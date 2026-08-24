import { describe, expect, it } from 'vitest';
import { demoCases } from '../data/demoCases';
import type { Invoice, WorkflowSession } from '../domain/types';
import {
  buildRiskDrilldownLink,
  buildRiskDrilldownRows,
  filterRiskDrilldownRows,
  getRiskDrilldownSummary,
} from './riskDrilldown';

// 维度与 KPI 下钻：本地 fixture 的 department/person 已知（销售部 / 销售部-张三）
describe('维度与比率指标下钻（新增入口）', () => {
  const local = buildHighRiskLocalCase(); // department: 销售部, handler: 销售部-张三
  const rows = buildRiskDrilldownRows([local], demoCases);

  it('行上填充维度归属标签', () => {
    const row = rows.find((r) => r.id === 'case-local-001')!;
    expect(row.department).toBe('销售部');
    expect(row.person).toBe('销售部-张三');
    expect(row.supplier).toBe('杭州示例餐饮有限公司');
  });

  it('维度下钻：部门 + 值筛选命中归属票据', () => {
    const matched = filterRiskDrilldownRows(rows, { dimension: 'department', dimensionValue: '销售部' });
    expect(matched.some((r) => r.id === 'case-local-001')).toBe(true);
    expect(matched.every((r) => r.department === '销售部')).toBe(true);
    const unmatched = filterRiskDrilldownRows(rows, { dimension: 'department', dimensionValue: '不存在部门' });
    expect(unmatched.length).toBe(0);
  });

  it('KPI 下钻：仅命中进入分母的本地票据', () => {
    // 本地 fixture 无 AI 介入记录 -> 未复核，不进 ai-adoption 分母
    const adoption = filterRiskDrilldownRows(rows, { kpi: 'ai-adoption' });
    expect(adoption.some((r) => r.id === 'case-local-001')).toBe(false);
    expect(adoption.every((r) => r.source === 'local')).toBe(true);
  });

  it('摘要条：维度/KPI 来源名称与返回链接', () => {
    const dimSummary = getRiskDrilldownSummary(rows, { dimension: 'person', dimensionValue: '销售部-张立' });
    expect(dimSummary.active).toBe(true);
    expect(dimSummary.sourceName).toBe('人员：销售部-张立');
    const kpiSummary = getRiskDrilldownSummary(rows, { kpi: 'voucher-pass' });
    expect(kpiSummary.sourceName).toBe('凭证确认通过率');
    // 修复后的返回链接指向真实路由 /risks
    expect(kpiSummary.backToDashboard).toBe('/risks');
  });

  it('下钻链接生成：维度与 KPI 入口', () => {
    expect(buildRiskDrilldownLink({ dimension: 'supplier', dimensionValue: 'A公司' })).toBe(
      '/invoices?dimension=supplier&value=A%E5%85%AC%E5%8F%B8',
    );
    expect(buildRiskDrilldownLink({ kpi: 'false-positive' })).toBe('/invoices?kpi=false-positive');
  });
});

