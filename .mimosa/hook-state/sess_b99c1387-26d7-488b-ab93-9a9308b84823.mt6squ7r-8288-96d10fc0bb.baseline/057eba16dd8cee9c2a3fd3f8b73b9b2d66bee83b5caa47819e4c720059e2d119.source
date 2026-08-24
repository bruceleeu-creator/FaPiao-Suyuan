import type { InvoiceCategory, StructuredQuestion } from '../domain/types';

// Gate 3：结构化问题模板（含必答标记、AI 指导语、建议证据）
// 三类做深场景必须包含必答问题：
//   餐饮：招待对象、参与人、业务目的、审批记录
//   住宿：出差申请、住宿人员、行程、项目/部门
//   咨询服务：合同、服务内容、成果物、验收、付款与发票一致性
// 八类发票均有最低问题模板
const structuredQuestionTemplates: Record<InvoiceCategory, StructuredQuestion[]> = {
  餐饮: [
    {
      id: 'CY-001',
      text: '本次招待的客户/对象是谁？',
      required: true,
      mappedField: 'externalParty',
      hint: '业务招待费扣除需要明确招待对象，否则无法证明业务相关性，进而在税前扣除和企业所得税处理上被税务机关质疑。',
      suggestedEvidence: ['客户拜访记录', '业务招待审批'],
    },
    {
      id: 'CY-002',
      text: '参与人有哪些（含本方与对方）？',
      required: true,
      mappedField: 'participants',
      hint: '招待人数和身份决定招待费扣除限额（发生额60%与营业收入5‰孰低），且需与本方员工、客户身份对应一致。',
      suggestedEvidence: ['业务招待审批', '客户拜访记录'],
    },
    {
      id: 'CY-003',
      text: '业务目的是什么（如续约、谈判、客户维护）？',
      required: true,
      mappedField: 'purpose',
      hint: '业务目的是判断招待费是否与企业生产经营相关的核心依据，缺失会被认定为个人消费不得税前扣除。',
      suggestedEvidence: ['业务招待审批', '客户拜访记录'],
    },
    {
      id: 'CY-004',
      text: '是否有业务招待审批记录？',
      required: true,
      mappedField: 'contract',
      hint: '事前审批是内控有效性的关键证据，缺审批会被认定为内控失效，影响凭证合规性。',
      suggestedEvidence: ['业务招待审批'],
    },
  ],
  住宿: [
    {
      id: 'ZS-001',
      text: '关联的出差申请单号是？',
      required: true,
      mappedField: 'contract',
      hint: '差旅费扣除必须有事前出差申请，否则无法证明住宿与生产经营的直接关系。',
      suggestedEvidence: ['出差申请', '项目任务单'],
    },
    {
      id: 'ZS-002',
      text: '住宿期间行程是怎样的？',
      required: true,
      mappedField: 'businessContent',
      hint: '行程能交叉验证住宿日期、地点与业务事由是否一致，是反舞弊和反虚列差旅的关键证据。',
      suggestedEvidence: ['行程记录', '出差申请'],
    },
    {
      id: 'ZS-003',
      text: '住宿人员是谁？',
      required: true,
      mappedField: 'initiator',
      hint: '住宿人员必须是本公司在职员工，且与出差申请人员一致，否则存在虚列差旅风险。',
      suggestedEvidence: ['出差申请', '行程记录'],
    },
    {
      id: 'ZS-004',
      text: '归属哪个项目/部门？',
      required: true,
      mappedField: 'department',
      hint: '项目归属决定费用归集方向（管理费用/销售费用/研发费用），影响后续科目建议的准确性。',
      suggestedEvidence: ['项目任务单', '出差申请'],
    },
  ],
  咨询服务: [
    {
      id: 'ZX-001',
      text: '咨询合同编号和金额是？',
      required: true,
      mappedField: 'contract',
      hint: '咨询服务费必须以合同为基础，无合同不得入账，且合同金额需与发票、付款一致。',
      suggestedEvidence: ['咨询合同', '付款记录'],
    },
    {
      id: 'ZX-002',
      text: '服务内容范围是什么？',
      required: true,
      mappedField: 'businessContent',
      hint: '服务内容决定费用性质（管理咨询/技术咨询/财税咨询），影响二级科目归类和税务处理。',
      suggestedEvidence: ['咨询合同', '成果物'],
    },
    {
      id: 'ZX-003',
      text: '成果物有哪些（报告/模型/培训）？',
      required: true,
      mappedField: 'purpose',
      hint: '咨询服务必须有可验证的成果物，无成果会被认定为虚假交易或预付费用，不得全额税前扣除。',
      suggestedEvidence: ['成果物', '验收单'],
    },
    {
      id: 'ZX-004',
      text: '是否有验收单？',
      required: true,
      mappedField: 'paymentSubject',
      hint: '验收单是服务实际发生的核心证据，缺失会被认定服务未完成，不得在当期确认费用。',
      suggestedEvidence: ['验收单', '成果物'],
    },
    {
      id: 'ZX-005',
      text: '付款记录是否与发票一致？',
      required: true,
      mappedField: 'paymentMethod',
      hint: '三流一致（合同/发票/付款）是反虚开的核心，金额或对方不一致需立即核查。',
      suggestedEvidence: ['付款记录', '咨询合同'],
    },
  ],
  交通: [
    {
      id: 'JT-001',
      text: '出差事由是什么？',
      required: true,
      mappedField: 'purpose',
      hint: '交通费需与出差事由对应，缺事由会被认定为个人出行不得税前扣除。',
      suggestedEvidence: ['出差申请', '行程记录'],
    },
    {
      id: 'JT-002',
      text: '出行人员是谁？',
      required: true,
      mappedField: 'initiator',
      hint: '出行人员必须与出差申请一致，且为本公司在职员工。',
      suggestedEvidence: ['出差申请'],
    },
    {
      id: 'JT-003',
      text: '是否关联出差申请？',
      required: false,
      mappedField: 'contract',
      hint: '关联出差申请能交叉验证行程真实性，缺失时需补充说明。',
      suggestedEvidence: ['出差申请', '行程记录'],
    },
  ],
  车辆: [
    {
      id: 'CL-001',
      text: '车辆用途是什么？',
      required: true,
      mappedField: 'purpose',
      hint: '车辆费用需区分公务/私用，私用部分不得税前扣除。',
      suggestedEvidence: ['车辆使用记录', '审批'],
    },
    {
      id: 'CL-002',
      text: '是否公司车辆？',
      required: true,
      mappedField: 'paymentSubject',
      hint: '公司车辆与员工车辆费用处理不同（员工车辆需签私车公用协议）。',
      suggestedEvidence: ['车辆使用记录'],
    },
    {
      id: 'CL-003',
      text: '加油/维修/过路费？',
      required: false,
      mappedField: 'businessContent',
      hint: '区分费用类型有助于归集到对应明细科目。',
      suggestedEvidence: ['车辆使用记录', '审批'],
    },
  ],
  办公: [
    {
      id: 'BG-001',
      text: '办公用品明细是什么？',
      required: true,
      mappedField: 'businessContent',
      hint: '办公用品需有明细清单，笼统"办公用品"被税务稽查高风险关注。',
      suggestedEvidence: ['采购审批', '入库或领用记录'],
    },
    {
      id: 'BG-002',
      text: '使用部门是谁？',
      required: true,
      mappedField: 'department',
      hint: '使用部门决定费用归集（管理费用/销售费用/研发费用）。',
      suggestedEvidence: ['入库或领用记录'],
    },
    {
      id: 'BG-003',
      text: '是否有采购审批？',
      required: false,
      mappedField: 'contract',
      hint: '采购审批是内控有效性的关键证据。',
      suggestedEvidence: ['采购审批'],
    },
  ],
  广告推广: [
    {
      id: 'GG-001',
      text: '广告投放渠道是？',
      required: true,
      mappedField: 'externalParty',
      hint: '投放渠道决定广告费扣除限额适用规则（互联网广告/传统媒体）。',
      suggestedEvidence: ['广告合同', '投放效果报告'],
    },
    {
      id: 'GG-002',
      text: '推广活动名称？',
      required: true,
      mappedField: 'businessContent',
      hint: '推广活动需明确具体名称和范围，否则被认定为笼统营销支出。',
      suggestedEvidence: ['广告合同', '投放效果报告'],
    },
    {
      id: 'GG-003',
      text: '是否有合同和效果报告？',
      required: true,
      mappedField: 'contract',
      hint: '广告费扣除需合同+效果报告双证据，缺失不得税前扣除。',
      suggestedEvidence: ['广告合同', '投放效果报告', '付款记录'],
    },
  ],
  租赁物业: [
    {
      id: 'ZL-001',
      text: '租赁物是什么？',
      required: true,
      mappedField: 'businessContent',
      hint: '租赁物决定科目归集（办公用房/仓储/设备）和税务处理。',
      suggestedEvidence: ['租赁合同'],
    },
    {
      id: 'ZL-002',
      text: '租期和月租金？',
      required: true,
      mappedField: 'paymentMethod',
      hint: '租期和租金决定是当期费用还是待摊费用，影响会计处理。',
      suggestedEvidence: ['租赁合同', '付款记录'],
    },
    {
      id: 'ZL-003',
      text: '是否有租赁合同？',
      required: true,
      mappedField: 'contract',
      hint: '租赁无合同不得入账，且需与发票、付款一致。',
      suggestedEvidence: ['租赁合同', '付款记录'],
    },
  ],
};

