import type {
  AiIntervention,
  BusinessEvent,
  DecisionDraft,
  EvidenceChain,
  Invoice,
  RiskLevel,
  StructuredQuestion,
  UserActionLog,
  WorkflowSession,
  WorkflowStep,
} from '../domain/types';
import {
  checkRequiredQuestionsAnswered,
  mockGenerateQAGuidance,
  mockGenerateStructuredQuestions,
  mockScenarioLabel,
} from '../ai/mockQuestionService';
import {
  mockMatchEvidenceDetailed,
  mockRequiredEvidence,
  mockRequiredEvidenceGuidance,
} from '../ai/mockEvidenceMatcher';
import { mockAssessRiskLevel, mockEvaluateGates, mockGenerateDecisionDraft } from '../ai/mockRiskAdvisor';
import { detectCaseExceptions } from '../cases/caseStore';

// 流程步骤顺序
export const WORKFLOW_STEPS: WorkflowStep[] = [
  '发票输入',
  '票面确认',
  '业务追问',
  '证据补充',
  'AI风险初判',
  '人工复核',
  '生成建议',
];

let logCounter = 0;
const nextLogId = () => `LOG-${Date.now()}-${++logCounter}`;
const nowIso = () => new Date().toISOString();

function pushLog(
  session: WorkflowSession,
  action: string,
  fromStep?: WorkflowStep,
  toStep?: WorkflowStep,
  note?: string,
): UserActionLog[] {
  const log: UserActionLog = {
    id: nextLogId(),
    operator: '当前用户',
    action,
    fromStep,
    toStep,
    timestamp: nowIso(),
    note,
  };
  return [...session.actionLogs, log];
}

function ensureAiIntervention(
  interventions: AiIntervention[],
  stage: AiIntervention['stage'],
  task: string,
  inputSummary: string,
  outputSummary: string,
  confidence: number,
  questions: string[] = [],
): AiIntervention[] {
  const exists = interventions.find((item) => item.stage === stage);
  const next: AiIntervention = {
    stage,
    task,
    inputSummary,
    outputSummary,
    confidence,
    questions,
    adoption: '待处理',
  };
  return exists ? interventions.map((item) => (item.stage === stage ? next : item)) : [...interventions, next];
}

// 初始化业务事件对象（待用户回答追问后填充）
function buildInitialBusinessEvent(invoice: Invoice): BusinessEvent {
  return {
    id: `BE-${Date.now()}`,
    invoiceId: invoice.id,
    scenario: mockScenarioLabel(invoice.category),
    initiator: '待补充',
    handler: '待补充',
    claimant: '待补充',
    participants: [],
    externalParty: '待补充',
    occurredAt: invoice.issueDate,
    location: '待补充',
    purpose: '待补充',
    businessContent: '待补充',
    department: '待补充',
    project: '待补充',
    contract: '待补充',
    paymentSubject: '待补充',
    paymentMethod: '待补充',
    beneficiary: '待补充',
    companyBurdenReason: '待补充',
    conflicts: [],
    confidence: 0.5,
    // Gate 3：默认必答问题未完成
    requiredQuestionsAnswered: false,
    unansweredRequiredQuestions: mockGenerateStructuredQuestions(invoice.category)
      .filter((q) => q.required)
      .map((q) => q.text),
  };
}

// 初始化证据链对象（Gate 3：附结构化指导）
function buildInitialEvidenceChain(invoice: Invoice, businessEventId: string): EvidenceChain {
  const required = mockRequiredEvidence(invoice.category);
  const guidance = mockRequiredEvidenceGuidance(invoice.category);
  return {
    id: `EC-${Date.now()}`,
    invoiceId: invoice.id,
    businessEventId,
    requiredEvidence: required,
    uploadedEvidence: ['发票'],
    matchedEvidence: [],
    missingEvidence: required.filter((item) => item !== '发票'),
    conflictingEvidence: [],
    completenessScore: Math.round((1 / required.length) * 100),
    status: '缺失',
    evidenceGuidance: guidance,
    insufficientEvidence: [],
  };
}

// 创建流程会话
export function createWorkflowSession(invoice: Invoice): WorkflowSession {
  const businessEvent = buildInitialBusinessEvent(invoice);
  const evidenceChain = buildInitialEvidenceChain(invoice, businessEvent.id);
  return {
    caseId: `WF-${Date.now()}`,
    currentStep: '票面确认',
    completedSteps: ['发票输入'],
    invoice,
    businessEvent,
    evidenceChain,
    aiInterventions: [
      {
        stage: 'OCR识别',
        task: '从录入来源识别票面字段',
        inputSummary: `来源：${invoice.sourceFile}`,
        outputSummary: `识别 ${invoice.invoiceType} / ${invoice.category}，置信度 ${Math.round(invoice.recognitionConfidence * 100)}%。`,
        confidence: invoice.recognitionConfidence,
        questions: [],
        adoption: '待处理',
      },
    ],
    actionLogs: [
      {
        id: nextLogId(),
        operator: '当前用户',
        action: '开始识别',
        fromStep: '发票输入',
        toStep: '票面确认',
        timestamp: nowIso(),
        note: `录入发票 ${invoice.invoiceNumber}，进入票面确认。`,
      },
    ],
    finalStatus: '待确认票面',
    // Gate 3：初始化业务问答记录
    businessQA: mockGenerateStructuredQuestions(invoice.category),
    aiRiskStale: false,
  };
}