// 构造一个本地 case：高风险 + 业务闸门阻断 + 业务问答未完成 + finalStatus = '暂不能判断'
function buildHighRiskLocalCase(): WorkflowSession {
  const invoice: Invoice = {
    id: 'INV-LOCAL-001',
    invoiceType: '增值税普通发票',
    invoiceCode: '044002600999',
    invoiceNumber: '99988001',
    issueDate: '2026-07-15',
    seller: '杭州示例餐饮有限公司',
    buyer: '浙江示例科技有限公司',
    itemName: '餐饮服务',
    amount: 5200,
    taxAmount: 156,
    taxRate: '3%',
    verificationStatus: '验真失败',
    duplicateStatus: '疑似重复',
    redLetterStatus: '正常',
    recognitionConfidence: 0.55,
    category: '餐饮',
    anomalies: ['验真失败', '疑似重复'],
    sourceFile: 'mock://ocr/local-001.pdf',
    status: '暂不能判断',
  };
  const session: WorkflowSession = {
    caseId: 'case-local-001',
    currentStep: '人工复核',
    completedSteps: ['发票输入', '票面确认', '业务追问', '证据补充', 'AI风险初判'],
    invoice,
    businessEvent: {
      id: 'BE-LOCAL-001',
      invoiceId: invoice.id,
      scenario: '客户业务招待（本地）',
      initiator: '销售部-张三',
      handler: '销售部-张三',
      claimant: '销售部-张三',
      participants: ['张三'],
      externalParty: '某客户',
      occurredAt: '2026-07-15',
      location: '杭州',
      purpose: '客户招待',
      businessContent: '招待客户用餐',
      department: '销售部',
      project: 'Q3客户维护',
      contract: '无',
      paymentSubject: '浙江示例科技有限公司',
      paymentMethod: '员工垫付',
      beneficiary: '销售部',
      companyBurdenReason: '客户维护',
      conflicts: [],
      confidence: 0.45,
      requiredQuestionsAnswered: true,
    },
    evidenceChain: {
      id: 'EC-LOCAL-001',
      invoiceId: invoice.id,
      businessEventId: 'BE-LOCAL-001',
      requiredEvidence: ['发票', '业务招待审批', '客户拜访记录'],
      uploadedEvidence: ['发票'],
      matchedEvidence: [],
      missingEvidence: ['业务招待审批', '客户拜访记录'],
      conflictingEvidence: [],
      completenessScore: 30,
      status: '缺失',
    },
    aiInterventions: [],
    actionLogs: [],
    decisionDraft: {
      version: 'v1',
      gates: [
        { name: '发票闸门', status: '阻断', reason: '验真失败且疑似重复。' },
        { name: '业务闸门', status: '通过', reason: '业务问答已完成。' },
        { name: '证据闸门', status: '阻断', reason: '关键证据缺失。' },
        { name: '风险闸门', status: '阻断', reason: '高风险。' },
      ],
      accountingConclusion: '暂不能判断',
      vatConclusion: '禁止税务处理',
      citConclusion: '禁止税前扣除',
      otherRiskNotes: ['重复报销风险'],
      evidenceConclusion: '证据缺失',
      riskLevel: '高',
      confidence: 0.35,
      remediation: ['重新上传清晰票据', '补充业务招待审批'],
      approvalRequirement: '财务负责人复核',
      voucherDraft: { status: '禁止生成', summary: '阻断：不得生成凭证草稿。' },
      humanReviewRecords: [],
      finalStatus: '暂不能判断',
      businessQACompleted: true,
    },
    finalStatus: '暂不能判断',
  };
  return session;
}

// 构造一个本地 case：低风险 + 全闸门通过 + finalStatus = '待生成凭证'
function buildLowRiskLocalCase(): WorkflowSession {
  const invoice: Invoice = {
    id: 'INV-LOCAL-002',
    invoiceType: '增值税普通发票',
    invoiceCode: '044002600888',
    invoiceNumber: '88877002',
    issueDate: '2026-07-16',
    seller: '杭州示例文具有限公司',
    buyer: '浙江示例科技有限公司',
    itemName: '办公用品',
    amount: 680,
    taxAmount: 19.32,
    taxRate: '3%',
    verificationStatus: '验真通过',
    duplicateStatus: '未重复',
    redLetterStatus: '正常',
    recognitionConfidence: 0.95,
    category: '办公',
    anomalies: [],
    sourceFile: 'mock://ocr/local-002.pdf',
    status: '待生成凭证',
  };
  const session: WorkflowSession = {
    caseId: 'case-local-002',
    currentStep: '生成建议',
    completedSteps: ['发票输入', '票面确认', '业务追问', '证据补充', 'AI风险初判', '人工复核'],
    invoice,
    businessEvent: {
      id: 'BE-LOCAL-002',
      invoiceId: invoice.id,
      scenario: '办公用品采购',
      initiator: '行政部-李四',
      handler: '行政部-李四',
      claimant: '行政部-李四',
      participants: ['李四'],
      externalParty: '杭州示例文具有限公司',
      occurredAt: '2026-07-16',
      location: '杭州',
      purpose: '日常办公',
      businessContent: '采购签字笔和文件夹',
      department: '行政部',
      project: '日常采购',
      contract: '无',
      paymentSubject: '浙江示例科技有限公司',
      paymentMethod: '对公转账',
      beneficiary: '行政部',
      companyBurdenReason: '日常办公需要',
      conflicts: [],
      confidence: 0.93,
      requiredQuestionsAnswered: true,
    },
    evidenceChain: {
      id: 'EC-LOCAL-002',
      invoiceId: invoice.id,
      businessEventId: 'BE-LOCAL-002',
      requiredEvidence: ['发票', '采购审批', '付款记录'],
      uploadedEvidence: ['发票', '采购审批', '付款记录'],
      matchedEvidence: ['采购审批', '付款记录'],
      missingEvidence: [],
      conflictingEvidence: [],
      completenessScore: 95,
      status: '完整',
    },
    aiInterventions: [],
    actionLogs: [],
    decisionDraft: {
      version: 'v1',
      gates: [
        { name: '发票闸门', status: '通过', reason: '票面完整，验真通过。' },
        { name: '业务闸门', status: '通过', reason: '业务问答完成。' },
        { name: '证据闸门', status: '通过', reason: '证据齐全。' },
        { name: '风险闸门', status: '通过', reason: '低风险。' },
      ],
      accountingConclusion: '计入管理费用-办公费',
      vatConclusion: '普通发票不抵扣',
      citConclusion: '可税前扣除',
      otherRiskNotes: [],
      evidenceConclusion: '证据完整',
      riskLevel: '低',
      confidence: 0.92,
      remediation: [],
      approvalRequirement: '无需追加审批',
      voucherDraft: { status: '可生成草稿', summary: '借：管理费用-办公费；贷：银行存款。' },
      humanReviewRecords: [],
      finalStatus: '待生成凭证',
      businessQACompleted: true,
    },
    finalStatus: '待生成凭证',
  };
  return session;
}

