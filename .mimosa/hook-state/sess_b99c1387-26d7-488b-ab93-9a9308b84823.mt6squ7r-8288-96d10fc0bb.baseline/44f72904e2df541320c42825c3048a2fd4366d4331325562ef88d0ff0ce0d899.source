import { describe, expect, it } from 'vitest';
import { demoCases } from '../data/demoCases';
import type { Invoice, WorkflowSession } from '../domain/types';
import { buildMonthlyTrend, parseIssueMonth } from './riskTrend';

function buildInvoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
    id: 'INV-TREND-001',
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
    status: '待确认票面',
    ...overrides,
  };
}

function buildSession(overrides: Partial<WorkflowSession> = {}): WorkflowSession {
  return {
    caseId: 'CASE-TREND-001',
    currentStep: '生成建议',
    completedSteps: [],
    invoice: buildInvoice(),
    businessEvent: {} as WorkflowSession['businessEvent'],
    evidenceChain: {} as WorkflowSession['evidenceChain'],
    aiInterventions: [],
    actionLogs: [],
    finalStatus: '待财务复核',
    ...overrides,
  };
}

describe('parseIssueMonth', () => {
  it('解析 YYYY-MM，非法日期返回 null', () => {
    expect(parseIssueMonth('2026-07-12')).toBe('2026-07');
    expect(parseIssueMonth('2026-01-01')).toBe('2026-01');
    expect(parseIssueMonth('bad-date')).toBeNull();
    expect(parseIssueMonth('')).toBeNull();
  });
});

describe('buildMonthlyTrend', () => {
  it('按月份聚合张数、金额、高风险数（本地 + 演示合并）', () => {
    const local = buildSession({
      caseId: 'CASE-T1',
      invoice: buildInvoice({ issueDate: '2026-07-01', amount: 1000 }),
      decisionDraft: {
        version: 'v1',
        gates: [],
        accountingConclusion: '',
        vatConclusion: '',
        citConclusion: '',
        otherRiskNotes: [],
        evidenceConclusion: '',
        riskLevel: '高',
        confidence: 0.5,
        remediation: [],
        approvalRequirement: '',
        voucherDraft: { status: '禁止生成', summary: '' },
        humanReviewRecords: [],
        finalStatus: '暂不能判断',
        businessQACompleted: true,
      },
    });
    const { points, anchorMonth } = buildMonthlyTrend([local], demoCases, 6);
    expect(anchorMonth).toBe('2026-07');
    expect(points.length).toBe(6);
    expect(points[5].month).toBe('2026-07');
    expect(points[5].count).toBeGreaterThanOrEqual(1);
    // 本地高风险 case 与演示高风险案例都计入
    const demoHigh = demoCases.filter((c) => c.riskDecision.riskLevel === '高');
    expect(points[5].highRiskCount).toBe(1 + demoHigh.filter((c) => c.invoice.issueDate.startsWith('2026-07')).length);
    expect(points[5].totalAmount).toBeGreaterThanOrEqual(1000);
  });

  it('窗口内无数据的月份计为 0（保持时间轴连续）', () => {
    const { points } = buildMonthlyTrend([], demoCases, 6);
    const zeroMonths = points.filter((p) => p.count === 0);
    expect(zeroMonths.length).toBeGreaterThan(0);
    expect(zeroMonths.every((p) => p.totalAmount === 0)).toBe(true);
  });

  it('无任何有效日期数据时返回空点位', () => {
    const broken = buildSession({
      caseId: 'CASE-T2',
      invoice: buildInvoice({ issueDate: 'not-a-date' }),
    });
    const { points, anchorMonth } = buildMonthlyTrend([broken], [], 6);
    expect(points).toEqual([]);
    expect(anchorMonth).toBe('');
  });

  it('窗口外的旧月份不计入', () => {
    const old = buildSession({
      caseId: 'CASE-T3',
      invoice: buildInvoice({ issueDate: '2025-01-15', amount: 9999 }),
    });
    const withOld = buildMonthlyTrend([old], demoCases, 6);
    const demoOnly = buildMonthlyTrend([], demoCases, 6);
    // 锚点为演示数据最新月，2025-01 不在近 6 个月窗口，总额与仅演示一致
    expect(withOld.points.some((p) => p.month === '2025-01')).toBe(false);
    expect(withOld.points.reduce((sum, p) => sum + p.totalAmount, 0)).toBe(
      demoOnly.points.reduce((sum, p) => sum + p.totalAmount, 0),
    );
  });
});
