// DeepSeek 业务追问集成测试
// 验证"业务追问 → 证据补充 → AI 风险初判 → 生成建议"一体化数据流：
//   1. LOAD_QUESTIONS：DeepSeek 动态问题替换模板，建议证据并入证据清单
//   2. ANSWER_QUESTIONS：必答检查对动态问题集生效，答案按 mappedField 写入业务事件
//   3. GENERATE_AI_RISK：DeepSeek 建议等级只允许调严（与规则取更严者）
//   4. GENERATE_DECISION：DeepSeek 风险卡片并入最终建议
import { describe, expect, it } from 'vitest';
import type { Invoice, StructuredQuestion } from '../domain/types';
import { createWorkflowSession, workflowReducer } from './workflowReducer';
import { checkRequiredQuestionsAnswered } from '../ai/mockQuestionService';

function buildInvoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
    id: 'INV-TEST-001',
    invoiceType: '增值税普通发票',
    invoiceCode: '',
    invoiceNumber: '26537000000343554012',
    issueDate: '2026-08-01',
    seller: '中国移动通信集团云南有限公司昆明分公司',
    buyer: '浙江示例科技有限公司',
    itemName: '*基础电信服务*流量服务',
    amount: 54.13,
    taxAmount: 4.87,
    taxRate: '3%',
    verificationStatus: '验真通过',
    duplicateStatus: '未重复',
    redLetterStatus: '正常',
    recognitionConfidence: 0.94,
    category: '办公',
    anomalies: [],
    sourceFile: 'tencent://ocr/test.pdf',
    status: '待确认票面',
    ...overrides,
  };
}

// 模拟 DeepSeek 按票面生成的动态问题（办公-电信流量服务场景）
const deepSeekQuestions: StructuredQuestion[] = [
  {
    id: 'DS-001',
    text: '本张销方为中国移动云南分公司、金额 59 元的流量服务费，对应的业务目的是什么？',
    required: true,
    mappedField: 'purpose',
    hint: '通信费需与生产经营直接相关，否则不得税前扣除。',
    suggestedEvidence: ['付款记录'],
    options: ['门店日常经营通讯', '员工外勤办公通讯', '项目专用数据通道', '备用号码保号'],
  },
  {
    id: 'DS-002',
    text: '该号码的使用部门是哪个？',
    required: true,
    mappedField: 'department',
    hint: '使用部门决定费用归集方向（管理费用/销售费用/研发费用）。',
    suggestedEvidence: ['费用报销单'],
  },
  {
    id: 'DS-003',
    text: '号码使用人是谁（需为在职员工）？',
    required: true,
    mappedField: 'initiator',
    hint: '使用人非在职员工时费用性质存疑，存在个税风险。',
    suggestedEvidence: [],
  },
  {
    id: 'DS-004',
    text: '付款方式与收款方是否与销方一致？',
    required: false,
    mappedField: 'paymentMethod',
    hint: '三流一致是反虚开的核心。',
    suggestedEvidence: ['付款记录', '费用报销单'],
  },
];

function startSession(): ReturnType<typeof createWorkflowSession> {
  let session = createWorkflowSession(buildInvoice());
  session = workflowReducer(session, { type: 'CONFIRM_INVOICE', patch: {} });
  return session;
}

describe('LOAD_QUESTIONS：DeepSeek 动态问题替换模板并入证据清单', () => {
  it('业务追问步骤允许替换，businessQA/businessQASource 更新，建议证据并入 requiredEvidence 与 evidenceGuidance', () => {
    let session = startSession();
    expect(session.businessQASource).toBe('template');

    session = workflowReducer(session, {
      type: 'LOAD_QUESTIONS',
      questions: deepSeekQuestions,
      guidance: '本张流量服务费需证明用途与部门归属，建议准备付款记录与报销单。',
    });

    expect(session.businessQASource).toBe('deepseek');
    expect(session.businessQA).toHaveLength(4);
    // DeepSeek 给出的候选选项随问题保存（第 5 个自定义项由前端提供，不入库）
    expect(session.businessQA?.[0].options).toHaveLength(4);
    expect(session.businessQA?.[0].options).toContain('门店日常经营通讯');
    expect(session.businessQAGuidance).toContain('流量服务费');
    // 办公类基础清单：发票、采购审批、入库或领用记录；DeepSeek 建议补充：付款记录、费用报销单
    expect(session.evidenceChain.requiredEvidence).toEqual(
      expect.arrayContaining(['付款记录', '费用报销单', '采购审批', '入库或领用记录']),
    );
    const guidanceNames = session.evidenceChain.evidenceGuidance?.map((g) => g.name) ?? [];
    expect(guidanceNames).toEqual(expect.arrayContaining(['付款记录', '费用报销单']));
    // DeepSeek 建议项为补充佐证（required=false），不作为硬性闸门
    const extra = session.evidenceChain.evidenceGuidance?.find((g) => g.name === '付款记录');
    expect(extra?.required).toBe(false);
    expect(session.actionLogs.some((l) => l.action === '生成追问（DeepSeek）')).toBe(true);
  });

  it('非业务追问步骤拒绝替换（防状态污染）', () => {
    let session = startSession();
    session = workflowReducer(session, {
      type: 'LOAD_QUESTIONS',
      questions: deepSeekQuestions,
      guidance: '指引',
    });
    const answered = workflowReducer(session, {
      type: 'ANSWER_QUESTIONS',
      answers: Object.fromEntries(deepSeekQuestions.map((q) => [q.text, '占位回答'])),
    });
    expect(answered.currentStep).toBe('证据补充');
    const after = workflowReducer(answered, {
      type: 'LOAD_QUESTIONS',
      questions: deepSeekQuestions,
      guidance: 'x',
    });
    expect(after).toBe(answered);
  });
});

