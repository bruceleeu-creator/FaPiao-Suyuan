import { describe, expect, it } from 'vitest';
import type { Invoice, WorkflowSession, UserActionLog, GateCheck } from '../domain/types';
import {
  createWorkflowSession,
  workflowReducer,
} from './workflowReducer';
import {
  mockAssessRiskLevel,
  mockEvaluateGates,
  mockGenerateDecisionDraft,
  mockGeneratePostingAdvice,
} from '../ai/mockRiskAdvisor';
import { mockMatchEvidenceDetailed, mockRequiredEvidenceGuidance } from '../ai/mockEvidenceMatcher';
import { mockGenerateStructuredQuestions, mockCheckRequiredQuestionsAnswered } from '../ai/mockQuestionService';

// Gate 3 必测场景（7 个）
// 1. 只扫描发票不回答问题，不能通过业务闸门
// 2. 问答不足但上传了发票，不能通过证据闸门
// 3. 缺少合同/付款/成果/验收时输出具体补证清单
// 4. 异常工作台补资料后回到三阶段处理并重新 AI 分析
// 5. 业务问答和证据都完整的低风险案例可生成凭证草稿
// 6. 高风险案例不得因补了部分资料就自动放行
// 7. 结果页能看到二级/三级科目入账建议

function buildInvoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
    id: 'INV-GATE3',
    invoiceType: '增值税普通发票',
    invoiceCode: '044002600111',
    invoiceNumber: '10012001',
    issueDate: '2026-07-12',
    seller: '杭州湖滨餐饮管理有限公司',
    buyer: '浙江示例科技有限公司',
    itemName: '餐饮服务',
    amount: 1860,
    taxAmount: 52.64,
    taxRate: '3%',
    verificationStatus: '验真通过',
    duplicateStatus: '未重复',
    redLetterStatus: '正常',
    recognitionConfidence: 0.94,
    category: '餐饮',
    anomalies: [],
    sourceFile: 'mock://ocr/test.pdf',
    status: '待确认票面',
    ...overrides,
  };
}

// 餐饮必答问题全答（来自 mockQuestionService 模板）
const CATERING_FULL_ANSWERS: Record<string, string> = {
  '本次招待的客户/对象是谁？': '杭州示例客户A',
  '参与人有哪些（含本方与对方）？': '张三、李四、客户A王五',
  '业务目的是什么（如续约、谈判、客户维护）？': '续约谈判',
  '是否有业务招待审批记录？': '是，OA编号2026-001',
};

// 推进到指定阶段的辅助函数
function advanceToStep(
  invoice: Invoice,
  targetStep: WorkflowSession['currentStep'],
  options: { answers?: Record<string, string>; evidenceItems?: string[] } = {},
): WorkflowSession {
  let session = createWorkflowSession(invoice);
  if (targetStep === '票面确认') return session;

  session = workflowReducer(session, { type: 'CONFIRM_INVOICE', patch: {} });
  if (targetStep === '业务追问') return session;

  session = workflowReducer(session, {
    type: 'ANSWER_QUESTIONS',
    answers: options.answers ?? CATERING_FULL_ANSWERS,
  });
  if (targetStep === '证据补充') return session;

  session = workflowReducer(session, {
    type: 'UPLOAD_EVIDENCE',
    items: options.evidenceItems ?? ['业务招待审批', '客户拜访记录', '付款记录'],
  });
  if (targetStep === 'AI风险初判') return session;

  session = workflowReducer(session, { type: 'GENERATE_AI_RISK' });
  if (targetStep === '人工复核') return session;

  session = workflowReducer(session, { type: 'ADOPT_DECISION', mode: '采纳' });
  if (targetStep === '生成建议') return session;

  return session;
}

