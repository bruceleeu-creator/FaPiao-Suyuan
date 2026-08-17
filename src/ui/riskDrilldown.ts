// 风险驾驶舱指标下钻 - 统一工具模块
// 把本地 case 和演示 case 映射成同一种列表行，统一支持下钻入口：
//   金额指标 3 个：high-risk / remediation / pending-judgment
//   闸门指标 4 个：发票闸门 / 业务闸门 / 证据闸门 / 风险闸门
//   维度下钻 3 个：department / person / supplier（按维度值筛选）
//   比率指标 4 个：ai-adoption / manual-modify / voucher-pass / false-positive（按票据复核结果筛选）
// 不重复实现筛选逻辑，所有入口共用 buildRiskDrilldownRows + filterRiskDrilldownRows。

import type {
  DemoCase,
  GateCheck,
  GateStatus,
  InvoiceCategory,
  RiskLevel,
  WorkflowSession,
  WorkflowStatus,
} from '../domain/types';
import { normalizeDimensionLabel, resolvePersonLabel, type DimensionKey } from './riskDimensions';
import {
  extractAiAdoption,
  extractVoucherConfirmation,
  matchesKpiFilter,
  type KpiFilterKey,
  type KpiRowFields,
} from './riskKpis';

// 风险等级可能在本地 case 未生成 decisionDraft 时为 null，统一映射成 '待生成' 便于展示
export type RiskLevelOrPending = RiskLevel | '待生成';

export type DrilldownSource = 'local' | 'demo';

// 下钻筛选类型
export type RiskFilterKey = 'high-risk' | 'remediation' | 'pending-judgment';
export type GateFilterKey = GateCheck['name']; // '发票闸门' | '业务闸门' | '证据闸门' | '风险闸门'
export type { DimensionKey, KpiFilterKey };

export interface RiskDrilldownQuery {
  riskFilter?: RiskFilterKey;
  gate?: GateFilterKey;
  // 维度下钻：dimension + value 组合
  dimension?: DimensionKey;
  dimensionValue?: string;
  // 比率指标下钻（按票据复核结果筛选，仅本地 case 参与统计）
  kpi?: KpiFilterKey;
}

// 统一下钻行
export interface RiskDrilldownRow extends KpiRowFields {
  source: DrilldownSource;
  id: string;
  title: string;
  invoiceNumber: string;
  seller: string;
  category: InvoiceCategory;
  amount: number;
  riskLevel: RiskLevelOrPending;
  finalStatus: WorkflowStatus;
  gates: GateCheck[];
  remediation: string[];
  // 维度归属（部门/人员/供应商，归一化后标签，未填写 -> 「未填写」）
  department: string;
  person: string;
  supplier: string;
  // 发票详情路径（本地 case 和演示 case 均可访问）
  detailPath: string;
  // 本地 case 的处理路径（演示 case 不存在）
  workflowPath?: string;
  // 命中原因（按下钻筛选维度填充，至少 1 条）
  matchedReasons: string[];
  // 下一步建议（按闸门/风险/暂不能判断场景生成）
  nextActionHint: string;
}

const GATE_ORDER: GateFilterKey[] = ['发票闸门', '业务闸门', '证据闸门', '风险闸门'];