// 统一阻断判定：对齐 mockEvaluateGates / mockAssessRiskLevel 口径
// 任一闸门阻断、风险高、证据缺失、低置信度、红冲/作废、验真失败、疑似重复，都不得进入"待生成凭证"
// Gate 3：业务问答未完成也作为阻断条件
function computeBlockFlags(invoice: Invoice, businessEvent: BusinessEvent, evidenceChain: EvidenceChain) {
  const riskLevel = mockAssessRiskLevel(invoice, evidenceChain, businessEvent);
  const gates = mockEvaluateGates(invoice, businessEvent, evidenceChain, riskLevel);
  const anyGateBlocked = gates.some((g) => g.status === '阻断');
  const invoiceBlocked =
    invoice.verificationStatus === '验真失败' ||
    invoice.duplicateStatus === '疑似重复' ||
    invoice.redLetterStatus !== '正常';
  const evidenceMissing = evidenceChain.missingEvidence.length > 0 || evidenceChain.status === '冲突';
  const lowOcrConfidence = invoice.recognitionConfidence < 0.6;
  const lowBusinessConfidence = businessEvent.confidence < 0.7;
  const highRisk = riskLevel === '高';
  // Gate 3：业务问答未完成也算阻断
  const businessQABlocked = businessEvent.requiredQuestionsAnswered === false;
  const blocked = anyGateBlocked || invoiceBlocked || evidenceMissing || lowOcrConfidence || highRisk || businessQABlocked;
  return {
    riskLevel,
    gates,
    anyGateBlocked,
    invoiceBlocked,
    evidenceMissing,
    lowOcrConfidence,
    lowBusinessConfidence,
    highRisk,
    businessQABlocked,
    blocked,
  };
}

// Reducer Action 类型
export type WorkflowAction =
  | { type: 'CONFIRM_INVOICE'; patch: Partial<Invoice> }
  | { type: 'ANSWER_QUESTIONS'; answers: Record<string, string> }
  // DeepSeek 按票面动态生成的问题替换本地模板，并把建议证据并入证据清单
  | { type: 'LOAD_QUESTIONS'; questions: StructuredQuestion[]; guidance: string; scenarioLabel?: string }
  | { type: 'UPLOAD_EVIDENCE'; items: string[] }
  // analysis 可选：DeepSeek 风险分析（等级为建议值，与规则结果取更严者为最终等级）
  | {
      type: 'GENERATE_AI_RISK';
      analysis?: {
        suggestedLevel: RiskLevel;
        riskCards: string[];
        summary: string;
        accountingFocus?: string;
        vatFocus?: string;
        citFocus?: string;
      };
    }
  | { type: 'ADOPT_DECISION'; mode: '采纳' | '修改' | '退回'; note?: string }
  | { type: 'GENERATE_DECISION' }
  // 财务确认动作：凭证草稿生成后的通过/退回（凭证确认通过率统计来源）
  | { type: 'CONFIRM_VOUCHER'; mode: '通过' | '退回修正'; note?: string }
  // 误报标记动作：对风险卡片标记/取消误报（误报率统计来源）
  | { type: 'MARK_RISK_FALSE_POSITIVE'; card: string; marked: boolean; note?: string }
  | { type: 'RESUPPLY_EVIDENCE'; items: string[]; fromException?: boolean; targetCaseId?: string }
  | { type: 'INVALIDATE_AI_RISK'; reason?: string }
  | { type: 'NAVIGATE_STEP'; step: WorkflowStep }
  | { type: 'RESET' };

// 风险等级严格度排序：取更严者时使用（规则引擎与 DeepSeek 建议一致性规则）
const RISK_SEVERITY: Record<RiskLevel, number> = { '低': 0, '中低': 1, '中': 2, '高': 3 };
function stricterRiskLevel(a: RiskLevel, b: RiskLevel): RiskLevel {
  return RISK_SEVERITY[a] >= RISK_SEVERITY[b] ? a : b;
}

