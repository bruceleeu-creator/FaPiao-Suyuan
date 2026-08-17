import { describe, expect, it, vi } from 'vitest';
import {
  getTencentCloudOcrStatusText,
  isTencentCloudOcrEnabled,
  mapOcrResultToInvoicePatch,
  tencentCloudInvoiceOcrRecognize,
  type TencentCloudOcrInput,
} from './tencentCloudInvoiceOcr';

describe('腾讯云 OCR 预留适配器：占位响应', () => {
  it('默认调用返回 reserved 状态', () => {
    const result = tencentCloudInvoiceOcrRecognize({ fileName: 'test.pdf' });
    expect(result.status).toBe('reserved');
    expect(result.reserved).toBe(true);
    expect(result.simulated).toBe(true);
  });

  it('占位响应包含「腾讯云服务尚未开通」提示', () => {
    const result = tencentCloudInvoiceOcrRecognize({});
    expect(result.userMessage).toContain('腾讯云 OCR 服务尚未开通');
    expect(result.userMessage).toContain('接口预留响应');
  });

  it('占位响应不返回任何票面字段', () => {
    const result = tencentCloudInvoiceOcrRecognize({ fileName: 'invoice.jpg' });
    expect(result.invoiceType).toBeUndefined();
    expect(result.invoiceNumber).toBeUndefined();
    expect(result.seller).toBeUndefined();
    expect(result.amount).toBeUndefined();
    expect(result.recognitionConfidence).toBeUndefined();
  });

  it('包含时间戳和调用耗时', () => {
    const result = tencentCloudInvoiceOcrRecognize({});
    expect(result.timestamp).toBeTruthy();
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });
});

describe('腾讯云 OCR 预留适配器：不发真实 HTTP 请求', () => {
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

    tencentCloudInvoiceOcrRecognize({ fileName: 'test.pdf', forceReserved: true });

    expect(fetchSpy).not.toHaveBeenCalled();

    // 还原
    if (hasXHR && originalOpen) {
      XMLHttpRequest.prototype.open = originalOpen;
    }
    delete (globalThis as Record<string, unknown>).fetch;
  });

  it('forceReserved=false 也返回 manual_check（真实接入未配置）', () => {
    // 当前阶段真实接入未配置，forceReserved=false 不再走预留，但真实调用也未配置
    // 直接进入 manual_check 兜底分支（仍不发请求）
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const result = tencentCloudInvoiceOcrRecognize({ forceReserved: false });
    expect(result.status).toBe('manual_check');
    expect(result.reserved).toBe(false);
    expect(result.simulated).toBe(false);
    expect(result.errorMessage).toContain('not configured');
    expect(fetchSpy).not.toHaveBeenCalled();

    delete (globalThis as Record<string, unknown>).fetch;
  });
});

describe('腾讯云 OCR 预留适配器：结果映射', () => {
  it('reserved 结果映射到空 patch（无票面字段）', () => {
    const result = tencentCloudInvoiceOcrRecognize({});
    const patch = mapOcrResultToInvoicePatch(result);
    expect(patch).toEqual({});
  });

  it('simulated/manual_check 结果映射到空 patch', () => {
    // 模拟一个 simulated 结果
    const simulatedResult = {
      status: 'simulated' as const,
      simulated: true,
      reserved: false,
      userMessage: '内置',
      timestamp: new Date().toISOString(),
      durationMs: 10,
      invoiceType: '增值税普通发票',
      invoiceNumber: '10012001',
    };
    const patch = mapOcrResultToInvoicePatch(simulatedResult);
    expect(patch).toEqual({});
  });

  it('success 结果（未来真实接入）映射到票面 patch', () => {
    // 模拟一个 success 结果（未来真实接入后）
    const successResult = {
      status: 'success' as const,
      simulated: false,
      reserved: false,
      userMessage: '识别成功',
      timestamp: new Date().toISOString(),
      durationMs: 800,
      invoiceType: '增值税专用发票',
      invoiceCode: '033002600221',
      invoiceNumber: '20022002',
      issueDate: '2026-07-10',
      seller: '南京江北商务酒店有限公司',
      buyer: '浙江示例科技有限公司',
      itemName: '住宿服务',
      amount: 980,
      taxAmount: 58.8,
      taxRate: '6%',
      recognitionConfidence: 0.95,
      sourceFile: 'tencent://ocr/20022002.pdf',
    };
    const patch = mapOcrResultToInvoicePatch(successResult);
    expect(patch.invoiceNumber).toBe('20022002');
    expect(patch.seller).toBe('南京江北商务酒店有限公司');
    expect(patch.amount).toBe(980);
    expect(patch.recognitionConfidence).toBe(0.95);
  });
});

describe('腾讯云 OCR 预留适配器：服务状态', () => {
  it('当前阶段 isTencentCloudOcrEnabled 返回 false', () => {
    expect(isTencentCloudOcrEnabled()).toBe(false);
  });

  it('getTencentCloudOcrStatusText 返回「待开通」', () => {
    expect(getTencentCloudOcrStatusText()).toBe('待开通');
  });
});

describe('腾讯云 OCR 预留适配器：输入参数', () => {
  it('接受完整的输入参数（不报错，仍返回占位）', () => {
    const input: TencentCloudOcrInput = {
      fileName: 'invoice-001.pdf',
      fileType: 'pdf',
      fileSize: 102400,
      operator: '张三',
      caseId: 'WF-001',
      forceReserved: true,
    };
    const result = tencentCloudInvoiceOcrRecognize(input);
    expect(result.status).toBe('reserved');
    expect(result.reserved).toBe(true);
  });

  it('空输入也返回占位响应', () => {
    const result = tencentCloudInvoiceOcrRecognize({});
    expect(result.status).toBe('reserved');
  });
});
