// 标准凭证 CSV 模板导出
// 基于 CO_20260718_标准凭证导入模板.csv 第一版字段
//
// 严格遵守：
//   1. 借贷金额必须平衡
//   2. 普通发票（不得抵扣进项税）：借费用 = 价税合计，贷方 = 价税合计
//   3. 专票（可抵扣进项税）：借费用 = 金额，借进项税 = 税额，贷方 = 价税合计
//   4. 高风险、验真失败、重复、红冲、作废、证据缺失事项不得导出可导入凭证行
//   5. 仅生成草稿，不代表正式过账
//
// 边界依据：CO_20260718_腾讯云OCR验真与标准凭证导入方案.md 第七节
//   - 低风险、验真通过、证据完整：可生成凭证导入模板
//   - 中风险：必须财务确认后才能导出模板（status='待人工确认'，仍可导出，但标注审核状态）
//   - 高风险、验真失败、重复发票、红冲、作废、证据缺失：禁止生成可导入凭证

import type { DecisionDraft, Invoice } from '../domain/types';

// CSV 表头字段（与 CO_20260718_标准凭证导入模板.csv 一致）
export const VOUCHER_CSV_HEADERS = [
  '凭证日期',
  '凭证字',
  '凭证号',
  '摘要',
  '科目编码',
  '科目名称',
  '借方金额',
  '贷方金额',
  '币种',
  '发票号码',
  '发票代码',
  '开票日期',
  '销方名称',
  '购方名称',
  '业务类型',
  '风险等级',
  '审核状态',
  '附件路径',
  '外部系统编号',
  '备注',
] as const;

export type VoucherCsvHeader = (typeof VOUCHER_CSV_HEADERS)[number];

// 单行凭证记录
export interface VoucherCsvRow {
  凭证日期: string;
  凭证字: string;
  凭证号: string;
  摘要: string;
  科目编码: string;
  科目名称: string;
  借方金额: number;
  贷方金额: number;
  币种: string;
  发票号码: string;
  发票代码: string;
  开票日期: string;
  销方名称: string;
  购方名称: string;
  业务类型: string;
  风险等级: string;
  审核状态: string;
  附件路径: string;
  外部系统编号: string;
  备注: string;
}

// 默认科目映射（第一版，按业务类型粗粒度匹配）
// 实际项目应通过 postingAdvice 注入；此处为兜底
const FALLBACK_ACCOUNT_MAP: Record<string, { code: string; name: string }> = {
  餐饮: { code: '6602.04', name: '管理费用-业务招待费' },
  住宿: { code: '6601.02', name: '销售费用-差旅费' },
  咨询服务: { code: '6602.02', name: '管理费用-咨询服务费' },
  广告推广: { code: '6601.05', name: '销售费用-广告宣传费' },
  办公: { code: '6602.06', name: '管理费用-办公费' },
  交通: { code: '6601.01', name: '销售费用-差旅费' },
  车辆: { code: '6602.07', name: '管理费用-车辆使用费' },
  租赁物业: { code: '6602.08', name: '管理费用-租赁费' },
};

// 进项税科目（专票抵扣用）
const INPUT_VAT_ACCOUNT = { code: '2221.01.01', name: '应交税费-应交增值税-进项税额' };
// 贷方科目（普票：其他应付款-员工报销；专票：银行存款）
const CREDIT_ACCOUNT_GENERAL = { code: '2241.01', name: '其他应付款-员工报销' };
const CREDIT_ACCOUNT_SPECIAL = { code: '1002', name: '银行存款' };

// 阻断导出的判定：基于 invoice + decisionDraft
// 任一命中即阻断：
//   - voucherDraft.status === '禁止生成'
//   - 验真失败、疑似重复、红冲、作废
//   - 高风险
//   - 证据缺失（missingEvidence.length > 0 或 status==='冲突'）
export interface VoucherBlockResult {
  blocked: boolean;
  reason: string;
}

