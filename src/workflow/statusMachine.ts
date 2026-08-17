import type { WorkflowStatus } from '../domain/types';

// 16 状态机的合法流转表
// 设计依据：CO_Gate2B多发票状态机与API配置方案.md
// 不允许跳过必要状态直接生成凭证草稿；高风险/证据缺失/业务事实不足必须进入复核、补证据或暂不能判断。

export const ALL_STATUSES: WorkflowStatus[] = [
  '待识别',
  '识别中',
  '待确认票面',
  '待还原业务',
  '待回答问题',
  '待补充证据',
  '业务已还原',
  '待风险判断',
  '待财务复核',
  '待负责人审批',
  '待生成凭证',
  '凭证草稿已生成',
  '已完成',
  '已退回',
  '暂不能判断',
  '已作废或已红冲',
];

// 合法流转表：from -> 允许到达的下一状态集合
// 设计依据：CO_Gate2B多发票状态机与API配置方案.md + reducer 实际路径
// 已覆盖 workflowReducer 的全部 finalStatus 变化路径，确保 WorkflowContext.dispatch 不会拒绝合法流转
const TRANSITION_TABLE: Record<WorkflowStatus, WorkflowStatus[]> = {
  '待识别': ['识别中'],
  '识别中': ['待确认票面', '暂不能判断'],
  '待确认票面': ['待还原业务', '待回答问题', '已作废或已红冲', '暂不能判断'],
  '待还原业务': ['待回答问题'],
  '待回答问题': ['待补充证据', '业务已还原', '暂不能判断'],
  // reducer UPLOAD_EVIDENCE 后：待补充证据 -> 待风险判断
  '待补充证据': ['业务已还原', '待回答问题', '待风险判断'],
  '业务已还原': ['待风险判断'],
  '待风险判断': ['待财务复核', '待生成凭证', '待补充证据', '暂不能判断'],
  // reducer ADOPT_DECISION 证据闸门阻断时：待财务复核 -> 待补充证据（回证据补充）
  // Gate 3：异常工作台补料完整后：待财务复核 -> 待风险判断（重新进入 AI 风险初判）
  '待财务复核': ['待负责人审批', '待生成凭证', '已退回', '暂不能判断', '待补充证据', '待风险判断'],
  '待负责人审批': ['待生成凭证', '已退回', '暂不能判断'],
  // reducer GENERATE_DECISION 中风险时：待生成凭证 -> 待财务复核（mockGenerateDecisionDraft 返回）
  '待生成凭证': ['凭证草稿已生成', '暂不能判断', '待财务复核'],
  '凭证草稿已生成': ['已完成', '待财务复核'],
  '已完成': [],
  '已退回': ['待回答问题', '待补充证据'],
  // Gate 3：异常工作台补资料回流，允许暂不能判断 -> 待补充证据 / 待风险判断（证据补齐后直接进入AI风险初判）
  '暂不能判断': ['待回答问题', '待补充证据', '待确认票面', '待风险判断'],
  '已作废或已红冲': [],
};

// 判断 from -> to 是否合法
export function canTransition(from: WorkflowStatus, to: WorkflowStatus): boolean {
  const allowed = TRANSITION_TABLE[from];
  return Array.isArray(allowed) && allowed.includes(to);
}

// 执行流转：合法返回 to，非法抛出错误（不静默吞掉）
export function transitionStatus(from: WorkflowStatus, to: WorkflowStatus): WorkflowStatus {
  if (!canTransition(from, to)) {
    throw new Error(`非法状态流转：${from} -> ${to}。`);
  }
  return to;
}

// 终态判定：进入后不能再流出
export function isTerminalStatus(status: WorkflowStatus): boolean {
  return TRANSITION_TABLE[status].length === 0;
}

// 获取某状态的允许下一状态列表（供 UI 提示）
export function nextAllowedStatuses(from: WorkflowStatus): WorkflowStatus[] {
  return [...TRANSITION_TABLE[from]];
}

// 生成状态流转日志文本
export function formatTransitionLog(from: WorkflowStatus, to: WorkflowStatus, note?: string): string {
  const base = `状态流转：${from} → ${to}`;
  return note ? `${base}（${note}）` : base;
}
