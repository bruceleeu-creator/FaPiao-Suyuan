import type { EvidenceChain, EvidenceGuidance, InvoiceCategory } from '../domain/types';

// 各类发票必要证据清单（向后兼容，纯字符串数组）
const requiredEvidenceMap: Record<InvoiceCategory, string[]> = {
  餐饮: ['发票', '业务招待审批', '客户拜访记录', '付款记录'],
  住宿: ['发票', '出差申请', '行程记录', '付款记录', '项目任务单'],
  咨询服务: ['发票', '咨询合同', '成果物', '验收单', '付款记录'],
  交通: ['发票', '出差申请', '行程记录'],
  车辆: ['发票', '车辆使用记录', '审批'],
  办公: ['发票', '采购审批', '入库或领用记录'],
  广告推广: ['发票', '广告合同', '投放效果报告', '付款记录'],
  租赁物业: ['发票', '租赁合同', '付款记录'],
};

// Gate 3：结构化证据指导清单（证明目的 + 缺失影响 + 示例材料）
const evidenceGuidanceMap: Record<InvoiceCategory, EvidenceGuidance[]> = {
  餐饮: [
    {
      name: '发票',
      required: true,
      proofPurpose: '证明招待支出实际发生及金额、税额。',
      missingImpact: '无发票不得入账，不得税前扣除。',
      sampleMaterial: '增值税普通发票或专用发票原件',
    },
    {
      name: '业务招待审批',
      required: true,
      proofPurpose: '证明招待行为经事前审批，内控有效。',
      missingImpact: '缺审批被认定内控失效，可能被认定为个人消费不得扣除。',
      sampleMaterial: 'OA审批截图或纸质审批单',
    },
    {
      name: '客户拜访记录',
      required: true,
      proofPurpose: '证明招待对象、时间、地点、事由与发票一致。',
      missingImpact: '无法证明业务相关性，扣除被质疑。',
      sampleMaterial: 'CRM拜访记录或拜访日志',
    },
    {
      name: '付款记录',
      required: true,
      proofPurpose: '证明款项实际支付且与发票对方一致（三流一致）。',
      missingImpact: '三流不一致被怀疑虚开，不得抵扣和扣除。',
      sampleMaterial: '银行回单或报销单',
    },
  ],
  住宿: [
    {
      name: '发票',
      required: true,
      proofPurpose: '证明住宿支出实际发生。',
      missingImpact: '无发票不得入账。',
      sampleMaterial: '增值税普通发票或专用发票',
    },
    {
      name: '出差申请',
      required: true,
      proofPurpose: '证明住宿事前经审批且与生产经营相关。',
      missingImpact: '无出差申请被认定虚列差旅，不得扣除。',
      sampleMaterial: 'OA出差申请单',
    },
    {
      name: '行程记录',
      required: true,
      proofPurpose: '交叉验证住宿日期、地点与出差事由。',
      missingImpact: '无法证明行程真实性，反舞弊失效。',
      sampleMaterial: '机票/火车票/会议通知',
    },
    {
      name: '付款记录',
      required: true,
      proofPurpose: '证明款项实际支付且与发票对方一致。',
      missingImpact: '三流不一致被怀疑虚开。',
      sampleMaterial: '银行回单或报销单',
    },
    {
      name: '项目任务单',
      required: false,
      proofPurpose: '证明住宿费用归集到正确项目。',
      missingImpact: '费用归集错误，影响项目成本核算。',
      sampleMaterial: '项目任务单',
    },
  ],
  咨询服务: [
    {
      name: '发票',
      required: true,
      proofPurpose: '证明咨询服务支出实际发生。',
      missingImpact: '无发票不得入账。',
      sampleMaterial: '增值税专用发票（咨询费一般开专票）',
    },
    {
      name: '咨询合同',
      required: true,
      proofPurpose: '证明咨询服务有合同基础，金额、范围、期限明确。',
      missingImpact: '无合同不得入账，无法证明服务真实性。',
      sampleMaterial: '咨询服务合同',
    },
    {
      name: '成果物',
      required: true,
      proofPurpose: '证明咨询服务实际交付，可验证。',
      missingImpact: '无成果被认定虚假交易或预付费用。',
      sampleMaterial: '报告/模型/培训记录/交付清单',
    },
    {
      name: '验收单',
      required: true,
      proofPurpose: '证明服务已实际验收合格。',
      missingImpact: '服务未完成不得当期确认费用。',
      sampleMaterial: '验收单/确认书',
    },
    {
      name: '付款记录',
      required: true,
      proofPurpose: '证明款项实际支付且与合同、发票一致（三流一致）。',
      missingImpact: '三流不一致被怀疑虚开，进项税不得抵扣。',
      sampleMaterial: '银行回单',
    },
  ],
  交通: [
    {
      name: '发票',
      required: true,
      proofPurpose: '证明交通支出实际发生。',
      missingImpact: '无发票不得入账。',
      sampleMaterial: '机票/火车票/出租车发票',
    },
    {
      name: '出差申请',
      required: true,
      proofPurpose: '证明交通与出差事由相关。',
      missingImpact: '被认定个人出行不得扣除。',
      sampleMaterial: 'OA出差申请单',
    },
    {
      name: '行程记录',
      required: true,
      proofPurpose: '交叉验证交通日期、起讫地点与出差一致。',
      missingImpact: '无法证明行程真实性。',
      sampleMaterial: '行程单/会议通知',
    },
  ],
  车辆: [
    {
      name: '发票',
      required: true,
      proofPurpose: '证明车辆支出实际发生。',
      missingImpact: '无发票不得入账。',
      sampleMaterial: '加油发票/维修发票/过路费发票',
    },
    {
      name: '车辆使用记录',
      required: true,
      proofPurpose: '证明车辆用于公务而非私用。',
      missingImpact: '私用部分不得扣除，且需补缴个税。',
      sampleMaterial: '车辆使用日志/GPS记录',
    },
    {
      name: '审批',
      required: false,
      proofPurpose: '证明车辆费用经审批。',
      missingImpact: '内控失效，影响凭证合规性。',
      sampleMaterial: '审批单',
    },
  ],
  办公: [
    {
      name: '发票',
      required: true,
      proofPurpose: '证明办公支出实际发生。',
      missingImpact: '无发票不得入账。',
      sampleMaterial: '增值税普通发票或专用发票',
    },
    {
      name: '采购审批',
      required: true,
      proofPurpose: '证明采购经事前审批。',
      missingImpact: '内控失效。',
      sampleMaterial: '采购审批单',
    },
    {
      name: '入库或领用记录',
      required: true,
      proofPurpose: '证明办公用品实际入库或领用到部门。',
      missingImpact: '无法证明实物归属，被怀疑虚列。',
      sampleMaterial: '入库单/领用单',
    },
  ],
  广告推广: [
    {
      name: '发票',
      required: true,
      proofPurpose: '证明广告支出实际发生。',
      missingImpact: '无发票不得入账。',
      sampleMaterial: '增值税专用发票',
    },
    {
      name: '广告合同',
      required: true,
      proofPurpose: '证明广告投放有合同基础，金额、渠道、期限明确。',
      missingImpact: '无合同不得入账，且广告费扣除需合同支持。',
      sampleMaterial: '广告发布合同',
    },
    {
      name: '投放效果报告',
      required: true,
      proofPurpose: '证明广告实际投放且效果可验证。',
      missingImpact: '无效果报告不得税前扣除。',
      sampleMaterial: '媒体投放效果报告/截图/链接',
    },
    {
      name: '付款记录',
      required: true,
      proofPurpose: '证明款项实际支付且与合同、发票一致。',
      missingImpact: '三流不一致被怀疑虚开。',
      sampleMaterial: '银行回单',
    },
  ],
  租赁物业: [
    {
      name: '发票',
      required: true,
      proofPurpose: '证明租赁支出实际发生。',
      missingImpact: '无发票不得入账。',
      sampleMaterial: '增值税专用发票',
    },
    {
      name: '租赁合同',
      required: true,
      proofPurpose: '证明租赁关系存在，租期、租金、租赁物明确。',
      missingImpact: '无合同不得入账。',
      sampleMaterial: '租赁合同',
    },
    {
      name: '付款记录',
      required: true,
      proofPurpose: '证明款项实际支付且与合同、发票一致。',
      missingImpact: '三流不一致被怀疑虚开。',
      sampleMaterial: '银行回单',
    },
  ],
};

