// 腾讯云密钥本地加密存储
//
// 安全设计：
// - 不在仓库保存明文密钥
// - 使用 AES-256-GCM 加密后写入本地文件
// - 加密密钥来自环境变量 TENCENT_CREDENTIALS_KEY，或本地自动生成的密钥文件
// - 密钥文件和密文文件都应加入 .gitignore，不进入版本库
// - 本模块不打印、不返回完整密钥到日志/响应体
//
// 2026-08-24：抽出通用 encryptJsonToFile / decryptJsonToFile 供 apiKeyStore（DeepSeek）
// 复用同一套加密体系；存储目录可用环境变量 CREDENTIAL_DATA_DIR 覆盖（默认本模块目录，
// 兼容既有本地文件），冒烟测试指向临时目录避免污染。

import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import process from 'node:process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function resolveCredentialDir() {
  const override = process.env.CREDENTIAL_DATA_DIR;
  if (override && override.trim()) return override;
  return __dirname;
}

const TENCENT_FILE = '.tencent-credentials.enc';

export const CREDENTIAL_FILE = path.join(__dirname, '.tencent-credentials.enc');
export const KEY_FILE = path.join(__dirname, '.tencent-credential-key');

// 从环境变量或本地密钥文件派生 32 字节 AES 密钥
function resolveEncryptionKey() {
  const envKey = process.env.TENCENT_CREDENTIALS_KEY;
  if (envKey && envKey.length >= 16) {
    return createHash('sha256').update(envKey).digest();
  }

  if (existsSync(KEY_FILE)) {
    const fileKey = readFileSync(KEY_FILE, 'utf-8').trim();
    if (fileKey.length >= 16) {
      return createHash('sha256').update(fileKey).digest();
    }
  }

  // 首次运行：生成本地随机密钥文件（仅本地开发使用）
  const generated = randomBytes(32).toString('hex');
  mkdirSync(path.dirname(KEY_FILE), { recursive: true });
  writeFileSync(KEY_FILE, `${generated}\n`, { mode: 0o600 });
  return createHash('sha256').update(generated).digest();
}

// 通用：加密任意 JSON 对象并写入凭据目录下的指定文件
export function encryptJsonToFile(fileName, plainObject) {
  const key = resolveEncryptionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const plaintext = JSON.stringify(plainObject);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf-8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  const payload = JSON.stringify({
    version: 1,
    algorithm: 'aes-256-gcm',
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
    data: encrypted.toString('base64'),
  });
  const target = path.join(resolveCredentialDir(), fileName);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, `${payload}\n`, { mode: 0o600 });
}

// 通用：从凭据目录下的指定文件读取并解密 JSON 对象（不存在或损坏返回空对象）
export function decryptJsonFromFile(fileName) {
  const target = path.join(resolveCredentialDir(), fileName);
  if (!existsSync(target)) return {};
  try {
    const raw = readFileSync(target, 'utf-8').trim();
    const payload = JSON.parse(raw);
    if (payload.version !== 1 || payload.algorithm !== 'aes-256-gcm') {
      throw new Error('Unsupported credential encryption format');
    }
    const key = resolveEncryptionKey();
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(payload.iv, 'base64'));
    decipher.setAuthTag(Buffer.from(payload.authTag, 'base64'));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(payload.data, 'base64')),
      decipher.final(),
    ]);
    return JSON.parse(decrypted.toString('utf-8'));
  } catch (err) {
    // 解密失败时不抛给调用方，避免服务因凭据文件损坏而不可用
    console.error(`[credentialStore] ${fileName} 解密失败，请检查 TENCENT_CREDENTIALS_KEY 或本地密钥文件。`);
    return {};
  }
}

export function saveTencentCredential({ secretId, secretKey } = {}) {
  const existing = loadTencentCredentials();
  const next = { ...existing };
  if (secretId) next.secretId = secretId;
  if (secretKey) next.secretKey = secretKey;
  encryptJsonToFile(TENCENT_FILE, next);
  return {
    secretIdStored: Boolean(next.secretId),
    secretKeyStored: Boolean(next.secretKey),
  };
}

export function loadTencentCredentials() {
  return decryptJsonFromFile(TENCENT_FILE);
}

export function validateSecretId(secretId) {
  return typeof secretId === 'string' && /^AKID[A-Za-z0-9]{32}$/.test(secretId);
}

export function validateSecretKey(secretKey) {
  return typeof secretKey === 'string' && /^[A-Za-z0-9]{32}$/.test(secretKey);
}

export function maskSecret(value) {
  if (!value || value.length < 8) return '****';
  return `${value.slice(0, 4)}****${value.slice(-4)}`;
}

export function getTencentCredentialStatus() {
  const creds = loadTencentCredentials();
  const hasSecretId = validateSecretId(creds.secretId);
  const hasSecretKey = validateSecretKey(creds.secretKey);
  return {
    secretIdStored: Boolean(creds.secretId),
    secretKeyStored: Boolean(creds.secretKey),
    secretIdValid: hasSecretId,
    secretKeyValid: hasSecretKey,
    secretIdMasked: creds.secretId ? maskSecret(creds.secretId) : null,
    configured: hasSecretId && hasSecretKey,
  };
}
