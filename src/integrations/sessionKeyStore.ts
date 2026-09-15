// 旧版会话密钥存储（兼容层 · 2026-09-15 起由服务器账户密钥库取代）
//
// 密钥模型变更：密钥不再保存到浏览器——用户在「接口配置」页保存的密钥
// 加密存入服务器账户密钥库（见 storedKeysApi.ts / server/credentialStore.mjs）。
// 本模块保留两个职责：
//   1. 兼容读取：旧版已存于 sessionStorage 的密钥仍随请求透传（请求级凭据
//      优先级最高，不影响现有调用点），面板检测到时预填表单引导迁移；
//   2. 迁移清理：保存到服务器成功后由面板调用 setXxxKeys(uid, null) 清除遗留。
//
// 历史模型（2026-08-31 至 2026-09-15）：密钥仅存 sessionStorage，关站自清、
// 服务器零持久化；按账户命名空间隔离（同一浏览器不同账户互不可见）。

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