export function evaluateVoucherExportBlock(
  invoice: Invoice,
  decision: DecisionDraft,
): VoucherBlockResult {
  if (decision.voucherDraft.status === '禁止生成') {
    return {
      blocked: true,
      reason: `凭证草稿状态为「禁止生成」：${decision.voucherDraft.summary}`,
    };
  }
  if (invoice.verificationStatus === '验真失败') {
    return { blocked: true, reason: '发票验真失败，禁止导出可导入凭证。' };
  }
  if (invoice.duplicateStatus === '疑似重复') {
    return { blocked: true, reason: '发票疑似重复，禁止导出可导入凭证。' };
  }
  if (invoice.redLetterStatus !== '正常') {
    return {
      blocked: true,
      reason: `发票状态为「${invoice.redLetterStatus}」，禁止导出可导入凭证。`,
    };
  }
  if (decision.riskLevel === '高') {
    return { blocked: true, reason: '风险等级为高，禁止导出可导入凭证。' };
  }
  // 证据缺失由 decision.voucherDraft.status='禁止生成' 兜底
  // 此处再补一道兜底：若 evidenceConclusion 包含「缺失」关键字
  if (decision.evidenceConclusion && decision.evidenceConclusion.includes('缺失')) {
    return { blocked: true, reason: '证据链缺失，禁止导出可导入凭证。' };
  }
  return { blocked: false, reason: '' };
}

// 解析科目：优先用 postingAdvice（一级/二级/三级），其次用兜底表
function resolveAccount(
  invoice: Invoice,
  decision: DecisionDraft,
): { code: string; name: string } {
  if (decision.postingAdvice) {
    const { primaryAccount, secondaryAccount, detailAccount } = decision.postingAdvice;
    const name = [primaryAccount, secondaryAccount, detailAccount]
      .filter(Boolean)
      .join('-');
    // 兜底表里若有同业务类型编码，沿用；否则用占位
    const fallback = FALLBACK_ACCOUNT_MAP[invoice.category];
    return { code: fallback?.code ?? '', name };
  }
  return FALLBACK_ACCOUNT_MAP[invoice.category] ?? { code: '', name: '待确认科目' };
}

// 审核状态映射：voucherDraft.status -> CSV 审核状态
function resolveAuditStatus(decision: DecisionDraft): string {
  if (decision.voucherDraft.status === '禁止生成') return '禁止生成';
  if (decision.voucherDraft.status === '待人工确认') return '待财务确认';
  if (decision.riskLevel === '中' || decision.riskLevel === '中低') return '待财务确认';
  return '已确认';
}

// 摘要生成：业务类型 + 项目名 + 发票号
function buildSummary(invoice: Invoice): string {
  const parts = [invoice.category, invoice.itemName, invoice.invoiceNumber]
    .filter(Boolean)
    .join('-');
  return parts || '标准凭证草稿';
}

// 生成凭证行（不含表头）
// 阻断时返回空数组；正常时返回借方行 + 贷方行
export function buildVoucherCsvRows(
  invoice: Invoice,
  decision: DecisionDraft,
  voucherDate: string = new Date().toISOString().slice(0, 10),
): VoucherCsvRow[] {
  const block = evaluateVoucherExportBlock(invoice, decision);
  if (block.blocked) {
    return [];
  }

  const isSpecialVat =
    invoice.invoiceType.includes('专票') || invoice.invoiceType.includes('专用发票');
  const account = resolveAccount(invoice, decision);
  const creditAccount = isSpecialVat ? CREDIT_ACCOUNT_SPECIAL : CREDIT_ACCOUNT_GENERAL;
  const auditStatus = resolveAuditStatus(decision);
  const summary = buildSummary(invoice);
  const attachment = invoice.sourceFile || '';
  const riskLevel = decision.riskLevel;
  const baseRow: Omit<VoucherCsvRow, '科目编码' | '科目名称' | '借方金额' | '贷方金额' | '备注'> = {
    凭证日期: voucherDate,
    凭证字: '记',
    凭证号: '',
    摘要: summary,
    币种: 'CNY',
    发票号码: invoice.invoiceNumber,
    发票代码: invoice.invoiceCode,
    开票日期: invoice.issueDate,
    销方名称: invoice.seller,
    购方名称: invoice.buyer,
    业务类型: invoice.category,
    风险等级: riskLevel,
    审核状态: auditStatus,
    附件路径: attachment,
    外部系统编号: '',
  };

  const rows: VoucherCsvRow[] = [];

  if (isSpecialVat) {
    // 专票：借费用 = 金额，借进项税 = 税额，贷方 = 价税合计
    rows.push({
      ...baseRow,
      科目编码: account.code,
      科目名称: account.name,
      借方金额: round2(invoice.amount),
      贷方金额: 0,
      备注: '专票不含税金额入费用',
    });
    rows.push({
      ...baseRow,
      科目编码: INPUT_VAT_ACCOUNT.code,
      科目名称: INPUT_VAT_ACCOUNT.name,
      借方金额: round2(invoice.taxAmount),
      贷方金额: 0,
      备注: '专票税额单独列示',
    });
    rows.push({
      ...baseRow,
      科目编码: creditAccount.code,
      科目名称: creditAccount.name,
      借方金额: 0,
      贷方金额: round2(invoice.amount + invoice.taxAmount),
      备注: '贷方金额等于价税合计',
    });
  } else {
    // 普通发票：不得抵扣进项税，费用借方 = 价税合计，贷方 = 价税合计
    const total = invoice.amount + invoice.taxAmount;
    rows.push({
      ...baseRow,
      科目编码: account.code,
      科目名称: account.name,
      借方金额: round2(total),
      贷方金额: 0,
      备注: '普通发票价税合计入费用',
    });
    rows.push({
      ...baseRow,
      科目编码: creditAccount.code,
      科目名称: creditAccount.name,
      借方金额: 0,
      贷方金额: round2(total),
      备注: '与借方金额保持平衡',
    });
  }

  return rows;
}