// 核心流转：只处理各 action 的状态变化
function coreReducer(state: WorkflowSession, action: WorkflowAction): WorkflowSession {
  switch (action.type) {
    case 'CONFIRM_INVOICE': {
      const invoice: Invoice = { ...state.invoice, ...action.patch, status: '待还原业务' };
      const businessEvent = buildInitialBusinessEvent(invoice);
      const evidenceChain = buildInitialEvidenceChain(invoice, businessEvent.id);
      return {
        ...state,
        invoice,
        businessEvent,
        evidenceChain,
        currentStep: '业务追问',
        completedSteps: [...state.completedSteps, '票面确认'],
        actionLogs: pushLog(state, '确认票面', '票面确认', '业务追问', '用户确认或修改了票面字段。'),
        // 方案 A：确认票面后进入「待回答问题」（贴合 16 状态定义）
        finalStatus: '待回答问题',
        // Gate 3：先用本地模板占位，进入业务追问后由 DeepSeek 按票面动态生成替换
        businessQA: mockGenerateStructuredQuestions(invoice.category),
        businessQASource: 'template',
        businessQAGuidance: mockGenerateQAGuidance(invoice.category),
        aiRiskStale: false,
      };
    }

    case 'LOAD_QUESTIONS': {
      // DeepSeek 按票面动态生成的问题替换本地模板（仅业务追问步骤允许）
      if (state.currentStep !== '业务追问') return state;
      const questions = action.questions;
      if (!Array.isArray(questions) || questions.length === 0) return state;

      // 问题建议的证据并入证据链：DeepSeek 建议作为"补充佐证"展示，
      // 不参与闸门硬判定（闸门口径仍由规则引擎的类别清单决定）
      const baseRequired = mockRequiredEvidence(state.invoice.category);
      const baseGuidance = mockRequiredEvidenceGuidance(state.invoice.category);
      const extraNames: string[] = [];
      for (const q of questions) {
        for (const e of q.suggestedEvidence) {
          if (e !== '发票' && !baseRequired.includes(e) && !extraNames.includes(e)) {
            extraNames.push(e);
          }
        }
      }
      const extraGuidance = extraNames.map((name) => {
        const related = questions.find((q) => q.suggestedEvidence.includes(name));
        return {
          name,
          required: false,
          proofPurpose: `DeepSeek 基于追问「${related?.text ?? ''}」建议补充的佐证材料。`,
          missingImpact: '缺失不阻断证据闸门，但会削弱业务真实性的证明力度并降低风险置信度。',
          sampleMaterial: name,
        };
      });
      const evidenceChain: EvidenceChain = {
        ...state.evidenceChain,
        requiredEvidence: [...baseRequired, ...extraNames],
        evidenceGuidance: [...baseGuidance, ...extraGuidance],
      };

      const interventions = ensureAiIntervention(
        state.aiInterventions,
        '业务还原',
        'DeepSeek 基于票面事实动态生成业务追问',
        `销方：${state.invoice.seller}；项目：${state.invoice.itemName}；价税合计：${state.invoice.amount + state.invoice.taxAmount} 元`,
        `已生成 ${questions.length} 个追问问题（必答 ${questions.filter((q) => q.required).length} 个）${extraNames.length > 0 ? `，建议证据 ${extraNames.length} 项已并入证据清单` : ''}。`,
        0.9,
        questions.map((q) => q.text),
      );

      return {
        ...state,
        businessQA: questions,
        businessQASource: 'deepseek',
        businessQAGuidance:
          action.guidance || state.businessQAGuidance || mockGenerateQAGuidance(state.invoice.category),
        evidenceChain,
        aiInterventions: interventions,
        actionLogs: pushLog(
          state,
          '生成追问（DeepSeek）',
          '业务追问',
          '业务追问',
          `DeepSeek 按票面生成 ${questions.length} 个问题（必答 ${questions.filter((q) => q.required).length} 个）${extraNames.length > 0 ? `；建议证据并入清单：${extraNames.join('、')}` : ''}。`,
        ),
      };
    }

    case 'ANSWER_QUESTIONS': {
      const answers = action.answers;
      const category = state.invoice.category;
      // 问题以 session.businessQA 为单一事实源（本地模板或 DeepSeek 动态生成均可）
      const activeQuestions: StructuredQuestion[] =
        state.businessQA && state.businessQA.length > 0
          ? state.businessQA
          : mockGenerateStructuredQuestions(category);
      // Gate 3：必答问题硬闸门检查（对动态问题集生效）
      const { allAnswered, unanswered } = checkRequiredQuestionsAnswered(activeQuestions, answers);
      const structuredQuestions: StructuredQuestion[] = activeQuestions.map((q) => ({
        ...q,
        userAnswer: answers[q.text] ?? '',
      }));

      // 计算回答完成度
      const answeredCount = activeQuestions.filter(
        (q) => (answers[q.text] ?? '').trim().length > 0,
      ).length;
      const allBlank = answeredCount === 0;
      const answerRatio = answeredCount / activeQuestions.length;
      const confidence = allBlank ? 0.4 : answerRatio >= 0.7 ? 0.82 : 0.55;

      // 按 mappedField 把答案写入业务事件（DeepSeek 动态问题与本地模板统一走此映射）
      // 同一字段被多个问题映射时取第一个非空回答
      const fieldAnswer = new Map<string, string>();
      for (const q of activeQuestions) {
        const value = (answers[q.text] ?? '').trim();
        if (value && !fieldAnswer.has(q.mappedField)) fieldAnswer.set(q.mappedField, value);
      }
      // 兼容本地模板的历史取值口径（文本 key 兜底，动态问题不依赖）
      const legacyPurpose =
        answers['业务目的是什么（如续约、谈判、客户维护）？'] ??
        answers['出差事由是什么？'] ??
        answers['关联的出差申请单号是？'] ??
        '';
      const legacyInitiator =
        answers['参与人有哪些（含本方与对方）？'] ?? answers['住宿人员是谁？'] ?? '';
      const purpose = (fieldAnswer.get('purpose') ?? legacyPurpose).trim() || '待补充';
      const initiatorRaw =
        fieldAnswer.get('initiator') ?? fieldAnswer.get('participants') ?? legacyInitiator;
      const initiator = initiatorRaw.trim() || '待补充';
      const externalParty = (fieldAnswer.get('externalParty') ?? '').trim() || '待补充';
      const participantsSource = fieldAnswer.get('participants') ?? initiatorRaw;
      const participants = participantsSource
        .split(/[，,、]/)
        .map((s) => s.trim())
        .filter(Boolean);

      // 其余业务事实字段：答案非空时覆盖"待补充"（合同/部门/付款/时间地点/受益人等）
      const extraFields = [
        'handler', 'claimant', 'occurredAt', 'location', 'businessContent', 'department',
        'project', 'contract', 'paymentSubject', 'paymentMethod', 'beneficiary', 'companyBurdenReason',
      ] as const;
      const extras: Partial<BusinessEvent> = {};
      for (const field of extraFields) {
        const value = fieldAnswer.get(field);
        if (value) (extras as Record<string, unknown>)[field] = value;
      }
      if (!extras.businessContent) extras.businessContent = purpose;

      // Gate 3：必答问题未完成 -> 业务闸门阻断，停留在业务追问步骤
      if (!allAnswered) {
        const businessEvent: BusinessEvent = {
          ...state.businessEvent,
          purpose,
          initiator,
          participants,
          externalParty,
          ...extras,
          confidence,
          requiredQuestionsAnswered: false,
          unansweredRequiredQuestions: unanswered,
        };
        const interventions = ensureAiIntervention(
          state.aiInterventions,
          '业务还原',
          '根据发票类型和用户回答还原业务事件（业务闸门阻断）',
          `发票类型：${category}；用户回答：${allBlank ? '（全部为空）' : Object.values(answers).filter((v) => v.trim()).join('；')}`,
          `业务闸门阻断：${unanswered.length} 个核心必答问题未答。${mockGenerateQAGuidance(category)}`,
          confidence,
          unanswered,
        );
        return {
          ...state,
          businessEvent,
          // 停留在业务追问，不推进步骤
          currentStep: '业务追问',
          completedSteps: state.completedSteps,
          aiInterventions: interventions,
          businessQA: structuredQuestions,
          actionLogs: pushLog(
            state,
            '回答被拒（必答问题未完成）',
            '业务追问',
            '业务追问',
            `核心必答问题未答 ${unanswered.length} 个：${unanswered.join('、')}。业务闸门阻断，不得进入证据补充。`,
          ),
          // 保持待回答问题状态（不流转）
          finalStatus: '待回答问题',
        };
      }

      // 必答完成，正常推进
      const businessEvent: BusinessEvent = {
        ...state.businessEvent,
        purpose,
        initiator,
        participants,
        externalParty,
        ...extras,
        confidence,
        requiredQuestionsAnswered: true,
        unansweredRequiredQuestions: [],
      };
      // 业务还原 AI 介入
      const interventions = ensureAiIntervention(
        state.aiInterventions,
        '业务还原',
        '根据发票类型和用户回答还原业务事件',
        `发票类型：${category}；用户回答：${Object.values(answers).filter((v) => v.trim()).join('；')}`,
        `还原场景：${businessEvent.scenario}；目的：${purpose}；核心必答问题已完成。`,
        confidence,
        activeQuestions.map((q) => q.text),
      );
      return {
        ...state,
        businessEvent,
        currentStep: '证据补充',
        completedSteps: [...state.completedSteps, '业务追问'],
        aiInterventions: interventions,
        businessQA: structuredQuestions,
        actionLogs: pushLog(
          state,
          '回答追问',
          '业务追问',
          '证据补充',
          `用户回答 ${answeredCount}/${activeQuestions.length} 个问题（${state.businessQASource === 'deepseek' ? 'DeepSeek 动态问题' : '本地模板'}），核心必答问题已完成，业务置信度 ${Math.round(confidence * 100)}%。`,
        ),
        finalStatus: '待补充证据',
      };
    }

    case 'UPLOAD_EVIDENCE': {
      const uploaded = Array.from(new Set([...state.evidenceChain.uploadedEvidence, ...action.items]));
      // Gate 3：使用 mockMatchEvidenceDetailed 计算结构化匹配结果
      const matchResult = mockMatchEvidenceDetailed(
        state.invoice.category,
        uploaded,
        state.evidenceChain.conflictingEvidence,
      );
      const evidenceChain: EvidenceChain = {
        ...state.evidenceChain,
        uploadedEvidence: uploaded,
        matchedEvidence: matchResult.matchedEvidence,
        missingEvidence: matchResult.missingEvidence,
        insufficientEvidence: matchResult.insufficientEvidence,
        conflictingEvidence: matchResult.conflictingEvidence,
        completenessScore: matchResult.completenessScore,
        status: matchResult.status,
      };
      const interventions = ensureAiIntervention(
        state.aiInterventions,
        '证据匹配',
        '比对已补充证据与必要证据清单（含证明目的和缺失影响）',
        `已上传：${uploaded.join('、')}`,
        `完整度 ${matchResult.completenessScore}%，缺口 ${matchResult.missingEvidence.length} 项，不足以证明 ${matchResult.insufficientEvidence.length} 项`,
        matchResult.missingEvidence.length === 0 && matchResult.insufficientEvidence.length === 0 ? 0.92 : 0.6,
        matchResult.remediationAdvice.map((a) => a.action),
      );
      return {
        ...state,
        evidenceChain,
        currentStep: 'AI风险初判',
        completedSteps: [...state.completedSteps, '证据补充'],
        aiInterventions: interventions,
        actionLogs: pushLog(
          state,
          '补充证据',
          '证据补充',
          'AI风险初判',
          `上传证据：${action.items.join('、')}。完整度 ${matchResult.completenessScore}%，缺口 ${matchResult.missingEvidence.length} 项，不足以证明 ${matchResult.insufficientEvidence.length} 项。`,
        ),
        finalStatus: '待风险判断',
        // Gate 3：上传新证据后旧 AI 风险结论失效（如果之前生成过）
        aiRiskStale: false,
      };
    }

    case 'GENERATE_AI_RISK': {
      // 规则引擎负责确定性定级（AGENTS 边界）；DeepSeek 提供解释与风险卡片，
      // 其建议等级只允许调严（取更严者），不允许放宽规则结论
      const ruleLevel = mockAssessRiskLevel(state.invoice, state.evidenceChain, state.businessEvent);
      const analysis = action.analysis;
      const adoptedLevel: RiskLevel = analysis
        ? stricterRiskLevel(ruleLevel, analysis.suggestedLevel)
        : ruleLevel;
      const confidence = Math.min(
        0.95,
        state.businessEvent.confidence * 0.6 + state.evidenceChain.completenessScore / 100 * 0.4,
      );
      const outputSummary = analysis
        ? `${analysis.summary || '（DeepSeek 未给出摘要）'}${analysis.riskCards.length > 0 ? `｜风险点：${analysis.riskCards.join('；')}` : ''}`
        : `风险等级：${adoptedLevel}（规则引擎判定）。`;
      const interventions = ensureAiIntervention(
        state.aiInterventions,
        '风险解释',
        analysis
          ? 'DeepSeek 综合票面、业务问答与证据生成风险分析（与规则定级取更严者）'
          : '生成风险等级和风险卡片',
        `发票金额 ${state.invoice.amount}，证据完整度 ${state.evidenceChain.completenessScore}%，业务问答完成 ${state.businessEvent.requiredQuestionsAnswered ? '是' : '否'}；规则等级 ${ruleLevel}${analysis ? `，DeepSeek 建议 ${analysis.suggestedLevel}` : ''}`,
        outputSummary,
        confidence,
      );
      return {
        ...state,
        currentStep: '人工复核',
        completedSteps: [...state.completedSteps, 'AI风险初判'],
        aiInterventions: interventions,
        // DeepSeek 风险分析结果（含最终采纳等级），供人工复核展示与生成建议引用
        aiRiskAnalysis: {
          source: analysis ? 'deepseek' : 'rule',
          suggestedLevel: adoptedLevel,
          riskCards: analysis?.riskCards ?? [],
          summary: analysis?.summary ?? '',
          accountingFocus: analysis?.accountingFocus,
          vatFocus: analysis?.vatFocus,
          citFocus: analysis?.citFocus,
        },
        actionLogs: pushLog(
          state,
          '生成 AI 初判',
          'AI风险初判',
          '人工复核',
          `AI 输出风险等级 ${adoptedLevel}${analysis ? `（规则 ${ruleLevel} / DeepSeek 建议 ${analysis.suggestedLevel}，取更严）` : ''}，置信度 ${Math.round(confidence * 100)}%。${state.aiRiskStale ? '（已重新生成，旧结论已失效）' : ''}`,
        ),
        finalStatus: '待财务复核',
        aiRiskStale: false,
      };
    }

    case 'ADOPT_DECISION': {
      const { mode, note } = action;
      const interventions = state.aiInterventions.map((item) =>
        item.stage === '风险解释' ? { ...item, adoption: mode, note } : item,
      );
      // 统一阻断判定：对齐 mockEvaluateGates / mockAssessRiskLevel 口径
      const flags = computeBlockFlags(state.invoice, state.businessEvent, state.evidenceChain);

      if (mode === '退回') {
        return {
          ...state,
          currentStep: '业务追问',
          completedSteps: state.completedSteps,
          aiInterventions: interventions,
          actionLogs: pushLog(state, '退回 AI 结论', '人工复核', '业务追问', note ?? '用户退回 AI 结论，需补充业务事实。'),
          finalStatus: '已退回',
        };
      }

      // 采纳/修改：优先以 flags.blocked / flags.anyGateBlocked 作为源头安全口径
      // 任一闸门阻断或风险高/证据缺失/低置信度/业务问答未完成，绝不得进入"待生成凭证"
      let nextStep: WorkflowStep;
      let finalStatus: WorkflowSession['finalStatus'];
      let blockReason = '';

      // 定位具体阻断闸门
      const invoiceGate = flags.gates.find((g) => g.name === '发票闸门');
      const businessGate = flags.gates.find((g) => g.name === '业务闸门');
      const evidenceGate = flags.gates.find((g) => g.name === '证据闸门');
      const riskGate = flags.gates.find((g) => g.name === '风险闸门');

      const invoiceGateBlocked = invoiceGate?.status === '阻断';
      const businessGateBlocked = businessGate?.status === '阻断';
      const evidenceGateBlocked = evidenceGate?.status === '阻断';
      const riskGateBlocked = riskGate?.status === '阻断';

      if (flags.blocked || flags.anyGateBlocked) {
        // 源头兜底：任一阻断，按阻断类型分流
        // Gate 3：业务闸门阻断优先回业务追问
        if (businessGateBlocked || flags.businessQABlocked) {
          nextStep = '业务追问';
          finalStatus = '待回答问题';
          blockReason = `阻断：业务闸门阻断（${businessGate?.reason ?? '业务问答未完成'}），需完成核心必答问题后重新判断。`;
        } else if (evidenceGateBlocked || flags.evidenceMissing) {
          // 证据闸门阻断 -> 回证据补充
          nextStep = '证据补充';
          finalStatus = '待补充证据';
          blockReason = `阻断：证据闸门阻断（缺口 ${state.evidenceChain.missingEvidence.length} 项），需补充证据后重新判断。`;
        } else {
          // 发票闸门/风险闸门阻断、高风险、低OCR置信度等 -> 暂不能判断
          nextStep = '业务追问';
          finalStatus = '暂不能判断';
          const reasons = [
            invoiceGateBlocked && '发票闸门阻断',
            riskGateBlocked && '风险闸门阻断',
            flags.highRisk && '高风险',
            flags.invoiceBlocked && '验真失败/疑似重复/红冲作废',
            flags.lowOcrConfidence && '低OCR置信度',
          ].filter(Boolean);
          blockReason = `阻断：${reasons.join('、') || '闸门阻断'}，不得生成凭证草稿。`;
        }
      } else if (flags.lowBusinessConfidence || flags.riskLevel === '中') {
        // 业务置信度偏低或中风险（重大金额）-> 待财务复核（必须人工确认）
        nextStep = '生成建议';
        finalStatus = '待财务复核';
        blockReason = `业务置信度偏低或风险等级为${flags.riskLevel}，凭证草稿需财务复核。`;
      } else {
        // 全部闸门通过且低风险 -> 待生成凭证
        nextStep = '生成建议';
        finalStatus = '待生成凭证';
        blockReason = '闸门与风险均通过，可生成凭证草稿。';
      }

      const completedSteps: WorkflowStep[] = nextStep === '生成建议'
        ? [...state.completedSteps, '人工复核']
        : state.completedSteps;

      return {
        ...state,
        currentStep: nextStep,
        completedSteps,
        aiInterventions: interventions,
        actionLogs: pushLog(state, `${mode} AI 结论`, '人工复核', nextStep, note ? `${note}（${blockReason}）` : blockReason),
        finalStatus,
      };
    }

    case 'GENERATE_DECISION': {
      // 风险等级沿用 AI 风险初判的最终采纳等级（含 DeepSeek 调严），保持三阶段结论一致
      const riskLevel = state.aiRiskAnalysis?.suggestedLevel
        ?? mockAssessRiskLevel(state.invoice, state.evidenceChain, state.businessEvent);
      const confidence = Math.min(
        0.95,
        state.businessEvent.confidence * 0.6 + state.evidenceChain.completenessScore / 100 * 0.4,
      );
      const decisionDraft: DecisionDraft = mockGenerateDecisionDraft(
        state.invoice,
        state.businessEvent,
        state.evidenceChain,
        riskLevel,
        confidence,
      );
      // DeepSeek 风险卡片并入最终建议的其他风险提示（人工复核可追溯 AI 依据）
      if (state.aiRiskAnalysis && state.aiRiskAnalysis.riskCards.length > 0) {
        decisionDraft.otherRiskNotes = [
          ...decisionDraft.otherRiskNotes,
          ...state.aiRiskAnalysis.riskCards.map((card) => `【DeepSeek 风险点】${card}`),
        ];
      }
      const voucherIntervention = ensureAiIntervention(
        state.aiInterventions,
        '凭证建议',
        '在规则允许时生成凭证草稿建议（含入账科目建议）',
        `闸门结果：${decisionDraft.gates.map((g) => `${g.name}=${g.status}`).join('，')}`,
        decisionDraft.voucherDraft.summary,
        confidence,
      );
      return {
        ...state,
        decisionDraft,
        currentStep: '生成建议',
        completedSteps: [...state.completedSteps, '生成建议'],
        aiInterventions: voucherIntervention,
        actionLogs: pushLog(state, '生成风险建议', '生成建议', '生成建议', `最终状态：${decisionDraft.finalStatus}；凭证草稿：${decisionDraft.voucherDraft.status}；入账建议：${decisionDraft.postingAdvice ? `${decisionDraft.postingAdvice.primaryAccount}/${decisionDraft.postingAdvice.secondaryAccount}/${decisionDraft.postingAdvice.detailAccount}` : '未生成'}。`),
        finalStatus: decisionDraft.finalStatus,
      };
    }

    case 'CONFIRM_VOUCHER': {
      // 财务确认动作：仅凭证草稿已生成后允许（状态机合法流转：通过->已完成，退回->待财务复核）
      if (state.finalStatus !== '凭证草稿已生成' || !state.decisionDraft) {
        return state;
      }
      const record =
        action.mode === '通过'
          ? `财务确认通过${action.note ? `：${action.note}` : '：凭证草稿与入账建议核对无误。'}`
          : `凭证退回修正${action.note ? `：${action.note}` : '：凭证草稿需修正后重新生成。'}`;
      const decisionDraft: DecisionDraft = {
        ...state.decisionDraft,
        humanReviewRecords: [...state.decisionDraft.humanReviewRecords, record],
      };
      return {
        ...state,
        decisionDraft,
        currentStep: '生成建议',
        actionLogs: pushLog(
          state,
          action.mode === '通过' ? '凭证确认通过' : '凭证退回修正',
          '生成建议',
          '生成建议',
          record,
        ),
        finalStatus: action.mode === '通过' ? '已完成' : '待财务复核',
      };
    }

    case 'MARK_RISK_FALSE_POSITIVE': {
      // 误报标记：对风险卡片标记/取消误报，仅生成建议后允许（不改变流程状态）
      if (!state.decisionDraft) {
        return state;
      }
      const marked = Array.from(new Set(state.decisionDraft.falsePositiveCards ?? []));
      const nextMarked = action.marked
        ? marked.includes(action.card)
          ? marked
          : [...marked, action.card]
        : marked.filter((c) => c !== action.card);
      const record = action.marked
        ? `标记误报${action.note ? `：${action.note}` : `：风险卡片「${action.card}」经核实为误报。`}`
        : `取消误报标记：风险卡片「${action.card}」恢复有效。`;
      const decisionDraft: DecisionDraft = {
        ...state.decisionDraft,
        falsePositiveCards: nextMarked,
        humanReviewRecords: [...state.decisionDraft.humanReviewRecords, record],
      };
      return {
        ...state,
        decisionDraft,
        actionLogs: pushLog(
          state,
          action.marked ? '标记误报' : '取消误报',
          state.currentStep,
          state.currentStep,
          record,
        ),
      };
    }

    case 'INVALIDATE_AI_RISK': {
      // Gate 3：标记旧 AI 风险初判为已失效（不删除，保留审计追溯）
      const interventions = state.aiInterventions.map((item) =>
        item.stage === '风险解释'
          ? { ...item, adoption: '退回' as const, note: `已失效：${action.reason ?? '证据已更新，需重新分析'}` }
          : item,
      );
      // 清除 decisionDraft（如果存在），避免误用旧结论
      return {
        ...state,
        aiInterventions: interventions,
        decisionDraft: undefined,
        aiRiskStale: true,
        actionLogs: pushLog(
          state,
          '标记 AI 风险初判失效',
          state.currentStep,
          state.currentStep,
          action.reason ?? '用户补充了新材料，旧 AI 风险初判已失效，需重新点击生成 AI 风险初判。',
        ),
      };
    }

    case 'RESUPPLY_EVIDENCE': {
      // Gate 3：异常工作台补资料回流
      // 1. 写入证据链
      // 2. 标记旧 AI 风险初判为已失效
      // 3. 根据完整度决定 currentStep：若证据仍不完整 -> 证据补充；若完整 -> AI风险初判
      // 4. 清除旧 decisionDraft
      const uploaded = Array.from(new Set([...state.evidenceChain.uploadedEvidence, ...action.items]));
      const matchResult = mockMatchEvidenceDetailed(
        state.invoice.category,
        uploaded,
        state.evidenceChain.conflictingEvidence,
      );
      const evidenceChain: EvidenceChain = {
        ...state.evidenceChain,
        uploadedEvidence: uploaded,
        matchedEvidence: matchResult.matchedEvidence,
        missingEvidence: matchResult.missingEvidence,
        insufficientEvidence: matchResult.insufficientEvidence,
        conflictingEvidence: matchResult.conflictingEvidence,
        completenessScore: matchResult.completenessScore,
        status: matchResult.status,
      };

      // 标记旧 AI 风险初判失效
      const interventions = state.aiInterventions.map((item) =>
        item.stage === '风险解释'
          ? { ...item, adoption: '退回' as const, note: '已失效：用户在异常工作台补充了新材料，需重新分析' }
          : item,
      );

      // 决定下一步：若证据仍不完整（有缺口或不足以证明） -> 证据补充；否则 -> AI风险初判
      const evidenceComplete = matchResult.missingEvidence.length === 0 && matchResult.insufficientEvidence.length === 0;
      const nextStep: WorkflowStep = evidenceComplete ? 'AI风险初判' : '证据补充';
      const nextFinalStatus: WorkflowSession['finalStatus'] = evidenceComplete ? '待风险判断' : '待补充证据';

      return {
        ...state,
        evidenceChain,
        aiInterventions: interventions,
        decisionDraft: undefined,
        aiRiskStale: true,
        currentStep: nextStep,
        // 不重复加 completedSteps（证据补充可能已完成过）
        completedSteps: state.completedSteps.includes('证据补充')
          ? state.completedSteps
          : [...state.completedSteps, '证据补充'],
        actionLogs: pushLog(
          state,
          '异常工作台补资料',
          '证据补充',
          nextStep,
          `补充证据：${action.items.join('、')}。完整度 ${matchResult.completenessScore}%。旧 AI 风险初判已失效，需重新生成。${evidenceComplete ? '证据已完整，进入 AI 风险初判。' : '证据仍不完整，停留在证据补充。'}`,
        ),
        finalStatus: nextFinalStatus,
      };
    }

    case 'NAVIGATE_STEP': {
      // Gate 3 补丁：步骤点击跳转
      // 规则：只修改 currentStep，不修改 finalStatus / completedSteps，不生成 AI 结果
      // 调用方应先用 canNavigateToStep 校验，未满足条件时不调用此 action
      // 此处再做一次兜底校验，防止绕过
      if (action.step === state.currentStep) {
        return state;
      }
      if (!canNavigateToStep(state, action.step)) {
        return state;
      }
      return {
        ...state,
        currentStep: action.step,
        actionLogs: pushLog(
          state,
          '步骤跳转',
          state.currentStep,
          action.step,
          `用户从「${state.currentStep}」跳转到「${action.step}」查看（仅切换查看，未改变最终状态和已完成步骤）。`,
        ),
      };
    }

    case 'RESET':
      return createWorkflowSession(state.invoice);

    default:
      return state;
  }
}