export function mockRequiredEvidence(category: InvoiceCategory): string[] {
  return requiredEvidenceMap[category] ?? ['发票'];
}

// Gate 3：返回结构化证据指导清单
export function mockRequiredEvidenceGuidance(category: InvoiceCategory): EvidenceGuidance[] {
  return evidenceGuidanceMap[category] ?? [
    {
      name: '发票',
      required: true,
      proofPurpose: '证明支出实际发生。',
      missingImpact: '无发票不得入账。',
      sampleMaterial: '发票原件',
    },
  ];
}

// Gate 3：扩展匹配结果 - 区分已匹配/未上传/上传但不足以证明/疑似冲突
export interface EvidenceMatchResult {
  matchedEvidence: string[];        // 已匹配且足以证明
  missingEvidence: string[];        // 未上传
  insufficientEvidence: string[];   // 上传但不足以证明（如缺盖章、缺签字等）
  conflictingEvidence: string[];    // 疑似冲突
  completenessScore: number;
  status: EvidenceChain['status'];
  // Gate 3：可执行补证建议（不再只输出"待补充"）
  remediationAdvice: EvidenceRemediationAdvice[];
}

export interface EvidenceRemediationAdvice {
  evidenceName: string;
  proofPurpose: string;
  missingImpact: string;
  sampleMaterial: string;
  action: string; // 具体行动建议
}