// 构造一个本地 case：未生成 decisionDraft（流程早期）
function buildEarlyStageLocalCase(): WorkflowSession {
  const invoice: Invoice = {
    id: 'INV-LOCAL-003',
    invoiceType: '增值税普通发票',
    invoiceCode: '044002600777',
    invoiceNumber: '77766003',
    issueDate: '2026-07-17',
    seller: '杭州示例酒店有限公司',
    buyer: '浙江示例科技有限公司',
    itemName: '住宿服务',
    amount: 1200,
    taxAmount: 72,
    taxRate: '6%',
    verificationStatus: '待验真',
    duplicateStatus: '未重复',
    redLetterStatus: '正常',
    recognitionConfidence: 0.9,
    category: '住宿',
    anomalies: [],
    sourceFile: 'mock://ocr/local-003.pdf',
    status: '待回答问题',
  };
  const session: WorkflowSession = {
    caseId: 'case-local-003',
    currentStep: '业务追问',
    completedSteps: ['发票输入', '票面确认'],
    invoice,
    businessEvent: {
      id: 'BE-LOCAL-003',
      invoiceId: invoice.id,
      scenario: '员工出差住宿（本地）',
      initiator: '实施部-王五',
      handler: '实施部-王五',
      claimant: '实施部-王五',
      participants: ['王五'],
      externalParty: '客户现场',
      occurredAt: '2026-07-17',
      location: '杭州',
      purpose: '客户支持',
      businessContent: '客户现场支持',
      department: '实施部',
      project: '客户项目',
      contract: '无',
      paymentSubject: '浙江示例科技有限公司',
      paymentMethod: '企业卡',
      beneficiary: '实施部',
      companyBurdenReason: '出差',
      conflicts: [],
      confidence: 0.5,
      requiredQuestionsAnswered: false,
      unansweredRequiredQuestions: ['出差事由', '住宿期间'],
    },
    evidenceChain: {
      id: 'EC-LOCAL-003',
      invoiceId: invoice.id,
      businessEventId: 'BE-LOCAL-003',
      requiredEvidence: [],
      uploadedEvidence: [],
      matchedEvidence: [],
      missingEvidence: [],
      conflictingEvidence: [],
      completenessScore: 0,
      status: '缺失',
    },
    aiInterventions: [],
    actionLogs: [],
    finalStatus: '待回答问题',
  };
  return session;
}

const localCases = [buildHighRiskLocalCase(), buildLowRiskLocalCase(), buildEarlyStageLocalCase()];