// Gate 3：返回结构化问题模板
export function mockGenerateStructuredQuestions(category: InvoiceCategory): StructuredQuestion[] {
  return structuredQuestionTemplates[category] ?? [
    {
      id: 'DEFAULT-001',
      text: '请补充业务事实说明。',
      required: true,
      mappedField: 'purpose',
      hint: '业务事实说明是判断费用性质和税前扣除的基础。',
      suggestedEvidence: ['发票'],
    },
  ];
}

// 向后兼容：返回纯文本问题数组（key 仍为问题文本，与 reducer 兼容）
export function mockGenerateQuestions(category: InvoiceCategory): string[] {
  return mockGenerateStructuredQuestions(category).map((q) => q.text);
}

// Gate 3：生成 AI 指导语（告诉用户为什么要回答这些问题，以及缺什么材料）
export function mockGenerateQAGuidance(category: InvoiceCategory): string {
  const questions = mockGenerateStructuredQuestions(category);
  const requiredQuestions = questions.filter((q) => q.required);
  const allEvidence = Array.from(new Set(requiredQuestions.flatMap((q) => q.suggestedEvidence)));
  return `本类发票需证明的业务事实：${mockScenarioLabel(category)}。请回答 ${requiredQuestions.length} 个核心必答问题，建议提前准备：${allEvidence.join('、')}。若不补充，业务闸门将阻断，证据闸门和风险闸门不得通过，无法生成可放行凭证草稿。`;
}

