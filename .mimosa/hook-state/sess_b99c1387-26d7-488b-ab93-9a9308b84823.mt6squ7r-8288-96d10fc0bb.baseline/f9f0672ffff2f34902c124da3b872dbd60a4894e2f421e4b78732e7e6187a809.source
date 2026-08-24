// 登录态本地存储 + 数据 key 按账户隔离
//
// 职责：
//   1. 登录态（token/用户）持久化在专用 key，供 AuthContext 与 localStore 同步读取
//   2. 数据隔离：登录后所有 invoice_evidence_* 数据 key 自动附加 u{userId}__ 命名空间，
//      不同账户在同一浏览器中互不可见；未登录时保持旧 key（vitest node 环境无 window，路径不变）
//
// 约束：authStorage 的 key 本身绝不参与命名空间变换（自举），否则死循环。

export const AUTH_STORAGE_KEY = 'invoice_evidence_auth';

// 命名空间前缀基座：所有业务数据 key 都以它开头
const DATA_KEY_PREFIX = 'invoice_evidence_';

export interface StoredAuthUser {
  userId: string;
  username: string;
  token: string;
  expiresAt: number;
}

interface StoredAuth {
  user: StoredAuthUser | null;
}

// 解析 localStorage 中的登录态（坏数据返回 null，不抛出）
export function parseStoredAuth(raw: string | null): StoredAuthUser | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as StoredAuth;
    if (
      parsed &&
      parsed.user &&
      typeof parsed.user.userId === 'string' &&
      typeof parsed.user.username === 'string' &&
      typeof parsed.user.token === 'string'
    ) {
      return parsed.user;
    }
    return null;
  } catch {
    return null;
  }
}

// 同步读取当前登录用户（浏览器外/未登录返回 null）
export function getStoredAuthUser(): StoredAuthUser | null {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') return null;
  try {
    return parseStoredAuth(window.localStorage.getItem(AUTH_STORAGE_KEY));
  } catch {
    return null;
  }
}

export function persistAuthUser(user: StoredAuthUser | null): void {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') return;
  try {
    if (user === null) {
      window.localStorage.removeItem(AUTH_STORAGE_KEY);
    } else {
      const payload: StoredAuth = { user };
      window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(payload));
    }
  } catch (err) {
    console.warn('[authStorage] 登录态写入失败：', err);
  }
}

// 受保护后端接口（OCR/DeepSeek）所需的请求头：携带登录令牌
// 未登录返回空对象（接口将返回 401，前端各自回退模拟模式）
export function authHeaders(): Record<string, string> {
  const user = getStoredAuthUser();
  return user?.token ? { Authorization: `Bearer ${user.token}` } : {};
}

// 数据 key 命名空间变换（纯函数，便于测试）：
//   - 登录态 key 与非 invoice_evidence_ 前缀的 key 原样返回
//   - 已登录：invoice_evidence_cases → invoice_evidence_u{userId}__cases
//   - 未登录：保持原 key（兼容 vitest node 环境与旧数据）
export function applyAccountNamespace(key: string, user: StoredAuthUser | null): string {
  if (key === AUTH_STORAGE_KEY) return key;
  if (!key.startsWith(DATA_KEY_PREFIX)) return key;
  if (!user || !user.userId) return key;
  return `${DATA_KEY_PREFIX}u${user.userId}__${key.slice(DATA_KEY_PREFIX.length)}`;
}
