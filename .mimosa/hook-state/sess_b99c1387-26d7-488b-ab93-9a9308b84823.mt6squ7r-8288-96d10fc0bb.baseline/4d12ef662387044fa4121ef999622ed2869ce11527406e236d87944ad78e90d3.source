import type {
  BusinessEvent,
  DecisionDraft,
  EvidenceChain,
  GateCheck,
  Invoice,
  PostingAdvice,
  RiskLevel,
} from '../domain/types';
import { getThresholds } from '../rules/thresholdStore';

// Gate 3：业务闸门硬约束 - 必答问题未完成时阻断
// 业务闸门检查需访问 businessEvent.requiredQuestionsAnswered
// 旧版 mockEvaluateGates 仅看 purpose/confidence/conflicts，已升级

// 四道闸门判定：发票闸门、业务闸门、证据闸门、风险闸门
// Gate 3 升级点：
//   1. 业务闸门增加必答问题完成检查（requiredQuestionsAnswered）
//   2. 业务闸门阻断时输出未答必答问题清单
//   3. 证据闸门阻断时区分"未上传"和"上传但不足以证明"
export function mockEvaluateGates(
  invoice: Invoice,
  businessEvent: BusinessEvent,
  evidenceChain: EvidenceChain,
  riskLevel: RiskLevel,
): GateCheck[] {
  const gates: GateCheck[] = [];
  const thresholds = getThresholds();

  // 发票闸门
  const invoiceBlock =
    invoice.verificationStatus === '验真失败' ||
    invoice.duplicateStatus === '疑似重复' ||
    invoice.redLetterStatus !== '正常';
  gates.push({
    name: '发票闸门',
    status: invoiceBlock ? '阻断' : '通过',
    reason: invoiceBlock
      ? `${invoice.verificationStatus}、${invoice.duplicateStatus}或红冲异常，禁止进入入账。`
      : '票面字段完整，验真通过，未发现重复或红冲。',
  });

  // 业务闸门（Gate 3 硬约束）
  // 1. 必答问题必须完成（requiredQuestionsAnswered === true）
  // 2. 业务目的不能为"待补充"
  // 3. 置信度不得低于业务置信度阻断线（阈值可配置）
  // 4. 不能存在事实矛盾
  const requiredAnswered = businessEvent.requiredQuestionsAnswered === true;
  const unansweredList = businessEvent.unansweredRequiredQuestions ?? [];
  const businessBlock =
    !requiredAnswered ||
    businessEvent.purpose === '待补充' ||
    businessEvent.confidence < thresholds.businessConfidenceBlockLine ||
    businessEvent.conflicts.length > 0;
  const businessReasonParts: string[] = [];
  if (!requiredAnswered) {
    businessReasonParts.push(
      `核心必答问题未完成${unansweredList.length > 0 ? `（${unansweredList.slice(0, 2).join('、')}${unansweredList.length > 2 ? '等' : ''}）` : ''}`,
    );
  }
  if (businessEvent.purpose === '待补充') businessReasonParts.push('业务目的未说明');
  if (businessEvent.confidence < thresholds.businessConfidenceBlockLine) businessReasonParts.push('业务置信度过低');
  if (businessEvent.conflicts.length > 0) businessReasonParts.push('存在事实矛盾');
  gates.push({
    name: '业务闸门',
    status: businessBlock ? '阻断' : '通过',
    reason: businessBlock
      ? `${businessReasonParts.join('、')}，需补充业务事实或完成必答问题后才能放行。`
      : '业务目的、参与人、受益人和承担理由清晰，核心必答问题已完成。',
  });

  // 证据闸门（Gate 3 升级：区分未上传和上传但不足以证明）
  const hasMissing = evidenceChain.missingEvidence.length > 0;
  const hasInsufficient = (evidenceChain.insufficientEvidence ?? []).length > 0;
  const hasConflict = evidenceChain.status === '冲突';
  const evidenceBlock = hasMissing || hasConflict;
  const evidenceStatus: GateCheck['status'] = evidenceBlock ? '阻断' : hasInsufficient ? '待补充' : '通过';
  const evidenceReasonParts: string[] = [];
  if (hasMissing) evidenceReasonParts.push(`未上传：${evidenceChain.missingEvidence.join('、')}`);
  if (hasInsufficient) evidenceReasonParts.push(`上传但不足以证明：${(evidenceChain.insufficientEvidence ?? []).join('、')}`);
  if (hasConflict) evidenceReasonParts.push('存在冲突材料');
  gates.push({
    name: '证据闸门',
    status: evidenceStatus,
    reason:
      evidenceStatus === '通过'
        ? '关键审批、付款和业务佐证材料已匹配且足以证明业务真实性。'
        : `${evidenceReasonParts.join('；')}。`,
  });

  // 风险闸门
  const riskBlock = riskLevel === '高' || invoice.recognitionConfidence < thresholds.ocrConfidenceWarnLine;
  gates.push({
    name: '风险闸门',
    status: riskBlock ? '阻断' : riskLevel === '中' ? '待补充' : '通过',
    reason: riskBlock
      ? '高风险或低置信度，禁止自动生成凭证草稿，必须人工复核。'
      : riskLevel === '中'
        ? '中风险事项，凭证草稿需财务人工确认。'
        : '规则与 AI 结论一致，风险等级可控。',
  });

  return gates;
}

