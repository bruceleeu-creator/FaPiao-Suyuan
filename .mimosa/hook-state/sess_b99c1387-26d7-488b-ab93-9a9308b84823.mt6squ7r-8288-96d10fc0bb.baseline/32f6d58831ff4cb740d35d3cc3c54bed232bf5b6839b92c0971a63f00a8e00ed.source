// 风险驾驶舱维度下钻 - 纯函数模块
// 按部门 / 人员 / 供应商三个维度聚合风险结构（管理端视角）：
//   部门：businessEvent.department（未填写归入「未填写」）
//   人员：经办人 handler -> 报销人 claimant -> 发起人 initiator 兜底链
//   供应商：invoice.seller
// 数据源与下钻列表一致：本地 case + 演示样例合并。

import type { DemoCase, WorkflowSession } from '../domain/types';

export type DimensionKey = 'department' | 'person' | 'supplier';

export const DIMENSION_LABEL: Record<DimensionKey, string> = {
  department: '部门',
  person: '人员',
  supplier: '供应商',
};

// 归属未填写时的统一标签（业务追问未覆盖或流程早期）
export const UNFILLED_LABEL = '未填写';

interface DimensionFact {
  label: string;
  amount: number;
  isHighRisk: boolean;
  needsRemediation: boolean;
}

// 标签归一：空值/待补充 -> 未填写（riskDrilldown 维度筛选共用）
export function normalizeDimensionLabel(value: string | undefined): string {
  const trimmed = (value ?? '').trim();
  if (!trimmed || trimmed === '待补充') return UNFILLED_LABEL;
  return trimmed;
}

// 人员归属：handler -> claimant -> initiator 兜底链
export function resolvePersonLabel(businessEvent: WorkflowSession['businessEvent']): string {
  return normalizeDimensionLabel(
    businessEvent.handler !== '待补充'
      ? businessEvent.handler
      : businessEvent.claimant !== '待补充'
        ? businessEvent.claimant
        : businessEvent.initiator,
  );
}

function hasBlockedOrPendingGates(gates: { status: string }[]): boolean {
  return gates.some((g) => g.status === '阻断' || g.status === '待补充');
}

function mapLocalFact(session: WorkflowSession, dimension: DimensionKey): DimensionFact {
  const riskLevel = session.decisionDraft?.riskLevel ?? null;
  return {
    label:
      dimension === 'department'
        ? normalizeDimensionLabel(session.businessEvent.department)
        : dimension === 'person'
          ? resolvePersonLabel(session.businessEvent)
          : normalizeDimensionLabel(session.invoice.seller),
    amount: session.invoice.amount,
    isHighRisk: riskLevel === '高',
    needsRemediation:
      hasBlockedOrPendingGates(session.decisionDraft?.gates ?? []) ||
      session.finalStatus === '暂不能判断',
  };
}

function mapDemoFact(item: DemoCase, dimension: DimensionKey): DimensionFact {
  return {
    label:
      dimension === 'department'
        ? normalizeDimensionLabel(item.businessEvent.department)
        : dimension === 'person'
          ? resolvePersonLabel(item.businessEvent)
          : normalizeDimensionLabel(item.invoice.seller),
    amount: item.invoice.amount,
    isHighRisk: item.riskDecision.riskLevel === '高',
    needsRemediation:
      hasBlockedOrPendingGates(item.gates) || item.riskDecision.finalStatus === '暂不能判断',
  };
}

export interface DimensionBreakdownRow {
  dimension: DimensionKey;
  label: string;
  count: number;
  totalAmount: number;
  highRiskCount: number;
  remediationCount: number;
  // 下钻到发票列表的链接（按维度+值筛选）
  drilldownLink: string;
}

export function buildDimensionBreakdownLink(dimension: DimensionKey, value: string): string {
  return `/invoices?dimension=${dimension}&value=${encodeURIComponent(value)}`;
}

// 聚合单个维度：按金额降序，默认取前 8 条
export function buildDimensionBreakdown(
  localCases: WorkflowSession[],
  demoCases: DemoCase[],
  dimension: DimensionKey,
  topN = 8,
): DimensionBreakdownRow[] {
  const facts = [
    ...localCases.map((session) => mapLocalFact(session, dimension)),
    ...demoCases.map((item) => mapDemoFact(item, dimension)),
  ];
  const grouped = new Map<string, DimensionFact[]>();
  for (const fact of facts) {
    const list = grouped.get(fact.label) ?? [];
    list.push(fact);
    grouped.set(fact.label, list);
  }
  return [...grouped.entries()]
    .map(([label, list]) => ({
      dimension,
      label,
      count: list.length,
      totalAmount: list.reduce((sum, f) => sum + f.amount, 0),
      highRiskCount: list.filter((f) => f.isHighRisk).length,
      remediationCount: list.filter((f) => f.needsRemediation).length,
      drilldownLink: buildDimensionBreakdownLink(dimension, label),
    }))
    .sort((a, b) => b.totalAmount - a.totalAmount)
    .slice(0, topN);
}
