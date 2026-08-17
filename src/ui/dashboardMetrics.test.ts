import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { WorkflowSession } from '../domain/types';
import { computeDashboardMetrics } from './dashboardMetrics';

// 模拟 WorkflowSession（仅 metrics 关心的字段）
function buildSession(
  caseId: string,
  overrides: Partial<WorkflowSession> = {},
): WorkflowSession {
  const base: WorkflowSession = {
    caseId,
    currentStep: '票面确认',
    completedSteps: [],
    invoice: {
      id: `INV-${caseId}`,
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
    },
    businessEvent: {
      id: `BE-${caseId}`,
      invoiceId: `INV-${caseId}`,
      scenario: '客户业务招待',
      initiator: '销售部-陈立',
      handler: '销售部-陈立',
      claimant: '销售部-陈立',
      participants: ['陈立'],
      externalParty: '客户',
      occurredAt: '2026-07-12',
      location: '杭州',
      purpose: '续约谈判',
      businessContent: '业务沟通',
      department: '销售部',
      project: 'Q3续约',
      contract: '无',
      paymentSubject: '公司',
      paymentMethod: '员工垫付',
      beneficiary: '公司',
      companyBurdenReason: '业务招待',
      conflicts: [],
      confidence: 0.9,
    },
    evidenceChain: {
      id: `EC-${caseId}`,
      invoiceId: `INV-${caseId}`,
      businessEventId: `BE-${caseId}`,
      requiredEvidence: ['发票'],
      uploadedEvidence: ['发票'],
      matchedEvidence: [],
      missingEvidence: [],
      conflictingEvidence: [],
      completenessScore: 80,
      status: '完整',
    },
    aiInterventions: [],
    actionLogs: [],
    finalStatus: '待确认票面',
  };
  return { ...base, ...overrides };
}

class MemoryStorage {
  private store = new Map<string, string>();
  get length() { return this.store.size; }
  key(index: number) { return Array.from(this.store.keys())[index] ?? null; }
  getItem(key: string) { return this.store.has(key) ? this.store.get(key)! : null; }
  setItem(key: string, value: string) { this.store.set(key, String(value)); }
  removeItem(key: string) { this.store.delete(key); }
  clear() { this.store.clear(); }
}

describe('Dashboard 仪表盘指标聚合', () => {
  let memoryStorage: MemoryStorage;

  beforeEach(() => {
    memoryStorage = new MemoryStorage();
    globalThis.window = globalThis.window || {};
    globalThis.window.localStorage = memoryStorage as unknown as Storage;
  });

  afterEach(() => {
    memoryStorage.clear();
  });

  it('空 cases 时所有指标为 0', () => {
    const m = computeDashboardMetrics([]);
    expect(m.totalInvoices).toBe(0);
    expect(m.pendingCount).toBe(0);
    expect(m.exceptionCount).toBe(0);
    expect(m.generatedDecisionCount).toBe(0);
    expect(m.pendingReviewCount).toBe(0);
  });

  it('totalInvoices = 本地 case 总数', () => {
    const m = computeDashboardMetrics([
      buildSession('CASE-A'),
      buildSession('CASE-B'),
      buildSession('CASE-C'),
    ]);
    expect(m.totalInvoices).toBe(3);
  });

  it('pendingCount 排除已完成和已作废的终态', () => {
    const m = computeDashboardMetrics([
      buildSession('CASE-A', { finalStatus: '待确认票面' }),
      buildSession('CASE-B', { finalStatus: '已完成' }),
      buildSession('CASE-C', { finalStatus: '已作废或已红冲' }),
      buildSession('CASE-D', { finalStatus: '待财务复核' }),
    ]);
    // CASE-A 和 CASE-D 未进入终态
    expect(m.pendingCount).toBe(2);
  });

  it('generatedDecisionCount 统计有 decisionDraft 的 case', () => {
    const m = computeDashboardMetrics([
      buildSession('CASE-A'),
      buildSession('CASE-B', {
        decisionDraft: {
          version: 'v1',
          gates: [],
          accountingConclusion: '',
          vatConclusion: '',
          citConclusion: '',
          otherRiskNotes: [],
          evidenceConclusion: '',
          riskLevel: '低',
          confidence: 0.9,
          remediation: [],
          approvalRequirement: '',
          voucherDraft: { status: '可生成草稿', summary: '' },
          humanReviewRecords: [],
          finalStatus: '凭证草稿已生成',
        },
      }),
    ]);
    expect(m.generatedDecisionCount).toBe(1);
  });

  it('pendingReviewCount 统计待财务复核和待负责人审批', () => {
    const m = computeDashboardMetrics([
      buildSession('CASE-A', { finalStatus: '待财务复核' }),
      buildSession('CASE-B', { finalStatus: '待负责人审批' }),
      buildSession('CASE-C', { finalStatus: '待生成凭证' }),
      buildSession('CASE-D', { finalStatus: '已完成' }),
    ]);
    expect(m.pendingReviewCount).toBe(2);
  });

  it('exceptionCount 基于本地异常 case（验真失败、疑似重复等）', () => {
    const m = computeDashboardMetrics([
      buildSession('CASE-A', {
        invoice: {
          ...buildSession('CASE-A').invoice,
          verificationStatus: '验真失败',
        },
      }),
      buildSession('CASE-B'),
    ]);
    // CASE-A 验真失败 -> 异常
    expect(m.exceptionCount).toBe(1);
  });

  it('integrationSummaries 返回 3 个接口配置摘要', () => {
    const m = computeDashboardMetrics([]);
    expect(m.integrationSummaries.length).toBe(3);
    const keys = m.integrationSummaries.map((i) => i.key);
    expect(keys).toContain('ocr');
    expect(keys).toContain('verify');
    expect(keys).toContain('voucher');
  });

  it('hasDisabledOfficialIntegration：默认模拟模式应为 false', () => {
    const m = computeDashboardMetrics([]);
    // 默认配置都是模拟 + 启用，所以应为 false
    expect(m.hasDisabledOfficialIntegration).toBe(false);
  });
});
