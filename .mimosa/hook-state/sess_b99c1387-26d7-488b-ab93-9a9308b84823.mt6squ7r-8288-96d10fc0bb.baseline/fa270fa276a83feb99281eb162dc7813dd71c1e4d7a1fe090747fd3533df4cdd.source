import { describe, expect, it } from 'vitest';
import type { Invoice } from '../domain/types';
import { createWorkflowSession, workflowReducer } from './workflowReducer';

function buildInvoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
    id: 'INV-WF-TEST',
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

describe('workflowReducer 操作日志记录关键动作', () => {
  it('创建会话即写入「开始识别」日志', () => {
    const session = createWorkflowSession(buildInvoice());
    expect(session.actionLogs.length).toBe(1);
    expect(session.actionLogs[0].action).toBe('开始识别');
    expect(session.actionLogs[0].fromStep).toBe('发票输入');
    expect(session.actionLogs[0].toStep).toBe('票面确认');
  });

  it('确认票面 -> 写入「确认票面」日志，步骤推进到业务追问', () => {
    const session = createWorkflowSession(buildInvoice());
    const next = workflowReducer(session, { type: 'CONFIRM_INVOICE', patch: {} });
    expect(next.currentStep).toBe('业务追问');
    expect(next.actionLogs.some((l) => l.action === '确认票面')).toBe(true);
  });

  it('回答追问 -> 写入「回答追问」日志，AI 业务还原介入', () => {
    let session = createWorkflowSession(buildInvoice());
    session = workflowReducer(session, { type: 'CONFIRM_INVOICE', patch: {} });
    // Gate 3：必须回答全部 4 个必答问题才能通过业务闸门推进到证据补充
    session = workflowReducer(session, {
      type: 'ANSWER_QUESTIONS',
      answers: {
        '本次招待的客户/对象是谁？': '杭州示例客户',
        '参与人有哪些（含本方与对方）？': '张三, 李四',
        '业务目的是什么（如续约、谈判、客户维护）？': '续约谈判',
        '是否有业务招待审批记录？': '已审批',
      },
    });
    next_step(session, '证据补充');
    expect(session.actionLogs.some((l) => l.action === '回答追问')).toBe(true);
    expect(session.aiInterventions.some((i) => i.stage === '业务还原')).toBe(true);
  });

  it('补充证据 -> 写入「补充证据」日志', () => {
    let session = createWorkflowSession(buildInvoice());
    session = workflowReducer(session, { type: 'CONFIRM_INVOICE', patch: {} });
    session = workflowReducer(session, { type: 'ANSWER_QUESTIONS', answers: {} });
    session = workflowReducer(session, { type: 'UPLOAD_EVIDENCE', items: ['业务招待审批'] });
    expect(session.actionLogs.some((l) => l.action === '补充证据')).toBe(true);
  });

  it('生成 AI 初判 -> 写入「生成 AI 初判」日志', () => {
    let session = createWorkflowSession(buildInvoice());
    session = workflowReducer(session, { type: 'CONFIRM_INVOICE', patch: {} });
    session = workflowReducer(session, { type: 'ANSWER_QUESTIONS', answers: {} });
    session = workflowReducer(session, { type: 'UPLOAD_EVIDENCE', items: ['业务招待审批'] });
    session = workflowReducer(session, { type: 'GENERATE_AI_RISK' });
    expect(session.actionLogs.some((l) => l.action === '生成 AI 初判')).toBe(true);
  });

  it('采纳 -> 写入「采纳 AI 结论」日志', () => {
    let session = createWorkflowSession(buildInvoice());
    session = workflowReducer(session, { type: 'CONFIRM_INVOICE', patch: {} });
    session = workflowReducer(session, { type: 'ANSWER_QUESTIONS', answers: {} });
    session = workflowReducer(session, { type: 'UPLOAD_EVIDENCE', items: ['业务招待审批'] });
    session = workflowReducer(session, { type: 'GENERATE_AI_RISK' });
    session = workflowReducer(session, { type: 'ADOPT_DECISION', mode: '采纳' });
    expect(session.actionLogs.some((l) => l.action === '采纳 AI 结论')).toBe(true);
  });

  it('生成风险建议 -> 写入「生成风险建议」日志，决策草稿生成', () => {
    let session = createWorkflowSession(buildInvoice());
    session = workflowReducer(session, { type: 'CONFIRM_INVOICE', patch: {} });
    session = workflowReducer(session, { type: 'ANSWER_QUESTIONS', answers: {} });
    session = workflowReducer(session, { type: 'UPLOAD_EVIDENCE', items: ['业务招待审批'] });
    session = workflowReducer(session, { type: 'GENERATE_AI_RISK' });
    session = workflowReducer(session, { type: 'ADOPT_DECISION', mode: '采纳' });
    session = workflowReducer(session, { type: 'GENERATE_DECISION' });
    expect(session.actionLogs.some((l) => l.action === '生成风险建议')).toBe(true);
    expect(session.decisionDraft).toBeDefined();
  });

  it('高风险案例采纳被禁用，退回后回到业务追问', () => {
    const invoice = buildInvoice({
      verificationStatus: '验真失败',
      duplicateStatus: '疑似重复',
      recognitionConfidence: 0.72,
    });
    let session = createWorkflowSession(invoice);
    session = workflowReducer(session, { type: 'CONFIRM_INVOICE', patch: {} });
    session = workflowReducer(session, { type: 'ANSWER_QUESTIONS', answers: {} });
    session = workflowReducer(session, { type: 'UPLOAD_EVIDENCE', items: [] });
    session = workflowReducer(session, { type: 'GENERATE_AI_RISK' });
    session = workflowReducer(session, { type: 'ADOPT_DECISION', mode: '退回' });
    expect(session.finalStatus).toBe('已退回');
    expect(session.currentStep).toBe('业务追问');
  });
});