// 把本地 WorkflowSession 转成下钻行
// riskLevel 取自 decisionDraft.riskLevel，未生成则为 '待生成'
// gates 取自 decisionDraft.gates；若未生成（流程早期），则用空数组占位（仍可被闸门筛选命中为「未生成」场景）
function mapLocalCase(session: WorkflowSession): RiskDrilldownRow {
  const draft = session.decisionDraft;
  const riskLevel: RiskLevelOrPending = draft?.riskLevel ?? '待生成';
  const gates: GateCheck[] = draft?.gates ?? [];
  const remediation: string[] = draft?.remediation ?? [];
  const finalStatus: WorkflowStatus = session.finalStatus;

  return {
    source: 'local',
    id: session.caseId,
    title: `${session.invoice.category} - ${session.invoice.seller}`,
    invoiceNumber: session.invoice.invoiceNumber,
    seller: session.invoice.seller,
    category: session.invoice.category,
    amount: session.invoice.amount,
    riskLevel,
    finalStatus,
    gates,
    remediation,
    department: normalizeDimensionLabel(session.businessEvent.department),
    person: resolvePersonLabel(session.businessEvent),
    supplier: normalizeDimensionLabel(session.invoice.seller),
    aiAdoption: extractAiAdoption(session),
    voucherConfirmation: extractVoucherConfirmation(session),
    falsePositiveCount: draft?.falsePositiveCards?.length ?? 0,
    riskCardCount: draft?.otherRiskNotes?.length ?? 0,
    detailPath: `/invoices/${session.caseId}`,
    workflowPath: `/invoices/${session.caseId}/workflow`,
    matchedReasons: [], // 由 filterRiskDrilldownRows 按筛选维度填充
    nextActionHint: '',  // 由 filterRiskDrilldownRows 按筛选维度填充
  };
}

// 把演示 DemoCase 转成下钻行
// 演示样例无操作日志和 AI 介入记录，复核结果统一为「未复核/未确认」（比率指标只统计本地 case）
function mapDemoCase(item: DemoCase): RiskDrilldownRow {
  return {
    source: 'demo',
    id: item.id,
    title: item.title,
    invoiceNumber: item.invoice.invoiceNumber,
    seller: item.invoice.seller,
    category: item.invoice.category,
    amount: item.invoice.amount,
    riskLevel: item.riskDecision.riskLevel,
    finalStatus: item.riskDecision.finalStatus,
    gates: item.gates,
    remediation: item.riskDecision.remediation,
    department: normalizeDimensionLabel(item.businessEvent.department),
    person: resolvePersonLabel(item.businessEvent),
    supplier: normalizeDimensionLabel(item.invoice.seller),
    aiAdoption: '未复核',
    voucherConfirmation: '未确认',
    falsePositiveCount: 0,
    riskCardCount: 0,
    detailPath: `/invoices/${item.id}`,
    workflowPath: undefined, // 演示 case 不支持继续处理
    matchedReasons: [],
    nextActionHint: '',
  };
}

// 构建统一下钻行：本地 case 在前，演示 case 在后
export function buildRiskDrilldownRows(
  localCases: WorkflowSession[],
  demoCases: DemoCase[],
): RiskDrilldownRow[] {
  const localRows = localCases.map(mapLocalCase);
  const demoRows = demoCases.map(mapDemoCase);
  return [...localRows, ...demoRows];
}

// 查找行中某个闸门的状态（未生成 gates 时返回 undefined）
function findGateStatus(row: RiskDrilldownRow, gateName: GateFilterKey): GateStatus | undefined {
  return row.gates.find((g) => g.name === gateName)?.status;
}

// 是否任一闸门阻断或待补充
function hasAnyGateBlockedOrPending(row: RiskDrilldownRow): boolean {
  return row.gates.some((g) => g.status === '阻断' || g.status === '待补充');
}

