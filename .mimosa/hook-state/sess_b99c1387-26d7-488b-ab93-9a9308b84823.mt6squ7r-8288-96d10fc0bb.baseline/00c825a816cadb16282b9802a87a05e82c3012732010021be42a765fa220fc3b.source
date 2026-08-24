import type { WorkflowSession } from '../domain/types';
import { readJSON, writeJSON, STORAGE_KEYS } from '../storage/localStore';
import { getThresholds } from '../rules/thresholdStore';

// 多发票 case 仓库
// 设计：每个 case = 一个 WorkflowSession（含发票、业务事件、证据链、AI 记录、操作日志、风险建议草稿）
// 持久化结构：WorkflowSession[] 列表 + active caseId 单独存储便于快速恢复

// 兼容归一：旧版本存储的验真状态（带「模拟」前缀）统一迁移为现行枚举值
// 迁移只发生在读取后的内存对象上，下次 saveAllCases 时自然写回新值
const LEGACY_VERIFICATION_MAP: Record<string, string> = {
  模拟验真通过: '验真通过',
  模拟验真失败: '验真失败',
  待模拟验真: '待验真',
};

function normalizeSession(session: WorkflowSession): WorkflowSession {
  const legacy = LEGACY_VERIFICATION_MAP[session.invoice?.verificationStatus ?? ''];
  if (!legacy) return session;
  return {
    ...session,
    invoice: { ...session.invoice, verificationStatus: legacy as WorkflowSession['invoice']['verificationStatus'] },
  };
}

export function loadAllCases(): WorkflowSession[] {
  return readJSON<WorkflowSession[]>(STORAGE_KEYS.cases, []).map(normalizeSession);
}

export function saveAllCases(cases: WorkflowSession[]): boolean {
  return writeJSON(STORAGE_KEYS.cases, cases);
}

export function loadActiveCaseId(): string | null {
  return readJSON<string | null>(STORAGE_KEYS.activeCaseId, null);
}

export function saveActiveCaseId(caseId: string | null): boolean {
  return writeJSON(STORAGE_KEYS.activeCaseId, caseId);
}

// 按 caseId 查找单个 case
export function findCase(caseId: string | null | undefined): WorkflowSession | null {
  if (!caseId) return null;
  const all = loadAllCases();
  return all.find((c) => c.caseId === caseId) ?? null;
}

// 新增 case：自动写入持久化，并设为 active
export function addCase(session: WorkflowSession): WorkflowSession {
  const all = loadAllCases();
  // 同名 caseId 直接覆盖（理论上 caseId 使用时间戳+随机，不会冲突）
  const next = all.filter((c) => c.caseId !== session.caseId);
  next.push(session);
  saveAllCases(next);
  saveActiveCaseId(session.caseId);
  return session;
}

// 更新单个 case：不存在时返回 false
export function updateCase(session: WorkflowSession): boolean {
  const all = loadAllCases();
  const idx = all.findIndex((c) => c.caseId === session.caseId);
  if (idx === -1) return false;
  all[idx] = session;
  return saveAllCases(all);
}

// 删除单个 case
export function removeCase(caseId: string): boolean {
  const all = loadAllCases();
  const next = all.filter((c) => c.caseId !== caseId);
  if (next.length === all.length) return false;
  saveAllCases(next);
  // 如果删除的是当前 active，清空 active
  if (loadActiveCaseId() === caseId) {
    saveActiveCaseId(null);
  }
  return true;
}

// 清空所有 case（仅供调试/重置使用，不暴露在 UI）
export function clearAllCases(): void {
  saveAllCases([]);
  saveActiveCaseId(null);
}

// 生成全局唯一 caseId：时间戳 + 随机后缀
export function generateCaseId(): string {
  const ts = Date.now();
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `CASE-${ts}-${rand}`;
}

// 异常 case 检测：返回该 case 是否存在异常条件，以及异常类型列表
export type ExceptionType =
  | '验真失败'
  | '疑似重复'
  | '红冲/作废'
  | '证据缺失'
  | '业务事实不足'
  | '低置信度'
  | '高风险'
  | '暂不能判断';

export interface CaseException {
  caseId: string;
  invoiceNumber: string;
  seller: string;
  category: string;
  amount: number;
  exceptions: ExceptionType[];
  currentStatus: string;
  session: WorkflowSession;
}

export function detectCaseExceptions(session: WorkflowSession): ExceptionType[] {
  const exceptions: ExceptionType[] = [];
  const { invoice, evidenceChain, businessEvent, finalStatus } = session;
  const thresholds = getThresholds();

  if (invoice.verificationStatus === '验真失败') {
    exceptions.push('验真失败');
  }
  if (invoice.duplicateStatus === '疑似重复') {
    exceptions.push('疑似重复');
  }
  if (invoice.redLetterStatus !== '正常') {
    exceptions.push('红冲/作废');
  }
  if (evidenceChain.missingEvidence.length > 0 || evidenceChain.status === '冲突') {
    exceptions.push('证据缺失');
  }
  // 业务事实不足：业务置信度低于告警线或业务目的为待补充
  if (businessEvent.confidence < thresholds.businessConfidenceWarnLine || businessEvent.purpose === '待补充') {
    exceptions.push('业务事实不足');
  }
  // 低置信度：OCR 置信度低于告警线
  if (invoice.recognitionConfidence < thresholds.ocrConfidenceWarnLine) {
    exceptions.push('低置信度');
  }
  // 高风险：通过 decisionDraft 风险等级判定
  if (session.decisionDraft?.riskLevel === '高') {
    exceptions.push('高风险');
  }
  if (finalStatus === '暂不能判断') {
    exceptions.push('暂不能判断');
  }
  return exceptions;
}

export function listExceptionCases(): CaseException[] {
  const all = loadAllCases();
  return all
    .map((session) => ({
      caseId: session.caseId,
      invoiceNumber: session.invoice.invoiceNumber,
      seller: session.invoice.seller,
      category: session.invoice.category,
      amount: session.invoice.amount,
      exceptions: detectCaseExceptions(session),
      currentStatus: session.finalStatus,
      session,
    }))
    .filter((item) => item.exceptions.length > 0);
}