// 保留两位小数
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// 转义 CSV 字段：含逗号、引号、换行需用双引号包裹，内部双引号转义为两个双引号
function escapeCsvField(value: string | number): string {
  const str = String(value ?? '');
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

// 生成完整 CSV 文本（含表头）
// 阻断时返回阻断说明（仅一行备注，不含可导入凭证行）
export interface VoucherCsvResult {
  // 是否被阻断（true 时 csv 内容只是说明，不可导入）
  blocked: boolean;
  blockReason: string;
  // 完整 CSV 文本（含表头）
  csv: string;
  // 行数（不含表头）
  rowCount: number;
}

export function buildVoucherCsv(
  invoice: Invoice,
  decision: DecisionDraft,
  voucherDate: string = new Date().toISOString().slice(0, 10),
): VoucherCsvResult {
  const block = evaluateVoucherExportBlock(invoice, decision);
  if (block.blocked) {
    // 阻断：仅输出说明行，不含任何可导入凭证行
    const headerLine = VOUCHER_CSV_HEADERS.join(',');
    const noteLine = [
      voucherDate, // 凭证日期
      '', // 凭证字
      '', // 凭证号
      `【阻断】${invoice.invoiceNumber}`, // 摘要
      '', // 科目编码
      '阻断说明', // 科目名称
      '', // 借方金额
      '', // 贷方金额
      'CNY', // 币种
      invoice.invoiceNumber,
      invoice.invoiceCode,
      invoice.issueDate,
      invoice.seller,
      invoice.buyer,
      invoice.category,
      decision.riskLevel,
      '禁止生成',
      invoice.sourceFile || '',
      '',
      block.reason,
    ]
      .map(escapeCsvField)
      .join(',');
    return {
      blocked: true,
      blockReason: block.reason,
      csv: `${headerLine}\n${noteLine}`,
      rowCount: 0,
    };
  }

  const rows = buildVoucherCsvRows(invoice, decision, voucherDate);
  const headerLine = VOUCHER_CSV_HEADERS.join(',');
  const lines = rows.map((row) =>
    VOUCHER_CSV_HEADERS.map((h) => escapeCsvField(row[h])).join(','),
  );
  return {
    blocked: false,
    blockReason: '',
    csv: [headerLine, ...lines].join('\n'),
    rowCount: rows.length,
  };
}

// 借贷平衡校验：用于测试和运行时断言
export function checkDebitCreditBalance(rows: VoucherCsvRow[]): {
  balanced: boolean;
  debitTotal: number;
  creditTotal: number;
} {
  const debitTotal = round2(rows.reduce((sum, r) => sum + (r.借方金额 || 0), 0));
  const creditTotal = round2(rows.reduce((sum, r) => sum + (r.贷方金额 || 0), 0));
  return {
    balanced: debitTotal === creditTotal,
    debitTotal,
    creditTotal,
  };
}

// 生成文件名（用于下载）
export function buildVoucherCsvFilename(invoice: Invoice, decision: DecisionDraft): string {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const status = decision.voucherDraft.status === '禁止生成' ? 'blocked' : 'draft';
  return `voucher-${date}-${invoice.invoiceNumber}-${status}.csv`;
}