// 对外统一入口：核心流转 + 异常解除留痕
// dispatch 前该 case 存在异常、dispatch 后异常清空时，追加「异常已解除」日志
// 该日志是异常工作台「已解除」tab 的数据来源，无需额外持久化字段
export function workflowReducer(state: WorkflowSession, action: WorkflowAction): WorkflowSession {
  const next = coreReducer(state, action);
  const exceptionsBefore = detectCaseExceptions(state);
  if (exceptionsBefore.length === 0) return next;
  const exceptionsAfter = detectCaseExceptions(next);
  if (exceptionsAfter.length > 0) return next;
  return {
    ...next,
    actionLogs: [
      ...next.actionLogs,
      {
        id: nextLogId(),
        operator: '当前用户',
        action: '异常已解除',
        fromStep: next.currentStep,
        toStep: next.currentStep,
        timestamp: nowIso(),
        note: `已解除异常：${exceptionsBefore.join('、')}。`,
      },
    ],
  };
}

// Gate 3 补丁：步骤点击跳转校验
// 规则：
//   - 已完成步骤（在 completedSteps 中）和当前步骤：可点击查看（回看）
//   - 第 1 步「发票输入」：流程页内不处理，由 UI 跳回 /intake（reducer 视为允许）
//   - 第 2 步「票面确认」：当前 case 可回看
//   - 第 3 步「业务追问」：票面确认完成后可进入
//   - 第 4 步「证据补充」：业务必答问题已完成（businessEvent.requiredQuestionsAnswered === true）后可进入
//   - 第 5 步「AI风险初判」：证据补充已完成（completedSteps 含「证据补充」）后可进入
//   - 第 6 步「人工复核」：已生成 AI 风险初判（completedSteps 含「AI风险初判」）后可进入
//   - 第 7 步「生成建议」：人工复核已采纳/修改且未被硬阻断（completedSteps 含「人工复核」）后可进入
// 不允许通过点击步骤绕过业务问答、证据补充、AI 风险初判和人工复核。
export function canNavigateToStep(session: WorkflowSession, targetStep: WorkflowStep): boolean {
  // 当前步骤或已完成步骤：可回看
  if (session.currentStep === targetStep) return true;
  if (session.completedSteps.includes(targetStep)) return true;

  // 未来步骤按前置条件判断
  switch (targetStep) {
    case '发票输入':
      return true;
    case '票面确认':
      // 流程已开始即可回看票面确认
      return session.completedSteps.includes('发票输入');
    case '业务追问':
      // 票面确认完成后可进入业务追问
      return session.completedSteps.includes('票面确认');
    case '证据补充':
      // 业务必答问题必须完成
      return (
        session.completedSteps.includes('票面确认') &&
        session.businessEvent.requiredQuestionsAnswered === true
      );
    case 'AI风险初判':
      // 证据补充已完成（提交过证据）
      return session.completedSteps.includes('证据补充');
    case '人工复核':
      // 已生成 AI 风险初判
      return session.completedSteps.includes('AI风险初判');
    case '生成建议':
      // 人工复核已采纳/修改且未被硬阻断（completedSteps 含「人工复核」）
      return session.completedSteps.includes('人工复核');
    default:
      return false;
  }
}

