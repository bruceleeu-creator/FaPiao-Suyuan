// 演示样例 -> DecisionDraft 适配器
//
// 背景：DecisionResultPage 原本只读本地 WorkflowSession.decisionDraft。
// 演示样例（demoCases）没有进入本地 session，导致 /invoices/case-catering-001/decision
// 显示"尚未生成风险建议"，新版标准凭证 CSV 导出入口无法展示。
//
// 本适配器将 DemoCase.riskDecision + gates + businessEvent + evidenceChain
// 映射为 DecisionDraft，供 DecisionResultPage 在本地 session 缺失时回退使用。
//
// 边界：
//   - 不写入 localStorage
//   - 不修改 demoCases 原始数据
//   - 仅用于演示预览，不影响真实 workflow 状态机
//
// 依据：CO_20260718_本地页面验收与GateT2后端代理执行指令.md 第 2 节

import type {
  BusinessEvent,
  DecisionDraft,
  DemoCase,
  EvidenceChain,
  GateCheck,
  Invoice,
  PostingAdvice,
  RiskDecision,
  WorkflowSession,
} from '../domain/types';
import { demoCases } from './demoCases';

// 入账科目映射：从 invoice.category 派生基础 PostingAdvice
// 与 src/ai/mockRiskAdvisor.ts 的 postingAdviceMap 保持一致
const POSTING_ADVICE_BY_CATEGORY: Record<string, PostingAdvice> = {
  餐饮: {
    primaryAccount: '管理费用/销售费用',
    secondaryAccount: '业务招待费',
    detailAccount: '客户招待餐费',
    reason: '根据业务问答确认招待对象、参与人、业务目的，符合业务招待费定义。',
    conditions: '招待对象为本公司客户或经营相关外部人员；金额不超过发生额60%与营业收入5‰孰低。',
    manualReviewRequired: false,
  },
  住宿: {
    primaryAccount: '管理费用/销售费用',
    secondaryAccount: '差旅费',
    detailAccount: '住宿费',
    reason: '根据业务问答确认出差申请、住宿人员、行程，符合差旅费定义。',
    conditions: '住宿人员为本公司在职员工；住宿期间与出差申请一致；地点与出差事由相关。',
    manualReviewRequired: false,
  },
  咨询服务: {
    primaryAccount: '管理费用',
    secondaryAccount: '咨询服务费',
    detailAccount: '管理咨询/财税咨询/技术咨询',
    reason: '根据业务问答确认合同、服务内容、成果物、验收，符合咨询服务费定义。',
    conditions: '咨询服务有合同和验收单；成果物可验证；付款与发票、合同一致。',
    manualReviewRequired: true,
  },
  广告推广: {
    primaryAccount: '销售费用',
    secondaryAccount: '广告宣传费',
    detailAccount: '投放服务费',
    reason: '根据业务问答确认投放渠道、活动名称、合同和效果报告，符合广告费定义。',
    conditions: '广告费不超过当年销售（营业）收入15%准予扣除，超出部分准予在以后纳税年度结转。',
    manualReviewRequired: false,
  },
  办公: {
    primaryAccount: '管理费用',
    secondaryAccount: '办公费',
    detailAccount: '办公用品',
    reason: '根据业务问答确认办公用品明细、使用部门、采购审批，符合办公费定义。',
    conditions: '办公用品有明细清单；使用部门明确；采购经审批。',
    manualReviewRequired: false,
  },
  交通: {
    primaryAccount: '管理费用/销售费用',
    secondaryAccount: '差旅费',
    detailAccount: '交通费',
    reason: '根据业务问答确认出差事由和出行人员，符合差旅费-交通费定义。',
    conditions: '出行人员为本公司在职员工；与出差申请一致。',
    manualReviewRequired: false,
  },
  车辆: {
    primaryAccount: '管理费用',
    secondaryAccount: '车辆使用费',
    detailAccount: '加油/维修/过路费',
    reason: '根据业务问答确认车辆用途和归属，符合车辆使用费定义。',
    conditions: '车辆用于公务；私用部分不得扣除。',
    manualReviewRequired: false,
  },
  租赁物业: {
    primaryAccount: '管理费用',
    secondaryAccount: '租赁费/物业费',
    detailAccount: '办公用房租赁/物业管理',
    reason: '根据业务问答确认租赁物、租期、租金，符合租赁费定义。',
    conditions: '租赁有合同；租金与市场水平相当；用途与生产经营相关。',
    manualReviewRequired: false,
  },
};