describe('ANSWER_QUESTIONS：动态问题的必答闸门与 mappedField 映射', () => {
  it('动态必答问题未答完时业务闸门阻断，未答清单来自动态问题集', () => {
    let session = startSession();
    session = workflowReducer(session, {
      type: 'LOAD_QUESTIONS',
      questions: deepSeekQuestions,
      guidance: '指引',
    });

    const answers: Record<string, string> = {
      [deepSeekQuestions[0].text]: '门店日常经营通讯',
      [deepSeekQuestions[1].text]: '市场部',
      // DS-003（使用人）未答
    };
    session = workflowReducer(session, { type: 'ANSWER_QUESTIONS', answers });

    expect(session.currentStep).toBe('业务追问');
    expect(session.businessEvent.requiredQuestionsAnswered).toBe(false);
    expect(session.businessEvent.unansweredRequiredQuestions).toContain(deepSeekQuestions[2].text);
  });

  it('全部回答后按 mappedField 写入业务事件并推进到证据补充', () => {
    let session = startSession();
    session = workflowReducer(session, {
      type: 'LOAD_QUESTIONS',
      questions: deepSeekQuestions,
      guidance: '指引',
    });

    session = workflowReducer(session, {
      type: 'ANSWER_QUESTIONS',
      answers: {
        [deepSeekQuestions[0].text]: '门店日常经营通讯',
        [deepSeekQuestions[1].text]: '市场部',
        [deepSeekQuestions[2].text]: '张三',
        [deepSeekQuestions[3].text]: '对公转账，收款方与销方一致',
      },
    });

    expect(session.currentStep).toBe('证据补充');
    const be = session.businessEvent;
    expect(be.requiredQuestionsAnswered).toBe(true);
    expect(be.purpose).toBe('门店日常经营通讯');
    expect(be.department).toBe('市场部');
    expect(be.initiator).toBe('张三');
    expect(be.paymentMethod).toBe('对公转账，收款方与销方一致');
    // 问答记录随问题保存，供风险初判引用
    expect(session.businessQA?.every((q) => typeof q.userAnswer === 'string')).toBe(true);
  });

  it('通用必答检查对任意问题集生效', () => {
    const { allAnswered, unanswered } = checkRequiredQuestionsAnswered(
      deepSeekQuestions,
      { [deepSeekQuestions[0].text]: 'x' },
    );
    expect(allAnswered).toBe(false);
    expect(unanswered).toHaveLength(2);
  });
});

describe('GENERATE_AI_RISK / GENERATE_DECISION：DeepSeek 分析与规则定级一体化', () => {
  function advanceToRiskStep() {
    let session = startSession();
    session = workflowReducer(session, {
      type: 'LOAD_QUESTIONS',
      questions: deepSeekQuestions,
      guidance: '指引',
    });
    session = workflowReducer(session, {
      type: 'ANSWER_QUESTIONS',
      answers: Object.fromEntries(deepSeekQuestions.map((q, i) => [q.text, `回答${i}`])),
    });
    session = workflowReducer(session, {
      type: 'UPLOAD_EVIDENCE',
      items: ['采购审批', '入库或领用记录', '付款记录', '费用报销单'],
    });
    expect(session.currentStep).toBe('AI风险初判');
    return session;
  }

  it('DeepSeek 建议更严时采纳更严等级，风险卡片与分析存入 aiRiskAnalysis', () => {
    let session = advanceToRiskStep();
    // 54 元小票、证据齐全：规则引擎给低/中低；DeepSeek 建议高（发现矛盾）
    session = workflowReducer(session, {
      type: 'GENERATE_AI_RISK',
      analysis: {
        suggestedLevel: '高',
        riskCards: ['使用人与付款方不一致，存在个人消费混同风险', '缺费用报销单签批'],
        summary: '业务真实性存疑，建议人工核查。',
      },
    });

    expect(session.currentStep).toBe('人工复核');
    expect(session.aiRiskAnalysis?.source).toBe('deepseek');
    expect(session.aiRiskAnalysis?.suggestedLevel).toBe('高');
    expect(session.aiRiskAnalysis?.riskCards).toHaveLength(2);
    const riskIntervention = session.aiInterventions.find((i) => i.stage === '风险解释');
    expect(riskIntervention?.outputSummary).toContain('业务真实性存疑');
    expect(riskIntervention?.outputSummary).toContain('个人消费混同');
  });

  it('DeepSeek 建议更宽时不放宽规则结论（取更严者）', () => {
    // 构造规则定级为高的场景：业务问答未完成
    let session = startSession();
    session = workflowReducer(session, { type: 'ANSWER_QUESTIONS', answers: {} });
    session = workflowReducer(session, {
      type: 'GENERATE_AI_RISK',
      analysis: { suggestedLevel: '低', riskCards: [], summary: '看起来没问题' },
    });
    expect(session.aiRiskAnalysis?.suggestedLevel).toBe('高');
  });

  it('无 DeepSeek 分析时规则兜底，生成建议引用 DeepSeek 风险卡片', () => {
    let session = advanceToRiskStep();
    session = workflowReducer(session, {
      type: 'GENERATE_AI_RISK',
      analysis: {
        suggestedLevel: '中',
        riskCards: ['费用报销单缺少部门负责人签批'],
        summary: '证据基本完整，建议补签批。',
      },
    });
    session = workflowReducer(session, { type: 'ADOPT_DECISION', mode: '采纳' });
    session = workflowReducer(session, { type: 'GENERATE_DECISION' });

    expect(session.decisionDraft).toBeDefined();
    expect(
      session.decisionDraft?.otherRiskNotes.some((n) => n.includes('【DeepSeek 风险点】费用报销单缺少部门负责人签批')),
    ).toBe(true);
  });
});
