// 会话密钥存储：密钥只活在当前浏览器会话（sessionStorage）
//
// 隐私模型（用户明确要求的保护方式）：
//   - SecretId/SecretKey/API Key 由用户自己填入，仅存于 sessionStorage
//   - 关闭网站（标签页）即自动清除，浏览器不持久化、服务器不落盘
//   - 按账户命名空间隔离（同一浏览器不同账户互不可见）
//   - 永不写入 localStorage；除调用后端代理（随请求透传）外不发给任何地方
//
// 服务器端另可有管理员配置的全局密钥作为兜底（加密存储），
// 请求未携带会话密钥时后端自动回退——本模块只管浏览器侧。

export interface SessionTencentKeys {
  secretId: string;
  secretKey: string;
}

export interface SessionDeepSeekKeys {
  apiKey: string;
  model?: string;
}

export interface SessionKeys {
  tencent: SessionTencentKeys | null;
  deepseek: SessionDeepSeekKeys | null;
}

const STORAGE_PREFIX = 'fapiao.sessionKeys.';

function storageKey(userId: string | undefined | null): string | null {
  if (!userId) return null;
  return `${STORAGE_PREFIX}${userId}`;
}

function readAll(userId: string | undefined | null): SessionKeys {
  const key = storageKey(userId);
  if (!key) return { tencent: null, deepseek: null };
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return { tencent: null, deepseek: null };
    const parsed = JSON.parse(raw) as Partial<SessionKeys>;
    return {
      tencent:
        parsed.tencent && typeof parsed.tencent.secretId === 'string' && typeof parsed.tencent.secretKey === 'string'
          ? parsed.tencent
          : null,
      deepseek:
        parsed.deepseek && typeof parsed.deepseek.apiKey === 'string' && parsed.deepseek.apiKey
          ? parsed.deepseek
          : null,
    };
  } catch {
    return { tencent: null, deepseek: null };
  }
}

function writeAll(userId: string | undefined | null, keys: SessionKeys): boolean {
  const key = storageKey(userId);
  if (!key) return false;
  try {
    if (!keys.tencent && !keys.deepseek) {
      sessionStorage.removeItem(key);
    } else {
      sessionStorage.setItem(key, JSON.stringify(keys));
    }
    return true;
  } catch {
    return false;
  }
}

// ---------- 腾讯云 ----------

export function setTencentKeys(userId: string | undefined | null, keys: SessionTencentKeys | null): boolean {
  const all = readAll(userId);
  return writeAll(userId, { ...all, tencent: keys });
}

export function getTencentKeys(userId: string | undefined | null): SessionTencentKeys | null {
  return readAll(userId).tencent;
}

// ---------- DeepSeek ----------

export function setDeepSeekKeys(userId: string | undefined | null, keys: SessionDeepSeekKeys | null): boolean {
  const all = readAll(userId);
  return writeAll(userId, { ...all, deepseek: keys });
}

export function getDeepSeekKeys(userId: string | undefined | null): SessionDeepSeekKeys | null {
  return readAll(userId).deepseek;
}

// ---------- 全量清除（登出/手动清除按钮共用） ----------

export function clearSessionKeys(userId: string | undefined | null): void {
  const key = storageKey(userId);
  if (key) sessionStorage.removeItem(key);
}

// 当前账户是否持有任一可用会话密钥
export function hasAnySessionKeys(userId: string | undefined | null): boolean {
  const all = readAll(userId);
  return Boolean(all.tencent || all.deepseek);
}

// ---------- 请求体凭据片段（供 AI/OCR 服务调用层直接合并进 fetch body） ----------

import { getStoredAuthUser } from '../auth/authStorage';

// 当前登录账户的 DeepSeek 会话凭据（无则空对象，后端自动回退服务器配置）
export function deepSeekCredentialBody(): Record<string, string> {
  const keys = getDeepSeekKeys(getStoredAuthUser()?.userId);
  if (!keys) return {};
  return { apiKey: keys.apiKey, ...(keys.model ? { model: keys.model } : {}) };
}

// 当前登录账户的腾讯云会话凭据
export function tencentCredentialBody(): Record<string, string> {
  const keys = getTencentKeys(getStoredAuthUser()?.userId);
  if (!keys) return {};
  return { secretId: keys.secretId, secretKey: keys.secretKey };
}