// 根据发票类型和证据完整度给出风险等级
export function mockAssessRiskLevel(
  invoice: Invoice,
  evidenceChain: EvidenceChain,
  businessEvent: BusinessEvent,
): RiskLevel {
  const thresholds = getThresholds();
  // Gate 3：业务问答未完成 -> 高风险（不得放行）
  if (businessEvent.requiredQuestionsAnswered === false) {
    return '高';
  }
  if (
    invoice.verificationStatus === '验真失败' ||
    invoice.duplicateStatus === '疑似重复' ||
    businessEvent.confidence < thresholds.businessConfidenceBlockLine
  ) {
    return '高';
  }
  if (evidenceChain.missingEvidence.length > 2 || businessEvent.confidence < thresholds.businessConfidenceWarnLine) {
    return '高';
  }
  // Gate 3：上传但不足以证明也视同缺口
  const insufficientCount = (evidenceChain.insufficientEvidence ?? []).length;
  if (evidenceChain.missingEvidence.length + insufficientCount > 0 || invoice.amount >= thresholds.largeAmountLine) {
    return '中';
  }
  if (invoice.amount >= thresholds.approvalAmountLine || businessEvent.confidence < thresholds.businessConfidenceApprovalLine) {
    return '中低';
  }
  return '低';
}

// Gate 3：入账科目建议规则表
// 覆盖：餐饮、住宿、咨询服务、广告推广、办公五类（整改方案优先覆盖）
// 其他类别（交通、车辆、租赁物业）给出基础建议
const postingAdviceMap: Record<
  string,
  {
    primary: string;
    secondary: string;
    detail: string;
    reason: string;
    conditions: string;
  }
