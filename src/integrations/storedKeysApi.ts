// 账户密钥库 API 客户端（2026-09-15 新增）
//
// 密钥模型：用户在「接口配置」页保存的密钥存入服务器账户密钥库
// （node:sqlite + AES-256-GCM，按账户隔离），浏览器不再持久化任何密钥。
// 旧 sessionStorage 会话密钥仅作请求级透传的兼容读取（见 sessionKeyStore.ts）。
//
// 接口：GET  /api/keys/stored（状态：布尔 + 末 4 位掩码，永不回显明文）
//      POST /api/keys/stored/deepseek {apiKey, model?}
//      POST /api/keys/stored/tencent  {secretId, secretKey}
//      POST /api/keys/stored/clear    {provider: 'deepseek'|'tencent'|'all'}

import { authHeaders } from '../auth/authStorage';

export interface StoredProviderStatus {
  configured: boolean;
  masked?: string;
  model?: string;
}

export interface StoredKeysStatus {
  deepseek: StoredProviderStatus;
  tencent: StoredProviderStatus;
}

export interface StoredKeysResult {
  ok: boolean;
  message: string;
  data?: StoredKeysStatus;
}

async function requestStoredKeys(
  url: string,
  init?: { method?: 'GET' | 'POST'; body?: unknown },
): Promise<StoredKeysResult> {
  try {
    const r = await fetch(url, {
      method: init?.method ?? 'GET',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      ...(init?.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
      signal: AbortSignal.timeout(8000),
    });
    const payload = (await r.json().catch(() => null)) as {
      ok?: boolean;
      message?: string;
      data?: StoredKeysStatus;
    } | null;
    if (!payload) return { ok: false, message: '服务器响应异常，请稍后重试。' };
    return {
      ok: payload.ok === true,
      message: payload.message || '',
      data: payload.data,
    };
  } catch {
    return { ok: false, message: '网络错误：无法连接后端服务。' };
  }
}

// 当前账户已存密钥状态（网络失败/未登录返回 null，面板据此显示"未配置"）
export async function fetchStoredKeyStatus(): Promise<StoredKeysStatus | null> {
  const result = await requestStoredKeys('/api/keys/stored');
  return result.data ?? null;
}

export function saveStoredDeepSeekKeys(apiKey: string, model?: string): Promise<StoredKeysResult> {
  return requestStoredKeys('/api/keys/stored/deepseek', {
    method: 'POST',
    body: model ? { apiKey, model } : { apiKey },
  });
}

export function saveStoredTencentKeys(secretId: string, secretKey: string): Promise<StoredKeysResult> {
  return requestStoredKeys('/api/keys/stored/tencent', {
    method: 'POST',
    body: { secretId, secretKey },
  });
}

export function clearStoredKeys(provider: 'deepseek' | 'tencent' | 'all'): Promise<StoredKeysResult> {
  return requestStoredKeys('/api/keys/stored/clear', {
    method: 'POST',
    body: { provider },
  });
}
