import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AlertTriangle, Bot, CheckCircle2, ChevronRight, Download, Eye, FileText, History, Upload, X } from 'lucide-react';
import type { AiIntervention, EvidenceGuidance, Invoice, WorkflowStep } from '../../domain/types';
import { useWorkflow } from '../../workflow/WorkflowContext';
import {
  WORKFLOW_STEPS,
  canNavigateToStep,
  explainStepNavigationBlock,
} from '../../workflow/workflowReducer';
import {
  checkRequiredQuestionsAnswered,
  mockGenerateQAGuidance,
  mockGenerateStructuredQuestions,
} from '../../ai/mockQuestionService';
import { mockRequiredEvidenceGuidance } from '../../ai/mockEvidenceMatcher';
import { fetchDeepSeekQuestions, fetchDeepSeekRisk } from '../../ai/deepSeekQuestionService';
import { mockAssessRiskLevel, mockEvaluateGates } from '../../ai/mockRiskAdvisor';
import { mockCreateTemplateBlobUrl, mockGenerateEvidenceTemplate } from '../../ai/mockEvidenceTemplateService';
import { GateRail } from '../components/GateRail';
import { PageHeader } from '../components/PageHeader';

export function InvoiceWorkflowPage() {
  const { session: activeSession, activeCaseId, dispatch, resolveCaseId, loadCase, getCase } = useWorkflow();
  const navigate = useNavigate();
  const params = useParams<{ caseId?: string }>();

  const resolvedCaseId = resolveCaseId(params.caseId);

  // 防串单：当 URL 带具体 caseId 且与当前 activeCaseId 不一致时，必须切换 active case
  useEffect(() => {
    if (params.caseId && params.caseId !== 'current' && params.caseId !== activeCaseId) {
      loadCase(params.caseId);
    }
  }, [params.caseId, activeCaseId, loadCase]);

  const session = useMemo(() => {
    if (!resolvedCaseId) return activeSession;
    if (activeSession && activeSession.caseId === resolvedCaseId) return activeSession;
    return getCase(resolvedCaseId);
  }, [resolvedCaseId, activeSession, getCase]);

  // 各步骤的本地表单状态
  const [invoicePatch, setInvoicePatch] = useState<Partial<Invoice>>({});
  const [answers, setAnswers] = useState<Record<string, string>>({});
  // 业务追问：每题是否选中"自定义答案"（第 5 项）
  const [customChoice, setCustomChoice] = useState<Record<string, boolean>>({});
  const [evidenceSelection, setEvidenceSelection] = useState<string[]>([]);
  const [stepError, setStepError] = useState<string>('');
  // 证据补充：当前查看详情的证据（null 表示详情弹层关闭）
  const [detailEvidence, setDetailEvidence] = useState<{ guidance: EvidenceGuidance; status: string } | null>(null);

  // 证据详情弹层：Esc 关闭 + 锁定背景滚动
  useEffect(() => {
    if (!detailEvidence) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDetailEvidence(null);
    };
    window.addEventListener('keydown', onKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [detailEvidence]);

  // Gate 3 补丁：证据模板 Blob URL 缓存（按证据名称索引）
  // 重新生成或组件卸载时必须释放，避免内存泄露
  const [templateUrls, setTemplateUrls] = useState<Record<string, { url: string; fileName: string }>>({});
  const templateUrlsRef = useRef<Record<string, { url: string; fileName: string }>>({});
  // 步骤点击跳转的阻断原因（用于在步骤条下方提示）
  const [navBlockReason, setNavBlockReason] = useState<string>('');

  // 组件卸载时释放所有 Blob URL
  useEffect(() => {
    return () => {
      Object.values(templateUrlsRef.current).forEach((entry) => {
        if (entry?.url) {
          try {
            URL.revokeObjectURL(entry.url);
          } catch {
            // 忽略：URL 已失效或环境不支持
          }
        }
      });
      templateUrlsRef.current = {};
    };
  }, []);

  // Gate 3：结构化问题——以 session.businessQA 为单一事实源（本地模板或 DeepSeek 动态生成）
  const structuredQuestions = useMemo(
    () =>
      session && session.businessQA && session.businessQA.length > 0
        ? session.businessQA
        : session
          ? mockGenerateStructuredQuestions(session.invoice.category)
          : [],
    [session],
  );
  // Gate 3：结构化证据指导清单——优先读 session（含 DeepSeek 建议并入的补充佐证）
  const evidenceGuidance = useMemo(
    () =>
      session && session.evidenceChain.evidenceGuidance && session.evidenceChain.evidenceGuidance.length > 0
        ? session.evidenceChain.evidenceGuidance
        : session
          ? mockRequiredEvidenceGuidance(session.invoice.category)
          : [],
    [session],
  );
  // AI 指导语（DeepSeek 生成或本地模板）
  const qaGuidance = useMemo(
    () => (session ? session.businessQAGuidance ?? mockGenerateQAGuidance(session.invoice.category) : ''),
    [session],
  );

  // Gate 3：必答问题完成情况（对当前生效的问题集检查，用于UI显示未答清单）
  const requiredCheck = useMemo(() => {
    if (!session) return { allAnswered: false, unanswered: [] as string[] };
    return checkRequiredQuestionsAnswered(structuredQuestions, answers);
  }, [session, structuredQuestions, answers]);

  // ===== DeepSeek 业务追问动态生成 =====
  // 进入业务追问步骤时自动按票面生成一次（失败回退本地模板，不重复尝试）
  const [qaLoading, setQaLoading] = useState(false);
  const [qaLoadError, setQaLoadError] = useState('');
  const qaGenAttemptedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!session || session.currentStep !== '业务追问') return;
    if (session.businessQASource === 'deepseek') return;
    if (qaGenAttemptedRef.current.has(session.caseId)) return;
    qaGenAttemptedRef.current.add(session.caseId);
    setQaLoading(true);
    setQaLoadError('');
    void (async () => {
      const result = await fetchDeepSeekQuestions(session.invoice);
      // 注意：这里不做"组件已卸载/依赖已变化"短路。
      // StrictMode 双挂载会让首次回调被取消，若在 cancelled 时直接 return，
      // setQaLoading(false) 永远不会执行，页面会一直停在"DeepSeek 生成中"。
      // LOAD_QUESTIONS 在非业务追问步骤会被 reducer 拒绝，重复派发幂等，
      // 因此这里总是收尾加载状态。
      setQaLoading(false);
      if (result.ok) {
        dispatch({
          type: 'LOAD_QUESTIONS',
          questions: result.data.questions,
          guidance: result.data.guidance,
          scenarioLabel: result.data.scenarioLabel,
        });
      } else {
        setQaLoadError(result.message);
      }
    })();
  }, [session, dispatch]);

  // ===== DeepSeek 风险初判 =====
  const [riskLoading, setRiskLoading] = useState(false);
  const handleGenerateRisk = async () => {
    if (!session || riskLoading) return;
    setRiskLoading(true);
    const result = await fetchDeepSeekRisk({
      invoice: session.invoice,
      businessEvent: session.businessEvent,
      evidenceChain: {
        requiredEvidence: session.evidenceChain.requiredEvidence,
        uploadedEvidence: session.evidenceChain.uploadedEvidence,
        missingEvidence: session.evidenceChain.missingEvidence,
        insufficientEvidence: session.evidenceChain.insufficientEvidence ?? [],
        completenessScore: session.evidenceChain.completenessScore,
        status: session.evidenceChain.status,
      },
      answers: Object.fromEntries(
        (session.businessQA ?? [])
          .filter((q) => (q.userAnswer ?? '').trim())
          .map((q) => [q.text, q.userAnswer ?? '']),
      ),
    });
    setRiskLoading(false);
    if (result.ok) {
      dispatch({
        type: 'GENERATE_AI_RISK',
        analysis: {
          suggestedLevel: result.data.riskLevel,
          riskCards: result.data.riskCards,
          summary: result.data.summary,
          accountingFocus: result.data.accountingFocus,
          vatFocus: result.data.vatFocus,
          citFocus: result.data.citFocus,
        },
      });
    } else {
      // DeepSeek 不可用：规则引擎兜底定级
      dispatch({ type: 'GENERATE_AI_RISK' });
    }
  };

  if (!session) {
    return (
      <div className="page-stack">
        <PageHeader
          eyebrow="流程工作台"
          title="尚未开始流程"
          description="请先录入发票，再进入可操作流程。"
        />
        <Link className="button-link" to="/intake">前往录入发票</Link>
      </div>
    );
  }

  const stepIndex = WORKFLOW_STEPS.indexOf(session.currentStep);
  const currentAi: AiIntervention | undefined = [...session.aiInterventions]
    .reverse()
    .find((item) => item.adoption === '待处理') ?? session.aiInterventions[session.aiInterventions.length - 1];

  // 统一阻断判定：对齐 reducer 与最终闸门口径
  // Gate 3：业务问答未完成也作为阻断条件
  const blockFlags = useMemo(() => {
    if (!session) return null;
    const riskLevel = mockAssessRiskLevel(session.invoice, session.evidenceChain, session.businessEvent);
    const gates = mockEvaluateGates(session.invoice, session.businessEvent, session.evidenceChain, riskLevel);
    const anyGateBlocked = gates.some((g) => g.status === '阻断');
    const invoiceBlocked =
      session.invoice.verificationStatus === '验真失败' ||
      session.invoice.duplicateStatus === '疑似重复' ||
      session.invoice.redLetterStatus !== '正常';
    const evidenceMissing = session.evidenceChain.missingEvidence.length > 0 || session.evidenceChain.status === '冲突';
    const lowOcrConfidence = session.invoice.recognitionConfidence < 0.6;
    const highRisk = riskLevel === '高';
    const businessQABlocked = session.businessEvent.requiredQuestionsAnswered === false;
    return {
      anyGateBlocked,
      invoiceBlocked,
      evidenceMissing,
      lowOcrConfidence,
      highRisk,
      businessQABlocked,
      hardBlocked: anyGateBlocked || invoiceBlocked || lowOcrConfidence || highRisk || businessQABlocked,
      softBlocked: evidenceMissing,
      gates,
    };
  }, [session]);

  const toggleEvidence = (item: string) => {
    setEvidenceSelection((prev) =>
      prev.includes(item) ? prev.filter((i) => i !== item) : [...prev, item],
    );
  };

  // Gate 3 补丁：生成证据模板并缓存 Blob URL
  // 重新生成时先释放旧的 URL，避免内存泄露
  const handleGenerateTemplate = (evidenceName: string) => {
    if (!session) return;
    const result = mockGenerateEvidenceTemplate({
      invoiceCategory: session.invoice.category,
      evidenceName,
    });
    // 释放旧的 URL
    const prev = templateUrlsRef.current[evidenceName];
    if (prev?.url) {
      try {
        URL.revokeObjectURL(prev.url);
      } catch {
        // 忽略
      }
    }
    const url = mockCreateTemplateBlobUrl(result);
    const entry = { url, fileName: result.fileName };
    templateUrlsRef.current = { ...templateUrlsRef.current, [evidenceName]: entry };
    setTemplateUrls({ ...templateUrlsRef.current });
  };

  // Gate 3 补丁：步骤点击跳转
  // 已完成步骤和当前步骤可直接查看；未来步骤需满足前置条件
  const handleStepClick = (step: WorkflowStep) => {
    if (!session) return;
    if (step === '发票输入') {
      // 第 1 步：跳回录入页，不在当前会话内处理
      navigate('/intake');
      setNavBlockReason('');
      return;
    }
    if (session.currentStep === step) {
      setNavBlockReason('');
      return;
    }
    if (canNavigateToStep(session, step)) {
      setNavBlockReason('');
      dispatch({ type: 'NAVIGATE_STEP', step });
    } else {
      const reason = explainStepNavigationBlock(session, step);
      setNavBlockReason(reason);
    }
  };

  // Gate 3 补丁：AI 风险初判报告（人工复核页顶部派生展示）
  // 基于当前 session 实时计算，不依赖 decisionDraft
  // 复用 mockAssessRiskLevel / mockEvaluateGates / session.aiInterventions 中 stage === '风险解释' 的最近一条
  const renderRiskPrecheckReport = () => {
    if (!session) return null;
    // 找到最近一条「风险解释」AI 介入记录（按数组末尾优先）
    const riskIntervention = [...session.aiInterventions]
      .reverse()
      .find((item) => item.stage === '风险解释');
    if (!riskIntervention) {
      // 未生成 AI 风险初判：提示用户先去第 5 步生成
      return (
        <section className="risk-precheck-report" aria-label="AI 风险初判报告" role="status">
          <div className="risk-precheck-head">
            <Bot size={18} aria-hidden="true" />
            <strong>AI 风险初判报告</strong>
            <span className="risk-precheck-status stale">未生成</span>
          </div>
          <div className="risk-precheck-body">
            <p className="risk-precheck-empty">
              当前会话尚未生成 AI 风险初判。请回退到第 5 步「AI 风险初判」点击生成按钮后再进行人工复核。
            </p>
          </div>
        </section>
      );
    }

    // 实时计算风险等级和闸门
    const riskLevel = mockAssessRiskLevel(session.invoice, session.evidenceChain, session.businessEvent);
    const gates = mockEvaluateGates(session.invoice, session.businessEvent, session.evidenceChain, riskLevel);
    const confidence = riskIntervention.confidence;

    // 发票风险点
    const invoiceRiskPoints: string[] = [];
    if (session.invoice.verificationStatus === '验真失败') invoiceRiskPoints.push('验真失败，发票真实性存疑');
    if (session.invoice.duplicateStatus === '疑似重复') invoiceRiskPoints.push('疑似重复发票，需核查与历史票据关系');
    if (session.invoice.redLetterStatus !== '正常') invoiceRiskPoints.push(`红冲/作废状态：${session.invoice.redLetterStatus}`);
    if (session.invoice.recognitionConfidence < 0.6) invoiceRiskPoints.push(`OCR 置信度过低（${Math.round(session.invoice.recognitionConfidence * 100)}%）`);
    if (session.invoice.anomalies.length > 0) invoiceRiskPoints.push(`票面异常：${session.invoice.anomalies.join('、')}`);
    if (invoiceRiskPoints.length === 0) invoiceRiskPoints.push('未发现发票层面风险点');

    // 业务逻辑判断
    const businessLogic: string[] = [];
    if (session.businessEvent.requiredQuestionsAnswered === false) {
      const unanswered = session.businessEvent.unansweredRequiredQuestions ?? [];
      businessLogic.push(`核心必答问题未完成${unanswered.length > 0 ? `（${unanswered.join('、')}）` : ''}，业务闸门阻断`);
    } else {
      businessLogic.push(`业务场景：${session.businessEvent.scenario}`);
      businessLogic.push(`业务目的：${session.businessEvent.purpose}`);
      businessLogic.push(`业务置信度：${Math.round(session.businessEvent.confidence * 100)}%`);
    }
    if (session.businessEvent.conflicts.length > 0) {
      businessLogic.push(`存在事实矛盾：${session.businessEvent.conflicts.join('、')}`);
    }

    // 证据链缺口
    const evidenceGaps: string[] = [];
    if (session.evidenceChain.missingEvidence.length > 0) {
      evidenceGaps.push(`未上传：${session.evidenceChain.missingEvidence.join('、')}`);
    }
    if ((session.evidenceChain.insufficientEvidence ?? []).length > 0) {
      evidenceGaps.push(`上传但不足以证明：${(session.evidenceChain.insufficientEvidence ?? []).join('、')}`);
    }
    if (session.evidenceChain.status === '冲突') {
      evidenceGaps.push('证据存在冲突，需排查');
    }
    if (evidenceGaps.length === 0) {
      evidenceGaps.push(`证据链完整（完整度 ${session.evidenceChain.completenessScore}%）`);
    } else {
      evidenceGaps.unshift(`完整度 ${session.evidenceChain.completenessScore}%`);
    }

    // AI 建议动作
    const aiSuggestions: string[] = [];
    const anyBlocked = gates.some((g) => g.status === '阻断');
    const hasInsufficient = (session.evidenceChain.insufficientEvidence ?? []).length > 0;
    if (anyBlocked) {
      aiSuggestions.push('闸门阻断：不得采纳/修改，必须退回补充对应材料后重新生成 AI 风险初判。');
    } else if (hasInsufficient) {
      aiSuggestions.push('证据不足以证明：建议退回补充配套材料后再采纳/修改。');
    } else if (riskLevel === '高') {
      aiSuggestions.push('高风险事项：必须退回补充，并由财务负责人复核。');
    } else if (riskLevel === '中') {
      aiSuggestions.push('中风险事项：可采纳/修改，但凭证草稿需财务人工确认。');
    } else {
      aiSuggestions.push('风险可控：可采纳或修改后生成凭证草稿。');
    }
    if (session.businessEvent.requiredQuestionsAnswered === false) {
      aiSuggestions.push('请回退到第 3 步「业务追问」完成核心必答问题。');
    }
    if (session.evidenceChain.missingEvidence.length > 0) {
      aiSuggestions.push(`请回退到第 4 步「证据补充」补齐：${session.evidenceChain.missingEvidence.join('、')}。`);
    }

    // 是否允许采纳/修改
    const allowAdopt = !anyBlocked && !hasInsufficient && riskLevel !== '高' && session.businessEvent.requiredQuestionsAnswered !== false;
    const adoptionHint = allowAdopt
      ? '当前允许采纳或修改后采纳，可进入「生成建议」步骤。'
      : '当前不得采纳/修改，只能退回补充（业务问答、证据或票据异常未解决前禁止生成凭证草稿）。';

    return (
      <section className="risk-precheck-report" aria-label="AI 风险初判报告">
        <div className="risk-precheck-head">
          <Bot size={18} aria-hidden="true" />
          <strong>AI 风险初判报告</strong>
          <span className={`risk-precheck-status risk-${riskLevel}`}>风险等级：{riskLevel}</span>
          <span className="risk-precheck-confidence">置信度：{Math.round(confidence * 100)}%</span>
        </div>
        <div className="risk-precheck-body">
          <div className="risk-precheck-section">
            <div className="risk-precheck-section-head">
              <strong>四道闸门</strong>
            </div>
            <ul className="risk-precheck-gates">
              {gates.map((g) => (
                <li key={g.name} className={`risk-precheck-gate gate-${g.status}`}>
                  <span className="gate-name">{g.name}</span>
                  <span className={`gate-status status-${g.status}`}>{g.status}</span>
                  <small className="gate-reason">{g.reason}</small>
                </li>
              ))}
            </ul>
          </div>

          <div className="risk-precheck-section">
            <div className="risk-precheck-section-head">
              <strong>发票风险点</strong>
            </div>
            <ul className="risk-precheck-list">
              {invoiceRiskPoints.map((p, idx) => (
                <li key={`inv-${idx}`}>{p}</li>
              ))}
            </ul>
          </div>

          <div className="risk-precheck-section">
            <div className="risk-precheck-section-head">
              <strong>业务逻辑判断</strong>
            </div>
            <ul className="risk-precheck-list">
              {businessLogic.map((p, idx) => (
                <li key={`biz-${idx}`}>{p}</li>
              ))}
            </ul>
          </div>

          <div className="risk-precheck-section">
            <div className="risk-precheck-section-head">
              <strong>证据链缺口</strong>
            </div>
            <ul className="risk-precheck-list">
              {evidenceGaps.map((p, idx) => (
                <li key={`ev-${idx}`}>{p}</li>
              ))}
            </ul>
          </div>

          <div className="risk-precheck-section">
            <div className="risk-precheck-section-head">
              <strong>AI 建议动作</strong>
            </div>
            <ul className="risk-precheck-list">
              {aiSuggestions.map((p, idx) => (
                <li key={`ai-${idx}`}>{p}</li>
              ))}
            </ul>
          </div>

          <div className={`risk-precheck-adoption ${allowAdopt ? 'allow' : 'block'}`}>
            <AlertTriangle size={14} aria-hidden="true" />
            <span>{adoptionHint}</span>
          </div>

          <div className="risk-precheck-meta">
            <small>AI 介入阶段：风险解释</small>
            <small>输出摘要：{riskIntervention.outputSummary}</small>
            <small>采纳状态：{riskIntervention.adoption}</small>
          </div>
        </div>
      </section>
    );
  };

  const renderStepContent = () => {
    switch (session.currentStep) {
      case '票面确认':
        return (
          <div className="step-form">
            <p className="step-hint">系统已完成票面识别（上传文件为腾讯云 OCR 真实识别）。请确认或修改以下字段，点击「确认票面」继续。</p>
            <div className="intake-form">
              <label className="field">
                <span>发票号码</span>
                <input
                  defaultValue={session.invoice.invoiceNumber}
                  onChange={(e) => setInvoicePatch((p) => ({ ...p, invoiceNumber: e.target.value }))}
                />
              </label>
              <label className="field">
                <span>销方</span>
                <input
                  defaultValue={session.invoice.seller}
                  onChange={(e) => setInvoicePatch((p) => ({ ...p, seller: e.target.value }))}
                />
              </label>
              <label className="field">
                <span>金额</span>
                <input
                  type="number"
                  defaultValue={session.invoice.amount}
                  onChange={(e) => setInvoicePatch((p) => ({ ...p, amount: Number(e.target.value) || 0 }))}
                />
              </label>
              <label className="field">
                <span>税额</span>
                <input
                  type="number"
                  defaultValue={session.invoice.taxAmount}
                  onChange={(e) => setInvoicePatch((p) => ({ ...p, taxAmount: Number(e.target.value) || 0 }))}
                />
              </label>
            </div>
            <button
              type="button"
              className="primary-button"
              onClick={() => dispatch({ type: 'CONFIRM_INVOICE', patch: invoicePatch })}
            >
              确认票面 <ChevronRight size={16} aria-hidden="true" />
            </button>
          </div>
        );

      case '业务追问':
        // DeepSeek 按票面动态生成追问（不可用时回退本地规则模板）
        return (
          <div className="step-form">
            <div className="qa-guidance" role="note">
              <Bot size={16} aria-hidden="true" />
              <span>{qaGuidance}</span>
            </div>
            <p className="step-hint">
              {qaLoading
                ? 'DeepSeek 正在根据这张发票的票面事实生成严谨追问…'
                : session.businessQASource === 'deepseek'
                  ? '以下问题由 DeepSeek 基于本张发票的票面事实（销方、项目、金额、日期）动态生成，回答将直接写入业务事件并联动证据清单与风险初判。'
                  : qaLoadError
                    ? `DeepSeek 不可用（${qaLoadError}），已回退本地规则模板。回答仍将完整进入后续证据与风险环节。`
                    : `AI 业务问答根据「${session.invoice.category}」类型提出追问。`}
              <strong>核心必答问题（标 *）必须全部回答</strong>，否则业务闸门阻断，不得进入证据补充和风险判断。
            </p>
            <div className="qa-source" role="status">
              追问来源：{session.businessQASource === 'deepseek' ? 'DeepSeek 按票面动态生成' : qaLoadError ? '本地规则模板（DeepSeek 不可用）' : '本地规则模板'}
            </div>
            {qaLoading ? (
              <div className="qa-loading" role="status">
                <Bot size={16} aria-hidden="true" />
                <span>DeepSeek 生成中…完成后问题会自动替换，已输入内容不受影响。</span>
              </div>
            ) : (
            <div className="question-list structured">
              {structuredQuestions.map((q) => (
                <div className="question-item structured" key={q.id}>
                  <div className="question-head">
                    <span className={`question-text ${q.required ? 'required' : ''}`}>
                      {q.text}{q.required && <span className="required-mark"> *</span>}
                    </span>
                  </div>
                  <div className="question-hint" role="note">
                    <strong>为什么问：</strong>{q.hint}
                  </div>
                  {q.suggestedEvidence.length > 0 && (
                    <div className="question-evidence">
                      <strong>建议准备：</strong>{q.suggestedEvidence.join('、')}
                    </div>
                  )}
                  {q.options && q.options.length >= 2 ? (
                    <>
                      <div className="question-options" role="radiogroup" aria-label={q.text}>
                        {q.options.map((opt) => (
                          <label key={opt} className={`option-item ${answers[q.text] === opt ? 'selected' : ''}`}>
                            <input
                              type="radio"
                              name={q.id}
                              value={opt}
                              checked={answers[q.text] === opt}
                              onChange={() => {
                                setAnswers((prev) => ({ ...prev, [q.text]: opt }));
                                setCustomChoice((prev) => ({ ...prev, [q.text]: false }));
                                setStepError('');
                              }}
                            />
                            <span>{opt}</span>
                          </label>
                        ))}
                        <label className={`option-item option-custom ${customChoice[q.text] ? 'selected' : ''}`}>
                          <input
                            type="radio"
                            name={q.id}
                            checked={!!customChoice[q.text]}
                            onChange={() => {
                              setCustomChoice((prev) => ({ ...prev, [q.text]: true }));
                              // 从候选选项切到自定义时清空旧答案，等待用户输入；
                              // 原本就是自定义内容则保留
                              setAnswers((prev) =>
                                prev[q.text] && q.options && !q.options.includes(prev[q.text])
                                  ? prev
                                  : { ...prev, [q.text]: '' },
                              );
                              setStepError('');
                            }}
                          />
                          <span>自定义答案</span>
                        </label>
                      </div>
                      {customChoice[q.text] && (
                        <input
                          className="custom-answer-input"
                          value={answers[q.text] ?? ''}
                          onChange={(e) => {
                            setAnswers((prev) => ({ ...prev, [q.text]: e.target.value }));
                            setStepError('');
                          }}
                          placeholder="请输入自定义答案..."
                          aria-label={`${q.text}（自定义答案）`}
                          aria-required={q.required}
                        />
                      )}
                    </>
                  ) : (
                    <input
                      value={answers[q.text] ?? ''}
                      onChange={(e) => {
                        setAnswers((prev) => ({ ...prev, [q.text]: e.target.value }));
                        setStepError('');
                      }}
                      placeholder="请输入..."
                      aria-label={q.text}
                      aria-required={q.required}
                    />
                  )}
                </div>
              ))}
            </div>
            )}
            {stepError && <div className="intake-error" role="alert">{stepError}</div>}
            {requiredCheck.unanswered.length > 0 && (
              <div className="qa-warn" role="status">
                <AlertTriangle size={14} aria-hidden="true" />
                <span>未答必答问题（{requiredCheck.unanswered.length}）：{requiredCheck.unanswered.join('、')}</span>
              </div>
            )}
            <button
              type="button"
              className="primary-button"
              onClick={() => {
                if (!requiredCheck.allAnswered) {
                  setStepError(`核心必答问题未完成 ${requiredCheck.unanswered.length} 个：${requiredCheck.unanswered.join('、')}。业务闸门阻断，不得进入证据补充。`);
                  return;
                }
                setStepError('');
                dispatch({ type: 'ANSWER_QUESTIONS', answers });
              }}
            >
              提交回答 <ChevronRight size={16} aria-hidden="true" />
            </button>
          </div>
        );

      case '证据补充':
        // Gate 3：结构化证据清单（含证明目的、缺失影响、当前状态）
        // 展示为紧凑任务卡片：放不下的文字单行截断，hover 自动放大，点击卡片查看完整详情
        return (
          <div className="step-form">
            <p className="step-hint">
              请勾选已补充的证据材料（登记上传）。每项证据以任务卡片呈现，鼠标移入自动放大，点击卡片可查看证明目的、缺失影响和示例材料等完整详情。
              业务追问中 DeepSeek 建议的补充佐证已并入本清单（标注证明目的，不阻断闸门）。
            </p>
            <div className="evidence-checklist task-cards">
              {evidenceGuidance.map((g) => {
                const isUploaded = session.evidenceChain.uploadedEvidence.includes(g.name);
                const isInsufficient = (session.evidenceChain.insufficientEvidence ?? []).includes(g.name);
                const isSelected = evidenceSelection.includes(g.name);
                const status = isInsufficient ? '不足以证明' : isUploaded ? '已上传' : '未上传';
                const templateEntry = templateUrls[g.name];
                return (
                  <div
                    className={`evidence-task-card ${isInsufficient ? 'insufficient' : ''} ${isUploaded ? 'uploaded' : ''}`}
                    key={g.name}
                    role="button"
                    tabIndex={0}
                    aria-label={`证据任务卡片：${g.name}，${status}。点击查看详情`}
                    onClick={() => setDetailEvidence({ guidance: g, status })}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setDetailEvidence({ guidance: g, status });
                      }
                    }}
                  >
                    <div className="evidence-task-head">
                      <label
                        className="evidence-task-check"
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => e.stopPropagation()}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected || isUploaded}
                          onChange={() => toggleEvidence(g.name)}
                          disabled={isUploaded && !isSelected}
                          aria-label={`勾选${g.name}`}
                        />
                      </label>
                      <span className="evidence-task-name">
                        {g.name}
                        {g.required && <span className="required-mark"> *</span>}
                      </span>
                      <span className={`evidence-status status-${status}`}>{status}</span>
                    </div>
                    <div className="evidence-task-body">
                      <div className="evidence-task-row">
                        <strong>证明目的</strong>
                        <span className="evidence-clamp" title={g.proofPurpose}>{g.proofPurpose}</span>
                      </div>
                      <div className="evidence-task-row">
                        <strong>缺失影响</strong>
                        <span className="evidence-clamp" title={g.missingImpact}>{g.missingImpact}</span>
                      </div>
                      <div className="evidence-task-row">
                        <strong>示例材料</strong>
                        <span className="evidence-clamp" title={g.sampleMaterial}>{g.sampleMaterial}</span>
                      </div>
                    </div>
                    <div
                      className="evidence-task-foot"
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        className="evidence-detail-button"
                        onClick={() => setDetailEvidence({ guidance: g, status })}
                      >
                        <Eye size={13} aria-hidden="true" />
                        查看详情
                      </button>
                      <button
                        type="button"
                        className="evidence-template-button"
                        onClick={() => handleGenerateTemplate(g.name)}
                      >
                        <FileText size={13} aria-hidden="true" />
                        AI 生成模板
                      </button>
                      {templateEntry && (
                        <a
                          className="evidence-template-download"
                          href={templateEntry.url}
                          download={templateEntry.fileName}
                        >
                          <Download size={13} aria-hidden="true" />
                          下载
                        </a>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            {/* 证据详情弹层：点击卡片查看完整说明（hover 放大后点击进入） */}
            {detailEvidence && (
              <div
                className="evidence-detail-overlay"
                role="dialog"
                aria-modal="true"
                aria-label={`证据详情：${detailEvidence.guidance.name}`}
                onClick={() => setDetailEvidence(null)}
              >
                <div className="evidence-detail-modal" onClick={(e) => e.stopPropagation()}>
                  <div className="evidence-detail-head">
                    <div className="evidence-detail-title">
                      <span className="eyebrow">证据任务详情</span>
                      <h3>
                        {detailEvidence.guidance.name}
                        {detailEvidence.guidance.required && <span className="required-mark"> *</span>}
                      </h3>
                    </div>
                    <div className="evidence-detail-head-right">
                      <span className={`evidence-status status-${detailEvidence.status}`}>
                        {detailEvidence.status}
                      </span>
                      <button
                        type="button"
                        className="evidence-detail-close"
                        aria-label="关闭详情"
                        onClick={() => setDetailEvidence(null)}
                      >
                        <X size={18} aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                  <div className="evidence-detail-body">
                    <div className="evidence-detail-row">
                      <strong>证明目的</strong>
                      <p>{detailEvidence.guidance.proofPurpose}</p>
                    </div>
                    <div className="evidence-detail-row">
                      <strong>缺失影响</strong>
                      <p>{detailEvidence.guidance.missingImpact}</p>
                    </div>
                    <div className="evidence-detail-row">
                      <strong>示例材料</strong>
                      <p>{detailEvidence.guidance.sampleMaterial}</p>
                    </div>
                    <div className="evidence-detail-row">
                      <strong>当前状态</strong>
                      <p>
                        {detailEvidence.status === '已上传'
                          ? '该证据已登记上传，可作为证明依据。'
                          : detailEvidence.status === '不足以证明'
                            ? '该证据已上传但不足以独立证明业务，请补充配套材料。'
                            : '该证据尚未上传，勾选卡片复选框并提交后可登记。'}
                      </p>
                    </div>
                    {templateUrls[detailEvidence.guidance.name] && (
                      <small className="evidence-template-hint">
                        已生成本地 Word 文档下载链接（.docx，仅当前会话有效），可直接用 Word/WPS 打开填写。
                      </small>
                    )}
                  </div>
                  <div className="evidence-detail-actions">
                    <button
                      type="button"
                      className="evidence-template-button"
                      onClick={() => handleGenerateTemplate(detailEvidence.guidance.name)}
                    >
                      <FileText size={14} aria-hidden="true" />
                      AI 生成模板
                    </button>
                    {templateUrls[detailEvidence.guidance.name] && (
                      <a
                        className="evidence-template-download"
                        href={templateUrls[detailEvidence.guidance.name].url}
                        download={templateUrls[detailEvidence.guidance.name].fileName}
                      >
                        <Download size={14} aria-hidden="true" />
                        下载模板（{templateUrls[detailEvidence.guidance.name].fileName}）
                      </a>
                    )}
                    <button
                      type="button"
                      className="primary-button"
                      onClick={() => setDetailEvidence(null)}
                    >
                      关闭
                    </button>
                  </div>
                </div>
              </div>
            )}
            {/* Gate 3：上传但不足以证明的提示 */}
            {(session.evidenceChain.insufficientEvidence ?? []).length > 0 && (
              <div className="qa-warn" role="status">
                <AlertTriangle size={14} aria-hidden="true" />
                <span>以下证据已上传但不足以证明业务：{(session.evidenceChain.insufficientEvidence ?? []).join('、')}。请补充配套材料。</span>
              </div>
            )}
            <button
              type="button"
              className="primary-button"
              onClick={() => dispatch({ type: 'UPLOAD_EVIDENCE', items: evidenceSelection })}
            >
              提交证据 <Upload size={16} aria-hidden="true" />
            </button>
          </div>
        );

      case 'AI风险初判':
        // Gate 3：如果旧 AI 风险初判已失效，明确提示需重新生成
        return (
          <div className="step-form">
            <p className="step-hint">
              点击后 DeepSeek 将综合票面、业务问答还原的业务事件和证据链输出风险分析（等级建议、风险点、结论摘要）；系统再与规则引擎定级取更严者作为最终风险等级。
            </p>
            {session.aiRiskStale && (
              <div className="qa-warn" role="status">
                <AlertTriangle size={14} aria-hidden="true" />
                <span>旧 AI 风险初判已失效（证据已更新或异常工作台补料），必须重新点击生成。</span>
              </div>
            )}
            {/* Gate 3 补丁：提示报告将在下一步展示 */}
            <div className="step-hint" role="note">
              <Bot size={14} aria-hidden="true" />
              <span>生成后将在下一步「人工复核」顶部展示完整的 AI 风险初判报告（含风险等级、置信度、四道闸门、风险点、AI 建议动作和是否允许采纳）。</span>
            </div>
            <button
              type="button"
              className="primary-button"
              disabled={riskLoading}
              onClick={() => void handleGenerateRisk()}
            >
              {riskLoading ? 'DeepSeek 分析中…' : '生成 AI 风险初判（DeepSeek + 规则）'}{' '}
              <ChevronRight size={16} aria-hidden="true" />
            </button>
          </div>
        );

      case '人工复核':
        return (
          <div className="step-form">
            {/* Gate 3 补丁：人工复核页顶部展示 AI 风险初判报告 */}
            {renderRiskPrecheckReport()}
            <p className="step-hint">
              请对 AI 风险结论进行人工复核：采纳、修改或退回。
              {blockFlags?.hardBlocked && '（当前案例为高风险/验真失败/疑似重复/红冲作废/低置信度/业务问答未完成，采纳与修改已禁用，请退回补充）'}
              {blockFlags && !blockFlags.hardBlocked && blockFlags.softBlocked && '（证据缺失，采纳与修改已禁用，请退回补充证据）'}
              {!blockFlags?.hardBlocked && !blockFlags?.softBlocked && '（闸门与风险均通过，可采纳/修改后生成凭证草稿）'}
            </p>
            <div className="adopt-actions">
              <button
                type="button"
                className="primary-button"
                disabled={!!blockFlags?.hardBlocked || !!blockFlags?.softBlocked}
                onClick={() => dispatch({ type: 'ADOPT_DECISION', mode: '采纳' })}
              >
                采纳 AI 结论
              </button>
              <button
                type="button"
                className="secondary-button"
                disabled={!!blockFlags?.hardBlocked || !!blockFlags?.softBlocked}
                onClick={() => dispatch({ type: 'ADOPT_DECISION', mode: '修改', note: '用户修改了 AI 结论。' })}
              >
                修改后采纳
              </button>
              <button
                type="button"
                className="danger-button"
                onClick={() => dispatch({ type: 'ADOPT_DECISION', mode: '退回', note: '用户退回 AI 结论，需补充业务事实。' })}
              >
                退回
              </button>
            </div>
          </div>
        );

      case '生成建议':
        // Gate 3：生成建议步骤展示入账建议预览
        return (
          <div className="step-form">
            <p className="step-hint">点击「生成风险建议」，系统将输出四道闸门结果、会计税务建议、入账科目建议与凭证草稿边界。</p>
            {/* Gate 3：入账建议卡片预览 */}
            {session.decisionDraft?.postingAdvice && (
              <article className="posting-advice-card" aria-label="入账建议预览">
                <div className="posting-advice-head">
                  <FileText size={18} aria-hidden="true" />
                  <strong>入账建议预览</strong>
                  {session.decisionDraft.postingAdvice.manualReviewRequired && (
                    <span className="manual-review-pill">需人工确认</span>
                  )}
                </div>
                <div className="posting-advice-body">
                  <div className="advice-row">
                    <span>一级科目</span>
                    <strong>{session.decisionDraft.postingAdvice.primaryAccount}</strong>
                  </div>
                  <div className="advice-row">
                    <span>二级科目</span>
                    <strong>{session.decisionDraft.postingAdvice.secondaryAccount}</strong>
                  </div>
                  <div className="advice-row">
                    <span>三级明细科目</span>
                    <strong>{session.decisionDraft.postingAdvice.detailAccount}</strong>
                  </div>
                  <div className="advice-row">
                    <span>建议理由</span>
                    <small>{session.decisionDraft.postingAdvice.reason}</small>
                  </div>
                  <div className="advice-row">
                    <span>适用条件</span>
                    <small>{session.decisionDraft.postingAdvice.conditions}</small>
                  </div>
                </div>
              </article>
            )}
            <button
              type="button"
              className="primary-button"
              onClick={() => {
                dispatch({ type: 'GENERATE_DECISION' });
                navigate(`/invoices/${resolvedCaseId ?? 'current'}/decision`);
              }}
            >
              生成风险建议 <CheckCircle2 size={16} aria-hidden="true" />
            </button>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow={`可操作流程 / 三阶段闭环 · Case ${session.caseId}`}
        title={session.invoice.itemName || '发票流程'}
        description={`发票号 ${session.invoice.invoiceNumber} · ${session.invoice.category} · 当前状态：${session.finalStatus}`}
      />

      {/* 步骤条 - Gate 3 补丁：可点击按钮，已完成/当前可回看，未满足前置条件的未来步骤阻断并提示 */}
      <section className="stepper" aria-label="流程步骤">
        {WORKFLOW_STEPS.map((step, idx) => {
          const completed = session.completedSteps.includes(step);
          const isCurrent = session.currentStep === step;
          const canNavigate = step === '发票输入' ? true : canNavigateToStep(session, step);
          const isFuture = !completed && !isCurrent;
          return (
            <button
              type="button"
              className={`step-dot ${completed ? 'done' : ''} ${isCurrent ? 'current' : ''} ${isFuture && !canNavigate ? 'locked' : ''}`}
              key={step}
              aria-current={isCurrent ? 'step' : undefined}
              aria-label={`步骤 ${idx + 1}：${step}，${completed ? '已完成（可回看）' : isCurrent ? '进行中' : canNavigate ? '可跳转' : '未满足前置条件'}`}
              onClick={() => handleStepClick(step)}
            >
              <span className="step-no">{idx + 1}</span>
              <span className="step-label">{step}</span>
            </button>
          );
        })}
      </section>
      {/* Gate 3 补丁：步骤跳转阻断原因提示 */}
      {navBlockReason && (
        <div className="step-nav-block" role="alert">
          <AlertTriangle size={14} aria-hidden="true" />
          <span>{navBlockReason}</span>
        </div>
      )}

      <div className="workflow-layout">
        {/* 左侧：当前步骤操作区 */}
        <section className="workflow-main" aria-label="当前步骤操作">
          <div className="section-head">
            <div>
              <span className="eyebrow">当前步骤 {stepIndex + 1} / {WORKFLOW_STEPS.length}</span>
              <h2>{session.currentStep}</h2>
            </div>
          </div>
          {renderStepContent()}
        </section>

        {/* 右侧：AI 辅助判断面板 */}
        <aside className="ai-panel" aria-label="AI 辅助判断面板">
          <div className="ai-panel-head">
            <Bot size={20} aria-hidden="true" />
            <strong>AI 辅助判断</strong>
          </div>
          {currentAi ? (
            <div className="ai-content">
              <div className="ai-row">
                <span>当前任务</span>
                <strong>{currentAi.task}</strong>
              </div>
              <div className="ai-row">
                <span>输入来源</span>
                <small>{currentAi.inputSummary}</small>
              </div>
              <div className="ai-row">
                <span>输出结论</span>
                <small>{currentAi.outputSummary}</small>
              </div>
              <div className="ai-row">
                <span>置信度</span>
                <strong className="ai-confidence">{Math.round(currentAi.confidence * 100)}%</strong>
              </div>
              {currentAi.questions.length > 0 && (
                <div className="ai-row">
                  <span>追问问题</span>
                  <ul className="ai-questions">
                    {currentAi.questions.map((q) => (
                      <li key={q}>{q}</li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="ai-row">
                <span>采纳状态</span>
                <strong className={`adopt-${currentAi.adoption}`}>{currentAi.adoption}</strong>
              </div>
              {/* Gate 3：业务问答完成情况 */}
              <div className="ai-row">
                <span>业务问答</span>
                <strong className={session.businessEvent.requiredQuestionsAnswered ? 'adopt-采纳' : 'adopt-退回'}>
                  {session.businessEvent.requiredQuestionsAnswered ? '已完成' : '未完成'}
                </strong>
              </div>
              {session.aiRiskStale && (
                <div className="ai-row">
                  <span>AI 风险初判</span>
                  <strong className="adopt-退回">已失效（需重新生成）</strong>
                </div>
              )}
            </div>
          ) : (
            <p className="ai-empty">AI 暂无输出，请推进流程。</p>
          )}
        </aside>
      </div>

      {/* 当前对象的快照 */}
      <section className="snapshot-grid" aria-label="四类对象快照">
        <article className="snapshot-tile">
          <span className="panel-kicker">发票对象</span>
          <small>{session.invoice.invoiceType} · {session.invoice.category}</small>
          <small>{session.invoice.seller}</small>
          <small>金额 {session.invoice.amount} 元 / 税额 {session.invoice.taxAmount} 元</small>
          <small>验真：{session.invoice.verificationStatus} / 重复：{session.invoice.duplicateStatus}</small>
        </article>
        <article className="snapshot-tile">
          <span className="panel-kicker">业务事件对象</span>
          <small>场景：{session.businessEvent.scenario}</small>
          <small>目的：{session.businessEvent.purpose}</small>
          <small>置信度：{Math.round(session.businessEvent.confidence * 100)}%</small>
          <small>必答问题：{session.businessEvent.requiredQuestionsAnswered ? '已完成' : '未完成'}</small>
        </article>
        <article className="snapshot-tile">
          <span className="panel-kicker">证据链对象</span>
          <small>完整度：{session.evidenceChain.completenessScore}%</small>
          <small>缺口：{session.evidenceChain.missingEvidence.length} 项</small>
          <small>不足以证明：{(session.evidenceChain.insufficientEvidence ?? []).length} 项</small>
          <small>状态：{session.evidenceChain.status}</small>
        </article>
        <article className="snapshot-tile">
          <span className="panel-kicker">风险决策对象</span>
          <small>最终状态：{session.finalStatus}</small>
          <small>{session.decisionDraft ? `风险等级：${session.decisionDraft.riskLevel}` : '风险建议待生成'}</small>
          <small>{session.decisionDraft ? `凭证草稿：${session.decisionDraft.voucherDraft.status}` : '凭证草稿待生成'}</small>
          <small>{session.decisionDraft?.postingAdvice ? `入账建议：${session.decisionDraft.postingAdvice.primaryAccount}/${session.decisionDraft.postingAdvice.secondaryAccount}` : '入账建议待生成'}</small>
        </article>
      </section>

      {/* 闸门预览（生成建议后显示） */}
      {session.decisionDraft && (
        <section aria-label="四道闸门预览">
          <GateRail gates={session.decisionDraft.gates} />
        </section>
      )}

      {/* 操作日志 */}
      <section className="log-panel" aria-label="操作日志">
        <div className="log-head">
          <History size={18} aria-hidden="true" />
          <strong>操作日志（共 {session.actionLogs.length} 条）</strong>
        </div>
        <div className="log-list">
          {session.actionLogs.slice().reverse().map((log) => (
            <div className="log-row" key={log.id}>
              <span className="log-time">{new Date(log.timestamp).toLocaleString('zh-CN')}</span>
              <span className="log-action">{log.action}</span>
              <span className="log-step">{log.fromStep} → {log.toStep}</span>
              <small className="log-note">{log.note}</small>
            </div>
          ))}
        </div>
      </section>

      <div className="workflow-footer">
        <Link className="text-link" to="/intake">重新录入</Link>
        <Link className="text-link" to="/invoices">返回列表</Link>
      </div>
    </div>
  );
}
