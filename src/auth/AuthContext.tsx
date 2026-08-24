// 认证上下文：登录/注册/登出 + 页面刷新后的会话恢复
//
// 会话流：登录成功 → token 存 localStorage（authStorage）→ localStore 数据 key 自动切换到该账户命名空间
// 刷新页面 → AuthProvider 用 /api/auth/me 校验 token → 有效则恢复会话，无效/过期则清空转登录页
// 后端令牌为 HMAC 无状态签名，服务重启不掉线；有效期 7 天

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  getStoredAuthUser,
  persistAuthUser,
  type StoredAuthUser,
} from './authStorage';

export interface AuthContextValue {
  user: StoredAuthUser | null;
  initializing: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

interface AuthApiResponse {
  ok?: boolean;
  data?: { token: string; userId: string; username: string; role?: 'admin' | 'user'; expiresAt?: number };
  message?: string;
}

// 调用后端认证接口；网络不可达与业务错误统一转为带中文提示的 Error
async function callAuthApi(path: string, body: Record<string, string>): Promise<AuthApiResponse> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error('无法连接后端服务，请确认已运行 npm run dev（后端 127.0.0.1:8787）。');
  }
  let payload: AuthApiResponse = {};
  try {
    payload = (await response.json()) as AuthApiResponse;
  } catch {
    payload = {};
  }
  if (!response.ok || payload.ok !== true || !payload.data) {
    throw new Error(payload.message || `请求失败（HTTP ${response.status}）。`);
  }
  return payload;
}

function toStoredUser(payload: AuthApiResponse): StoredAuthUser {
  const { token, userId, username, role } = payload.data as NonNullable<AuthApiResponse['data']>;
  return { token, userId, username, role: role ?? 'user', expiresAt: payload.data?.expiresAt ?? 0 };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<StoredAuthUser | null>(null);
  const [initializing, setInitializing] = useState(true);

  // 会话恢复：有 token 则校验；任何失败都清空转登录页（重新登录即可，代价低）
  useEffect(() => {
    let cancelled = false;
    const stored = getStoredAuthUser();
    if (!stored) {
      setInitializing(false);
      return;
    }
    callAuthApi('/api/auth/me', { token: stored.token })
      .then((payload) => {
        if (cancelled) return;
        const restored = toStoredUser(payload);
        // 后端返回的 username 为准（用户名可能已变化），token 沿用本地
        const next: StoredAuthUser = { ...restored, token: stored.token };
        persistAuthUser(next);
        setUser(next);
      })
      .catch(() => {
        if (cancelled) return;
        persistAuthUser(null);
        setUser(null);
      })
      .finally(() => {
        if (!cancelled) setInitializing(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const payload = await callAuthApi('/api/auth/login', { username, password });
    const next = toStoredUser(payload);
    persistAuthUser(next);
    setUser(next);
  }, []);

  const register = useCallback(async (username: string, password: string) => {
    // 注册成功即视为登录（后端直接返回令牌）
    const payload = await callAuthApi('/api/auth/register', { username, password });
    const next = toStoredUser(payload);
    persistAuthUser(next);
    setUser(next);
  }, []);

  const logout = useCallback(() => {
    // 先清存储再清状态：卸载期间不会再有写入落到该账户命名空间
    persistAuthUser(null);
    setUser(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ user, initializing, login, register, logout }),
    [user, initializing, login, register, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth 必须在 <AuthProvider> 内使用。');
  return ctx;
}