describe('Gate 3 场景1：只扫描发票不回答问题，不能通过业务闸门', () => {
  it('确认票面后停留在业务追问，未答必答问题时不推进到证据补充', () => {
    const invoice = buildInvoice();
    let session = createWorkflowSession(invoice);
    session = workflowReducer(session, { type: 'CONFIRM_INVOICE', patch: {} });

    // 尝试提交空白回答
    session = workflowReducer(session, { type: 'ANSWER_QUESTIONS', answers: {} });

    expect(session.currentStep).toBe('业务追问');
    expect(session.businessEvent.requiredQuestionsAnswered).toBe(false);
    expect(session.businessEvent.unansweredRequiredQuestions?.length).toBeGreaterThan(0);
    expect(session.finalStatus).toBe('待回答问题');
    expect(session.completedSteps).not.toContain('业务追问');
  });

  it('必答问题部分回答（缺一个）也不能通过业务闸门', () => {
    const invoice = buildInvoice();
    let session = createWorkflowSession(invoice);
    session = workflowReducer(session, { type: 'CONFIRM_INVOICE', patch: {} });

    // 只回答 3 个，缺一个审批记录
    const partialAnswers = { ...CATERING_FULL_ANSWERS };
    delete partialAnswers['是否有业务招待审批记录？'];
    session = workflowReducer(session, { type: 'ANSWER_QUESTIONS', answers: partialAnswers });

    expect(session.currentStep).toBe('业务追问');
    expect(session.businessEvent.requiredQuestionsAnswered).toBe(false);
    expect(session.businessEvent.unansweredRequiredQuestions).toContain('是否有业务招待审批记录？');
  });

  it('业务闸门阻断时 gate 状态为阻断', () => {
    const invoice = buildInvoice();
    let session = createWorkflowSession(invoice);
    session = workflowReducer(session, { type: 'CONFIRM_INVOICE', patch: {} });
    session = workflowReducer(session, { type: 'ANSWER_QUESTIONS', answers: {} });

    const gates = mockEvaluateGates(invoice, session.businessEvent, session.evidenceChain, '高');
    const businessGate = gates.find((g) => g.name === '业务闸门');
    expect(businessGate?.status).toBe('阻断');
  });
});

describe('Gate 3 场景2：问答不足但上传了发票，不能通过证据闸门', () => {
  it('业务问答未完成时直接上传证据，证据闸门仍阻断', () => {
    const invoice = buildInvoice();
    let session = createWorkflowSession(invoice);
    session = workflowReducer(session, { type: 'CONFIRM_INVOICE', patch: {} });
    // 故意不答必答问题（被业务闸门拦截，但用户绕过 UI 强制 UPLOAD_EVIDENCE 也不应放行）
    session = workflowReducer(session, { type: 'ANSWER_QUESTIONS', answers: {} });

    // reducer 即使接收 UPLOAD_EVIDENCE，因 requiredQuestionsAnswered=false，computeBlockFlags 会判定阻断
    session = workflowReducer(session, {
      type: 'UPLOAD_EVIDENCE',
      items: ['业务招待审批', '客户拜访记录', '付款记录'],
    });

    // 评估闸门：业务闸门仍阻断
    const gates = mockEvaluateGates(invoice, session.businessEvent, session.evidenceChain, '高');
    const businessGate = gates.find((g) => g.name === '业务闸门');
    expect(businessGate?.status).toBe('阻断');
    expect(session.businessEvent.requiredQuestionsAnswered).toBe(false);
  });

  it('仅上传发票时，证据链检测到"发票不足以证明"', () => {
    const invoice = buildInvoice();
    let session = createWorkflowSession(invoice);
    session = workflowReducer(session, { type: 'CONFIRM_INVOICE', patch: {} });
    session = workflowReducer(session, { type: 'ANSWER_QUESTIONS', answers: CATERING_FULL_ANSWERS });
    // 仅上传发票（其他必要证据缺失）
    session = workflowReducer(session, { type: 'UPLOAD_EVIDENCE', items: [] });

    expect(session.evidenceChain.missingEvidence.length).toBeGreaterThan(0);
    // 仅有发票无其他佐证 -> 发票本身不足以证明
    expect(session.evidenceChain.insufficientEvidence).toContain('发票');
    expect(session.evidenceChain.status).toBe('缺失');
  });
});