describe('buildRiskDrilldownRows - 统一行构造', () => {
  it('本地 case 和演示 case 都被映射成行，本地在前演示在后', () => {
    const rows = buildRiskDrilldownRows(localCases, demoCases);
    expect(rows.length).toBe(localCases.length + demoCases.length);
    // 前 3 行为本地
    expect(rows[0].source).toBe('local');
    expect(rows[1].source).toBe('local');
    expect(rows[2].source).toBe('local');
    // 之后为演示
    expect(rows[3].source).toBe('demo');
  });

  it('本地 case 行的 detailPath 和 workflowPath 都已生成', () => {
    const rows = buildRiskDrilldownRows(localCases, demoCases);
    const local = rows.find((r) => r.source === 'local' && r.id === 'case-local-001')!;
    expect(local.detailPath).toBe('/invoices/case-local-001');
    expect(local.workflowPath).toBe('/invoices/case-local-001/workflow');
  });

  it('演示 case 行的 workflowPath 为 undefined（不支持继续处理）', () => {
    const rows = buildRiskDrilldownRows(localCases, demoCases);
    const demo = rows.find((r) => r.source === 'demo' && r.id === 'case-catering-001')!;
    expect(demo.workflowPath).toBeUndefined();
    expect(demo.detailPath).toBe('/invoices/case-catering-001');
  });

  it('未生成 decisionDraft 的本地 case 行 riskLevel 为「待生成」、gates 为空数组', () => {
    const rows = buildRiskDrilldownRows(localCases, demoCases);
    const early = rows.find((r) => r.id === 'case-local-003')!;
    expect(early.riskLevel).toBe('待生成');
    expect(early.gates).toEqual([]);
    expect(early.remediation).toEqual([]);
  });
});

describe('filterRiskDrilldownRows - 7 个下钻入口筛选', () => {
  const rows = buildRiskDrilldownRows(localCases, demoCases);

  it('high-risk 筛选结果 riskLevel 全部为「高」，金额合计等于命中发票金额之和', () => {
    const filtered = filterRiskDrilldownRows(rows, { riskFilter: 'high-risk' });
    expect(filtered.length).toBeGreaterThan(0);
    filtered.forEach((r) => {
      expect(r.riskLevel).toBe('高');
    });
    const expectedSum = filtered.reduce((sum, r) => sum + r.amount, 0);
    // 重新计算一次确保一致
    const recheck = rows.filter((r) => r.riskLevel === '高').reduce((s, r) => s + r.amount, 0);
    expect(expectedSum).toBe(recheck);
  });

  it('remediation 筛选结果至少有任一闸门阻断或待补充，或存在整改建议', () => {
    const filtered = filterRiskDrilldownRows(rows, { riskFilter: 'remediation' });
    expect(filtered.length).toBeGreaterThan(0);
    filtered.forEach((r) => {
      const hasGateBlockedOrPending = r.gates.some((g) => g.status === '阻断' || g.status === '待补充');
      const hasRemediation = r.remediation.length > 0;
      expect(hasGateBlockedOrPending || hasRemediation).toBe(true);
    });
  });

  it('pending-judgment 筛选结果 finalStatus 全部为「暂不能判断」', () => {
    const filtered = filterRiskDrilldownRows(rows, { riskFilter: 'pending-judgment' });
    expect(filtered.length).toBeGreaterThan(0);
    filtered.forEach((r) => {
      expect(r.finalStatus).toBe('暂不能判断');
    });
  });

  it('四个闸门筛选只命中对应闸门阻断或待补充的发票', () => {
    const gates: Array<'发票闸门' | '业务闸门' | '证据闸门' | '风险闸门'> = [
      '发票闸门',
      '业务闸门',
      '证据闸门',
      '风险闸门',
    ];
    for (const gate of gates) {
      const filtered = filterRiskDrilldownRows(rows, { gate });
      filtered.forEach((r) => {
        const g = r.gates.find((x) => x.name === gate);
        expect(g).toBeDefined();
        expect(g!.status === '阻断' || g!.status === '待补充').toBe(true);
      });
      // 同时验证：未命中该闸门阻断/待补充的行不在结果中
      const notMatched = rows.filter((r) => {
        const g = r.gates.find((x) => x.name === gate);
        return !(g && (g.status === '阻断' || g.status === '待补充'));
      });
      notMatched.forEach((r) => {
        expect(filtered.find((f) => f.id === r.id)).toBeUndefined();
      });
    }
  });

  it('命中行必须包含 matchedReasons（至少 1 条）和 nextActionHint', () => {
    const queries = [
      { riskFilter: 'high-risk' as const },
      { riskFilter: 'remediation' as const },
      { riskFilter: 'pending-judgment' as const },
      { gate: '发票闸门' as const },
      { gate: '业务闸门' as const },
      { gate: '证据闸门' as const },
      { gate: '风险闸门' as const },
    ];
    for (const q of queries) {
      const filtered = filterRiskDrilldownRows(rows, q);
      expect(filtered.length).toBeGreaterThan(0);
      filtered.forEach((r) => {
        expect(r.matchedReasons.length).toBeGreaterThan(0);
        expect(r.nextActionHint.length).toBeGreaterThan(0);
      });
    }
  });

  it('闸门筛选对未生成 gates 的本地 case 不命中（流程早期发票不归入闸门阻断列表）', () => {
    const filtered = filterRiskDrilldownRows(rows, { gate: '发票闸门' });
    const early = filtered.find((r) => r.id === 'case-local-003');
    expect(early).toBeUndefined();
  });

  it('high-risk 筛选对未生成 decisionDraft 的本地 case 不命中', () => {
    const filtered = filterRiskDrilldownRows(rows, { riskFilter: 'high-risk' });
    const early = filtered.find((r) => r.id === 'case-local-003');
    expect(early).toBeUndefined();
  });
});

