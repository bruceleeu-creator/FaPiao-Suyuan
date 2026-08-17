import { describe, expect, it } from 'vitest';
import type { Invoice } from '../domain/types';
import { createWorkflowSession, workflowReducer } from './workflowReducer';

function buildInvoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
    id: 'INV-BLOCK-TEST',
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

// 推进到人工复核阶段（证据完整 + 业务置信度高的标准路径）
function advanceToReview(invoice: Invoice, answers: Record<string, string>, evidenceItems: string[]) {
  let session = createWorkflowSession(invoice);
  session = workflowReducer(session, { type: 'CONFIRM_INVOICE', patch: {} });
  session = workflowReducer(session, { type: 'ANSWER_QUESTIONS', answers });
  session = workflowReducer(session, { type: 'UPLOAD_EVIDENCE', items: evidenceItems });
  session = workflowReducer(session, { type: 'GENERATE_AI_RISK' });
  return session;
}

const fullCateringAnswers = {
  '本次招待的客户/对象是谁？': '杭州示例客户',
  '参与人有哪些（含本方与对方）？': '张三, 李四',
  '业务目的是什么（如续约、谈判、客户维护）？': '续约谈判',
  '是否有业务招待审批记录？': '已审批',
};

const fullCateringEvidence = ['业务招待审批', '客户拜访记录', '付款记录'];

describe('问题1：空白业务回答 + 证据完整，不能生成可放行草稿', () => {
  it('全空白回答 -> 业务置信度 0.4，即使证据完整，采纳后不得进入待生成凭证', () => {
    const invoice = buildInvoice();
    // 空白回答
    const session = advanceToReview(invoice, {}, fullCateringEvidence);
    // 业务置信度应被降级
    expect(session.businessEvent.confidence).toBeLessThan(0.5);
    expect(session.businessEvent.purpose).toBe('待补充');

    // 采纳 -> Gate 3：业务问答未完成，业务闸门阻断，finalStatus 为待回答问题
    const afterAdopt = workflowReducer(session, { type: 'ADOPT_DECISION', mode: '采纳' });
    expect(afterAdopt.finalStatus).not.toBe('待生成凭证');
    // Gate 3：业务闸门阻断优先，finalStatus 为待回答问题
    expect(['暂不能判断', '待补充证据', '待财务复核', '待回答问题']).toContain(afterAdopt.finalStatus);
  });

  it('部分回答（不足70%）-> 业务置信度 0.55，不得进入待生成凭证', () => {
    const invoice = buildInvoice();
    const partialAnswers = {
      '本次招待的客户/对象是谁？': '客户A',
    };
    const session = advanceToReview(invoice, partialAnswers, fullCateringEvidence);
    expect(session.businessEvent.confidence).toBe(0.55);

    const afterAdopt = workflowReducer(session, { type: 'ADOPT_DECISION', mode: '采纳' });
    expect(afterAdopt.finalStatus).not.toBe('待生成凭证');
  });

  it('完整回答 + 证据完整 -> 业务置信度 0.82，可进入待生成凭证', () => {
    const invoice = buildInvoice({ amount: 1860 });
    const session = advanceToReview(invoice, fullCateringAnswers, fullCateringEvidence);
    expect(session.businessEvent.confidence).toBe(0.82);

    const afterAdopt = workflowReducer(session, { type: 'ADOPT_DECISION', mode: '采纳' });
    expect(afterAdopt.finalStatus).toBe('待生成凭证');
    expect(afterAdopt.currentStep).toBe('生成建议');
  });
});

describe('问题2：证据缺失时，即使人工采纳，也不能进入待生成凭证', () => {
  it('证据缺口 2 项 -> 采纳后回到证据补充，状态为待补充证据', () => {
    const invoice = buildInvoice();
    const session = advanceToReview(invoice, fullCateringAnswers, ['业务招待审批']);
    expect(session.evidenceChain.missingEvidence.length).toBeGreaterThan(0);

    const afterAdopt = workflowReducer(session, { type: 'ADOPT_DECISION', mode: '采纳' });
    expect(afterAdopt.finalStatus).toBe('待补充证据');
    expect(afterAdopt.currentStep).toBe('证据补充');
    expect(afterAdopt.finalStatus).not.toBe('待生成凭证');
  });

  it('证据完全缺失 -> 采纳后不得进入待生成凭证', () => {
    const invoice = buildInvoice();
    const session = advanceToReview(invoice, fullCateringAnswers, []);
    const afterAdopt = workflowReducer(session, { type: 'ADOPT_DECISION', mode: '采纳' });
    expect(afterAdopt.finalStatus).not.toBe('待生成凭证');
  });
});

