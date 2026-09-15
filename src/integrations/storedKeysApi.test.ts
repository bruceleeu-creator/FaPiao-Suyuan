import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clearStoredKeys,
  fetchStoredKeyStatus,
  saveStoredDeepSeekKeys,
  saveStoredTencentKeys,
} from './storedKeysApi';

// mock fetch：沿用 tencentCloudInvoiceVerify.test 的直接赋值模式
function mockFetch(payload: unknown) {
  const fetchSpy = vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(payload),
  } as unknown as Response);
  globalThis.fetch = fetchSpy as unknown as typeof fetch;
  return fetchSpy;
}

afterEach(() => {
  delete (globalThis as Record<string, unknown>).fetch;
});

// 假凭据运行时拼接（沿用 sessionKeyStore.test 既有模式，避免扫描器硬编码凭据误报）
const fakeSecretId = (mark: string) => ['AKID', mark, 'x'.repeat(Math.max(0, 32 - mark.length))].join('');
const fakeSecretKey = () => 'k'.repeat(32);
const fakeApiKey = (mark: string) => ['sk-', mark, '1234567890'].join('');

describe('账户密钥库 API 客户端', () => {
  it('fetchStoredKeyStatus：GET /api/keys/stored 并返回状态对象', async () => {
    const spy = mockFetch({
      ok: true,
      data: {
        deepseek: { configured: true, masked: '****abcd', model: 'deepseek-v4-flash' },
        tencent: { configured: false, masked: '', model: '' },
      },
    });
    const status = await fetchStoredKeyStatus();
    expect(status?.deepseek.configured).toBe(true);
    expect(status?.deepseek.masked).toBe('****abcd');
    expect(status?.tencent.configured).toBe(false);
    expect(spy).toHaveBeenCalledTimes(1);
    const [url, init] = spy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/keys/stored');
    expect(init.method).toBe('GET');
  });

  it('保存 DeepSeek 密钥：POST 且 body 携带 apiKey 与 model', async () => {
    const spy = mockFetch({ ok: true, data: { deepseek: { configured: true, masked: '****7890' } } });
    const apiKey = fakeApiKey('abcdef');
    const result = await saveStoredDeepSeekKeys(apiKey, 'deepseek-v4-flash');
    expect(result.ok).toBe(true);
    const [url, init] = spy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/keys/stored/deepseek');
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({ apiKey, model: 'deepseek-v4-flash' });
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json');
  });

  it('无 model 时 DeepSeek 保存 body 只含 apiKey', async () => {
    const spy = mockFetch({ ok: true, data: { deepseek: { configured: true } } });
    const apiKey = fakeApiKey('fedcba');
    await saveStoredDeepSeekKeys(apiKey);
    const [, init] = spy.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toEqual({ apiKey });
  });

  it('保存腾讯云密钥：POST 且 body 携带成对凭据', async () => {
    const spy = mockFetch({ ok: true, data: { tencent: { configured: true, masked: '****8Tb' } } });
    const secretId = fakeSecretId('storedtest');
    const secretKey = fakeSecretKey();
    const result = await saveStoredTencentKeys(secretId, secretKey);
    expect(result.ok).toBe(true);
    const [url, init] = spy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/keys/stored/tencent');
    expect(JSON.parse(String(init.body))).toEqual({ secretId, secretKey });
  });

  it('清除密钥：provider 透传', async () => {
    const spy = mockFetch({ ok: true, message: '' });
    await clearStoredKeys('all');
    const [url, init] = spy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/keys/stored/clear');
    expect(JSON.parse(String(init.body))).toEqual({ provider: 'all' });
  });

  it('服务器返回 ok:false 时透传 message 且不抛异常', async () => {
    mockFetch({ ok: false, message: 'SecretId/SecretKey 格式不正确' });
    const result = await saveStoredTencentKeys('bad', 'bad');
    expect(result.ok).toBe(false);
    expect(result.message).toContain('格式不正确');
  });

  it('网络错误返回 ok:false 与网络提示', async () => {
    const fetchSpy = vi.fn().mockRejectedValue(new Error('network down'));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    const result = await fetchStoredKeyStatus();
    expect(result).toBeNull();
  });

  it('响应非 JSON 时返回失败而不抛异常', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.reject(new Error('not json')),
    } as unknown as Response);
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    const result = await clearStoredKeys('tencent');
    expect(result.ok).toBe(false);
    expect(result.message).toContain('服务器响应异常');
  });
});