// 命中原因构造（按下钻筛选维度）
function buildMatchedReasons(row: RiskDrilldownRow, query: RiskDrilldownQuery): string[] {
  const reasons: string[] = [];

  if (query.riskFilter === 'high-risk') {
    if (row.riskLevel === '高') {
      reasons.push('风险等级为「高」');
    }
  }

  if (query.riskFilter === 'remediation') {
    const blockedGates = row.gates.filter((g) => g.status === '阻断').map((g) => g.name);
    const pendingGates = row.gates.filter((g) => g.status === '待补充').map((g) => g.name);
    if (blockedGates.length > 0) {
      reasons.push(`闸门阻断：${blockedGates.join('、')}`);
    }
    if (pendingGates.length > 0) {
      reasons.push(`闸门待补充：${pendingGates.join('、')}`);
    }
    if (row.remediation.length > 0) {
      reasons.push(`整改建议：${row.remediation.join('；')}`);
    }
    // 兜底：若 remediation 筛选命中但上述都为空，仍给一条命中说明
    if (reasons.length === 0) {
      reasons.push('存在闸门阻断或待补充，或存在整改建议');
    }
  }

  if (query.riskFilter === 'pending-judgment') {
    if (row.finalStatus === '暂不能判断') {
      reasons.push('最终状态为「暂不能判断」');
    }
  }

  if (query.gate) {
    const status = findGateStatus(row, query.gate);
    const reasonText = row.gates.find((g) => g.name === query.gate)?.reason ?? '';
    if (status === '阻断') {
      reasons.push(`${query.gate}阻断${reasonText ? `：${reasonText}` : ''}`);
    } else if (status === '待补充') {
      reasons.push(`${query.gate}待补充${reasonText ? `：${reasonText}` : ''}`);
    }
    // 本地 case 未生成 gates 时给出明确提示
    if (row.source === 'local' && row.gates.length === 0) {
      reasons.push(`${query.gate}尚未生成（本地 case 未完成 AI 风险初判）`);
    }
  }

  if (query.dimension && query.dimensionValue) {
    const dimensionLabelMap: Record<DimensionKey, string> = {
      department: '部门',
      person: '人员',
      supplier: '供应商',
    };
    reasons.push(`${dimensionLabelMap[query.dimension]}归属：${row[query.dimension]}`);
  }

  if (query.kpi) {
    const kpiLabelMap: Record<KpiFilterKey, string> = {
      'ai-adoption': 'AI 判断采纳率',
      'manual-modify': '人工修改率',
      'voucher-pass': '凭证确认通过率',
      'false-positive': '误报率',
    };
    const metricName = kpiLabelMap[query.kpi];
    reasons.push(`AI 结论复核：${row.aiAdoption}；凭证确认：${row.voucherConfirmation}`);
    if (row.riskCardCount > 0 || row.falsePositiveCount > 0) {
      reasons.push(`误报标记 ${row.falsePositiveCount}/${row.riskCardCount} 张风险卡片`);
    }
    reasons.push(`该票据为「${metricName}」统计分母的一员（明细按票据隔离展示）`);
  }

  return reasons;
}

// 按 7 个入口规则生成下一步建议
function buildNextActionHint(row: RiskDrilldownRow, query: RiskDrilldownQuery): string {
  // 闸门下钻：按闸门类型给建议
  if (query.gate) {
    switch (query.gate) {
      case '发票闸门':
        return '重新核验票面字段、验真结果、重复票和红冲状态，必要时退回经办人补传清晰票据。';
      case '业务闸门':
        return '补充业务目的、参与人、受益人、承担理由，并完成 AI 必答问题后再生成 AI 风险初判。';
      case '证据闸门':
        return '补充合同、审批、付款、验收、行程、拜访、成果物等证据链材料，必要时点击「AI 生成模板」下载填写指引。';
      case '风险闸门':
        return '财务复核风险结论，必要时退回业务或证据补充，重新生成 AI 风险初判后再判断。';
    }
  }

  // 金额下钻：按指标类型给建议
  if (query.riskFilter === 'high-risk') {
    return '进入三阶段处理，优先完成业务问答和证据链复核；高风险事项必须人工确认，不得自动生成凭证草稿。';
  }
  if (query.riskFilter === 'remediation') {
    return '按命中闸门原因逐项补齐材料：先解除发票异常，再补业务事实，最后补证据链；每补一项重新生成 AI 风险初判。';
  }
  if (query.riskFilter === 'pending-judgment') {
    return '补齐业务事实和证据后重新生成 AI 风险初判；若仍无法判断，由财务负责人复核后决定是否退回或挂账。';
  }

  // 维度下钻：从归属维度切入处理
  if (query.dimension) {
    return '从该维度定位高风险或待整改票据，逐张进入三阶段处理；维度内的共性问题可反馈经办部门规范报销材料。';
  }

  // 比率指标下钻：按票据复核结果核对
  if (query.kpi === 'ai-adoption' || query.kpi === 'manual-modify') {
    return '核对每张票据的 AI 结论复核结果；修改和退回较多的场景应检查规则阈值或补充业务事实口径。';
  }
  if (query.kpi === 'voucher-pass') {
    return '核对每张票据的凭证确认结果；退回修正的票据应回到生成建议页修正后重新确认。';
  }
  if (query.kpi === 'false-positive') {
    return '核对每张票据的误报标记；误报较多的风险卡片应反馈调整规则阈值，减少无效风险提示。';
  }

  // 无下钻筛选：根据行自身情况给通用建议
  if (row.riskLevel === '高') {
    return '高风险事项，进入三阶段处理并人工复核。';
  }
  if (row.finalStatus === '暂不能判断') {
    return '补齐业务事实和证据后重新生成 AI 风险初判。';
  }
  if (hasAnyGateBlockedOrPending(row)) {
    return '按命中闸门原因逐项补齐材料。';
  }
  return '可继续推进流程或查看详情。';
}