describe('问题3：低OCR置信度/红冲作废/高风险时，人工采纳不能进入待生成凭证', () => {
  it('低OCR置信度（<0.6）-> 采纳后暂不能判断', () => {
    const invoice = buildInvoice({ recognitionConfidence: 0.5 });
    const session = advanceToReview(invoice, fullCateringAnswers, fullCateringEvidence);
    const afterAdopt = workflowReducer(session, { type: 'ADOPT_DECISION', mode: '采纳' });
    expect(afterAdopt.finalStatus).toBe('暂不能判断');
    expect(afterAdopt.finalStatus).not.toBe('待生成凭证');
  });

  it('红冲作废 -> 采纳后暂不能判断', () => {
    const invoice = buildInvoice({ redLetterStatus: '已红冲' });
    const session = advanceToReview(invoice, fullCateringAnswers, fullCateringEvidence);
    const afterAdopt = workflowReducer(session, { type: 'ADOPT_DECISION', mode: '采纳' });
    expect(afterAdopt.finalStatus).toBe('暂不能判断');
    expect(afterAdopt.finalStatus).not.toBe('待生成凭证');
  });

  it('验真失败 + 疑似重复 -> 采纳后暂不能判断', () => {
    const invoice = buildInvoice({
      verificationStatus: '验真失败',
      duplicateStatus: '疑似重复',
      recognitionConfidence: 0.72,
    });
    const session = advanceToReview(invoice, fullCateringAnswers, fullCateringEvidence);
    const afterAdopt = workflowReducer(session, { type: 'ADOPT_DECISION', mode: '采纳' });
    expect(afterAdopt.finalStatus).toBe('暂不能判断');
    expect(afterAdopt.currentStep).toBe('业务追问');
  });

  it('大额触发中风险（>=30000）+ 证据完整 -> 采纳后待财务复核，不得直接待生成凭证', () => {
    const invoice = buildInvoice({ amount: 50000 });
    const session = advanceToReview(invoice, fullCateringAnswers, fullCateringEvidence);
    const afterAdopt = workflowReducer(session, { type: 'ADOPT_DECISION', mode: '采纳' });
    // 大额触发中风险，需财务复核，不得直接进入待生成凭证
    expect(afterAdopt.finalStatus).not.toBe('待生成凭证');
    expect(['待财务复核', '暂不能判断', '待补充证据']).toContain(afterAdopt.finalStatus);
  });

  it('大额 + 证据缺口多 -> 阻断，采纳后不得进入待生成凭证', () => {
    const invoice = buildInvoice({ amount: 50000 });
    const session = advanceToReview(invoice, fullCateringAnswers, ['业务招待审批']);
    const afterAdopt = workflowReducer(session, { type: 'ADOPT_DECISION', mode: '采纳' });
    // 证据缺失优先拦截，回到证据补充；不论显示哪种阻断状态，都不得进入待生成凭证
    expect(afterAdopt.finalStatus).not.toBe('待生成凭证');
    expect(['暂不能判断', '待补充证据']).toContain(afterAdopt.finalStatus);
  });

  it('退回始终可用，不受阻断影响', () => {
    const invoice = buildInvoice({ verificationStatus: '验真失败' });
    const session = advanceToReview(invoice, fullCateringAnswers, fullCateringEvidence);
    const afterReturn = workflowReducer(session, { type: 'ADOPT_DECISION', mode: '退回' });
    expect(afterReturn.finalStatus).toBe('已退回');
    expect(afterReturn.currentStep).toBe('业务追问');
  });
});

describe('问题4：多数问题已回答但业务目的为空，业务闸门阻断时不得进入待生成凭证', () => {
  it('回答了3/4问题但业务目的为空 -> 业务闸门阻断，采纳后不得待生成凭证', () => {
    const invoice = buildInvoice();
    // 回答了客户对象、参与人、审批记录，但业务目的（关键问题）留空
    const partialAnswers = {
      '本次招待的客户/对象是谁？': '杭州示例客户',
      '参与人有哪些（含本方与对方）？': '张三, 李四',
      '是否有业务招待审批记录？': '已审批',
      // 业务目的问题故意不回答
    };
    const session = advanceToReview(invoice, partialAnswers, fullCateringEvidence);

    // 业务目的应为"待补充"，业务闸门应阻断
    expect(session.businessEvent.purpose).toBe('待补充');

    // 采纳 -> 必须被阻断，不得进入待生成凭证
    const afterAdopt = workflowReducer(session, { type: 'ADOPT_DECISION', mode: '采纳' });
    expect(afterAdopt.finalStatus).not.toBe('待生成凭证');
    // Gate 3：业务问答未完成（业务目的问题未答），业务闸门阻断，finalStatus 为待回答问题
    expect(afterAdopt.finalStatus).toBe('待回答问题');
    expect(afterAdopt.currentStep).toBe('业务追问');
  });

  it('业务目的为空 + 证据完整 -> 业务闸门阻断优先，仍不得待生成凭证', () => {
    const invoice = buildInvoice();
    const partialAnswers = {
      '本次招待的客户/对象是谁？': '客户A',
      '参与人有哪些（含本方与对方）？': '张三',
      '是否有业务招待审批记录？': '已审批',
    };
    const session = advanceToReview(invoice, partialAnswers, fullCateringEvidence);

    // 即使证据完整，业务闸门阻断也不得放行
    const afterAdopt = workflowReducer(session, { type: 'ADOPT_DECISION', mode: '采纳' });
    expect(afterAdopt.finalStatus).not.toBe('待生成凭证');
    // Gate 3：业务闸门阻断优先，finalStatus 为待回答问题
    expect(['暂不能判断', '待补充证据', '待财务复核', '待回答问题']).toContain(afterAdopt.finalStatus);
  });

  it('修改后采纳同样受业务闸门阻断约束', () => {
    const invoice = buildInvoice();
    const partialAnswers = {
      '本次招待的客户/对象是谁？': '客户A',
      '参与人有哪些（含本方与对方）？': '张三',
      '是否有业务招待审批记录？': '已审批',
    };
    const session = advanceToReview(invoice, partialAnswers, fullCateringEvidence);

    const afterModify = workflowReducer(session, { type: 'ADOPT_DECISION', mode: '修改', note: '修改' });
    expect(afterModify.finalStatus).not.toBe('待生成凭证');
  });
});
