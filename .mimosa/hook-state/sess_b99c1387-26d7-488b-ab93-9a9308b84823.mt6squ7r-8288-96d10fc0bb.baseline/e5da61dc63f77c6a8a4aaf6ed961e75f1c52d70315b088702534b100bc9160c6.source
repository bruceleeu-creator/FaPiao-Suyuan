import { describe, expect, it } from 'vitest';
import { demoCases, exceptionCases } from './demoCases';

describe('Gate 1 demo data', () => {
  it('covers catering, lodging, consulting, and a blocked invoice', () => {
    expect(demoCases.map((item) => item.invoice.category)).toEqual(
      expect.arrayContaining(['餐饮', '住宿', '咨询服务']),
    );
    expect(demoCases.some((item) => item.invoice.verificationStatus === '验真失败')).toBe(true);
  });

  it('keeps voucher output as a draft boundary', () => {
    expect(demoCases.every((item) => item.riskDecision.voucherDraft.summary.includes('草稿'))).toBe(true);
    expect(exceptionCases.some((item) => item.riskDecision.voucherDraft.status === '禁止生成')).toBe(true);
  });

  it('keeps all four gates visible on every case', () => {
    expect(demoCases.every((item) => item.gates.length === 4)).toBe(true);
  });
});