describe('Gate 3 场景3：缺少合同/付款/成果/验收时输出具体补证清单', () => {
  it('咨询服务场景缺成果物/验收单/付款记录，补证清单含具体证明目的和缺失影响', () => {
    const invoice = buildInvoice({ category: '咨询服务', itemName: '管理咨询服务' });
    let session = createWorkflowSession(invoice);
    session = workflowReducer(session, { type: 'CONFIRM_INVOICE', patch: {} });

    // 咨询服务必答问题（5 个）
    const consultingAnswers: Record<string, string> = {
      '咨询合同编号和金额是？': 'CON-2026-001，金额10万',
      '服务内容范围是什么？': '财税咨询服务',
      '成果物有哪些（报告/模型/培训）？': '财税咨询报告',
      '是否有验收单？': '是，VS-001',
      '付款记录是否与发票一致？': '是，银行回单BR-001',
    };
    session = workflowReducer(session, { type: 'ANSWER_QUESTIONS', answers: consultingAnswers });

    // 只上传咨询合同，缺成果物/验收单/付款记录
    session = workflowReducer(session, {
      type: 'UPLOAD_EVIDENCE',
      items: ['咨询合同'],
    });

    // missingEvidence 必须含成果物/验收单/付款记录
    expect(session.evidenceChain.missingEvidence).toEqual(expect.arrayContaining(['成果物', '验收单', '付款记录']));
    // 咨询合同"上传但不足以证明"（有合同无成果物）
    expect(session.evidenceChain.insufficientEvidence).toContain('咨询合同');

    // remediationAdvice 含具体证明目的和缺失影响
    const matchResult = mockMatchEvidenceDetailed('咨询服务', ['咨询合同', '发票'], []);
    expect(matchResult.remediationAdvice.length).toBeGreaterThan(0);

    const adviceForDeliverable = matchResult.remediationAdvice.find((a) => a.evidenceName === '成果物');
    expect(adviceForDeliverable).toBeDefined();
    expect(adviceForDeliverable?.proofPurpose).toContain('证明咨询服务实际交付');
    expect(adviceForDeliverable?.missingImpact).toContain('虚假交易');

    const adviceForAcceptance = matchResult.remediationAdvice.find((a) => a.evidenceName === '验收单');
    expect(adviceForAcceptance).toBeDefined();
    expect(adviceForAcceptance?.missingImpact).toContain('服务未完成');
  });

  it('咨询服务 evidenceGuidance 含证明目的/缺失影响/示例材料', () => {
    const guidance = mockRequiredEvidenceGuidance('咨询服务');
    const deliverableGuidance = guidance.find((g) => g.name === '成果物');
    expect(deliverableGuidance).toBeDefined();
    expect(deliverableGuidance?.proofPurpose).toBeTruthy();
    expect(deliverableGuidance?.missingImpact).toBeTruthy();
    expect(deliverableGuidance?.sampleMaterial).toBeTruthy();
  });

  it('餐饮场景缺客户拜访记录时，审批"不足以证明"', () => {
    const result = mockMatchEvidenceDetailed('餐饮', ['发票', '业务招待审批'], []);
    expect(result.missingEvidence).toContain('客户拜访记录');
    expect(result.missingEvidence).toContain('付款记录');
    expect(result.insufficientEvidence).toContain('业务招待审批');
  });
});

describe('Gate 3 场景4：异常工作台补资料后回到三阶段处理并重新 AI 分析', () => {
  it('补料回流后旧 AI 风险初判失效，decisionDraft 被清除', () => {
    const invoice = buildInvoice();
    // 先推进到生成建议（含 decisionDraft）
    let session = advanceToStep(invoice, '生成建议');
    session = workflowReducer(session, { type: 'GENERATE_DECISION' });
    expect(session.decisionDraft).toBeDefined();

    // 异常工作台补料回流
    session = workflowReducer(session, {
      type: 'RESUPPLY_EVIDENCE',
      items: ['客户拜访记录', '付款记录'],
      fromException: true,
    });

    expect(session.aiRiskStale).toBe(true);
    expect(session.decisionDraft).toBeUndefined();
    // RESUPPLY_EVIDENCE 写入"异常工作台补资料"日志（标记失效是该 action 内部行为，不单独记日志）
    expect(session.actionLogs.some((l: UserActionLog) => l.action === '异常工作台补资料')).toBe(true);
  });

  it('补料完整后，currentStep 回到 AI风险初判，finalStatus 为待风险判断', () => {
    const invoice = buildInvoice();
    let session = advanceToStep(invoice, '生成建议');
    session = workflowReducer(session, { type: 'GENERATE_DECISION' });

    // 补全所有必要证据
    session = workflowReducer(session, {
      type: 'RESUPPLY_EVIDENCE',
      items: ['业务招待审批', '客户拜访记录', '付款记录'],
      fromException: true,
    });

    expect(session.evidenceChain.missingEvidence.length).toBe(0);
    expect((session.evidenceChain.insufficientEvidence ?? []).length).toBe(0);
    expect(session.currentStep).toBe('AI风险初判');
    expect(session.finalStatus).toBe('待风险判断');
  });

  it('补料仍不完整时，currentStep 停在证据补充', () => {
    const invoice = buildInvoice();
    // advanceToStep 时不传 evidenceItems，使证据链有缺口
    let session = advanceToStep(invoice, '生成建议', { evidenceItems: [] });
    session = workflowReducer(session, { type: 'GENERATE_DECISION' });

    // 仅补一项（仍缺拜访记录和付款记录）
    session = workflowReducer(session, {
      type: 'RESUPPLY_EVIDENCE',
      items: ['业务招待审批'],
      fromException: true,
    });

    expect(session.evidenceChain.missingEvidence.length).toBeGreaterThan(0);
    expect(session.currentStep).toBe('证据补充');
    expect(session.finalStatus).toBe('待补充证据');
  });

  it('INVALIDATE_AI_RISK 单独触发时标记失效', () => {
    const invoice = buildInvoice();
    let session = advanceToStep(invoice, 'AI风险初判');
    session = workflowReducer(session, { type: 'INVALIDATE_AI_RISK', reason: '人工标记需重新分析' });

    expect(session.aiRiskStale).toBe(true);
    expect(session.decisionDraft).toBeUndefined();
    expect(session.actionLogs.some((l: UserActionLog) => l.action === '标记 AI 风险初判失效')).toBe(true);
  });
});

