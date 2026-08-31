import { describe, it, expect, beforeEach } from 'vitest';
import {
  setTencentKeys,
  getTencentKeys,
  setDeepSeekKeys,
  getDeepSeekKeys,
  clearSessionKeys,
  hasAnySessionKeys,
} from './sessionKeyStore';

// node 测试环境无 sessionStorage/localStorage：内存桩（与 integrationConfigStore.test 同法）
class MemoryStorage {
  private store = new Map<string, string>();
  written: string[] = [];
  getItem(key: string) {
    return this.store.has(key) ? this.store.get(key)! : null;
  }
  setItem(key: string, value: string) {
    this.store.set(key, value);
    this.written.push(key);
  }
  removeItem(key: string) {
    this.store.delete(key);
  }
  clear() {
    this.store.clear();
    this.written = [];
  }
}

const sessionStub = new MemoryStorage();
const localStub = new MemoryStorage();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).sessionStorage = sessionStub;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).localStorage = localStub;

const USER_A = 'user-a';
const USER_B = 'user-b';

describe('sessionKeyStore（会话密钥：仅 sessionStorage、按账户隔离、可清除）', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('存取腾讯云密钥：写入后可读回，未登录（无 userId）不可写', () => {
    expect(setTencentKeys(USER_A, { secretId: 'AKIDx', secretKey: 'k'.repeat(32) })).toBe(true);
    expect(getTencentKeys(USER_A)).toEqual({ secretId: 'AKIDx', secretKey: 'k'.repeat(32) });
    expect(setTencentKeys(null, { secretId: 'AKIDx', secretKey: 'k'.repeat(32) })).toBe(false);
    expect(getTencentKeys(null)).toBeNull();
  });

  it('按账户命名空间隔离：A 的密钥 B 读不到', () => {
    setTencentKeys(USER_A, { secretId: 'AKIDa', secretKey: 'a'.repeat(32) });
    expect(getTencentKeys(USER_B)).toBeNull();
  });

  it('DeepSeek 与腾讯云互不覆盖', () => {
    setTencentKeys(USER_A, { secretId: 'AKIDa', secretKey: 'a'.repeat(32) });
    setDeepSeekKeys(USER_A, { apiKey: 'sk-test1234567890abcd', model: 'deepseek-v4-flash' });
    expect(getTencentKeys(USER_A)?.secretId).toBe('AKIDa');
    expect(getDeepSeekKeys(USER_A)?.apiKey).toBe('sk-test1234567890abcd');
    expect(getDeepSeekKeys(USER_A)?.model).toBe('deepseek-v4-flash');
  });

  it('传 null 清除对应密钥；clearSessionKeys 全清', () => {
    setTencentKeys(USER_A, { secretId: 'AKIDa', secretKey: 'a'.repeat(32) });
    setDeepSeekKeys(USER_A, { apiKey: 'sk-test1234567890abcd' });
    expect(hasAnySessionKeys(USER_A)).toBe(true);
    setTencentKeys(USER_A, null);
    expect(getTencentKeys(USER_A)).toBeNull();
    expect(hasAnySessionKeys(USER_A)).toBe(true);
    clearSessionKeys(USER_A);
    expect(hasAnySessionKeys(USER_A)).toBe(false);
    expect(getDeepSeekKeys(USER_A)).toBeNull();
  });

  it('密钥只进 sessionStorage，绝不进 localStorage', () => {
    setTencentKeys(USER_A, { secretId: 'AKIDsecret', secretKey: 's'.repeat(32) });
    setDeepSeekKeys(USER_A, { apiKey: 'sk-secret-key-123456' });
    // localStorage 桩上没有任何写入发生
    expect(localStub.written.length).toBe(0);
    const stored = sessionStub.getItem('fapiao.sessionKeys.user-a') || '';
    expect(stored).toContain('AKIDsecret');
    expect(stored).toContain('sk-secret-key-123456');
  });

  it('损坏的存储内容安全降级为空', () => {
    sessionStorage.setItem('fapiao.sessionKeys.user-a', '{not json');
    expect(getTencentKeys(USER_A)).toBeNull();
    expect(hasAnySessionKeys(USER_A)).toBe(false);
  });
});
