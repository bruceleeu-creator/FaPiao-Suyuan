// 异常工作台统一队列 - 纯函数模块
// 把本地 case 和演示样例映射成同一种异常行，统一支持：
//   统计概览（8 类异常计数+金额）、筛选（类型/来源/风险等级）、排序（优先级/金额/时间）
// 演示样例复用 adaptDemoCaseToWorkflowSession + detectCaseExceptions 推导异常，不另写一套判定口径。

import type { DemoCase, InvoiceCategory, RiskLevel, WorkflowSession, WorkflowStatus } from '../domain/types';
import { detectCaseExceptions } from '../cases/caseStore';
import type { ExceptionType } from '../cases/caseStore';
import { adaptDemoCaseToWorkflowSession } from '../data/demoCaseToDecisionDraft';

export type { ExceptionType };

export type ExceptionSource = 'local' | 'demo';
export type RiskLevelOrPending = RiskLevel | '待生成';

// 8 类异常的固定展示顺序（统计概览和筛选 chips 共用）
export const EXCEPTION_TYPE_ORDER: ExceptionType[] = [
  '验真失败',
  '疑似重复',
  '红冲/作废',
  '证据缺失',
  '业务事实不足',
  '低置信度',
  '高风险',
  '暂不能判断',
];

// 统一异常行
export interface ExceptionBoardRow {
  source: ExceptionSource;
  caseId: string;
  invoiceNumber: string;
  seller: string;
  category: InvoiceCategory;
  amount: number;
  exceptions: ExceptionType[];
  riskLevel: RiskLevelOrPending;
  currentStatus: WorkflowStatus;
  evidenceGaps: string[];
  insufficientEvidence: string[];
  detailPath: string;
  // 本地 case 的处理路径（演示 case 不存在）
  workflowPath?: string;
  // 业务时间：本地从 caseId 内嵌时间戳解析，演示用发票开具日期
  occurredAtMs: number;
}

// 已解除异常行（「已解除」tab 数据）
export interface ResolvedExceptionRow {
  caseId: string;
  invoiceNumber: string;
  seller: string;
  category: InvoiceCategory;
  amount: number;
  // 从解除日志 note 解析的原异常类型
  resolvedTypes: ExceptionType[];
  resolvedAt: string;
  currentStatus: WorkflowStatus;
  riskLevel: RiskLevelOrPending;
  detailPath: string;
  workflowPath: string;
}

// 从 caseId（CASE-<ts>-XXX）解析创建时间，解析失败返回 0
export function parseCaseTimestamp(caseId: string): number {
  const match = /^CASE-(\d+)-/.exec(caseId);
  return match ? Number(match[1]) : 0;
}

// 演示样例行有 decisionDraft，风险等级取自其中
function mapLocalCase(session: WorkflowSession): ExceptionBoardRow {
  return {
    source: 'local',
    caseId: session.caseId,
    invoiceNumber: session.invoice.invoiceNumber,
    seller: session.invoice.seller,
    category: session.invoice.category,
    amount: session.invoice.amount,
    exceptions: detectCaseExceptions(session),
    riskLevel: session.decisionDraft?.riskLevel ?? '待生成',
    currentStatus: session.finalStatus,
    evidenceGaps: session.evidenceChain.missingEvidence,
    insufficientEvidence: session.evidenceChain.insufficientEvidence ?? [],
    detailPath: `/invoices/${session.caseId}`,
    workflowPath: `/invoices/${session.caseId}/workflow`,
    occurredAtMs: parseCaseTimestamp(session.caseId),
  };
}

// 演示样例经 adapt 复用 detectCaseExceptions（同一套异常口径）
function mapDemoCase(item: DemoCase): ExceptionBoardRow {
  const session = adaptDemoCaseToWorkflowSession(item);
  return {
    source: 'demo',
    caseId: item.id,
    invoiceNumber: item.invoice.invoiceNumber,
    seller: item.invoice.seller,
    category: item.invoice.category,
    amount: item.invoice.amount,
    exceptions: detectCaseExceptions(session),
    riskLevel: item.riskDecision.riskLevel,
    currentStatus: item.riskDecision.finalStatus,
    evidenceGaps: item.evidenceChain.missingEvidence,
    insufficientEvidence: item.evidenceChain.insufficientEvidence ?? [],
    detailPath: `/invoices/${item.id}`,
    workflowPath: undefined,
    occurredAtMs: Date.parse(item.invoice.issueDate) || 0,
  };
}

// 构建统一异常队列：本地在前演示在后，仅保留存在异常的行
export function buildExceptionRows(
  localCases: WorkflowSession[],
  demoCases: DemoCase[],
): ExceptionBoardRow[] {
  const localRows = localCases
    .map(mapLocalCase)
    .filter((row) => row.exceptions.length > 0);
  const demoRows = demoCases
    .map(mapDemoCase)
    .filter((row) => row.exceptions.length > 0);
  return [...localRows, ...demoRows];
}

