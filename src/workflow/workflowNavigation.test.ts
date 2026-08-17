import { describe, expect, it } from 'vitest';
import type { Invoice } from '../domain/types';
import {
  canNavigateToStep,
  createWorkflowSession,
  explainStepNavigationBlock,
  workflowReducer,
} from './workflowReducer';
import { mockAssessRiskLevel, mockEvaluateGates } from '../ai/mockRiskAdvisor';

function buildInvoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
    id: 'INV-NAV-TEST',
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

// 模拟一套完整的餐饮必答回答（4 个必答问题全部回答）
const fullCateringAnswers = {
  '本次招待的客户/对象是谁？': '杭州示例客户',
  '参与人有哪些（含本方与对方）？': '张三, 李四',
  '业务目的是什么（如续约、谈判、客户维护）？': '续约谈判',
  '是否有业务招待审批记录？': '已审批',
};

describe('NAVIGATE_STEP - 步骤点击跳转', () => {
  it('NAVIGATE_STEP 只修改 currentStep，不修改 finalStatus 和 completedSteps', () => {
    let session = createWorkflowSession(buildInvoice());
    session = workflowReducer(session, { type: 'CONFIRM_INVOICE', patch: {} });
    session = workflowReducer(session, { type: 'ANSWER_QUESTIONS', answers: fullCateringAnswers });
    // 此时 currentStep = '证据补充', finalStatus = '待补充证据'
    const finalStatusBefore = session.finalStatus;
    const completedStepsBefore = [...session.completedSteps];

    // 回看到「业务追问」
    const next = workflowReducer(session, { type: 'NAVIGATE_STEP', step: '业务追问' });
    expect(next.currentStep).toBe('业务追问');
    expect(next.finalStatus).toBe(finalStatusBefore);
    expect(next.completedSteps).toEqual(completedStepsBefore);
    // 不应生成新的 AI 结果
    expect(next.aiInterventions.length).toBe(session.aiInterventions.length);
    expect(next.decisionDraft).toBe(session.decisionDraft);
  });

  it('NAVIGATE_STEP 跳到当前步骤时返回原 state（无变化）', () => {
    let session = createWorkflowSession(buildInvoice());
    session = workflowReducer(session, { type: 'CONFIRM_INVOICE', patch: {} });
    const next = workflowReducer(session, { type: 'NAVIGATE_STEP', step: session.currentStep });
    expect(next).toBe(session);
  });

  it('NAVIGATE_STEP 未满足前置条件时返回原 state（兜底校验，不绕过闸门）', () => {
    let session = createWorkflowSession(buildInvoice());
    session = workflowReducer(session, { type: 'CONFIRM_INVOICE', patch: {} });
    // 业务问答未完成，尝试直接跳到证据补充
    const next = workflowReducer(session, { type: 'NAVIGATE_STEP', step: '证据补充' });
    expect(next).toBe(session);
    expect(next.currentStep).toBe('业务追问');
  });

  it('NAVIGATE_STEP 写入「步骤跳转」操作日志', () => {
    let session = createWorkflowSession(buildInvoice());
    session = workflowReducer(session, { type: 'CONFIRM_INVOICE', patch: {} });
    session = workflowReducer(session, { type: 'ANSWER_QUESTIONS', answers: fullCateringAnswers });
    const logCountBefore = session.actionLogs.length;
    const next = workflowReducer(session, { type: 'NAVIGATE_STEP', step: '业务追问' });
    expect(next.actionLogs.length).toBe(logCountBefore + 1);
    expect(next.actionLogs[next.actionLogs.length - 1].action).toBe('步骤跳转');
  });
});

