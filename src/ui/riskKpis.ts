// 风险驾驶舱比率指标 - 纯函数模块
// 把「模拟值」替换为基于操作日志/AI 介入记录的真实统计：
//   AI 判断采纳率 / 人工修改率：来自 aiInterventions 风险解释阶段的 adoption（采纳/修改/退回）
//   凭证确认通过率：来自 actionLogs 中「凭证确认通过/凭证退回修正」（取最新一次）
//   误报率：来自 decisionDraft.falsePositiveCards / 风险卡片总数（otherRiskNotes 口径）
// 口径原则：分母为 0 时返回 null（页面显示「暂无数据」），不得强行形成结论。

import type { InvoiceCategory, WorkflowSession } from '../domain/types';

export type KpiFilterKey = 'ai-adoption' | 'manual-modify' | 'voucher-pass' | 'false-positive';

// 单张票据的复核结果（明细下钻按票据逐行隔离展示）
export interface ReviewOutcomeRow {
  caseId: string;
  invoiceNumber: string;
  seller: string;
  category: InvoiceCategory;
  amount: number;
  // AI 结论复核结果：采纳/修改/退回；未完成人工复核时为「未复核」
  aiAdoption: '采纳' | '修改' | '退回' | '未复核';
  // 凭证确认结果：最新一次确认动作；未确认过为「未确认」
  voucherConfirmation: '通过' | '退回修正' | '未确认';
  // 误报标记数 / 风险卡片总数（本地风险卡片 = decisionDraft.otherRiskNotes）
  falsePositiveCount: number;
  riskCardCount: number;
  detailPath: string;
}

export interface RiskKpiSummary {
  // 各比率：分母为 0 时为 null（页面显示「暂无数据」）
  aiAdoptionRate: number | null;
  manualModifyRate: number | null;
  voucherPassRate: number | null;
  falsePositiveRate: number | null;
  // 分母明细（摘要条展示）
  reviewedCount: number;
  voucherConfirmedCount: number;
  totalRiskCards: number;
  falsePositiveCards: number;
}

// 提取 case 的 AI 结论复核结果
export function extractAiAdoption(session: WorkflowSession): ReviewOutcomeRow['aiAdoption'] {
  const intervention = session.aiInterventions.find((item) => item.stage === '风险解释');
  if (!intervention) return '未复核';
  if (intervention.adoption === '采纳' || intervention.adoption === '修改' || intervention.adoption === '退回') {
    return intervention.adoption;
  }
  return '未复核';
}

// 提取 case 的凭证确认结果（最新一次）
export function extractVoucherConfirmation(session: WorkflowSession): ReviewOutcomeRow['voucherConfirmation'] {
  let result: ReviewOutcomeRow['voucherConfirmation'] = '未确认';
  for (const log of session.actionLogs) {
    if (log.action === '凭证确认通过') result = '通过';
    else if (log.action === '凭证退回修正') result = '退回修正';
  }
  return result;
}

// 构建按票据隔离的复核明细行
export function computeReviewOutcomeRows(cases: WorkflowSession[]): ReviewOutcomeRow[] {
  return cases.map((session) => ({
    caseId: session.caseId,
    invoiceNumber: session.invoice.invoiceNumber,
    seller: session.invoice.seller,
    category: session.invoice.category,
    amount: session.invoice.amount,
    aiAdoption: extractAiAdoption(session),
    voucherConfirmation: extractVoucherConfirmation(session),
    falsePositiveCount: session.decisionDraft?.falsePositiveCards?.length ?? 0,
    riskCardCount: session.decisionDraft?.otherRiskNotes?.length ?? 0,
    detailPath: `/invoices/${session.caseId}`,
  }));
}

// 比率计算：分母 0 -> null
function rate(numerator: number, denominator: number): number | null {
  if (denominator === 0) return null;
  return numerator / denominator;
}

// 汇总四个比率指标
export function computeRiskKpis(cases: WorkflowSession[]): RiskKpiSummary {
  const rows = computeReviewOutcomeRows(cases);
  const reviewed = rows.filter((row) => row.aiAdoption !== '未复核');
  const adopted = reviewed.filter((row) => row.aiAdoption === '采纳').length;
  const modified = reviewed.filter((row) => row.aiAdoption === '修改').length;

  const voucherConfirmed = rows.filter((row) => row.voucherConfirmation !== '未确认');
  const voucherPassed = voucherConfirmed.filter((row) => row.voucherConfirmation === '通过').length;

  const totalRiskCards = rows.reduce((sum, row) => sum + row.riskCardCount, 0);
  const falsePositiveCards = rows.reduce((sum, row) => sum + row.falsePositiveCount, 0);

  return {
    aiAdoptionRate: rate(adopted, reviewed.length),
    manualModifyRate: rate(modified, reviewed.length),
    voucherPassRate: rate(voucherPassed, voucherConfirmed.length),
    falsePositiveRate: rate(falsePositiveCards, totalRiskCards),
    reviewedCount: reviewed.length,
    voucherConfirmedCount: voucherConfirmed.length,
    totalRiskCards,
    falsePositiveCards,
  };
}

// KPI 行所需的最小复核结果字段（riskDrilldown 行结构兼容即可复用筛选）
export type KpiRowFields = Pick<
  ReviewOutcomeRow,
  'aiAdoption' | 'voucherConfirmation' | 'falsePositiveCount' | 'riskCardCount'
>;

// KPI 下钻：某比率指标命中哪些票据（每张票据独立一行，只统计进入分母的票据）
export function matchesKpiFilter(row: KpiRowFields, kpi: KpiFilterKey): boolean {
  switch (kpi) {
    case 'ai-adoption':
    case 'manual-modify':
      return row.aiAdoption !== '未复核';
    case 'voucher-pass':
      return row.voucherConfirmation !== '未确认';
    case 'false-positive':
      return row.riskCardCount > 0 || row.falsePositiveCount > 0;
  }
}

// 比率格式化：null -> 「暂无数据」；有值 -> 百分比（整数）
export function formatKpiRate(value: number | null): string {
  if (value === null) return '暂无数据';
  return `${Math.round(value * 100)}%`;
}