// 单类型统计
export interface ExceptionTypeStat {
  type: ExceptionType;
  count: number;
  totalAmount: number;
}

// 统计概览：按 8 类固定顺序输出（计数为 0 的也输出，供 chips 完整展示）
export function buildExceptionTypeStats(rows: ExceptionBoardRow[]): ExceptionTypeStat[] {
  return EXCEPTION_TYPE_ORDER.map((type) => {
    const matched = rows.filter((row) => row.exceptions.includes(type));
    return {
      type,
      count: matched.length,
      totalAmount: matched.reduce((sum, row) => sum + row.amount, 0),
    };
  });
}

// 筛选条件
export interface ExceptionBoardFilter {
  // 选中的异常类型（空数组 = 全部）
  types: ExceptionType[];
  source: 'all' | 'local' | 'demo';
  // 风险等级（不选 = 全部）
  riskLevel?: RiskLevel;
}

export const DEFAULT_EXCEPTION_FILTER: ExceptionBoardFilter = {
  types: [],
  source: 'all',
};

export function filterExceptionRows(
  rows: ExceptionBoardRow[],
  filter: ExceptionBoardFilter,
): ExceptionBoardRow[] {
  return rows.filter((row) => {
    if (filter.types.length > 0 && !filter.types.some((t) => row.exceptions.includes(t))) {
      return false;
    }
    if (filter.source !== 'all' && row.source !== filter.source) return false;
    if (filter.riskLevel && row.riskLevel !== filter.riskLevel) return false;
    return true;
  });
}

// 排序键
export type ExceptionSortKey = 'priority' | 'amount' | 'time' | 'exceptionCount';

// 优先级打分（仅用于排序，不在 UI 展示数值）：
//   高风险权重最高；票面硬异常（验真失败/疑似重复/红冲作废）次之；再按异常数量、金额兜底
const BLOCKING_TYPES: ExceptionType[] = ['验真失败', '疑似重复', '红冲/作废'];

function priorityScore(row: ExceptionBoardRow): number {
  let score = 0;
  if (row.exceptions.includes('高风险') || row.riskLevel === '高') score += 1000;
  score += row.exceptions.filter((t) => BLOCKING_TYPES.includes(t)).length * 300;
  if (row.exceptions.includes('暂不能判断')) score += 200;
  score += row.exceptions.length * 50;
  score += Math.min(row.amount / 10000, 100);
  return score;
}

export function sortExceptionRows(rows: ExceptionBoardRow[], key: ExceptionSortKey): ExceptionBoardRow[] {
  const sorted = [...rows];
  switch (key) {
    case 'amount':
      return sorted.sort((a, b) => b.amount - a.amount);
    case 'time':
      return sorted.sort((a, b) => b.occurredAtMs - a.occurredAtMs);
    case 'exceptionCount':
      return sorted.sort((a, b) => b.exceptions.length - a.exceptions.length || b.amount - a.amount);
    case 'priority':
    default:
      return sorted.sort((a, b) => priorityScore(b) - priorityScore(a));
  }
}

// 从解除日志 note 中解析原异常类型（note 格式：已解除异常：A、B。）
export function parseResolvedTypes(note: string): ExceptionType[] {
  const inner = /已解除异常：(.+?)。?$/.exec(note.trim())?.[1] ?? '';
  return EXCEPTION_TYPE_ORDER.filter((type) => inner.includes(type));
}

// 已解除异常行：本地 case 当前无异常但留有「异常已解除」日志
export function buildResolvedExceptionRows(localCases: WorkflowSession[]): ResolvedExceptionRow[] {
  const rows: ResolvedExceptionRow[] = [];
  for (const session of localCases) {
    if (detectCaseExceptions(session).length > 0) continue;
    const clearedLogs = session.actionLogs.filter((l) => l.action === '异常已解除');
    if (clearedLogs.length === 0) continue;
    // 取最后一次解除记录，合并全部解除过的类型
    const resolvedTypes = Array.from(
      new Set(clearedLogs.flatMap((l) => parseResolvedTypes(l.note ?? ''))),
    );
    rows.push({
      caseId: session.caseId,
      invoiceNumber: session.invoice.invoiceNumber,
      seller: session.invoice.seller,
      category: session.invoice.category,
      amount: session.invoice.amount,
      resolvedTypes,
      resolvedAt: clearedLogs[clearedLogs.length - 1].timestamp,
      currentStatus: session.finalStatus,
      riskLevel: session.decisionDraft?.riskLevel ?? '待生成',
      detailPath: `/invoices/${session.caseId}`,
      workflowPath: `/invoices/${session.caseId}/workflow`,
    });
  }
  return rows.sort((a, b) => Date.parse(b.resolvedAt) - Date.parse(a.resolvedAt));
}