describe('getRiskDrilldownSummary - 下钻摘要', () => {
  const rows = buildRiskDrilldownRows(localCases, demoCases);

  it('无筛选时 active=false，sourceName 为「全部发票」', () => {
    const summary = getRiskDrilldownSummary(rows, {});
    expect(summary.active).toBe(false);
    expect(summary.sourceName).toBe('全部发票');
    expect(summary.matchedCount).toBe(0);
    expect(summary.totalAmount).toBe(0);
  });

  it('high-risk 筛选摘要的金额合计与下钻列表金额一致', () => {
    const filtered = filterRiskDrilldownRows(rows, { riskFilter: 'high-risk' });
    const summary = getRiskDrilldownSummary(rows, { riskFilter: 'high-risk' });
    expect(summary.active).toBe(true);
    expect(summary.sourceName).toBe('高风险金额');
    expect(summary.matchedCount).toBe(filtered.length);
    expect(summary.totalAmount).toBe(filtered.reduce((s, r) => s + r.amount, 0));
  });

  it('闸门筛选摘要 sourceName 等于闸门名称', () => {
    const summary = getRiskDrilldownSummary(rows, { gate: '证据闸门' });
    expect(summary.active).toBe(true);
    expect(summary.sourceName).toBe('证据闸门');
    expect(summary.description).toContain('证据闸门');
  });

  it('驾驶舱金额与下钻列表金额一致（7 个入口逐一验证）', () => {
    const queries = [
      { riskFilter: 'high-risk' as const },
      { riskFilter: 'remediation' as const },
      { riskFilter: 'pending-judgment' as const },
      { gate: '发票闸门' as const },
      { gate: '业务闸门' as const },
      { gate: '证据闸门' as const },
      { gate: '风险闸门' as const },
    ];
    for (const q of queries) {
      const filtered = filterRiskDrilldownRows(rows, q);
      const summary = getRiskDrilldownSummary(rows, q);
      expect(summary.totalAmount).toBe(filtered.reduce((s, r) => s + r.amount, 0));
      expect(summary.matchedCount).toBe(filtered.length);
    }
  });
});

describe('buildRiskDrilldownLink - 链接构造', () => {
  it('riskFilter 链接正确编码', () => {
    expect(buildRiskDrilldownLink({ riskFilter: 'high-risk' })).toBe('/invoices?riskFilter=high-risk');
    expect(buildRiskDrilldownLink({ riskFilter: 'remediation' })).toBe('/invoices?riskFilter=remediation');
    expect(buildRiskDrilldownLink({ riskFilter: 'pending-judgment' })).toBe('/invoices?riskFilter=pending-judgment');
  });

  it('gate 链接正确编码中文闸门名', () => {
    expect(buildRiskDrilldownLink({ gate: '发票闸门' })).toBe('/invoices?gate=' + encodeURIComponent('发票闸门'));
    expect(buildRiskDrilldownLink({ gate: '业务闸门' })).toBe('/invoices?gate=' + encodeURIComponent('业务闸门'));
    expect(buildRiskDrilldownLink({ gate: '证据闸门' })).toBe('/invoices?gate=' + encodeURIComponent('证据闸门'));
    expect(buildRiskDrilldownLink({ gate: '风险闸门' })).toBe('/invoices?gate=' + encodeURIComponent('风险闸门'));
  });

  it('无筛选时返回 /invoices', () => {
    expect(buildRiskDrilldownLink({})).toBe('/invoices');
  });
});
