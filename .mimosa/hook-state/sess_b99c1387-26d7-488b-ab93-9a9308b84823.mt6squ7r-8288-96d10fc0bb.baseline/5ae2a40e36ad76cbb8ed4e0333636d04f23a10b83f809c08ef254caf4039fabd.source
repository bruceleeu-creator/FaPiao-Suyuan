import { describe, expect, it } from 'vitest';
import { demoCases } from '../data/demoCases';
import type { DemoCase, Invoice, WorkflowSession } from '../domain/types';
import {
  buildDimensionBreakdown,
  buildDimensionBreakdownLink,
  resolvePersonLabel,
} from './riskDimensions';

function buildInvoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
    id: 'INV-DIM-001',
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

function buildBusinessEvent(overrides: Partial<WorkflowSession['businessEvent']> = {}): WorkflowSession['businessEvent'] {
  return {
    id: 'BE-DIM-001',
    invoiceId: 'INV-DIM-001',
    scenario: '客户业务招待',
    initiator: '待补充',
    handler: '待补充',
    claimant: '待补充',
    participants: [],
    externalParty: '待补充',
    occurredAt: '2026-07-12',
    location: '杭州',
    purpose: '客户招待',
    businessContent: '招待客户用餐',
    department: '待补充',
    project: '无',
    contract: '无',
    paymentSubject: '浙江示例科技有限公司',
    paymentMethod: '员工垫付',
    beneficiary: '销售部',
    companyBurdenReason: '客户维护',
    conflicts: [],
    confidence: 0.82,
    requiredQuestionsAnswered: true,
    ...overrides,
  };
}

function buildSession(overrides: Partial<WorkflowSession> = {}): WorkflowSession {
  return {
    caseId: 'CASE-DIM-001',
    currentStep: '生成建议',
    completedSteps: [],
    invoice: buildInvoice(),
    businessEvent: buildBusinessEvent(),
    evidenceChain: {} as WorkflowSession['evidenceChain'],
    aiInterventions: [],
    actionLogs: [],
    finalStatus: '凭证草稿已生成',
    ...overrides,
  };
}

describe('resolvePersonLabel', () => {
  it('按 handler -> claimant -> initiator 兜底链取值', () => {
    expect(resolvePersonLabel(buildBusinessEvent({ handler: '张三' }))).toBe('张三');
    expect(resolvePersonLabel(buildBusinessEvent({ claimant: '李四' }))).toBe('李四');
    expect(resolvePersonLabel(buildBusinessEvent({ initiator: '王五' }))).toBe('王五');
    expect(resolvePersonLabel(buildBusinessEvent())).toBe('未填写');
  });
});

describe('buildDimensionBreakdown', () => {
  it('部门维度：本地 + 演示合并聚合，未填写归入统一标签', () => {
    const sales = buildSession({
      caseId: 'CASE-D1',
      invoice: buildInvoice({ amount: 5000 }),
      businessEvent: buildBusinessEvent({ department: '销售部' }),
    });
    const unfilled = buildSession({ caseId: 'CASE-D2', invoice: buildInvoice({ amount: 1000 }) });
    const rows = buildDimensionBreakdown([sales, unfilled], demoCases, 'department');
    const labels = rows.map((r) => r.label);
    expect(labels).toContain('销售部');
    expect(labels).toContain('未填写');
    // 金额降序
    const amounts = rows.map((r) => r.totalAmount);
    expect([...amounts].sort((a, b) => b - a)).toEqual(amounts);
    const salesRow = rows.find((r) => r.label === '销售部')!;
    const demoSalesCount = demoCases.filter((c) => c.businessEvent.department === '销售部').length;
    expect(salesRow.count).toBe(1 + demoSalesCount);
    expect(salesRow.drilldownLink).toBe('/invoices?dimension=department&value=%E9%94%80%E5%94%AE%E9%83%A8');
  });

  it('供应商维度：按 seller 聚合并统计高风险数', () => {
    const rows = buildDimensionBreakdown([], demoCases, 'supplier');
    expect(rows.length).toBeGreaterThan(0);
    // 4 个演示案例 seller 各不相同
    expect(rows.every((r) => r.count >= 1)).toBe(true);
    const totalHighRisk = rows.reduce((sum, r) => sum + r.highRiskCount, 0);
    expect(totalHighRisk).toBe(demoCases.filter((c) => c.riskDecision.riskLevel === '高').length);
  });

  it('人员维度：演示案例经兜底链解析出经办人', () => {
    const rows = buildDimensionBreakdown([], demoCases, 'person');
    // 演示案例 handler 形如「销售部-陈立」
    expect(rows.some((r) => r.label !== '未填写')).toBe(true);
  });

  it('topN 截断：超出条数按金额保留前 N', () => {
    const many: WorkflowSession[] = Array.from({ length: 12 }, (_, i) =>
      buildSession({
        caseId: `CASE-SUP-${i}`,
        invoice: buildInvoice({ seller: `供应商${i}`, amount: 1000 + i * 100 }),
      }),
    );
    const rows = buildDimensionBreakdown(many, [], 'supplier', 8);
    expect(rows.length).toBe(8);
    expect(rows[0].label).toBe('供应商11');
  });

  it('待整改数 = 任一闸门阻断/待补充 或 暂不能判断', () => {
    const blocked = buildSession({
      caseId: 'CASE-R1',
      finalStatus: '暂不能判断',
      businessEvent: buildBusinessEvent({ department: '销售部' }),
    });
    const rows = buildDimensionBreakdown([blocked], [], 'department');
    expect(rows.find((r) => r.label === '销售部')?.remediationCount).toBe(1);
  });
});

describe('buildDimensionBreakdownLink', () => {
  it('生成带编码的下钻链接', () => {
    expect(buildDimensionBreakdownLink('person', '销售部-陈立')).toBe(
      '/invoices?dimension=person&value=%E9%94%80%E5%94%AE%E9%83%A8-%E9%99%88%E7%AB%8B',
    );
  });
});