// 模拟"上传但不足以证明"的检测
// 规则：若仅上传了"发票"而其他关键证据缺失，则发票本身"不足以证明"业务真实性
// 若上传了"审批"但无客户拜访记录，则审批"不足以证明"业务相关性
function detectInsufficientEvidence(
  category: InvoiceCategory,
  uploaded: string[],
  missing: string[],
): string[] {
  const insufficient: string[] = [];
  // 通用规则：仅有发票无其他佐证 -> 发票本身不足以证明业务
  if (uploaded.length === 1 && uploaded.includes('发票') && missing.length > 0) {
    insufficient.push('发票');
  }
  // 餐饮：有审批无拜访记录 -> 审批不足以证明对象和事由
  if (category === '餐饮' && uploaded.includes('业务招待审批') && !uploaded.includes('客户拜访记录')) {
    insufficient.push('业务招待审批');
  }
  // 咨询服务：有合同无成果物 -> 合同不足以证明服务实际发生
  if (category === '咨询服务' && uploaded.includes('咨询合同') && !uploaded.includes('成果物')) {
    insufficient.push('咨询合同');
  }
  // 广告推广：有合同无效果报告 -> 合同不足以证明广告实际投放
  if (category === '广告推广' && uploaded.includes('广告合同') && !uploaded.includes('投放效果报告')) {
    insufficient.push('广告合同');
  }
  return insufficient;
}

// Gate 3：生成可执行补证建议
function buildRemediationAdvice(
  category: InvoiceCategory,
  missing: string[],
  insufficient: string[],
): EvidenceRemediationAdvice[] {
  const guidance = mockRequiredEvidenceGuidance(category);
  const advice: EvidenceRemediationAdvice[] = [];
  const targetNames = Array.from(new Set([...missing, ...insufficient]));
  for (const name of targetNames) {
    const g = guidance.find((item) => item.name === name);
    if (!g) continue;
    advice.push({
      evidenceName: g.name,
      proofPurpose: g.proofPurpose,
      missingImpact: g.missingImpact,
      sampleMaterial: g.sampleMaterial,
      action: insufficient.includes(name)
        ? `已上传但不足以证明：${g.proofPurpose}。建议补充配套材料（示例：${g.sampleMaterial}）。`
        : `未上传：${g.proofPurpose}。请上传（示例：${g.sampleMaterial}），否则${g.missingImpact}`,
    });
  }
  return advice;
}

// 比对已补充证据与必要证据，输出缺口和完整度（向后兼容）
export function mockMatchEvidence(
  category: InvoiceCategory,
  uploadedEvidence: string[],
): Pick<EvidenceChain, 'missingEvidence' | 'completenessScore' | 'status'> {
  const required = mockRequiredEvidence(category);
  const missing = required.filter((item) => !uploadedEvidence.includes(item));
  const matched = required.filter((item) => uploadedEvidence.includes(item));
  const completenessScore = Math.round((matched.length / required.length) * 100);
  const status: EvidenceChain['status'] =
    missing.length === 0 ? '完整' : uploadedEvidence.length === 0 ? '缺失' : '缺失';
  return { missingEvidence: missing, completenessScore, status };
}

// Gate 3：扩展匹配（含 insufficient / remediationAdvice）
export function mockMatchEvidenceDetailed(
  category: InvoiceCategory,
  uploadedEvidence: string[],
  conflictingEvidence: string[] = [],
): EvidenceMatchResult {
  const required = mockRequiredEvidence(category);
  const matched = required.filter((item) => uploadedEvidence.includes(item));
  const missing = required.filter((item) => !uploadedEvidence.includes(item));
  const insufficient = detectInsufficientEvidence(category, uploadedEvidence, missing);
  const completenessScore = Math.round((matched.length / required.length) * 100);
  const status: EvidenceChain['status'] =
    conflictingEvidence.length > 0
      ? '冲突'
      : missing.length === 0 && insufficient.length === 0
        ? '完整'
        : '缺失';
  const remediationAdvice = buildRemediationAdvice(category, missing, insufficient);
  return {
    matchedEvidence: matched,
    missingEvidence: missing,
    insufficientEvidence: insufficient,
    conflictingEvidence,
    completenessScore,
    status,
    remediationAdvice,
  };
}
