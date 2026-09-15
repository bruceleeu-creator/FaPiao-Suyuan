// 账户密钥库（服务器端持久化存储，2026-09-15 新增）
//
// 背景：密钥模型从「仅存浏览器 sessionStorage」升级为「服务器账户密钥库」——
// 用户在「接口配置」页保存的密钥按账户存入服务器数据库，跨会话可用；
// 浏览器不再持久化任何密钥（旧 sessionStorage 密钥仅作请求级透传的兼容读取）。
//
// 安全设计：
// - 存储：node:sqlite 数据库（零第三方依赖；Node ≥22.13 直接可用，
//   22.5–22.12 需 --experimental-sqlite 标志；不可用时本模块降级为"不可用"，
//   服务器照常启动，密钥相关接口返回明确错误，不影响登录/健康检查）
// - 数据库文件默认 server/data/credentials.db（在每日 crontab 备份范围内），
//   可用 CREDENTIAL_DB_PATH 覆盖（冒烟测试指向临时文件）
// - 加密：值经 AES-256-GCM 加密后入库；密钥来自 CREDENTIAL_VAULT_KEY 环境变量
//   或自动生成的 server/data/credential-vault.key（0600，与库同目录，备份自洽）
// - 隔离：按 user_id + provider 存取，只能读到自己的密钥
// - 所有 SQL 一律参数绑定，不拼接任何外部输入
// - 不打印、不返回明文密钥；对外只暴露布尔状态与末 4 位掩码

import { createRequire } from 'node:module';
import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, mkdirSync, chmodSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import process from 'node:process';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// node:sqlite 按需加载：缺失（旧 Node 未加标志）时降级，不在 import 期炸掉服务器
let DatabaseSync = null;
try {
  ({ DatabaseSync } = require('node:sqlite'));
} catch {
  DatabaseSync = null;
}

const PROVIDERS = ['deepseek', 'tencent'];

function resolveDataDir() {
  const override = process.env.CREDENTIAL_DB_PATH;
  if (override && override.trim()) return path.dirname(path.resolve(override));
  return path.join(__dirname, 'data');
}

function resolveDbPath() {
  const override = process.env.CREDENTIAL_DB_PATH;
  if (override && override.trim()) return path.resolve(override);
  return path.join(__dirname, 'data', 'credentials.db');
}

function resolveVaultKey() {
  const envKey = process.env.CREDENTIAL_VAULT_KEY;
  if (envKey && envKey.length >= 16) {
    return createHash('sha256').update(envKey).digest();
  }
  const keyPath = path.join(resolveDataDir(), 'credential-vault.key');
  if (existsSync(keyPath)) {
    const fileKey = readFileSync(keyPath, 'utf-8').trim();
    if (fileKey.length >= 16) return createHash('sha256').update(fileKey).digest();
  }
  const generated = randomBytes(32).toString('hex');
  mkdirSync(path.dirname(keyPath), { recursive: true });
  writeFileSync(keyPath, `${generated}\n`, { mode: 0o600 });
  try { chmodSync(keyPath, 0o600); } catch { /* 非 POSIX 环境忽略 */ }
  return createHash('sha256').update(generated).digest();
}

function encryptSecret(plainObject) {
  const key = resolveVaultKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const plaintext = JSON.stringify(plainObject);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf-8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `v1:${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted.toString('base64')}`;
}

function decryptSecret(encoded) {
  if (typeof encoded !== 'string') return null;
  const parts = encoded.split(':');
  if (parts.length !== 4 || parts[0] !== 'v1') return null;
  try {
    const key = resolveVaultKey();
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(parts[1], 'base64'));
    decipher.setAuthTag(Buffer.from(parts[2], 'base64'));
    const decrypted = Buffer.concat([decipher.update(Buffer.from(parts[3], 'base64')), decipher.final()]);
    return JSON.parse(decrypted.toString('utf-8'));
  } catch {
    // 密钥不匹配或密文损坏：视为不可读，不让异常外抛导致接口 500
    return null;
  }
}