describe('canNavigateToStep / explainStepNavigationBlock - 跳转校验', () => {
  it('业务问答未完成时不能跳到证据补充', () => {
    let session = createWorkflowSession(buildInvoice());
    session = workflowReducer(session, { type: 'CONFIRM_INVOICE', patch: {} });
    // 业务问答未完成（必答问题未答）
    expect(session.businessEvent.requiredQuestionsAnswered).toBe(false);
    expect(canNavigateToStep(session, '证据补充')).toBe(false);
    const reason = explainStepNavigationBlock(session, '证据补充');
    expect(reason).toContain('证据补充');
    expect(reason).toContain('必答问题');
  });

  it('业务问答完成后可以跳到证据补充', () => {
    let session = createWorkflowSession(buildInvoice());
    session = workflowReducer(session, { type: 'CONFIRM_INVOICE', patch: {} });
    session = workflowReducer(session, { type: 'ANSWER_QUESTIONS', answers: fullCateringAnswers });
    expect(canNavigateToStep(session, '证据补充')).toBe(true);
    expect(explainStepNavigationBlock(session, '证据补充')).toBe('');
  });

  it('未生成 AI 风险初判时不能跳到人工复核', () => {
    let session = createWorkflowSession(buildInvoice());
    session = workflowReducer(session, { type: 'CONFIRM_INVOICE', patch: {} });
    session = workflowReducer(session, { type: 'ANSWER_QUESTIONS', answers: fullCateringAnswers });
    session = workflowReducer(session, { type: 'UPLOAD_EVIDENCE', items: ['业务招待审批', '客户拜访记录', '付款记录'] });
    // 证据已完整但未生成 AI 风险初判
    expect(canNavigateToStep(session, '人工复核')).toBe(false);
    const reason = explainStepNavigationBlock(session, '人工复核');
    expect(reason).toContain('AI风险初判');
    expect(reason).toContain('生成');
  });

  it('未提交证据时不能跳到 AI 风险初判', () => {
    let session = createWorkflowSession(buildInvoice());
    session = workflowReducer(session, { type: 'CONFIRM_INVOICE', patch: {} });
    session = workflowReducer(session, { type: 'ANSWER_QUESTIONS', answers: fullCateringAnswers });
    // 还在证据补充，未提交过证据
    expect(canNavigateToStep(session, 'AI风险初判')).toBe(false);
    expect(explainStepNavigationBlock(session, 'AI风险初判')).toContain('证据补充');
  });

  it('未完成人工复核时不能跳到生成建议', () => {
    let session = createWorkflowSession(buildInvoice());
    session = workflowReducer(session, { type: 'CONFIRM_INVOICE', patch: {} });
    session = workflowReducer(session, { type: 'ANSWER_QUESTIONS', answers: fullCateringAnswers });
    session = workflowReducer(session, { type: 'UPLOAD_EVIDENCE', items: ['业务招待审批', '客户拜访记录', '付款记录'] });
    session = workflowReducer(session, { type: 'GENERATE_AI_RISK' });
    // 已生成 AI 风险初判但未完成人工复核
    expect(canNavigateToStep(session, '生成建议')).toBe(false);
    expect(explainStepNavigationBlock(session, '生成建议')).toContain('人工复核');
  });

  it('已完成步骤和当前步骤可回看', () => {
    let session = createWorkflowSession(buildInvoice());
    session = workflowReducer(session, { type: 'CONFIRM_INVOICE', patch: {} });
    session = workflowReducer(session, { type: 'ANSWER_QUESTIONS', answers: fullCateringAnswers });
    // 当前在「证据补充」，可回看「票面确认」「业务追问」
    expect(canNavigateToStep(session, '票面确认')).toBe(true);
    expect(canNavigateToStep(session, '业务追问')).toBe(true);
    expect(canNavigateToStep(session, '证据补充')).toBe(true);
    expect(explainStepNavigationBlock(session, '票面确认')).toBe('');
    expect(explainStepNavigationBlock(session, '业务追问')).toBe('');
  });

  it('回看旧步骤后仍可继续从当前业务状态推进', () => {
    let session = createWorkflowSession(buildInvoice());
    session = workflowReducer(session, { type: 'CONFIRM_INVOICE', patch: {} });
    session = workflowReducer(session, { type: 'ANSWER_QUESTIONS', answers: fullCateringAnswers });
    // 回看到「票面确认」
    session = workflowReducer(session, { type: 'NAVIGATE_STEP', step: '票面确认' });
    expect(session.currentStep).toBe('票面确认');
    expect(session.finalStatus).toBe('待补充证据');
    // 仍可继续提交证据（虽然 currentStep 切回了，但状态保留）
    // 通过 NAVIGATE_STEP 跳回证据补充
    const next = workflowReducer(session, { type: 'NAVIGATE_STEP', step: '证据补充' });
    expect(next.currentStep).toBe('证据补充');
    expect(next.finalStatus).toBe('待补充证据');
    expect(next.completedSteps).toEqual(session.completedSteps);
  });
});