function next_step(session: { currentStep: string }, expected: string) {
  expect(session.currentStep).toBe(expected);
}

// 驱动到「凭证草稿已生成」的完整路径（低风险 + 全闸门通过 + 证据齐全）
function driveToVoucherGenerated() {
  let session = createWorkflowSession(buildInvoice());
  session = workflowReducer(session, { type: 'CONFIRM_INVOICE', patch: {} });
  session = workflowReducer(session, {
    type: 'ANSWER_QUESTIONS',
    answers: {
      '本次招待的客户/对象是谁？': '杭州示例客户',
      '参与人有哪些（含本方与对方）？': '张三, 李四',
      '业务目的是什么（如续约、谈判、客户维护）？': '续约谈判',
      '是否有业务招待审批记录？': '已审批',
    },
  });
  session = workflowReducer(session, {
    type: 'UPLOAD_EVIDENCE',
    items: ['发票', '业务招待审批', '客户拜访记录', '付款记录'],
  });
  session = workflowReducer(session, { type: 'GENERATE_AI_RISK' });
  session = workflowReducer(session, { type: 'ADOPT_DECISION', mode: '采纳' });
  session = workflowReducer(session, { type: 'GENERATE_DECISION' });
  return session;
}

describe('workflowReducer 财务确认与误报标记（新动作）', () => {
  it('凭证草稿已生成后确认通过 -> 已完成，写「凭证确认通过」日志和复核记录', () => {
    const session = driveToVoucherGenerated();
    expect(session.finalStatus).toBe('凭证草稿已生成');
    const next = workflowReducer(session, { type: 'CONFIRM_VOUCHER', mode: '通过' });
    expect(next.finalStatus).toBe('已完成');
    expect(next.actionLogs.some((l) => l.action === '凭证确认通过')).toBe(true);
    expect(next.decisionDraft?.humanReviewRecords.some((r) => r.includes('财务确认通过'))).toBe(true);
  });

  it('凭证退回修正 -> 待财务复核，写「凭证退回修正」日志', () => {
    const session = driveToVoucherGenerated();
    const next = workflowReducer(session, { type: 'CONFIRM_VOUCHER', mode: '退回修正', note: '科目需调整' });
    expect(next.finalStatus).toBe('待财务复核');
    expect(next.actionLogs.some((l) => l.action === '凭证退回修正')).toBe(true);
    expect(next.decisionDraft?.humanReviewRecords.some((r) => r.includes('科目需调整'))).toBe(true);
  });

  it('非「凭证草稿已生成」状态调用财务确认 -> 状态不变、不写日志', () => {
    let session = createWorkflowSession(buildInvoice());
    session = workflowReducer(session, { type: 'CONFIRM_INVOICE', patch: {} });
    const logsBefore = session.actionLogs.length;
    const next = workflowReducer(session, { type: 'CONFIRM_VOUCHER', mode: '通过' });
    expect(next).toBe(session);
    expect(next.actionLogs.length).toBe(logsBefore);
  });

  it('标记误报 -> decisionDraft.falsePositiveCards 更新并写日志，流程状态不变', () => {
    const session = driveToVoucherGenerated();
    const card = session.decisionDraft!.otherRiskNotes[0] ?? '测试风险点';
    const marked = workflowReducer(session, { type: 'MARK_RISK_FALSE_POSITIVE', card, marked: true });
    expect(marked.decisionDraft?.falsePositiveCards).toContain(card);
    expect(marked.actionLogs.some((l) => l.action === '标记误报')).toBe(true);
    expect(marked.finalStatus).toBe(session.finalStatus);
    // 重复标记不产生重复条目
    const markedAgain = workflowReducer(marked, { type: 'MARK_RISK_FALSE_POSITIVE', card, marked: true });
    expect(markedAgain.decisionDraft?.falsePositiveCards?.filter((c) => c === card).length).toBe(1);
    // 取消误报后清空并写「取消误报」日志
    const unmarked = workflowReducer(marked, { type: 'MARK_RISK_FALSE_POSITIVE', card, marked: false });
    expect(unmarked.decisionDraft?.falsePositiveCards).not.toContain(card);
    expect(unmarked.actionLogs.some((l) => l.action === '取消误报')).toBe(true);
  });

  it('未生成 decisionDraft 时标记误报 -> 状态不变', () => {
    const session = createWorkflowSession(buildInvoice());
    const next = workflowReducer(session, { type: 'MARK_RISK_FALSE_POSITIVE', card: 'X', marked: true });
    expect(next).toBe(session);
  });
});