// 根据发票类型生成初始业务事件对象的场景描述
export function mockScenarioLabel(category: InvoiceCategory): string {
  const map: Record<InvoiceCategory, string> = {
    餐饮: '客户业务招待',
    住宿: '员工出差住宿',
    咨询服务: '管理咨询服务',
    交通: '员工出差交通',
    车辆: '车辆相关支出',
    办公: '办公用品采购',
    广告推广: '广告推广支出',
    租赁物业: '租赁物业支出',
  };
  return map[category];
}

// 通用必答检查：对任意问题集（本地模板或 DeepSeek 动态生成）生效
export function checkRequiredQuestionsAnswered(
  questions: StructuredQuestion[],
  answers: Record<string, string>,
): { allAnswered: boolean; unanswered: string[] } {
  const required = questions.filter((q) => q.required);
  const unanswered = required
    .filter((q) => !(answers[q.text] ?? '').trim())
    .map((q) => q.text);
  return { allAnswered: unanswered.length === 0, unanswered };
}

// Gate 3：检查必答问题是否完成（基于本地模板，向后兼容）
export function mockCheckRequiredQuestionsAnswered(
  category: InvoiceCategory,
  answers: Record<string, string>,
): { allAnswered: boolean; unanswered: string[] } {
  return checkRequiredQuestionsAnswered(mockGenerateStructuredQuestions(category), answers);
}