let dbHandle = null;

function getDb() {
  if (!DatabaseSync) return null;
  if (dbHandle) return dbHandle;
  const dbPath = resolveDbPath();
  mkdirSync(path.dirname(dbPath), { recursive: true });
  dbHandle = new DatabaseSync(dbPath);
  dbHandle.exec(`
    CREATE TABLE IF NOT EXISTS user_credentials (
      user_id TEXT NOT NULL,
      provider TEXT NOT NULL,
      secret_enc TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (user_id, provider)
    )
  `);
  try { chmodSync(dbPath, 0o600); } catch { /* 非 POSIX 环境忽略 */ }
  return dbHandle;
}

// 数据库模块当前是否可用（node:sqlite 存在且库文件可打开）
export function isCredentialStoreAvailable() {
  try {
    return getDb() !== null;
  } catch {
    return false;
  }
}

function assertProvider(provider) {
  if (!PROVIDERS.includes(provider)) {
    throw new Error(`未知的密钥类别：${provider}`);
  }
}

// 保存（upsert）某账户某类别的密钥对象（自动加密，永不打印）
export function saveUserCredential(userId, provider, secretObject) {
  if (!userId || typeof userId !== 'string') return { ok: false, message: '缺少账户标识。' };
  assertProvider(provider);
  const db = getDb();
  if (!db) {
    return { ok: false, message: '服务器数据库不可用（node:sqlite 未启用），请联系管理员。' };
  }
  const enc = encryptSecret(secretObject);
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO user_credentials (user_id, provider, secret_enc, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(user_id, provider) DO UPDATE SET
       secret_enc = excluded.secret_enc,
       updated_at = excluded.updated_at`
  ).run(userId, provider, enc, now);
  return { ok: true };
}

// 读取某账户某类别的密钥对象（解密失败返回 null，不抛异常）
export function loadUserCredential(userId, provider) {
  if (!userId || typeof userId !== 'string') return null;
  try {
    assertProvider(provider);
  } catch {
    return null;
  }
  const db = getDb();
  if (!db) return null;
  const row = db.prepare(
    'SELECT secret_enc FROM user_credentials WHERE user_id = ? AND provider = ?'
  ).get(userId, provider);
  if (!row) return null;
  return decryptSecret(row.secret_enc);
}

// 清除某账户的密钥：provider 为 'deepseek' | 'tencent' | 'all'
export function clearUserCredential(userId, provider) {
  if (!userId || typeof userId !== 'string') return { ok: false, message: '缺少账户标识。' };
  const db = getDb();
  if (!db) {
    return { ok: false, message: '服务器数据库不可用（node:sqlite 未启用），请联系管理员。' };
  }
  if (provider === 'all') {
    db.prepare('DELETE FROM user_credentials WHERE user_id = ?').run(userId);
  } else {
    assertProvider(provider);
    db.prepare('DELETE FROM user_credentials WHERE user_id = ? AND provider = ?').run(userId, provider);
  }
  return { ok: true };
}

function maskTail(value) {
  if (typeof value !== 'string' || !value) return '';
  if (value.length <= 8) return '****';
  return `****${value.slice(-4)}`;
}

// 状态总览：只返回布尔与掩码，永不返回明文
export function getStoredCredentialStatus(userId) {
  if (!userId || typeof userId !== 'string') {
    return { deepseek: { configured: false }, tencent: { configured: false } };
  }
  const deepseek = loadUserCredential(userId, 'deepseek');
  const tencent = loadUserCredential(userId, 'tencent');
  return {
    deepseek: {
      configured: Boolean(deepseek?.apiKey),
      masked: deepseek?.apiKey ? maskTail(deepseek.apiKey) : '',
      model: typeof deepseek?.model === 'string' ? deepseek.model : '',
    },
    tencent: {
      configured: Boolean(tencent?.secretId && tencent?.secretKey),
      masked: tencent?.secretId ? maskTail(tencent.secretId) : '',
    },
  };
}