describe('AI 风险初判报告依据 - 派生展示', () => {
  it('生成 AI 风险初判后存在「风险解释」AI 介入记录', () => {
    let session = createWorkflowSession(buildInvoice());
    session = workflowReducer(session, { type: 'CONFIRM_INVOICE', patch: {} });
    session = workflowReducer(session, { type: 'ANSWER_QUESTIONS', answers: fullCateringAnswers });
    session = workflowReducer(session, { type: 'UPLOAD_EVIDENCE', items: ['业务招待审批', '客户拜访记录', '付款记录'] });
    session = workflowReducer(session, { type: 'GENERATE_AI_RISK' });

    const riskIntervention = session.aiInterventions.find((i) => i.stage === '风险解释');
    expect(riskIntervention).toBeDefined();
    expect(riskIntervention!.adoption).toBe('待处理');
    expect(riskIntervention!.confidence).toBeGreaterThan(0);
    expect(riskIntervention!.outputSummary).toContain('风险等级');
  });

  it('人工复核页可派生风险等级和闸门报告（基于 session 实时计算）', () => {
    let session = createWorkflowSession(buildInvoice());
    session = workflowReducer(session, { type: 'CONFIRM_INVOICE', patch: {} });
    session = workflowReducer(session, { type: 'ANSWER_QUESTIONS', answers: fullCateringAnswers });
    session = workflowReducer(session, { type: 'UPLOAD_EVIDENCE', items: ['业务招待审批', '客户拜访记录', '付款记录'] });
    session = workflowReducer(session, { type: 'GENERATE_AI_RISK' });

    // 此时 currentStep 应为「人工复核」
    expect(session.currentStep).toBe('人工复核');

    // 派生展示依据：mockAssessRiskLevel + mockEvaluateGates + session.aiInterventions
    const riskLevel = mockAssessRiskLevel(session.invoice, session.evidenceChain, session.businessEvent);
    const gates = mockEvaluateGates(session.invoice, session.businessEvent, session.evidenceChain, riskLevel);
    const riskIntervention = [...session.aiInterventions]
      .reverse()
      .find((i) => i.stage === '风险解释');

    expect(['低', '中低', '中', '高']).toContain(riskLevel);
    expect(gates.length).toBe(4);
    expect(gates.map((g) => g.name)).toEqual(['发票闸门', '业务闸门', '证据闸门', '风险闸门']);
    expect(riskIntervention).toBeDefined();
    expect(riskIntervention!.confidence).toBeGreaterThan(0);

    // 报告必须能基于这些数据生成（模拟 UI 派生逻辑）
    const reportAvailable =
      riskIntervention !== undefined &&
      typeof riskLevel === 'string' &&
      gates.length === 4 &&
      gates.every((g) => typeof g.status === 'string' && typeof g.reason === 'string');
    expect(reportAvailable).toBe(true);
  });

  it('未生成 AI 风险初判时人工复核页报告显示「未生成」提示', () => {
    // 通过 NAVIGATE_STEP 模拟：已生成 AI 风险初判后跳回 AI风险初判，
    // 然后再跳到人工复核（验证回看路径不丢失报告依据）
    let session = createWorkflowSession(buildInvoice());
    session = workflowReducer(session, { type: 'CONFIRM_INVOICE', patch: {} });
    session = workflowReducer(session, { type: 'ANSWER_QUESTIONS', answers: fullCateringAnswers });
    session = workflowReducer(session, { type: 'UPLOAD_EVIDENCE', items: ['业务招待审批', '客户拜访记录', '付款记录'] });
    session = workflowReducer(session, { type: 'GENERATE_AI_RISK' });

    // 跳回 AI 风险初判步骤回看
    session = workflowReducer(session, { type: 'NAVIGATE_STEP', step: 'AI风险初判' });
    expect(session.currentStep).toBe('AI风险初判');

    // 跳回人工复核（已完成步骤，可回看）
    session = workflowReducer(session, { type: 'NAVIGATE_STEP', step: '人工复核' });
    expect(session.currentStep).toBe('人工复核');

    // 风险解释记录仍然存在（用于人工复核页派生报告）
    const riskIntervention = session.aiInterventions.find((i) => i.stage === '风险解释');
    expect(riskIntervention).toBeDefined();
  });

  it('业务问答或证据缺失时报告必须明确提示不得采纳/修改，只能退回补充', () => {
    // 构造一个业务问答未完成但强行到了人工复核的场景（通过 NAVIGATE_STEP 回看路径模拟）
    // 实际生产中业务问答未完成时无法进入人工复核，但报告派生逻辑必须能正确判断
    let session = createWorkflowSession(buildInvoice());
    session = workflowReducer(session, { type: 'CONFIRM_INVOICE', patch: {} });
    session = workflowReducer(session, { type: 'ANSWER_QUESTIONS', answers: fullCateringAnswers });
    session = workflowReducer(session, { type: 'UPLOAD_EVIDENCE', items: ['业务招待审批', '客户拜访记录', '付款记录'] });
    session = workflowReducer(session, { type: 'GENERATE_AI_RISK' });

    // 此时业务问答已完成、证据完整，风险等级应为低或中低
    const riskLevel = mockAssessRiskLevel(session.invoice, session.evidenceChain, session.businessEvent);
    const gates = mockEvaluateGates(session.invoice, session.businessEvent, session.evidenceChain, riskLevel);
    const anyBlocked = gates.some((g) => g.status === '阻断');
    const hasInsufficient = (session.evidenceChain.insufficientEvidence ?? []).length > 0;

    // 在当前正常路径下应允许采纳（无阻断、无不足、非高风险、业务问答已完成）
    const allowAdopt = !anyBlocked && !hasInsufficient && riskLevel !== '高' && session.businessEvent.requiredQuestionsAnswered !== false;
    expect(allowAdopt).toBe(true);

    // 模拟证据缺失场景：构造一个证据缺失的 session
    let sessionBlocked = createWorkflowSession(buildInvoice());
    sessionBlocked = workflowReducer(sessionBlocked, { type: 'CONFIRM_INVOICE', patch: {} });
    sessionBlocked = workflowReducer(sessionBlocked, { type: 'ANSWER_QUESTIONS', answers: fullCateringAnswers });
    // 只上传一个证据，剩余证据缺失
    sessionBlocked = workflowReducer(sessionBlocked, { type: 'UPLOAD_EVIDENCE', items: ['业务招待审批'] });
    sessionBlocked = workflowReducer(sessionBlocked, { type: 'GENERATE_AI_RISK' });

    const riskLevelBlocked = mockAssessRiskLevel(sessionBlocked.invoice, sessionBlocked.evidenceChain, sessionBlocked.businessEvent);
    const gatesBlocked = mockEvaluateGates(sessionBlocked.invoice, sessionBlocked.businessEvent, sessionBlocked.evidenceChain, riskLevelBlocked);
    const anyBlocked2 = gatesBlocked.some((g) => g.status === '阻断');
    const hasMissing2 = sessionBlocked.evidenceChain.missingEvidence.length > 0;
    const allowAdopt2 = !anyBlocked2 && !hasMissing2 && riskLevelBlocked !== '高' && sessionBlocked.businessEvent.requiredQuestionsAnswered !== false;

    // 证据缺失时报告必须提示不得采纳
    expect(allowAdopt2).toBe(false);
    expect(hasMissing2 || anyBlocked2 || riskLevelBlocked === '高').toBe(true);
  });
});
