// 工作台仪表盘指标聚合 helper
// 数据来源优先级：本地 cases（WorkflowSession[]），无本地 case 时显示 0
// 不再依赖 demo 卡片作为主体，demo 仅作为快速体验入口

import type { WorkflowSession } from '../domain/types';
import { detectCaseExceptions } from '../cases/caseStore';
import { getIntegrationModeSummaries } from '../integrations/integrationConfigStore';

export interface DashboardMetrics {
  // 已录入发票数量（本地 case 总数）
  totalInvoices: number;
  // 待处理发票数量：未进入终态（已完成/已作废或已红冲）的 case
  pendingCount: number;
  // 异常/阻断数量
  exceptionCount: number;
  // 已生成风险建议数量（有 decisionDraft 的 case）
  generatedDecisionCount: number;
  // 待财务复核数量
  pendingReviewCount: number;
  // 接口配置状态摘要
  integrationSummaries: ReturnType<typeof getIntegrationModeSummaries>;
  // 是否存在正式模式且未启用的接口
  hasDisabledOfficialIntegration: boolean;
}

// 终态：进入后不能再流出
const TERMINAL_STATUSES = ['已完成', '已作废或已红冲'];

export function computeDashboardMetrics(cases: WorkflowSession[]): DashboardMetrics {
  const totalInvoices = cases.length;

  const pendingCount = cases.filter(
    (c) => !TERMINAL_STATUSES.includes(c.finalStatus),
  ).length;

  // 异常队列基于 detectCaseExceptions，与异常工作台保持一致
  // 直接基于传入的 cases 计算而非从 localStorage 读取，使 helper 更纯粹可测
  const exceptionCount = cases.filter(
    (c) => detectCaseExceptions(c).length > 0,
  ).length;

  const generatedDecisionCount = cases.filter((c) => c.decisionDraft).length;

  const pendingReviewCount = cases.filter(
    (c) => c.finalStatus === '待财务复核' || c.finalStatus === '待负责人审批',
  ).length;

  const integrationSummaries = getIntegrationModeSummaries();
  const hasDisabledOfficialIntegration = integrationSummaries.some(
    (item) => item.mode === '正式' && !item.enabled,
  );

  return {
    totalInvoices,
    pendingCount,
    exceptionCount,
    generatedDecisionCount,
    pendingReviewCount,
    integrationSummaries,
    hasDisabledOfficialIntegration,
  };
}