> = {
  餐饮: {
    primary: '管理费用/销售费用',
    secondary: '业务招待费',
    detail: '客户招待餐费',
    reason: '根据业务问答确认招待对象、参与人、业务目的，符合业务招待费定义。',
    conditions: '招待对象为本公司客户或经营相关外部人员；金额不超过发生额60%与营业收入5‰孰低。',
  },
  住宿: {
    primary: '管理费用/销售费用',
    secondary: '差旅费',
    detail: '住宿费',
    reason: '根据业务问答确认出差申请、住宿人员、行程，符合差旅费定义。',
    conditions: '住宿人员为本公司在职员工；住宿期间与出差申请一致；地点与出差事由相关。',
  },
  咨询服务: {
    primary: '管理费用',
    secondary: '咨询服务费',
    detail: '管理咨询/财税咨询/技术咨询',
    reason: '根据业务问答确认合同、服务内容、成果物、验收，符合咨询服务费定义。',
    conditions: '咨询服务有合同和验收单；成果物可验证；付款与发票、合同一致。',
  },
  广告推广: {
    primary: '销售费用',
    secondary: '广告宣传费',
    detail: '投放服务费',
    reason: '根据业务问答确认投放渠道、活动名称、合同和效果报告，符合广告费定义。',
    conditions: '广告费不超过当年销售（营业）收入15%准予扣除，超出部分准予在以后纳税年度结转。',
  },
  办公: {
    primary: '管理费用',
    secondary: '办公费',
    detail: '办公用品',
    reason: '根据业务问答确认办公用品明细、使用部门、采购审批，符合办公费定义。',
    conditions: '办公用品有明细清单；使用部门明确；采购经审批。',
  },
  交通: {
    primary: '管理费用/销售费用',
    secondary: '差旅费',
    detail: '交通费',
    reason: '根据业务问答确认出差事由和出行人员，符合差旅费-交通费定义。',
    conditions: '出行人员为本公司在职员工；与出差申请一致。',
  },
  车辆: {
    primary: '管理费用',
    secondary: '车辆使用费',
    detail: '加油/维修/过路费',
    reason: '根据业务问答确认车辆用途和归属，符合车辆使用费定义。',
    conditions: '车辆用于公务；私用部分不得扣除。',
  },
  租赁物业: {
    primary: '管理费用',
    secondary: '租赁费/物业费',
    detail: '办公用房租赁/物业管理',
    reason: '根据业务问答确认租赁物、租期、租金，符合租赁费定义。',
    conditions: '租赁有合同；租金与市场水平相当；用途与生产经营相关。',
  },
};

// Gate 3：生成入账科目建议
export function mockGeneratePostingAdvice(
  invoice: Invoice,
  businessEvent: BusinessEvent,
  evidenceChain: EvidenceChain,
  riskLevel: RiskLevel,
): PostingAdvice {
  const rule = postingAdviceMap[invoice.category] ?? {
    primary: '管理费用',
    secondary: '其他费用',
    detail: '待确认明细',
    reason: '类别未匹配，建议财务人工归类。',
    conditions: '请财务确认后归集到对应明细科目。',
  };
  // 高风险、证据缺失、业务问答不足时，标注"仅为暂定科目，需补证后确认"
  const qaIncomplete = businessEvent.requiredQuestionsAnswered === false;
  const evidenceMissing = evidenceChain.missingEvidence.length > 0;
  const evidenceInsufficient = (evidenceChain.insufficientEvidence ?? []).length > 0;
  const manualReviewRequired =
    riskLevel === '高' || riskLevel === '中' || qaIncomplete || evidenceMissing || evidenceInsufficient;
  const reason = manualReviewRequired
    ? `${rule.reason}（注：${qaIncomplete ? '业务问答未完成' : ''}${evidenceMissing ? '证据缺失' : ''}${evidenceInsufficient ? '证据不足以证明' : ''}，仅为暂定科目，需补证后确认）`
    : rule.reason;
  return {
    primaryAccount: rule.primary,
    secondaryAccount: rule.secondary,
    detailAccount: rule.detail,
    reason,
    conditions: rule.conditions,
    manualReviewRequired,
  };
}

