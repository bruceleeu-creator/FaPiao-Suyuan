import { describe, expect, it } from 'vitest';
import type { Invoice } from '../domain/types';
import { canTransition } from './statusMachine';
import { createWorkflowSession, workflowReducer } from './workflowReducer';

// 防御性测试：验证 workflowReducer 的每一步 finalStatus 变化都通过 16 状态机校验
// 这是对 WorkflowContext.dispatch 拦截逻辑的底层保证：
// WorkflowContext.dispatch 在 prevStatus !== nextStatus && !canTransition(prevStatus, nextStatus) 时会拒绝
// 如果 reducer 路径与状态机不一致，正常流程会被卡死

function buildInvoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
    id: 'INV-STATE-TEST',
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

// 辅助：断言 reducer 一次 action 后，finalStatus 流转合法
function expectLegalTransition(
  prevStatus: string,
  nextSession: { finalStatus: string },
  label: string,
) {
  if (prevStatus !== nextSession.finalStatus) {
    expect(
      canTransition(prevStatus as any, nextSession.finalStatus as any),
      `${label}: 状态机拒绝合法流转 ${prevStatus} -> ${nextSession.finalStatus}`,
    ).toBe(true);
  }
}

const fullCateringAnswers = {
  '本次招待的客户/对象是谁？': '杭州示例客户',
  '参与人有哪些（含本方与对方）？': '张三, 李四',
  '业务目的是什么（如续约、谈判、客户维护）？': '续约谈判',
  '是否有业务招待审批记录？': '已审批',
};

const fullCateringEvidence = ['业务招待审批', '客户拜访记录', '付款记录'];

describe('Critical：reducer 路径与 16 状态机一致性', () => {
  it('确认票面 -> 提交追问 -> 能进入证据补充，不会被状态机拒绝', () => {
    // 这是独立审查发现的 Critical 问题的回归测试
    const invoice = buildInvoice();
    let session = createWorkflowSession(invoice);
    expect(session.finalStatus).toBe('待确认票面');

    // CONFIRM_INVOICE: 待确认票面 -> 待回答问题
    session = workflowReducer(session, { type: 'CONFIRM_INVOICE', patch: {} });
    expectLegalTransition('待确认票面', session, 'CONFIRM_INVOICE');
    expect(session.finalStatus).toBe('待回答问题');
    expect(session.currentStep).toBe('业务追问');

    // ANSWER_QUESTIONS: 待回答问题 -> 待补充证据
    session = workflowReducer(session, { type: 'ANSWER_QUESTIONS', answers: fullCateringAnswers });
    expectLegalTransition('待回答问题', session, 'ANSWER_QUESTIONS');
    expect(session.finalStatus).toBe('待补充证据');
    expect(session.currentStep).toBe('证据补充');

    // UPLOAD_EVIDENCE: 待补充证据 -> 待风险判断
    session = workflowReducer(session, { type: 'UPLOAD_EVIDENCE', items: fullCateringEvidence });
    expectLegalTransition('待补充证据', session, 'UPLOAD_EVIDENCE');
    expect(session.finalStatus).toBe('待风险判断');
    expect(session.currentStep).toBe('AI风险初判');
  });

  it('完整正常路径：确认票面 -> 追问 -> 证据 -> AI初判 -> 采纳 -> 生成建议，全部流转合法', () => {
    const invoice = buildInvoice();
    let session = createWorkflowSession(invoice);
    let prevStatus = session.finalStatus;

    const actions: Array<{ label: string; action: any }> = [
      { label: 'CONFIRM_INVOICE', action: { type: 'CONFIRM_INVOICE', patch: {} } },
      { label: 'ANSWER_QUESTIONS', action: { type: 'ANSWER_QUESTIONS', answers: fullCateringAnswers } },
      { label: 'UPLOAD_EVIDENCE', action: { type: 'UPLOAD_EVIDENCE', items: fullCateringEvidence } },
      { label: 'GENERATE_AI_RISK', action: { type: 'GENERATE_AI_RISK' } },
      { label: 'ADOPT_DECISION_采纳', action: { type: 'ADOPT_DECISION', mode: '采纳' } },
      { label: 'GENERATE_DECISION', action: { type: 'GENERATE_DECISION' } },
    ];

    for (const { label, action } of actions) {
      session = workflowReducer(session, action);
      // 每一步都要通过状态机校验
      expectLegalTransition(prevStatus, session, label);
      prevStatus = session.finalStatus;
    }

    // 最终应生成凭证草稿
    expect(session.decisionDraft).toBeDefined();
    expect(['凭证草稿已生成', '待财务复核', '暂不能判断']).toContain(session.finalStatus);
  });

  it('高风险阻断路径：采纳被阻断 -> 暂不能判断，流转合法', () => {
    const invoice = buildInvoice({
      verificationStatus: '验真失败',
      recognitionConfidence: 0.5,
    });
    let session = createWorkflowSession(invoice);
    session = workflowReducer(session, { type: 'CONFIRM_INVOICE', patch: {} });
    session = workflowReducer(session, { type: 'ANSWER_QUESTIONS', answers: fullCateringAnswers });
    session = workflowReducer(session, { type: 'UPLOAD_EVIDENCE', items: fullCateringEvidence });
    session = workflowReducer(session, { type: 'GENERATE_AI_RISK' });

    const prevStatus = session.finalStatus;
    session = workflowReducer(session, { type: 'ADOPT_DECISION', mode: '采纳' });
    expectLegalTransition(prevStatus, session, 'ADOPT_DECISION_高风险采纳');
    // 高风险/验真失败应被阻断
    expect(['暂不能判断', '待补充证据', '待财务复核']).toContain(session.finalStatus);
  });

  it('证据缺失阻断路径：采纳后回证据补充，待财务复核 -> 待补充证据 合法', () => {
    const invoice = buildInvoice();
    let session = createWorkflowSession(invoice);
    session = workflowReducer(session, { type: 'CONFIRM_INVOICE', patch: {} });
    session = workflowReducer(session, { type: 'ANSWER_QUESTIONS', answers: fullCateringAnswers });
    // 只上传一项证据，造成缺失
    session = workflowReducer(session, { type: 'UPLOAD_EVIDENCE', items: ['业务招待审批'] });
    session = workflowReducer(session, { type: 'GENERATE_AI_RISK' });

    expect(session.finalStatus).toBe('待财务复核');
    const prevStatus = session.finalStatus;

    session = workflowReducer(session, { type: 'ADOPT_DECISION', mode: '采纳' });
    expectLegalTransition(prevStatus, session, 'ADOPT_DECISION_证据缺失');
    // 证据缺失应回到证据补充
    expect(session.finalStatus).toBe('待补充证据');
  });

  it('退回路径：采纳退回 -> 已退回，流转合法', () => {
    const invoice = buildInvoice();
    let session = createWorkflowSession(invoice);
    session = workflowReducer(session, { type: 'CONFIRM_INVOICE', patch: {} });
    session = workflowReducer(session, { type: 'ANSWER_QUESTIONS', answers: fullCateringAnswers });
    session = workflowReducer(session, { type: 'UPLOAD_EVIDENCE', items: fullCateringEvidence });
    session = workflowReducer(session, { type: 'GENERATE_AI_RISK' });

    const prevStatus = session.finalStatus;
    session = workflowReducer(session, { type: 'ADOPT_DECISION', mode: '退回' });
    expectLegalTransition(prevStatus, session, 'ADOPT_DECISION_退回');
    expect(session.finalStatus).toBe('已退回');
  });
});