// 行是否命中下钻筛选
function matchesQuery(row: RiskDrilldownRow, query: RiskDrilldownQuery): boolean {
  if (query.riskFilter === 'high-risk') {
    return row.riskLevel === '高';
  }
  if (query.riskFilter === 'remediation') {
    return (
      hasAnyGateBlockedOrPending(row) ||
      row.remediation.length > 0
    );
  }
  if (query.riskFilter === 'pending-judgment') {
    return row.finalStatus === '暂不能判断';
  }
  if (query.gate) {
    const status = findGateStatus(row, query.gate);
    // 本地 case 未生成 gates 时不命中闸门下钻（避免把流程早期的发票误归入闸门阻断列表）
    return status === '阻断' || status === '待补充';
  }
  // 维度下钻：维度标签精确匹配（值已归一化，未填写的票据用「未填写」查询）
  if (query.dimension && query.dimensionValue) {
    return row[query.dimension] === query.dimensionValue;
  }
  // 比率指标下钻：仅本地 case 参与统计（演示样例无操作日志，不进分母）
  if (query.kpi) {
    return row.source === 'local' && matchesKpiFilter(row, query.kpi);
  }
  // 无筛选：所有行都返回
  return true;
}

// 按下钻筛选过滤行，并填充 matchedReasons 和 nextActionHint
export function filterRiskDrilldownRows(
  rows: RiskDrilldownRow[],
  query: RiskDrilldownQuery,
): RiskDrilldownRow[] {
  return rows
    .filter((row) => matchesQuery(row, query))
    .map((row) => {
      const matchedReasons = buildMatchedReasons(row, query);
      const nextActionHint = buildNextActionHint(row, query);
      return { ...row, matchedReasons, nextActionHint };
    });
}

// 下钻摘要：用于发票列表顶部展示
export interface RiskDrilldownSummary {
  // 是否处于下钻模式（有 riskFilter 或 gate）
  active: boolean;
  // 筛选来源名称（用于摘要条标题）
  sourceName: string;
  // 筛选说明（用于摘要条副标题）
  description: string;
  // 命中行
  matchedRows: RiskDrilldownRow[];
  // 命中数量
  matchedCount: number;
  // 金额合计
  totalAmount: number;
  // 清除筛选后的链接
  clearLink: string;
  // 返回风险驾驶舱链接
  backToDashboard: string;
}

const FILTER_LABEL: Record<RiskFilterKey, string> = {
  'high-risk': '高风险金额',
  remediation: '待整改金额',
  'pending-judgment': '暂不能判断金额',
};

const FILTER_DESCRIPTION: Record<RiskFilterKey, string> = {
  'high-risk': '筛选所有风险等级为「高」的发票（仅本地真实录入的 case）。',
  remediation: '筛选任一闸门阻断或待补充，或存在整改建议的发票（仅本地真实录入的 case）。',
  'pending-judgment': '筛选最终状态为「暂不能判断」的发票（仅本地真实录入的 case）。',
};