// 返回阻断原因；可跳转时返回空字符串
export function explainStepNavigationBlock(session: WorkflowSession, targetStep: WorkflowStep): string {
  if (canNavigateToStep(session, targetStep)) return '';

  // 当前/已完成不会进入这里，下面只处理未来步骤阻断原因
  switch (targetStep) {
    case '票面确认':
      return `不能跳转到「${targetStep}」：流程尚未开始（请先录入发票）。`;
    case '业务追问':
      return `不能跳转到「${targetStep}」：需先完成「票面确认」。`;
    case '证据补充': {
      const unanswered = session.businessEvent.unansweredRequiredQuestions ?? [];
      const unansweredHint = unanswered.length > 0 ? `（未答必答问题 ${unanswered.length} 个：${unanswered.join('、')}）` : '';
      return `不能跳转到「${targetStep}」：业务闸门未放行，核心必答问题未完成${unansweredHint}，请先在「业务追问」中完成必答问题。`;
    }
    case 'AI风险初判':
      return `不能跳转到「${targetStep}」：需先在「证据补充」中提交证据，证据闸门放行后才能进行 AI 风险初判。`;
    case '人工复核':
      return `不能跳转到「${targetStep}」：需先在「AI风险初判」中生成 AI 风险初判结果，未生成前不得进入人工复核。`;
    case '生成建议':
      return `不能跳转到「${targetStep}」：需先在「人工复核」中采纳或修改 AI 结论（且未被硬阻断），未完成人工复核前不得生成最终建议。`;
    default:
      return `不能跳转到「${targetStep}」：未满足前置条件。`;
  }
}
