export type InvoiceCategory =
  | '餐饮'
  | '住宿'
  | '交通'
  | '车辆'
  | '办公'
  | '咨询服务'
  | '广告推广'
  | '租赁物业';

export type VerificationStatus = '验真通过' | '验真失败' | '待验真';
export type DuplicateStatus = '未重复' | '疑似重复';
export type RiskLevel = '低' | '中低' | '中' | '高';
export type GateStatus = '通过' | '阻断' | '待补充';
export type VoucherDraftStatus = '可生成草稿' | '禁止生成' | '待人工确认';

export type WorkflowStatus =
  | '待识别'
  | '识别中'
  | '待确认票面'
  | '待还原业务'
  | '待回答问题'
  | '待补充证据'
  | '业务已还原'
  | '待风险判断'
  | '待财务复核'
  | '待负责人审批'
  | '待生成凭证'
  | '凭证草稿已生成'
  | '已完成'
  | '已退回'
  | '暂不能判断'
  | '已作废或已红冲';

export interface Invoice {
  id: string;
  invoiceType: string;
  invoiceCode: string;
  invoiceNumber: string;
  issueDate: string;
  seller: string;
  buyer: string;
  itemName: string;
  amount: number;
  taxAmount: number;
  taxRate: string;
  verificationStatus: VerificationStatus;
  duplicateStatus: DuplicateStatus;
  redLetterStatus: '正常' | '已红冲' | '已作废';
  recognitionConfidence: number;
  category: InvoiceCategory;
  anomalies: string[];
  sourceFile: string;
  status: WorkflowStatus;
}

export interface BusinessEvent {
  id: string;
  invoiceId: string;
  scenario: string;
  initiator: string;
  handler: string;
  claimant: string;
  participants: string[];
  externalParty: string;
  occurredAt: string;
  location: string;
  purpose: string;
  businessContent: string;
  department: string;
  project: string;
  contract: string;
  paymentSubject: string;
  paymentMethod: string;
  beneficiary: string;
  companyBurdenReason: string;
  conflicts: string[];
  confidence: number;
  // Gate 3：业务闸门硬约束 - 必答问题是否完成
  requiredQuestionsAnswered?: boolean;
  // Gate 3：未答必答问题列表（用于UI提示和阻断原因）
  unansweredRequiredQuestions?: string[];
}

export interface EvidenceChain {
  id: string;
  invoiceId: string;
  businessEventId: string;
  requiredEvidence: string[];
  uploadedEvidence: string[];
  matchedEvidence: string[];
  missingEvidence: string[];
  conflictingEvidence: string[];
  completenessScore: number;
  status: '完整' | '缺失' | '冲突';
  // Gate 3：结构化证据指导（证明目的+缺失影响）
  evidenceGuidance?: EvidenceGuidance[];
  // Gate 3：上传但不足以证明（如缺盖章、缺签字等）
  insufficientEvidence?: string[];
}

// Gate 3：结构化证据指导项
export interface EvidenceGuidance {
  name: string;          // 证据名称
  required: boolean;     // 是否必需
  proofPurpose: string;  // 证明目的
  missingImpact: string; // 缺失影响
  sampleMaterial: string; // 示例材料说明
}

// Gate 3：结构化业务问答问题
export interface StructuredQuestion {
  id: string;            // 问题唯一 ID
  text: string;          // 问题文本（同时作为 answers 的 key）
  required: boolean;     // 是否必答
  mappedField: string;   // 映射到 BusinessEvent 的字段
  hint: string;          // 为什么问这个问题（AI 指导语）
  suggestedEvidence: string[]; // 回答此问题建议准备的证据
  // DeepSeek 给出的候选选项（最多 4 个；前端另提供第 5 个"自定义答案"输入）
  options?: string[];
  userAnswer?: string;   // 用户回答（写入 session.businessQA）
}

// Gate 3：入账建议（一级/二级/三级科目）
export interface PostingAdvice {
  primaryAccount: string;    // 一级科目
  secondaryAccount: string;  // 二级科目
  detailAccount: string;     // 三级明细科目
  reason: string;            // 建议理由
  conditions: string;        // 适用条件
  manualReviewRequired: boolean; // 是否需要人工确认
}