// 生成完整风险建议草稿
export function mockGenerateDecisionDraft(
  invoice: Invoice,
  businessEvent: BusinessEvent,
  evidenceChain: EvidenceChain,
  riskLevel: RiskLevel,
  confidence: number,
): DecisionDraft {
  const gates = mockEvaluateGates(invoice, businessEvent, evidenceChain, riskLevel);
  const anyBlocked = gates.some((g) => g.status === '阻断');

  // 会计结论
  const accountingMap: Record<string, string> = {
    餐饮: '建议计入业务招待费。',
    住宿: '建议计入差旅费-住宿费。',
    咨询服务: '建议计入管理费用-咨询服务费。',
    交通: '建议计入差旅费-交通费。',
    车辆: '建议计入车辆使用费。',
    办公: '建议计入管理费用-办公费。',
    广告推广: '建议计入销售费用-广告推广费。',
    租赁物业: '建议计入租赁费或物业费。',
  };

  // 增值税结论（兼容「增值税专用发票」「专票」等写法）
  const isSpecialVat = invoice.invoiceType.includes('专票') || invoice.invoiceType.includes('专用发票');
  const vatConclusion = isSpecialVat
    ? '专票进项税额待财务复核后处理。'
    : '普通发票不得抵扣进项税。';

  // 企业所得税结论
  const citConclusion =
    invoice.category === '餐饮'
      ? '按业务招待费税前扣除限额复核（发生额60%与营业收入5‰孰低）。'
      : invoice.category === '广告推广'
        ? '按广告费税前扣除限额复核（不超过当年销售（营业）收入15%）。'
        : '业务真实性较高，可作为企业所得税税前扣除资料。';

  // 其他风险提示
  const thresholds = getThresholds();
  const otherRiskNotes: string[] = [];
  if (invoice.amount >= thresholds.largeAmountLine) otherRiskNotes.push('大额支出需关注成果物和审批。');
  if (businessEvent.confidence < thresholds.businessConfidenceWarnLine) otherRiskNotes.push('业务置信度偏低，建议复核。');
  if (businessEvent.requiredQuestionsAnswered === false) {
    const unanswered = businessEvent.unansweredRequiredQuestions ?? [];
    otherRiskNotes.push(`业务问答未完成：${unanswered.length} 个必答问题未答（业务闸门阻断）。`);
  }
  if (evidenceChain.missingEvidence.length > 0) {
    otherRiskNotes.push(`证据缺口：${evidenceChain.missingEvidence.join('、')}`);
  }
  const insufficient = evidenceChain.insufficientEvidence ?? [];
  if (insufficient.length > 0) {
    otherRiskNotes.push(`证据不足以证明：${insufficient.join('、')}（需补充配套材料）`);
  }

  // Gate 3：生成入账建议
  const postingAdvice = mockGeneratePostingAdvice(invoice, businessEvent, evidenceChain, riskLevel);

  // 凭证草稿边界
  let voucherStatus: DecisionDraft['voucherDraft']['status'];
  let voucherSummary: string;
  let finalStatus: DecisionDraft['finalStatus'];

  if (anyBlocked || riskLevel === '高') {
    voucherStatus = '禁止生成';
    // Gate 3：细化禁止原因
    const blockReasons: string[] = [];
    if (businessEvent.requiredQuestionsAnswered === false) {
      blockReasons.push('业务问答未完成');
    }
    if (evidenceChain.missingEvidence.length > 0) blockReasons.push('证据缺失');
    if ((evidenceChain.insufficientEvidence ?? []).length > 0) blockReasons.push('证据不足以证明');
    if (riskLevel === '高') blockReasons.push('高风险');
    voucherSummary = `阻断：${blockReasons.join('、') || '高风险/验真失败/疑似重复'}，不得生成凭证草稿。`;
    finalStatus = '暂不能判断';
  } else if (riskLevel === '中' || gates.some((g) => g.status === '待补充')) {
    voucherStatus = '待人工确认';
    voucherSummary = `暂存凭证建议：${accountingMap[invoice.category]} 入账建议：${postingAdvice.primaryAccount}/${postingAdvice.secondaryAccount}/${postingAdvice.detailAccount}（需财务确认后生成草稿）。`;
    finalStatus = '待财务复核';
  } else {
    voucherStatus = '可生成草稿';
    voucherSummary = `凭证草稿建议：${accountingMap[invoice.category]} 入账建议：${postingAdvice.primaryAccount}/${postingAdvice.secondaryAccount}/${postingAdvice.detailAccount}（草稿，不自动过账）`;
    finalStatus = '凭证草稿已生成';
  }

  // 整改建议（Gate 3：指导性 - 缺什么/为什么需要/补充后可重新判断什么）
  const remediation: string[] = [];
  if (invoice.verificationStatus === '验真失败') {
    remediation.push('重新上传清晰票据并补充官方验真结果（补充后可重新评估发票闸门）。');
  }
  if (invoice.duplicateStatus === '疑似重复') {
    remediation.push('说明与历史票据的关系，解除重复标记（补充后可重新评估发票闸门）。');
  }
  // Gate 3：业务问答未完成 -> 输出未答问题清单
  if (businessEvent.requiredQuestionsAnswered === false) {
    const unanswered = businessEvent.unansweredRequiredQuestions ?? [];
    if (unanswered.length > 0) {
      remediation.push(
        `回答核心必答问题：${unanswered.join('；')}（补充后业务闸门可放行，进入证据补充和风险判断）。`,
      );
    } else {
      remediation.push('完成核心必答问题（补充后业务闸门可放行）。');
    }
  }
  // Gate 3：证据缺失 -> 输出具体补证清单和目的
  if (evidenceChain.missingEvidence.length > 0) {
    remediation.push(
      `补充证据：${evidenceChain.missingEvidence.join('、')}（用于证明业务真实性和三流一致，补充后证据闸门可放行）。`,
    );
  }
  // Gate 3：证据不足以证明 -> 输出补配套材料建议
  if ((evidenceChain.insufficientEvidence ?? []).length > 0) {
    remediation.push(
      `补充配套材料：${(evidenceChain.insufficientEvidence ?? []).join('、')}（当前材料不足以证明业务真实性，需补充关联证据）。`,
    );
  }
  if (businessEvent.confidence < thresholds.businessConfidenceWarnLine && businessEvent.requiredQuestionsAnswered !== false) {
    remediation.push('补充业务事实说明，提高业务置信度（补充后可重新评估风险等级）。');
  }
  if (remediation.length === 0) remediation.push('无整改事项，可进入凭证草稿复核。');

  // 审批要求
  const approvalRequirement =
    riskLevel === '高'
      ? '财务负责人复核后再判断。'
      : invoice.amount >= thresholds.largeAmountLine
        ? '需负责人审批后生成草稿。'
        : riskLevel === '中'
          ? '财务复核后可生成草稿。'
          : '无需负责人追加审批。';

  // Gate 3：业务问答完成情况（用于审计追溯）
  const businessQACompleted = businessEvent.requiredQuestionsAnswered === true;

  return {
    version: `gate3-decision@${new Date().toISOString().slice(0, 10)}`,
    gates,
    accountingConclusion: accountingMap[invoice.category] ?? '建议计入相关费用科目。',
    vatConclusion,
    citConclusion,
    otherRiskNotes,
    evidenceConclusion:
      evidenceChain.status === '完整' && (evidenceChain.insufficientEvidence ?? []).length === 0
        ? '证据链完整且足以证明业务真实性。'
        : `证据链${evidenceChain.status}，完整度 ${evidenceChain.completenessScore}%${(evidenceChain.insufficientEvidence ?? []).length > 0 ? `，其中 ${(evidenceChain.insufficientEvidence ?? []).join('、')} 不足以证明业务` : ''}。`,
    riskLevel,
    confidence,
    remediation,
    approvalRequirement,
    voucherDraft: { status: voucherStatus, summary: voucherSummary },
    humanReviewRecords: ['等待财务复核风险建议与凭证草稿。'],
    finalStatus,
    postingAdvice,
    businessQACompleted,
  };
}