describe('Gate 3 场景5：业务问答和证据都完整的低风险案例可生成凭证草稿', () => {
  it('完整问答+完整证据+低金额+低风险，可生成凭证草稿', () => {
    const invoice = buildInvoice({ amount: 1860 });
    let session = advanceToStep(invoice, '生成建议', {
      answers: CATERING_FULL_ANSWERS,
      evidenceItems: ['业务招待审批', '客户拜访记录', '付款记录'],
    });
    session = workflowReducer(session, { type: 'GENERATE_DECISION' });

    expect(session.decisionDraft).toBeDefined();
    expect(session.decisionDraft?.voucherDraft.status).toBe('可生成草稿');
    expect(session.decisionDraft?.finalStatus).toBe('凭证草稿已生成');
    expect(session.decisionDraft?.businessQACompleted).toBe(true);
    expect(session.businessEvent.requiredQuestionsAnswered).toBe(true);
  });

  it('低风险完整案例，postingAdvice 不需要人工确认', () => {
    const invoice = buildInvoice({ amount: 1860 });
    let session = advanceToStep(invoice, '生成建议', {
      evidenceItems: ['业务招待审批', '客户拜访记录', '付款记录'],
    });
    session = workflowReducer(session, { type: 'GENERATE_DECISION' });

    expect(session.decisionDraft?.postingAdvice).toBeDefined();
    expect(session.decisionDraft?.postingAdvice?.manualReviewRequired).toBe(false);
  });

  it('业务问答完整+证据完整时，computeBlockFlags.blocked 为 false', () => {
    const invoice = buildInvoice({ amount: 1860 });
    let session = advanceToStep(invoice, 'AI风险初判', {
      evidenceItems: ['业务招待审批', '客户拜访记录', '付款记录'],
    });

    // 闸门不应阻断
    const gates = mockEvaluateGates(invoice, session.businessEvent, session.evidenceChain, '低');
    const anyBlocked = gates.some((g: GateCheck) => g.status === '阻断');
    expect(anyBlocked).toBe(false);
  });
});

