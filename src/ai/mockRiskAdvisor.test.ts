import { describe, expect, it } from 'vitest';
import type { BusinessEvent, EvidenceChain, Invoice } from '../domain/types';
import { mockAssessRiskLevel, mockEvaluateGates, mockGenerateDecisionDraft } from './mockRiskAdvisor';

function buildInvoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
    id: 'INV-TEST',
    invoiceType: '增值税普通发票',
    invoiceCode: '044002600111',
    invoiceNumber: '10012001',
    issueDate: '2026-07-12',
    seller: '测试销方',
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
    status: '待生成凭证',
    ...overrides,
  };
}

function buildBusinessEvent(overrides: Partial<BusinessEvent> = {}): BusinessEvent {
  return {
    id: 'BE-TEST',
    invoiceId: 'INV-TEST',
    scenario: '客户业务招待',
    initiator: '销售部-测试',
    handler: '销售部-测试',
    claimant: '销售部-测试',
    participants: ['测试'],
    externalParty: '客户',
    occurredAt: '2026-07-12',
    location: '杭州',
    purpose: '业务招待',
    businessContent: '续约谈判',
    department: '销售部',
    project: '测试项目',
    contract: '无',
    paymentSubject: '公司',
    paymentMethod: '报销',
    beneficiary: '销售团队',
    companyBurdenReason: '客户维护',
    conflicts: [],
    confidence: 0.9,
    // Gate 3：默认业务问答已完成
    requiredQuestionsAnswered: true,
    unansweredRequiredQuestions: [],
    ...overrides,
  };
}

function buildEvidenceChain(overrides: Partial<EvidenceChain> = {}): EvidenceChain {
  return {
    id: 'EC-TEST',
    invoiceId: 'INV-TEST',
    businessEventId: 'BE-TEST',
    requiredEvidence: ['发票', '业务招待审批', '客户拜访记录', '付款记录'],
    uploadedEvidence: ['发票', '业务招待审批', '客户拜访记录', '付款记录'],
    matchedEvidence: ['业务招待审批', '客户拜访记录', '付款记录'],
    missingEvidence: [],
    conflictingEvidence: [],
    completenessScore: 100,
    status: '完整',
    // Gate 3：默认无不足以证明的证据
    insufficientEvidence: [],
    ...overrides,
  };
}

describe('高风险/验真失败/疑似重复案例不得生成可放行凭证草稿', () => {
  it('验真失败 -> 风险等级高，凭证禁止生成', () => {
    const invoice = buildInvoice({ verificationStatus: '验真失败', recognitionConfidence: 0.72 });
    const businessEvent = buildBusinessEvent({ confidence: 0.4 });
    const evidence = buildEvidenceChain();
    const riskLevel = mockAssessRiskLevel(invoice, evidence, businessEvent);
    expect(riskLevel).toBe('高');
    const decision = mockGenerateDecisionDraft(invoice, businessEvent, evidence, riskLevel, 0.4);
    expect(decision.voucherDraft.status).toBe('禁止生成');
    expect(decision.finalStatus).toBe('暂不能判断');
    expect(decision.gates.some((g) => g.status === '阻断')).toBe(true);
  });

  it('疑似重复 -> 发票闸门阻断，凭证禁止生成', () => {
    const invoice = buildInvoice({ duplicateStatus: '疑似重复' });
    const businessEvent = buildBusinessEvent();
    const evidence = buildEvidenceChain();
    const gates = mockEvaluateGates(invoice, businessEvent, evidence, '高');
    const invoiceGate = gates.find((g) => g.name === '发票闸门');
    expect(invoiceGate?.status).toBe('阻断');
  });

  it('低置信度（<0.6）-> 风险闸门阻断', () => {
    const invoice = buildInvoice({ recognitionConfidence: 0.5 });
    const businessEvent = buildBusinessEvent({ confidence: 0.9 });
    const evidence = buildEvidenceChain();
    const gates = mockEvaluateGates(invoice, businessEvent, evidence, '高');
    const riskGate = gates.find((g) => g.name === '风险闸门');
    expect(riskGate?.status).toBe('阻断');
  });
});

describe('证据缺失时最终状态为待补充/待人工确认/暂不能判断', () => {
  it('证据缺口较多 -> 风险高，凭证禁止生成，暂不能判断', () => {
    const invoice = buildInvoice();
    const businessEvent = buildBusinessEvent({ confidence: 0.6 });
    const evidence = buildEvidenceChain({
      uploadedEvidence: ['发票'],
      missingEvidence: ['业务招待审批', '客户拜访记录', '付款记录'],
      completenessScore: 25,
      status: '缺失',
    });
    const riskLevel = mockAssessRiskLevel(invoice, evidence, businessEvent);
    expect(riskLevel).toBe('高');
    const decision = mockGenerateDecisionDraft(invoice, businessEvent, evidence, riskLevel, 0.6);
    expect(['禁止生成', '待人工确认']).toContain(decision.voucherDraft.status);
    expect(['暂不能判断', '待财务复核']).toContain(decision.finalStatus);
  });

  it('证据缺口较少 -> 风险中，凭证待人工确认', () => {
    const invoice = buildInvoice({ amount: 1860 });
    const businessEvent = buildBusinessEvent({ confidence: 0.85 });
    const evidence = buildEvidenceChain({
      uploadedEvidence: ['发票', '业务招待审批'],
      missingEvidence: ['客户拜访记录', '付款记录'],
      completenessScore: 50,
      status: '缺失',
    });
    const riskLevel = mockAssessRiskLevel(invoice, evidence, businessEvent);
    const decision = mockGenerateDecisionDraft(invoice, businessEvent, evidence, riskLevel, 0.75);
    // 证据缺失应触发阻断或待人工确认，不能是可生成草稿
    expect(decision.voucherDraft.status).not.toBe('可生成草稿');
  });
});

describe('正常低风险案例可生成凭证草稿（不自动过账）', () => {
  it('证据完整、低风险、低金额 -> 可生成草稿，最终状态凭证草稿已生成', () => {
    const invoice = buildInvoice({ amount: 1860 });
    const businessEvent = buildBusinessEvent({ confidence: 0.92 });
    const evidence = buildEvidenceChain();
    const riskLevel = mockAssessRiskLevel(invoice, evidence, businessEvent);
    expect(riskLevel).toBe('低');
    const decision = mockGenerateDecisionDraft(invoice, businessEvent, evidence, riskLevel, 0.9);
    expect(decision.voucherDraft.status).toBe('可生成草稿');
    expect(decision.finalStatus).toBe('凭证草稿已生成');
    expect(decision.voucherDraft.summary).toContain('草稿');
  });
});
