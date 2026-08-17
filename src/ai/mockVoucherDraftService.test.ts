import { describe, expect, it } from 'vitest';
import type { DecisionDraft, Invoice } from '../domain/types';
import { mockBuildVoucherDraft } from './mockVoucherDraftService';

function buildInvoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
    id: 'INV-V-TEST',
    invoiceType: '增值税普通发票',
    invoiceCode: '044002600111',
    invoiceNumber: '10012001',
    issueDate: '2026-07-12',
    seller: '杭州湖滨餐饮管理有限公司',
    buyer: '浙江示例科技有限公司',
    itemName: '餐饮服务',
    amount: 1860,
    taxAmount: 52.64,
    taxRate: '3%',
    verificationStatus: '验真通过',
    duplicateStatus: '未重复',
    redLetterStatus: '正常',
    recognitionConfidence: 0.94,
    category: '餐饮',
    anomalies: [],
    sourceFile: 'mock://ocr/test.pdf',
    status: '待生成凭证',
    ...overrides,
  };
}

function buildDecision(overrides: Partial<DecisionDraft> = {}): DecisionDraft {
  return {
    version: 'gate2a-test',
    gates: [],
    accountingConclusion: '建议计入业务招待费。',
    vatConclusion: '普通发票不得抵扣进项税。',
    citConclusion: '按业务招待费税前扣除限额复核。',
    otherRiskNotes: [],
    evidenceConclusion: '证据链完整。',
    riskLevel: '低',
    confidence: 0.9,
    remediation: [],
    approvalRequirement: '无需追加审批。',
    voucherDraft: { status: '可生成草稿', summary: '凭证草稿建议。' },
    humanReviewRecords: [],
    finalStatus: '凭证草稿已生成',
    ...overrides,
  };
}

// 从凭证文本中解析某方向的金额合计（支持小数）
function sumAmounts(lines: string[], direction: '借' | '贷'): number {
  return lines
    .filter((line) => line.startsWith(`${direction}：`))
    .reduce((sum, line) => {
      const match = line.match(/([\d,]+(?:\.\d+)?)\s*元$/);
      if (!match) return sum;
      return sum + Number(match[1].replace(/,/g, ''));
    }, 0);
}

describe('凭证草稿借贷平衡与科目清理', () => {
  it('普通发票：费用借方为价税合计，借贷金额相等', () => {
    const invoice = buildInvoice(); // 普票，金额 1860，税额 52.64
    const decision = buildDecision();
    const text = mockBuildVoucherDraft(invoice, decision);
    const lines = text.split('\n');

    const debitTotal = sumAmounts(lines, '借');
    const creditTotal = sumAmounts(lines, '贷');

    // 普票不得抵扣，借方费用 = 价税合计 = 1912.64
    expect(debitTotal).toBe(1860 + 52.64);
    // 借贷必须平衡
    expect(debitTotal).toBe(creditTotal);
    // 只有一笔借（费用）和一笔贷
    expect(lines.filter((l) => l.startsWith('借：')).length).toBe(1);
    expect(lines.filter((l) => l.startsWith('贷：')).length).toBe(1);
    // 科目文本不得带句号
    expect(text).not.toContain('业务招待费。');
    expect(text).toContain('业务招待费 1,912.64 元');
  });

  it('专票：包含进项税借方，贷方为价税合计，借贷平衡', () => {
    const invoice = buildInvoice({
      invoiceType: '增值税专用发票',
      amount: 10000,
      taxAmount: 600,
    });
    const decision = buildDecision({
      accountingConclusion: '建议计入管理费用-咨询服务费。',
    });
    const text = mockBuildVoucherDraft(invoice, decision);
    const lines = text.split('\n');

    const debitTotal = sumAmounts(lines, '借');
    const creditTotal = sumAmounts(lines, '贷');

    // 专票：借费用 10000 + 借进项税 600 = 10600；贷方 10600
    expect(debitTotal).toBe(10600);
    expect(creditTotal).toBe(10600);
    expect(debitTotal).toBe(creditTotal);
    // 应有两笔借（费用 + 进项税）
    expect(lines.filter((l) => l.startsWith('借：')).length).toBe(2);
    expect(text).toContain('应交税费-应交增值税-进项税额 600 元');
    expect(text).toContain('管理费用-咨询服务费 10,000 元');
    // 科目清理
    expect(text).not.toContain('咨询服务费。');
  });

  it('阻断案例：不得生成凭证草稿，仅输出阻断文本', () => {
    const invoice = buildInvoice({
      verificationStatus: '验真失败',
      duplicateStatus: '疑似重复',
    });
    const decision = buildDecision({
      voucherDraft: { status: '禁止生成', summary: '高风险阻断，不得生成凭证草稿。' },
      finalStatus: '暂不能判断',
      riskLevel: '高',
    });
    const text = mockBuildVoucherDraft(invoice, decision);

    expect(text.startsWith('【阻断】')).toBe(true);
    expect(text).not.toContain('借：');
    expect(text).not.toContain('贷：');
    expect(text).toContain('不得生成凭证草稿');
  });
});