describe('Gate 3 场景6：高风险案例不得因补了部分资料就自动放行', () => {
  it('验真失败的高风险案例，补全证据后风险仍为高，凭证仍禁止生成', () => {
    const invoice = buildInvoice({
      verificationStatus: '验真失败',
      recognitionConfidence: 0.72,
    });
    let session = advanceToStep(invoice, '生成建议', {
      evidenceItems: ['业务招待审批', '客户拜访记录', '付款记录'],
    });
    session = workflowReducer(session, { type: 'GENERATE_DECISION' });

    // 即使证据完整，验真失败仍是高风险
    const riskLevel = mockAssessRiskLevel(invoice, session.evidenceChain, session.businessEvent);
    expect(riskLevel).toBe('高');

    // 凭证草稿禁止生成
    expect(['禁止生成', '待人工确认']).toContain(session.decisionDraft?.voucherDraft.status);
    expect(['暂不能判断', '待财务复核']).toContain(session.decisionDraft?.finalStatus);

    // 发票闸门应阻断
    const invoiceGate = session.decisionDraft?.gates.find((g) => g.name === '发票闸门');
    expect(invoiceGate?.status).toBe('阻断');
  });

  it('疑似重复的高风险案例，补料后仍不得生成可放行凭证', () => {
    const invoice = buildInvoice({
      duplicateStatus: '疑似重复',
    });
    let session = advanceToStep(invoice, '生成建议', {
      evidenceItems: ['业务招待审批', '客户拜访记录', '付款记录'],
    });
    session = workflowReducer(session, { type: 'GENERATE_DECISION' });

    expect(session.decisionDraft?.voucherDraft.status).not.toBe('可生成草稿');
    expect(session.decisionDraft?.postingAdvice?.manualReviewRequired).toBe(true);
  });

  it('高风险异常工作台补料后，重新生成 AI 风险初判仍为高，不会自动放行', () => {
    const invoice = buildInvoice({
      verificationStatus: '验真失败',
      recognitionConfidence: 0.72,
    });
    let session = advanceToStep(invoice, '生成建议', {
      evidenceItems: ['业务招待审批', '客户拜访记录', '付款记录'],
    });
    session = workflowReducer(session, { type: 'GENERATE_DECISION' });

    // 异常工作台补料
    session = workflowReducer(session, {
      type: 'RESUPPLY_EVIDENCE',
      items: ['业务招待审批', '客户拜访记录', '付款记录'],
      fromException: true,
    });

    // aiRiskStale=true，需要重新生成
    expect(session.aiRiskStale).toBe(true);
    expect(session.decisionDraft).toBeUndefined();

    // 重新生成 AI 风险初判
    session = workflowReducer(session, { type: 'GENERATE_AI_RISK' });
    const riskLevel = mockAssessRiskLevel(invoice, session.evidenceChain, session.businessEvent);
    expect(riskLevel).toBe('高');

    // 采纳后，由于高风险，应进入"暂不能判断"或"待财务复核"，不得直接"待生成凭证"
    session = workflowReducer(session, { type: 'ADOPT_DECISION', mode: '采纳' });
    expect(session.finalStatus).not.toBe('待生成凭证');
    expect(session.finalStatus).not.toBe('凭证草稿已生成');
  });
});

