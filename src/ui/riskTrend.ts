// 风险驾驶舱月度趋势 - 纯函数模块
// 按发票开具日期（invoice.issueDate）聚合近 N 个月的张数、金额、高风险数
// 时间锚点取数据中最新月份（本地 + 演示合并），保证演示样例始终落在窗口内。

import type { DemoCase, WorkflowSession } from '../domain/types';

export interface MonthlyTrendPoint {
  // 月份标签：YYYY-MM
  month: string;
  count: number;
  totalAmount: number;
  highRiskCount: number;
}

export interface MonthlyTrend {
  points: MonthlyTrendPoint[];
  // 数据中最新月份（窗口右端点）
  anchorMonth: string;
}

// 解析 issueDate -> YYYY-MM；非法日期返回 null
export function parseIssueMonth(issueDate: string): string | null {
  const match = /^(\d{4})-(\d{2})/.exec(issueDate.trim());
  return match ? `${match[1]}-${match[2]}` : null;
}

// 月份序列：从 anchor 往前推 N-1 个月
function monthRange(anchor: string, months: number): string[] {
  const [year, month] = anchor.split('-').map(Number);
  const result: string[] = [];
  for (let i = months - 1; i >= 0; i -= 1) {
    const d = new Date(Date.UTC(year, month - 1 - i, 1));
    result.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
  }
  return result;
}

interface TrendFact {
  month: string | null;
  amount: number;
  isHighRisk: boolean;
}

function mapLocalTrendFact(session: WorkflowSession): TrendFact {
  return {
    month: parseIssueMonth(session.invoice.issueDate),
    amount: session.invoice.amount,
    isHighRisk: session.decisionDraft?.riskLevel === '高',
  };
}

function mapDemoTrendFact(item: DemoCase): TrendFact {
  return {
    month: parseIssueMonth(item.invoice.issueDate),
    amount: item.invoice.amount,
    isHighRisk: item.riskDecision.riskLevel === '高',
  };
}

// 聚合近 N 个月趋势（无有效日期数据时返回空 points）
export function buildMonthlyTrend(
  localCases: WorkflowSession[],
  demoCases: DemoCase[],
  months = 6,
): MonthlyTrend {
  const facts = [
    ...localCases.map(mapLocalTrendFact),
    ...demoCases.map(mapDemoTrendFact),
  ];
  const validMonths = facts
    .map((f) => f.month)
    .filter((m): m is string => m !== null)
    .sort();
  if (validMonths.length === 0) {
    return { points: [], anchorMonth: '' };
  }
  const anchor = validMonths[validMonths.length - 1];
  const range = monthRange(anchor, months);

  const points = range.map((month) => {
    const matched = facts.filter((f) => f.month === month);
    return {
      month,
      count: matched.length,
      totalAmount: matched.reduce((sum, f) => sum + f.amount, 0),
      highRiskCount: matched.filter((f) => f.isHighRisk).length,
    };
  });
  return { points, anchorMonth: anchor };
}
