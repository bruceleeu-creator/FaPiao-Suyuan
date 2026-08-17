import { describe, expect, it } from 'vitest';
import { demoCases } from '../data/demoCases';
import type { Invoice, WorkflowSession } from '../domain/types';
import {
  buildExceptionRows,
  buildExceptionTypeStats,
  buildResolvedExceptionRows,
  DEFAULT_EXCEPTION_FILTER,
  filterExceptionRows,
  parseCaseTimestamp,
  parseResolvedTypes,
  sortExceptionRows,
} from './exceptionBoard';

function buildInvoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
    id: 'INV-EX-001',
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

// 高异常本地 case：验真失败 + 低置信度 + 证据缺失 + 高风险
function buildHighExceptionCase(): WorkflowSession {
  const invoice = buildInvoice({
    verificationStatus: '验真失败',
    recognitionConfidence: 0.55,
    amount: 5200,
  });
  return {
    caseId: 'CASE-1752900000000-ABC123',
    currentStep: '人工复核',
    completedSteps: ['发票输入', '票面确认', '业务追问', '证据补充', 'AI风险初判'],
    invoice,
    businessEvent: {
      id: 'BE-EX-001',
      invoiceId: invoice.id,
      scenario: '客户业务招待',
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
      confidence: 0.82,
      requiredQuestionsAnswered: true,
    },
    evidenceChain: {
      id: 'EC-EX-001',
      invoiceId: invoice.id,
      businessEventId: 'BE-EX-001',
      requiredEvidence: ['发票', '业务招待审批', '客户拜访记录', '付款记录'],
      uploadedEvidence: ['发票'],
      matchedEvidence: [],
      missingEvidence: ['业务招待审批', '客户拜访记录', '付款记录'],
      conflictingEvidence: [],
      completenessScore: 25,
      status: '缺失',
    },
    aiInterventions: [],
    actionLogs: [],
    decisionDraft: {
      version: 'v1',
      gates: [
        { name: '发票闸门', status: '阻断', reason: '验真失败。' },
        { name: '业务闸门', status: '通过', reason: '业务问答已完成。' },
        { name: '证据闸门', status: '阻断', reason: '关键证据缺失。' },
        { name: '风险闸门', status: '阻断', reason: '高风险。' },
      ],
      accountingConclusion: '暂不能判断',
      vatConclusion: '禁止税务处理',
      citConclusion: '禁止税前扣除',
      otherRiskNotes: ['验真失败风险'],
      evidenceConclusion: '证据缺失',
      riskLevel: '高',
      confidence: 0.35,
      remediation: ['重新上传清晰票据'],
      approvalRequirement: '财务负责人复核',
      voucherDraft: { status: '禁止生成', summary: '阻断：不得生成凭证草稿。' },
      humanReviewRecords: [],
      finalStatus: '暂不能判断',
      businessQACompleted: true,
    },
    finalStatus: '暂不能判断',
  };
}

// 低异常本地 case：仅证据缺失
function buildLowExceptionCase(): WorkflowSession {
  const invoice = buildInvoice({ amount: 800, invoiceNumber: '10012002' });
  return {
    ...buildHighExceptionCase(),
    caseId: 'CASE-1752900001000-DEF456',
    invoice,
    decisionDraft: {
      ...buildHighExceptionCase().decisionDraft!,
      riskLevel: '中低',
      finalStatus: '待补充证据',
      gates: [
        { name: '发票闸门', status: '通过', reason: '票面正常。' },
        { name: '业务闸门', status: '通过', reason: '业务问答已完成。' },
        { name: '证据闸门', status: '待补充', reason: '付款记录缺失。' },
        { name: '风险闸门', status: '通过', reason: '风险可控。' },
      ],
    },
    finalStatus: '待补充证据',
  };
}

// 已解除异常 case：当前无异常但留有解除日志
function buildResolvedCase(): WorkflowSession {
  const base = buildLowExceptionCase();
  const invoice = buildInvoice({ amount: 800, invoiceNumber: '10012003' });
  return {
    ...base,
    caseId: 'CASE-1752900002000-GHI789',
    invoice,
    evidenceChain: {
      ...base.evidenceChain,
      uploadedEvidence: ['发票', '业务招待审批', '客户拜访记录', '付款记录'],
      matchedEvidence: ['发票', '业务招待审批', '客户拜访记录', '付款记录'],
      missingEvidence: [],
      completenessScore: 100,
      status: '完整',
    },
    actionLogs: [
      {
        id: 'LOG-1',
        operator: '当前用户',
        action: '异常已解除',
        fromStep: '证据补充',
        toStep: '证据补充',
        timestamp: '2026-07-18T10:00:00.000Z',
        note: '已解除异常：证据缺失。',
      },
    ],
    finalStatus: '待风险判断',
  };
}