describe('workflowReducer 异常解除留痕', () => {
  it('补齐证据使异常清空 -> 追加「异常已解除」日志并记录原异常类型', () => {
    let session = createWorkflowSession(buildInvoice());
    session = workflowReducer(session, { type: 'CONFIRM_INVOICE', patch: {} });
    session = workflowReducer(session, {
      type: 'ANSWER_QUESTIONS',
      answers: {
        '本次招待的客户/对象是谁？': '杭州示例客户',
        '参与人有哪些（含本方与对方）？': '张三, 李四',
        '业务目的是什么（如续约、谈判、客户维护）？': '续约谈判',
        '是否有业务招待审批记录？': '已审批',
      },
    });
    // 只上传部分证据 -> 存在「证据缺失」异常
    session = workflowReducer(session, { type: 'UPLOAD_EVIDENCE', items: ['发票'] });
    expect(session.evidenceChain.missingEvidence.length).toBeGreaterThan(0);
    // 补齐剩余证据 -> 异常清空，应留痕
    session = workflowReducer(session, {
      type: 'RESUPPLY_EVIDENCE',
      items: ['业务招待审批', '客户拜访记录', '付款记录'],
      fromException: true,
    });
    const clearedLog = session.actionLogs.find((l) => l.action === '异常已解除');
    expect(clearedLog).toBeDefined();
    expect(clearedLog?.note).toContain('证据缺失');
    expect(session.evidenceChain.missingEvidence.length).toBe(0);
  });

  it('异常未清空时不追加解除日志', () => {
    let session = createWorkflowSession(buildInvoice());
    session = workflowReducer(session, { type: 'CONFIRM_INVOICE', patch: {} });
    session = workflowReducer(session, {
      type: 'RESUPPLY_EVIDENCE',
      items: ['发票'],
      fromException: true,
    });
    expect(session.actionLogs.some((l) => l.action === '异常已解除')).toBe(false);
  });

  it('无异常的 case 正常流转不产生新的解除日志', () => {
    const session = driveToVoucherGenerated();
    // 路径中补齐证据时可能已留痕过一次，此处断言确认动作不再新增
    const clearedCount = session.actionLogs.filter((l) => l.action === '异常已解除').length;
    const next = workflowReducer(session, { type: 'CONFIRM_VOUCHER', mode: '通过' });
    expect(next.actionLogs.filter((l) => l.action === '异常已解除').length).toBe(clearedCount);
  });
});