// 根据风险等级推断是否需要人工确认
function inferManualReviewRequired(riskLevel: RiskDecision['riskLevel']): boolean {
  return riskLevel === '高' || riskLevel === '中';
}

// 根据业务事件推断业务问答是否完成
// 演示样例 businessEvent 没有 requiredQuestionsAnswered 字段，按 purpose 和 conflicts 推断
function inferBusinessQACompleted(businessEvent: BusinessEvent): boolean {
  if (businessEvent.requiredQuestionsAnswered !== undefined) {
    return businessEvent.requiredQuestionsAnswered;
  }
  // 演示样例兜底：purpose 非"待补充"且无冲突
  return businessEvent.purpose !== '待补充' && businessEvent.conflicts.length === 0;
}

// 将 DemoCase 转换为 DecisionDraft
// 不修改原始 demoCase，返回独立对象
export function adaptDemoCaseToDecisionDraft(demoCase: DemoCase): DecisionDraft {
  const { riskDecision, invoice, businessEvent, gates } = demoCase;
  const fallbackAdvice = POSTING_ADVICE_BY_CATEGORY[invoice.category] ?? {
    primaryAccount: '管理费用',
    secondaryAccount: '其他费用',
    detailAccount: '待确认明细',
    reason: '类别未匹配，建议财务人工归类。',
    conditions: '请财务确认后归集到对应明细科目。',
    manualReviewRequired: true,
  };

  // 根据风险等级动态决定 manualReviewRequired
  const manualReviewRequired =
    fallbackAdvice.manualReviewRequired || inferManualReviewRequired(riskDecision.riskLevel);

  const postingAdvice: PostingAdvice = {
    ...fallbackAdvice,
    manualReviewRequired,
  };

  return {
    version: riskDecision.ruleVersions.join('|') || 'demo-decision-v1',
    gates: gates as GateCheck[],
    accountingConclusion: riskDecision.accountingConclusion,
    vatConclusion: riskDecision.vatConclusion,
    citConclusion: riskDecision.citConclusion,
    otherRiskNotes: riskDecision.otherTaxTriggers ?? [],
    evidenceConclusion: riskDecision.evidenceConclusion,
    riskLevel: riskDecision.riskLevel,
    confidence: riskDecision.confidence,
    remediation: riskDecision.remediation,
    approvalRequirement: riskDecision.approvalRequirement,
    voucherDraft: {
      status: riskDecision.voucherDraft.status,
      summary: riskDecision.voucherDraft.summary,
    },
    humanReviewRecords: riskDecision.humanReviewRecords,
    finalStatus: riskDecision.finalStatus,
    postingAdvice,
    businessQACompleted: inferBusinessQACompleted(businessEvent),
  };
}

// 将 DemoCase 转换为 WorkflowSession（仅用于演示预览，不持久化）
// decisionDraft 字段由 adaptDemoCaseToDecisionDraft 生成
// caseId 使用 demoCase.id，便于路由匹配
export function adaptDemoCaseToWorkflowSession(demoCase: DemoCase): WorkflowSession {
  const decisionDraft = adaptDemoCaseToDecisionDraft(demoCase);
  return {
    caseId: demoCase.id,
    currentStep: '生成建议',
    completedSteps: ['发票输入', '票面确认', '业务追问', '证据补充', 'AI风险初判', '人工复核', '生成建议'],
    invoice: demoCase.invoice as Invoice,
    businessEvent: demoCase.businessEvent,
    evidenceChain: demoCase.evidenceChain as EvidenceChain,
    aiInterventions: [],
    actionLogs: [],
    decisionDraft,
    finalStatus: demoCase.riskDecision.finalStatus,
    // 演示样例业务问答默认已完成（除非有冲突）
    businessQA: [],
    aiRiskStale: false,
  };
}

// 按 caseId 查找演示样例并转换为 WorkflowSession
// 找不到时返回 null
export function findDemoCaseAsSession(caseId: string): WorkflowSession | null {
  const demoCase = demoCases.find((item) => item.id === caseId);
  if (!demoCase) return null;
  return adaptDemoCaseToWorkflowSession(demoCase);
}