const GATE_DESCRIPTION: Record<GateFilterKey, string> = {
  发票闸门: '筛选发票闸门为「阻断」或「待补充」的发票（票面、验真、重复、红冲异常）。',
  业务闸门: '筛选业务闸门为「阻断」或「待补充」的发票（业务目的、参与人、受益人未确认）。',
  证据闸门: '筛选证据闸门为「阻断」或「待补充」的发票（关键证据缺失或不足以证明）。',
  风险闸门: '筛选风险闸门为「阻断」或「待补充」的发票（高风险、低置信度或财务复核未通过）。',
};

const KPI_LABEL: Record<KpiFilterKey, string> = {
  'ai-adoption': 'AI 判断采纳率',
  'manual-modify': '人工修改率',
  'voucher-pass': '凭证确认通过率',
  'false-positive': '误报率',
};

const KPI_DESCRIPTION: Record<KpiFilterKey, string> = {
  'ai-adoption': '筛选完成人工复核（采纳/修改/退回）的本地票据，每张票据独立展示自己的复核结果。',
  'manual-modify': '筛选完成人工复核（采纳/修改/退回）的本地票据，每张票据独立展示自己的复核结果。',
  'voucher-pass': '筛选已执行凭证确认（通过/退回修正）的本地票据，每张票据独立展示确认结果。',
  'false-positive': '筛选已生成风险卡片的本地票据，每张票据独立展示误报标记情况。',
};

const DIMENSION_LABEL_MAP: Record<DimensionKey, string> = {
  department: '部门',
  person: '人员',
  supplier: '供应商',
};

export function getRiskDrilldownSummary(
  rows: RiskDrilldownRow[],
  query: RiskDrilldownQuery,
): RiskDrilldownSummary {
  const active = !!(query.riskFilter || query.gate || (query.dimension && query.dimensionValue) || query.kpi);
  const matchedRows = active ? filterRiskDrilldownRows(rows, query) : [];
  const matchedCount = matchedRows.length;
  const totalAmount = matchedRows.reduce((sum, r) => sum + r.amount, 0);

  let sourceName = '全部发票';
  let description = '未启用下钻筛选，展示全部本地发票。';

  if (query.riskFilter) {
    sourceName = FILTER_LABEL[query.riskFilter];
    description = FILTER_DESCRIPTION[query.riskFilter];
  } else if (query.gate) {
    sourceName = query.gate;
    description = GATE_DESCRIPTION[query.gate];
  } else if (query.dimension && query.dimensionValue) {
    sourceName = `${DIMENSION_LABEL_MAP[query.dimension]}：${query.dimensionValue}`;
    description = `筛选${DIMENSION_LABEL_MAP[query.dimension]}归属为「${query.dimensionValue}」的发票（仅本地真实录入的 case）。`;
  } else if (query.kpi) {
    sourceName = KPI_LABEL[query.kpi];
    description = KPI_DESCRIPTION[query.kpi];
  }

  return {
    active,
    sourceName,
    description,
    matchedRows,
    matchedCount,
    totalAmount,
    clearLink: '/invoices',
    // 修复：风险驾驶舱实际路由为 /risks（旧值 /risk-dashboard 会被兜底路由重定向到首页）
    backToDashboard: '/risks',
  };
}

// 构建下钻链接（供风险驾驶舱卡片点击使用）
export function buildRiskDrilldownLink(filter: RiskDrilldownQuery): string {
  if (filter.riskFilter) {
    return `/invoices?riskFilter=${encodeURIComponent(filter.riskFilter)}`;
  }
  if (filter.gate) {
    return `/invoices?gate=${encodeURIComponent(filter.gate)}`;
  }
  if (filter.dimension && filter.dimensionValue) {
    return `/invoices?dimension=${filter.dimension}&value=${encodeURIComponent(filter.dimensionValue)}`;
  }
  if (filter.kpi) {
    return `/invoices?kpi=${encodeURIComponent(filter.kpi)}`;
  }
  return '/invoices';
}

// 导出闸门顺序，供页面渲染使用
export const DRILLDOWN_GATE_ORDER = GATE_ORDER;