describe('buildExceptionRows', () => {
  it('合并本地与演示异常行，只保留存在异常的 case', () => {
    const rows = buildExceptionRows(
      [buildHighExceptionCase(), buildResolvedCase()],
      demoCases,
    );
    // 本地：高异常 case 入选；已解除 case 当前无异常不入选
    expect(rows.filter((r) => r.source === 'local').map((r) => r.caseId)).toEqual([
      'CASE-1752900000000-ABC123',
    ]);
    // 演示：至少包含 blocked 演示案例
    const demoRow = rows.find((r) => r.caseId === 'case-blocked-001');
    expect(demoRow).toBeDefined();
    expect(demoRow!.exceptions.length).toBeGreaterThan(0);
    expect(demoRow!.workflowPath).toBeUndefined();
  });

  it('本地行字段映射正确：路径、风险、时间戳解析', () => {
    const rows = buildExceptionRows([buildHighExceptionCase()], []);
    const row = rows[0];
    expect(row.detailPath).toBe('/invoices/CASE-1752900000000-ABC123');
    expect(row.workflowPath).toBe('/invoices/CASE-1752900000000-ABC123/workflow');
    expect(row.riskLevel).toBe('高');
    expect(row.occurredAtMs).toBe(1752900000000);
    expect(row.exceptions).toContain('验真失败');
    expect(row.exceptions).toContain('低置信度');
    expect(row.exceptions).toContain('证据缺失');
    expect(row.exceptions).toContain('高风险');
    expect(row.exceptions).toContain('暂不能判断');
  });

  it('演示行异常复用 detectCaseExceptions 口径', () => {
    const rows = buildExceptionRows([], demoCases);
    const blocked = rows.find((r) => r.caseId === 'case-blocked-001');
    // blocked 演示案例：高风险 + 暂不能判断 + 证据缺失（口径来自 demo 数据本身）
    expect(blocked?.exceptions).toContain('高风险');
    expect(blocked?.occurredAtMs).toBeGreaterThan(0);
  });
});

describe('buildExceptionTypeStats', () => {
  it('按 8 类固定顺序输出统计，计数为 0 的类型也保留', () => {
    const rows = buildExceptionRows([buildHighExceptionCase()], []);
    const stats = buildExceptionTypeStats(rows);
    expect(stats.length).toBe(8);
    expect(stats.find((s) => s.type === '验真失败')?.count).toBe(1);
    expect(stats.find((s) => s.type === '验真失败')?.totalAmount).toBe(5200);
    expect(stats.find((s) => s.type === '疑似重复')?.count).toBe(0);
  });
});

describe('filterExceptionRows', () => {
  const rows = buildExceptionRows(
    [buildHighExceptionCase(), buildLowExceptionCase()],
    demoCases,
  );

  it('默认筛选返回全部', () => {
    expect(filterExceptionRows(rows, DEFAULT_EXCEPTION_FILTER).length).toBe(rows.length);
  });

  it('按异常类型筛选（任一命中即可）', () => {
    const filtered = filterExceptionRows(rows, { ...DEFAULT_EXCEPTION_FILTER, types: ['验真失败'] });
    expect(filtered.every((r) => r.exceptions.includes('验真失败'))).toBe(true);
    expect(filtered.length).toBeGreaterThan(0);
  });

  it('按来源筛选', () => {
    const localOnly = filterExceptionRows(rows, { ...DEFAULT_EXCEPTION_FILTER, source: 'local' });
    expect(localOnly.every((r) => r.source === 'local')).toBe(true);
    expect(localOnly.length).toBe(2);
    const demoOnly = filterExceptionRows(rows, { ...DEFAULT_EXCEPTION_FILTER, source: 'demo' });
    expect(demoOnly.every((r) => r.source === 'demo')).toBe(true);
  });

  it('按风险等级筛选', () => {
    const filtered = filterExceptionRows(rows, { ...DEFAULT_EXCEPTION_FILTER, riskLevel: '高' });
    expect(filtered.every((r) => r.riskLevel === '高')).toBe(true);
    expect(filtered.length).toBeGreaterThan(0);
  });
});

describe('sortExceptionRows', () => {
  it('优先级排序：高异常 case 排在低异常之前', () => {
    const rows = buildExceptionRows([buildLowExceptionCase(), buildHighExceptionCase()], []);
    const sorted = sortExceptionRows(rows, 'priority');
    expect(sorted[0].caseId).toBe('CASE-1752900000000-ABC123');
  });

  it('金额排序与时间排序', () => {
    const rows = buildExceptionRows([buildLowExceptionCase(), buildHighExceptionCase()], []);
    expect(sortExceptionRows(rows, 'amount')[0].amount).toBe(5200);
    expect(sortExceptionRows(rows, 'time')[0].caseId).toBe('CASE-1752900001000-DEF456');
  });
});

describe('buildResolvedExceptionRows', () => {
  it('只返回当前无异常且有解除日志的 case，解析原异常类型', () => {
    const rows = buildResolvedExceptionRows([
      buildHighExceptionCase(),
      buildLowExceptionCase(),
      buildResolvedCase(),
    ]);
    expect(rows.length).toBe(1);
    expect(rows[0].caseId).toBe('CASE-1752900002000-GHI789');
    expect(rows[0].resolvedTypes).toEqual(['证据缺失']);
    expect(rows[0].currentStatus).toBe('待风险判断');
    expect(rows[0].workflowPath).toContain('/workflow');
  });
});

describe('parseCaseTimestamp / parseResolvedTypes', () => {
  it('解析 caseId 时间戳，非法 caseId 返回 0', () => {
    expect(parseCaseTimestamp('CASE-1752900000000-ABC123')).toBe(1752900000000);
    expect(parseCaseTimestamp('case-local-001')).toBe(0);
  });

  it('解析解除日志 note 中的异常类型', () => {
    expect(parseResolvedTypes('已解除异常：证据缺失、业务事实不足。')).toEqual([
      '证据缺失',
      '业务事实不足',
    ]);
    expect(parseResolvedTypes('其他日志')).toEqual([]);
  });
});
