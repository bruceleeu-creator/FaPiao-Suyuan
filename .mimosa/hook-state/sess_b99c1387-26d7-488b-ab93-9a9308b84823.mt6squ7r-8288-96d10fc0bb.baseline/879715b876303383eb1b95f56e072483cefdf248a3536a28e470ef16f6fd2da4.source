import { describe, expect, it, vi } from 'vitest';
import {
  getTencentCloudVerifyStatusText,
  getVerifyFallbackAdvice,
  isTencentCloudVerifyEnabled,
  mapVerifyResultToInvoicePatch,
  tencentCloudInvoiceVerify,
} from './tencentCloudInvoiceVerify';

describe('腾讯云发票核验预留适配器：占位响应', () => {
  it('默认调用返回 reserved 状态', () => {
    const result = tencentCloudInvoiceVerify({ invoiceNumber: '10012001' });
    expect(result.status).toBe('reserved');
    expect(result.reserved).toBe(true);
    expect(result.simulated).toBe(true);
  });

  it('占位响应包含「待人工核验」提示', () => {
    const result = tencentCloudInvoiceVerify({});
    expect(result.userMessage).toContain('腾讯云发票核验服务尚未开通');
    expect(result.userMessage).toContain('待人工核验');
  });

  it('占位响应不映射到具体核验状态', () => {
    const result = tencentCloudInvoiceVerify({ invoiceNumber: '10012001' });
    expect(result.mappedVerificationStatus).toBeUndefined();
    expect(result.mappedRedLetterStatus).toBeUndefined();
  });

  it('包含时间戳和调用耗时', () => {
    const result = tencentCloudInvoiceVerify({});
    expect(result.timestamp).toBeTruthy();
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });
});

describe('腾讯云发票核验预留适配器：不发真实 HTTP 请求', () => {
  it('调用适配器不会触发 fetch / XHR', () => {
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    // XMLHttpRequest 在 Node 环境可能不存在，使用 typeof 守卫
    const hasXHR = typeof XMLHttpRequest !== 'undefined';
    const originalOpen = hasXHR ? XMLHttpRequest.prototype.open : undefined;
    if (hasXHR) {
      const xhrOpenSpy = vi.fn();
      XMLHttpRequest.prototype.open = xhrOpenSpy;
    }

    tencentCloudInvoiceVerify({ invoiceNumber: '10012001', forceReserved: true });

    expect(fetchSpy).not.toHaveBeenCalled();

    // 还原
    if (hasXHR && originalOpen) {
      XMLHttpRequest.prototype.open = originalOpen;
    }
    delete (globalThis as Record<string, unknown>).fetch;
  });

  it('forceReserved=false 也返回 manual_check（真实接入未配置）', () => {
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const result = tencentCloudInvoiceVerify({ forceReserved: false });
    expect(result.status).toBe('manual_check');
    expect(result.reserved).toBe(false);
    expect(result.simulated).toBe(false);
    expect(result.errorMessage).toContain('not configured');
    expect(fetchSpy).not.toHaveBeenCalled();

    delete (globalThis as Record<string, unknown>).fetch;
  });
});

describe('腾讯云发票核验预留适配器：结果映射', () => {
  it('reserved 结果映射到空 patch', () => {
    const result = tencentCloudInvoiceVerify({});
    const patch = mapVerifyResultToInvoicePatch(result);
    expect(patch).toEqual({});
  });

  it('verified_pass 映射到「验真通过」', () => {
    const mockResult = {
      status: 'verified_pass' as const,
      simulated: false,
      reserved: false,
      userMessage: '核验通过',
      timestamp: new Date().toISOString(),
      durationMs: 500,
    };
    const patch = mapVerifyResultToInvoicePatch(mockResult);
    expect(patch.verificationStatus).toBe('验真通过');
  });

  it('verified_fail 映射到「验真失败」', () => {
    const mockResult = {
      status: 'verified_fail' as const,
      simulated: false,
      reserved: false,
      userMessage: '核验失败',
      timestamp: new Date().toISOString(),
      durationMs: 500,
    };
    const patch = mapVerifyResultToInvoicePatch(mockResult);
    expect(patch.verificationStatus).toBe('验真失败');
  });

  it('voided 映射到「已作废」', () => {
    const mockResult = {
      status: 'voided' as const,
      simulated: false,
      reserved: false,
      userMessage: '已作废',
      timestamp: new Date().toISOString(),
      durationMs: 500,
    };
    const patch = mapVerifyResultToInvoicePatch(mockResult);
    expect(patch.redLetterStatus).toBe('已作废');
  });

  it('red_letter 映射到「已红冲」', () => {
    const mockResult = {
      status: 'red_letter' as const,
      simulated: false,
      reserved: false,
      userMessage: '已红冲',
      timestamp: new Date().toISOString(),
      durationMs: 500,
    };
    const patch = mapVerifyResultToInvoicePatch(mockResult);
    expect(patch.redLetterStatus).toBe('已红冲');
  });

  it('timeout/unsupported_type/manual_check 映射到空 patch（走兜底）', () => {
    for (const status of ['timeout', 'unsupported_type', 'manual_check'] as const) {
      const mockResult = {
        status,
        simulated: false,
        reserved: false,
        userMessage: '超时/不支持/待核验',
        timestamp: new Date().toISOString(),
        durationMs: 500,
      };
      const patch = mapVerifyResultToInvoicePatch(mockResult);
      expect(patch).toEqual({});
    }
  });
});

describe('腾讯云发票核验预留适配器：服务状态', () => {
  it('当前阶段 isTencentCloudVerifyEnabled 返回 false', () => {
    expect(isTencentCloudVerifyEnabled()).toBe(false);
  });

  it('getTencentCloudVerifyStatusText 返回「待开通」', () => {
    expect(getTencentCloudVerifyStatusText()).toBe('待开通');
  });

  it('getVerifyFallbackAdvice 包含「尚未开通」和「人工核验」提示', () => {
    const advice = getVerifyFallbackAdvice();
    expect(advice).toContain('尚未开通');
    expect(advice).toContain('人工核验');
  });
});