export interface RiskDecision {
  id: string;
  invoiceId: string;
  businessEventId: string;
  accountingConclusion: string;
  vatConclusion: string;
  citConclusion: string;
  otherTaxTriggers: string[];
  internalControlConclusion: string;
  evidenceConclusion: string;
  riskCards: string[];
  remediation: string[];
  approvalRequirement: string;
  voucherDraft: {
    status: VoucherDraftStatus;
    summary: string;
  };
  ruleVersions: string[];
  confidence: number;
  humanReviewRecords: string[];
  finalStatus: WorkflowStatus;
  riskLevel: RiskLevel;
}

export interface GateCheck {
  name: '发票闸门' | '业务闸门' | '证据闸门' | '风险闸门';
  status: GateStatus;
  reason: string;
}

export interface DemoCase {
  id: string;
  title: string;
  invoice: Invoice;
  businessEvent: BusinessEvent;
  evidenceChain: EvidenceChain;
  riskDecision: RiskDecision;
  gates: GateCheck[];
}

/* ========== Gate 2A：可操作闭环新增类型 ========== */

// 流程步骤
export type WorkflowStep =
  | '发票输入'
  | '票面确认'
  | '业务追问'
  | '证据补充'
  | 'AI风险初判'
  | '人工复核'
  | '生成建议';

// AI 介入阶段
export type AiStage = 'OCR识别' | '业务还原' | '证据匹配' | '风险解释' | '凭证建议';

// AI 介入记录
export interface AiIntervention {
  stage: AiStage;
  task: string;
  inputSummary: string;
  outputSummary: string;
  confidence: number;
  questions: string[];
  adoption: '待处理' | '采纳' | '修改' | '退回';
  note?: string;
}

// 用户操作日志
export interface UserActionLog {
  id: string;
  operator: string;
  action: string;
  fromStep?: WorkflowStep;
  toStep?: WorkflowStep;
  timestamp: string;
  note?: string;
}

// 流程会话
export interface WorkflowSession {
  caseId: string;
  currentStep: WorkflowStep;
  completedSteps: WorkflowStep[];
  invoice: Invoice;
  businessEvent: BusinessEvent;
  evidenceChain: EvidenceChain;
  aiInterventions: AiIntervention[];
  actionLogs: UserActionLog[];
  decisionDraft?: DecisionDraft;
  finalStatus: WorkflowStatus;
  // Gate 3：业务问答记录（结构化问题+用户回答）
  businessQA?: StructuredQuestion[];
  // 业务追问来源：template=本地规则模板，deepseek=按票面动态生成
  businessQASource?: 'template' | 'deepseek';
  // 业务追问 AI 指导语（随问题生成，DeepSeek 或本地模板产出）
  businessQAGuidance?: string;
  // DeepSeek 风险初判分析（规则定级 + AI 解释一体；规则等级与建议等级取更严者）
  aiRiskAnalysis?: {
    source: 'deepseek' | 'rule';
    suggestedLevel: RiskLevel;
    riskCards: string[];
    summary: string;
    accountingFocus?: string;
    vatFocus?: string;
    citFocus?: string;
  };
  // Gate 3：旧 AI 风险初判是否已失效（补资料后必须重新分析）
  aiRiskStale?: boolean;
}

// 风险建议草稿（结果页用）
export interface DecisionDraft {
  version: string;
  gates: GateCheck[];
  accountingConclusion: string;
  vatConclusion: string;
  citConclusion: string;
  otherRiskNotes: string[];
  evidenceConclusion: string;
  riskLevel: RiskLevel;
  confidence: number;
  remediation: string[];
  approvalRequirement: string;
  voucherDraft: {
    status: VoucherDraftStatus;
    summary: string;
  };
  humanReviewRecords: string[];
  finalStatus: WorkflowStatus;
  // Gate 3：入账建议（一级/二级/三级科目）
  postingAdvice?: PostingAdvice;
  // Gate 3：业务问答是否完成（用于审计追溯）
  businessQACompleted?: boolean;
  // 财务标记为误报的风险卡片（误报率统计来源；未标记时为空）
  falsePositiveCards?: string[];
}

// 录入表单原始输入
export interface IntakeForm {
  source: '案例' | '手工';
  sampleCaseId?: string;
  invoiceType: string;
  invoiceCode: string;
  invoiceNumber: string;
  issueDate: string;
  seller: string;
  buyer: string;
  itemName: string;
  // 价税合计：用户票面看到的总金额（含税）
  // 系统基于此字段和 taxRate 拆分出 amount（不含税）和 taxAmount（税额）
  totalAmount?: number;
  // 不含税金额：提交给 workflow 的 invoice.amount
  amount: number;
  taxAmount: number;
  taxRate: string;
  category: InvoiceCategory;
}
