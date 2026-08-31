// DeepSeek 业务追问 / 风险初判服务（前端调用层）
//
// 职责：
//   1. 业务追问步骤：把发票票面发给后端 /api/deepseek/questions，由 DeepSeek
//      生成"严谨、真实、可对照票据作答"的结构化问题（含财税依据 hint、建议证据）
//   2. AI 风险初判：把票面 + 业务事件 + 证据链发给 /api/deepseek/risk，
//      由 DeepSeek 输出风险等级建议、风险卡片和结论摘要
// 两个接口失败时前端都有本地模板 / 规则兜底，不阻断流程。
import type { StructuredQuestion, RiskLevel } from '../domain/types';
import { authHeaders } from '../auth/authStorage';
import { deepSeekCredentialBody } from '../integrations/sessionKeyStore';

const MAPPED_FIELD_WHITELIST = new Set([
  'initiator', 'handler', 'claimant', 'participants', 'externalParty', 'occurredAt',
  'location', 'purpose', 'businessContent', 'department', 'project', 'contract',
  'paymentSubject', 'paymentMethod', 'beneficiary', 'companyBurdenReason',
]);

export interface DeepSeekQuestionsData {
  scenarioLabel: string;
  guidance: string;
  questions: StructuredQuestion[];
}

export type DeepSeekQuestionsResult =
  | { ok: true; data: DeepSeekQuestionsData }
  | { ok: false; message: string };

// 客户端二次校验：mappedField 白名单、问题数量，防止异常数据进入状态机
function sanitizeQuestions(raw: unknown): StructuredQuestion[] {
  const list = Array.isArray(raw) ? raw : [];
  const questions: StructuredQuestion[] = [];
  const seenIds = new Set<string>();
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const q = item as Partial<StructuredQuestion>;
    if (typeof q.text !== 'string' || !q.text.trim()) continue;
    if (typeof q.mappedField !== 'string' || !MAPPED_FIELD_WHITELIST.has(q.mappedField)) continue;
    let id = typeof q.id === 'string' && q.id.trim() ? q.id.trim() : `DS-${questions.length + 1}`;
    while (seenIds.has(id)) id = `${id}-x`;
    seenIds.add(id);
    questions.push({
      id,
      text: q.text.trim(),
      required: q.required === true,
      mappedField: q.mappedField,
      hint: typeof q.hint === 'string' && q.hint.trim() ? q.hint.trim() : '该字段是业务事实还原的必要信息。',
      suggestedEvidence: Array.isArray(q.suggestedEvidence)
        ? q.suggestedEvidence.filter((e): e is string => typeof e === 'string' && !!e.trim()).slice(0, 4)
        : [],
      options: Array.isArray(q.options)
        ? Array.from(
            new Set(
              q.options
                .filter((o): o is string => typeof o === 'string' && !!o.trim())
                .map((o) => o.trim()),
            ),
          ).slice(0, 4)
        : undefined,
    });
  }
  return questions;
}

export async function fetchDeepSeekQuestions(
  invoice: unknown,
): Promise<DeepSeekQuestionsResult> {
  try {
    const response = await fetch('/api/deepseek/questions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ invoice, ...deepSeekCredentialBody() }),
      // 超时兜底：后端 40s 内必有响应，网络悬挂时前端 45s 强制失败走模板回退
      signal: AbortSignal.timeout(45000),
    });
    const text = await response.text();
    let result: { ok?: boolean; data?: { scenarioLabel?: string; guidance?: string; questions?: unknown }; message?: string } | null = null;
    try {
      result = text ? JSON.parse(text) : null;
    } catch {
      result = null;
    }
    if (!result) {
      return { ok: false, message: `后端代理未启动或不可用（HTTP ${response.status}）` };
    }
    if (result.ok && result.data) {
      const questions = sanitizeQuestions(result.data.questions);
      if (questions.length >= 3) {
        return {
          ok: true,
          data: {
            scenarioLabel: result.data.scenarioLabel ?? '',
            guidance: result.data.guidance ?? '',
            questions,
          },
        };
      }
      return { ok: false, message: 'DeepSeek 生成的问题未达到最低质量要求，已回退本地模板。' };
    }
    return { ok: false, message: result.message || 'DeepSeek 问题生成失败。' };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'DeepSeek 请求失败。' };
  }
}

export interface DeepSeekRiskData {
  riskLevel: RiskLevel;
  summary: string;
  riskCards: string[];
  accountingFocus: string;
  vatFocus: string;
  citFocus: string;
}

export type DeepSeekRiskResult =
  | { ok: true; data: DeepSeekRiskData }
  | { ok: false; message: string };

const RISK_LEVEL_SET = new Set(['低', '中低', '中', '高']);

export async function fetchDeepSeekRisk(context: {
  invoice: unknown;
  businessEvent: unknown;
  evidenceChain: unknown;
  answers: unknown;
}): Promise<DeepSeekRiskResult> {
  try {
    const response = await fetch('/api/deepseek/risk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ ...context, ...deepSeekCredentialBody() }),
      signal: AbortSignal.timeout(45000),
    });
    const text = await response.text();
    let result: { ok?: boolean; data?: Partial<DeepSeekRiskData>; message?: string } | null = null;
    try {
      result = text ? JSON.parse(text) : null;
    } catch {
      result = null;
    }
    if (!result) {
      return { ok: false, message: `后端代理未启动或不可用（HTTP ${response.status}）` };
    }
    if (result.ok && result.data && typeof result.data.riskLevel === 'string' && RISK_LEVEL_SET.has(result.data.riskLevel)) {
      return {
        ok: true,
        data: {
          riskLevel: result.data.riskLevel as RiskLevel,
          summary: result.data.summary ?? '',
          riskCards: Array.isArray(result.data.riskCards)
            ? result.data.riskCards.filter((c): c is string => typeof c === 'string' && !!c.trim()).slice(0, 6)
            : [],
          accountingFocus: result.data.accountingFocus ?? '',
          vatFocus: result.data.vatFocus ?? '',
          citFocus: result.data.citFocus ?? '',
        },
      };
    }
    return { ok: false, message: result.message || 'DeepSeek 风险分析失败。' };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'DeepSeek 请求失败。' };
  }
}