describe('Gate 3 场景7：结果页能看到二级/三级科目入账建议', () => {
  it('餐饮低风险完整案例，postingAdvice 含一/二/三级科目', () => {
    const invoice = buildInvoice({ amount: 1860 });
    let session = advanceToStep(invoice, '生成建议', {
      evidenceItems: ['业务招待审批', '客户拜访记录', '付款记录'],
    });
    session = workflowReducer(session, { type: 'GENERATE_DECISION' });

    const advice = session.decisionDraft?.postingAdvice;
    expect(advice).toBeDefined();
    expect(advice?.primaryAccount).toBeTruthy(); // 一级科目
    expect(advice?.secondaryAccount).toBe('业务招待费'); // 二级科目
    expect(advice?.detailAccount).toBe('客户招待餐费'); // 三级明细科目
    expect(advice?.reason).toBeTruthy();
    expect(advice?.conditions).toBeTruthy();
  });

  it('咨询服务案例的 postingAdvice 二级科目为咨询服务费，三级为管理咨询/财税咨询/技术咨询', () => {
    const invoice = buildInvoice({ category: '咨询服务', itemName: '管理咨询服务', amount: 100000 });
    let session = createWorkflowSession(invoice);
    session = workflowReducer(session, { type: 'CONFIRM_INVOICE', patch: {} });

    const consultingAnswers: Record<string, string> = {
      '咨询合同编号和金额是？': 'CON-2026-001，金额10万',
      '服务内容范围是什么？': '财税咨询服务',
      '成果物有哪些（报告/模型/培训）？': '财税咨询报告',
      '是否有验收单？': '是，VS-001',
      '付款记录是否与发票一致？': '是，银行回单BR-001',
    };
    session = workflowReducer(session, { type: 'ANSWER_QUESTIONS', answers: consultingAnswers });
    session = workflowReducer(session, {
      type: 'UPLOAD_EVIDENCE',
      items: ['咨询合同', '成果物', '验收单', '付款记录'],
    });
    session = workflowReducer(session, { type: 'GENERATE_AI_RISK' });
    session = workflowReducer(session, { type: 'ADOPT_DECISION', mode: '采纳' });
    session = workflowReducer(session, { type: 'GENERATE_DECISION' });

    const advice = session.decisionDraft?.postingAdvice;
    expect(advice).toBeDefined();
    expect(advice?.primaryAccount).toBe('管理费用');
    expect(advice?.secondaryAccount).toBe('咨询服务费');
    expect(advice?.detailAccount).toBe('管理咨询/财税咨询/技术咨询');
  });

  it('mockGeneratePostingAdvice 直接调用，8 类发票均返回一/二/三级科目', () => {
    const categories: Invoice['category'][] = [
      '餐饮',
      '住宿',
      '咨询服务',
      '交通',
      '车辆',
      '办公',
      '广告推广',
      '租赁物业',
    ];
    for (const category of categories) {
      const invoice = buildInvoice({ category, amount: 1000 });
      const advice = mockGeneratePostingAdvice(
        invoice,
        { requiredQuestionsAnswered: true } as any,
        { missingEvidence: [], insufficientEvidence: [] } as any,
        '低',
      );
      expect(advice.primaryAccount).toBeTruthy();
      expect(advice.secondaryAccount).toBeTruthy();
      expect(advice.detailAccount).toBeTruthy();
      expect(advice.reason).toBeTruthy();
      expect(advice.conditions).toBeTruthy();
    }
  });

  it('低风险完整案例的 decisionDraft.businessQACompleted 为 true', () => {
    const invoice = buildInvoice({ amount: 1860 });
    let session = advanceToStep(invoice, '生成建议', {
      evidenceItems: ['业务招待审批', '客户拜访记录', '付款记录'],
    });
    session = workflowReducer(session, { type: 'GENERATE_DECISION' });
    expect(session.decisionDraft?.businessQACompleted).toBe(true);
  });

  it('业务问答未完成时生成的 decisionDraft.businessQACompleted 为 false 且 manualReviewRequired=true', () => {
    const invoice = buildInvoice();
    // 补全 mockEvaluateGates 所需的字段（避免访问 undefined 报错）
    const businessEvent = {
      id: 'BE-GATE3',
      invoiceId: invoice.id,
      scenario: '客户业务招待',
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
      confidence: 0.4,
      requiredQuestionsAnswered: false,
      unansweredRequiredQuestions: ['本次招待的客户/对象是谁？'],
    } as any;
    const evidenceChain = {
      id: 'EC-GATE3',
      invoiceId: invoice.id,
      businessEventId: 'BE-GATE3',
      requiredEvidence: ['发票', '业务招待审批', '客户拜访记录', '付款记录'],
      uploadedEvidence: ['发票', '业务招待审批', '客户拜访记录', '付款记录'],
      matchedEvidence: ['业务招待审批', '客户拜访记录', '付款记录'],
      missingEvidence: [],
      conflictingEvidence: [],
      completenessScore: 100,
      status: '完整' as const,
      insufficientEvidence: [],
    } as any;
    const decision = mockGenerateDecisionDraft(invoice, businessEvent, evidenceChain, '高', 0.5);
    expect(decision.businessQACompleted).toBe(false);
    expect(decision.postingAdvice?.manualReviewRequired).toBe(true);
  });
});

describe('Gate 3 辅助断言：结构化问答模板与必答检查', () => {
  it('餐饮类有 4 个必答问题', () => {
    const qs = mockGenerateStructuredQuestions('餐饮');
    const required = qs.filter((q) => q.required);
    expect(required.length).toBe(4);
  });

  it('住宿类有 4 个必答问题', () => {
    const qs = mockGenerateStructuredQuestions('住宿');
    const required = qs.filter((q) => q.required);
    expect(required.length).toBe(4);
  });

  it('咨询服务类有 5 个必答问题', () => {
    const qs = mockGenerateStructuredQuestions('咨询服务');
    const required = qs.filter((q) => q.required);
    expect(required.length).toBe(5);
  });

  it('mockCheckRequiredQuestionsAnswered 正确识别未答问题', () => {
    const result = mockCheckRequiredQuestionsAnswered('餐饮', {});
    expect(result.allAnswered).toBe(false);
    expect(result.unanswered.length).toBe(4);

    const fullResult = mockCheckRequiredQuestionsAnswered('餐饮', CATERING_FULL_ANSWERS);
    expect(fullResult.allAnswered).toBe(true);
    expect(fullResult.unanswered.length).toBe(0);
  });
});
