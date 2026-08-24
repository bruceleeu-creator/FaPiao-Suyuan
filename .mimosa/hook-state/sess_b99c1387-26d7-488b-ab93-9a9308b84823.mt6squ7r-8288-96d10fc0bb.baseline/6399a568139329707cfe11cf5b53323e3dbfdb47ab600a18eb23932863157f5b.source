import { describe, expect, it } from 'vitest';
import type { AiIntervention, Invoice, UserActionLog, WorkflowSession } from '../domain/types';
import {
  computeReviewOutcomeRows,
  computeRiskKpis,
  formatKpiRate,
  matchesKpiFilter,
} from './riskKpis';

function buildInvoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
    id: 'INV-KPI-001',
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

function buildRiskIntervention(adoption: AiIntervention['adoption']): AiIntervention {
  return {
    stage: '风险解释',
    task: '规则引擎评估四道闸门与风险等级',
    inputSummary: '票面 + 业务事件 + 证据链',
    outputSummary: '风险等级与闸门结果',
    confidence: 0.85,
    questions: [],
    adoption,
  };
}

function buildLog(action: string, timestamp: string): UserActionLog {
  return {
    id: `LOG-${action}-${timestamp}`,
    operator: '当前用户',
    action,
    fromStep: '生成建议',
    toStep: '生成建议',
    timestamp,
    note: '',
  };
}

function buildSession(overrides: Partial<WorkflowSession> = {}): WorkflowSession {
  return {
    caseId: 'CASE-1752900000000-TEST01',
    currentStep: '生成建议',
    completedSteps: ['发票输入', '票面确认', '业务追问', '证据补充', 'AI风险初判', '人工复核', '生成建议'],
    invoice: buildInvoice(),
    businessEvent: {} as WorkflowSession['businessEvent'],
    evidenceChain: {} as WorkflowSession['evidenceChain'],
    aiInterventions: [],
    actionLogs: [],
    finalStatus: '凭证草稿已生成',
    ...overrides,
  };
}

describe('computeRiskKpis', () => {
  it('无任何复核数据时全部返回 null（暂无数据）', () => {
    const kpis = computeRiskKpis([buildSession()]);
    expect(kpis.aiAdoptionRate).toBeNull();
    expect(kpis.manualModifyRate).toBeNull();
    expect(kpis.voucherPassRate).toBeNull();
    expect(kpis.falsePositiveRate).toBeNull();
    expect(kpis.reviewedCount).toBe(0);
  });

  it('AI 采纳率与人工修改率按票据复核结果计算', () => {
    const adopted = buildSession({
      caseId: 'CASE-A',
      aiInterventions: [buildRiskIntervention('采纳')],
    });
    const modified = buildSession({
      caseId: 'CASE-B',
      aiInterventions: [buildRiskIntervention('修改')],
    });
    const returned = buildSession({
      caseId: 'CASE-C',
      aiInterventions: [buildRiskIntervention('退回')],
    });
    const kpis = computeRiskKpis([adopted, modified, returned]);
    expect(kpis.reviewedCount).toBe(3);
    expect(kpis.aiAdoptionRate).toBeCloseTo(1 / 3);
    expect(kpis.manualModifyRate).toBeCloseTo(1 / 3);
  });

  it('adoption 为「待处理」的 case 不计入分母', () => {
    const pending = buildSession({
      caseId: 'CASE-P',
      aiInterventions: [buildRiskIntervention('待处理')],
    });
    expect(computeRiskKpis([pending]).reviewedCount).toBe(0);
  });

  it('凭证确认通过率取每张票据最新一次确认动作', () => {
    const passed = buildSession({
      caseId: 'CASE-V1',
      aiInterventions: [buildRiskIntervention('采纳')],
      actionLogs: [buildLog('凭证确认通过', '2026-07-18T10:00:00.000Z')],
    });
    // 退回后又通过：最新为通过
    const reworked = buildSession({
      caseId: 'CASE-V2',
      aiInterventions: [buildRiskIntervention('采纳')],
      actionLogs: [
        buildLog('凭证退回修正', '2026-07-18T09:00:00.000Z'),
        buildLog('凭证确认通过', '2026-07-18T11:00:00.000Z'),
      ],
    });
    const returned = buildSession({
      caseId: 'CASE-V3',
      aiInterventions: [buildRiskIntervention('采纳')],
      actionLogs: [buildLog('凭证退回修正', '2026-07-18T08:00:00.000Z')],
    });
    const kpis = computeRiskKpis([passed, reworked, returned]);
    expect(kpis.voucherConfirmedCount).toBe(3);
    expect(kpis.voucherPassRate).toBeCloseTo(2 / 3);
  });

  it('误报率 = 误报卡片数 / 风险卡片总数（otherRiskNotes 口径）', () => {
    const withDraft = buildSession({
      caseId: 'CASE-F1',
      aiInterventions: [buildRiskIntervention('采纳')],
      decisionDraft: {
        version: 'v1',
        gates: [],
        accountingConclusion: '',
        vatConclusion: '',
        citConclusion: '',
        otherRiskNotes: ['大额支出需关注', '业务置信度偏低', '重复报销风险'],
        evidenceConclusion: '',
        riskLevel: '低',
        confidence: 0.9,
        remediation: [],
        approvalRequirement: '',
        voucherDraft: { status: '可生成草稿', summary: '' },
        humanReviewRecords: [],
        finalStatus: '凭证草稿已生成',
        businessQACompleted: true,
        falsePositiveCards: ['大额支出需关注'],
      },
    });
    const kpis = computeRiskKpis([withDraft]);
    expect(kpis.totalRiskCards).toBe(3);
    expect(kpis.falsePositiveCards).toBe(1);
    expect(kpis.falsePositiveRate).toBeCloseTo(1 / 3);
  });
});

describe('computeReviewOutcomeRows / matchesKpiFilter', () => {
  it('每张票据独立一行，未复核/未确认正确标注', () => {
    const rows = computeReviewOutcomeRows([
      buildSession({ caseId: 'CASE-A', aiInterventions: [buildRiskIntervention('采纳')] }),
      buildSession({ caseId: 'CASE-B' }),
    ]);
    expect(rows.length).toBe(2);
    expect(rows[0].aiAdoption).toBe('采纳');
    expect(rows[1].aiAdoption).toBe('未复核');
    expect(rows[1].voucherConfirmation).toBe('未确认');
    expect(rows[0].detailPath).toBe('/invoices/CASE-A');
  });

  it('KPI 筛选只命中进入分母的票据', () => {
    const reviewed = buildSession({ caseId: 'CASE-A', aiInterventions: [buildRiskIntervention('采纳')] });
    const unreviewed = buildSession({ caseId: 'CASE-B' });
    const rows = computeReviewOutcomeRows([reviewed, unreviewed]);
    expect(rows.filter((r) => matchesKpiFilter(r, 'ai-adoption')).map((r) => r.caseId)).toEqual(['CASE-A']);
    expect(rows.filter((r) => matchesKpiFilter(r, 'voucher-pass')).length).toBe(0);
  });
});

describe('formatKpiRate', () => {
  it('null 显示暂无数据，数值显示整数百分比', () => {
    expect(formatKpiRate(null)).toBe('暂无数据');
    expect(formatKpiRate(0.852)).toBe('85%');
    expect(formatKpiRate(1)).toBe('100%');
    expect(formatKpiRate(0)).toBe('0%');
  });
});
