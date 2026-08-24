// 账户存储与令牌签发
//
// 设计原则（与代理后端一致）：
//   1. 零第三方依赖：仅 node:fs / node:crypto / node:process
//   2. 密码永不明文落盘：scrypt + 随机盐，比较用 timingSafeEqual
//   3. 令牌为 HMAC-SHA256 签名的无状态 token（服务重启不掉线，无需服务端会话表）
//   4. 签名密钥首次自动生成，保存在数据目录（0600），不入库不入日志
//   5. 用户数据文件原子写入（tmp + rename），避免写一半损坏
//
// 数据位置：server/data/users.json（可用环境变量 AUTH_DATA_DIR 覆盖，冒烟测试用临时目录）

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

// 令牌有效期：7 天
const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const USERS_FILE = 'users.json';
const SECRET_FILE = 'auth.secret';

function resolveDataDir() {
  const override = process.env.AUTH_DATA_DIR;
  if (override && override.trim()) return override;
  return path.join(path.dirname(fileURLToPath(import.meta.url)), 'data');
}

function ensureDataDir() {
  const dir = resolveDataDir();
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function loadUsersDb() {
  const file = path.join(resolveDataDir(), USERS_FILE);
  if (!fs.existsSync(file)) return { users: [] };
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf-8'));
    if (parsed && Array.isArray(parsed.users)) return parsed;
    return { users: [] };
  } catch {
    // 坏文件不致命：视为无用户，注册时会被覆盖重建
    return { users: [] };
  }
}

function saveUsersDb(db) {
  const dir = ensureDataDir();
  const file = path.join(dir, USERS_FILE);
  const tmp = `${file}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2), 'utf-8');
  fs.renameSync(tmp, file);
}

// 签名密钥：不存在则生成 32 字节随机数（hex 保存）
function getOrCreateSecret() {
  const dir = ensureDataDir();
  const file = path.join(dir, SECRET_FILE);
  if (fs.existsSync(file)) {
    const secret = fs.readFileSync(file, 'utf-8').trim();
    if (secret.length >= 32) return secret;
  }
  const secret = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(file, secret, { mode: 0o600, flag: 'w' });
  return secret;
}

// ---------- 校验 ----------

// 用户名：2-24 字符，允许中文/字母/数字/下划线/连字符
const USERNAME_PATTERN = /^[\p{Script=Han}A-Za-z0-9_-]{2,24}$/u;

export function validateUsername(username) {
  if (typeof username !== 'string') return { ok: false, message: '用户名不能为空。' };
  const name = username.trim();
  if (!USERNAME_PATTERN.test(name)) {
    return { ok: false, message: '用户名需为 2-24 位中文、字母、数字、下划线或连字符。' };
  }
  return { ok: true, name };
}

export function validatePassword(password) {
  if (typeof password !== 'string') return { ok: false, message: '密码不能为空。' };
  const pwd = password.trim();
  if (pwd.length < 6 || pwd.length > 64) {
    return { ok: false, message: '密码需为 6-64 位字符。' };
  }
  return { ok: true, pwd };
}

// ---------- 用户 CRUD ----------

function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

// 返回 { ok: true, user } 或 { ok: false, status, message }
// status: 400 参数非法 / 409 用户名已存在
export function registerUser({ username, password }) {
  const nameCheck = validateUsername(username);
  if (!nameCheck.ok) return { ok: false, status: 400, message: nameCheck.message };
  const pwdCheck = validatePassword(password);
  if (!pwdCheck.ok) return { ok: false, status: 400, message: pwdCheck.message };

  const name = nameCheck.name;
  const lower = name.toLowerCase();
  const db = loadUsersDb();
  if (db.users.some((u) => u.usernameLower === lower)) {
    return { ok: false, status: 409, message: '该用户名已被注册。' };
  }

  const salt = crypto.randomBytes(16).toString('hex');
  const user = {
    id: crypto.randomUUID(),
    username: name,
    usernameLower: lower,
    salt,
    hash: hashPassword(pwdCheck.pwd, salt),
    createdAt: new Date().toISOString(),
  };
  db.users.push(user);
  saveUsersDb(db);
  return { ok: true, user };
}

// 返回 user 或 null（用户不存在与密码错误不区分，防枚举）
export function verifyCredential({ username, password }) {
  if (typeof username !== 'string' || typeof password !== 'string') return null;
  const lower = username.trim().toLowerCase();
  if (!lower) return null;
  const db = loadUsersDb();
  const user = db.users.find((u) => u.usernameLower === lower);
  if (!user) {
    // 走一次哑哈希，避免「用户不存在时响应明显更快」的时序侧信道
    hashPassword(password, 'dummy-salt');
    return null;
  }
  const candidate = Buffer.from(hashPassword(password.trim(), user.salt), 'hex');
  const expected = Buffer.from(user.hash, 'hex');
  if (candidate.length !== expected.length || !crypto.timingSafeEqual(candidate, expected)) {
    return null;
  }
  return user;
}

export function findUserById(userId) {
  if (!userId) return null;
  const db = loadUsersDb();
  return db.users.find((u) => u.id === userId) ?? null;
}

// ---------- 无状态令牌（HMAC-SHA256 签名） ----------

function sign(payloadB64) {
  return crypto.createHmac('sha256', getOrCreateSecret()).update(payloadB64).digest('base64url');
}

// 签发 7 天有效期的令牌
export function issueToken(user) {
  const now = Date.now();
  const payload = { uid: user.id, username: user.username, iat: now, exp: now + TOKEN_TTL_MS };
  const payloadB64 = Buffer.from(JSON.stringify(payload), 'utf-8').toString('base64url');
  const token = `${payloadB64}.${sign(payloadB64)}`;
  return { token, expiresAt: payload.exp };
}

// 校验令牌：签名 + 有效期
// 返回 { ok: true, user, expiresAt } 或 { ok: false, status: 401, message }
export function verifyToken(token) {
  if (typeof token !== 'string' || !token.includes('.')) {
    return { ok: false, status: 401, message: '登录令牌无效，请重新登录。' };
  }
  const [payloadB64, signature] = token.split('.');
  if (!payloadB64 || !signature) {
    return { ok: false, status: 401, message: '登录令牌无效，请重新登录。' };
  }
  let expected;
  try {
    expected = sign(payloadB64);
  } catch {
    return { ok: false, status: 401, message: '登录令牌无效，请重新登录。' };
  }
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { ok: false, status: 401, message: '登录令牌无效，请重新登录。' };
  }
  let payload;
  try {
    payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf-8'));
  } catch {
    return { ok: false, status: 401, message: '登录令牌无效，请重新登录。' };
  }
  if (typeof payload.exp !== 'number' || Date.now() >= payload.exp) {
    return { ok: false, status: 401, message: '登录已过期，请重新登录。' };
  }
  const user = findUserById(payload.uid);
  if (!user) {
    return { ok: false, status: 401, message: '账户不存在，请重新登录。' };
  }
  return { ok: true, user, expiresAt: payload.exp };
}

// 对外输出账户状态（不泄露哈希/盐）
export function getAuthStatus() {
  const db = loadUsersDb();
  return { userCount: db.users.length };
}
