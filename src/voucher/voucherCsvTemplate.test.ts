import { describe, expect, it } from 'vitest';
import type { DecisionDraft, Invoice } from '../domain/types';
import {
  buildVoucherCsv,
  buildVoucherCsvFilename,
  buildVoucherCsvRows,
  checkDebitCreditBalance,
  evaluateVoucherExportBlock,
  VOUCHER_CSV_HEADERS,
  type VoucherCsvRow,
} from './voucherCsvTemplate';

function buildInvoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
    id: 'INV-V-CSV-001',
    invoiceType: '增值税普通发票',
    invoiceCode: '044002600111',
    invoiceNumber: '10012001',
    issueDate: '2026-07-12',
    seller: '杭州湖滨餐饮管理有限公司',
    buyer: '浙江示例科技有限公司',
    itemName: '餐饮服务',
    amount: 1860,
    taxAmount: 55.8,
    taxRate: '3%',
    verificationStatus: '验真通过',
    duplicateStatus: '未重复',
    redLetterStatus: '正常',
    recognitionConfidence: 0.94,
    category: '餐饮',
    anomalies: [],
    sourceFile: '/attachments/invoice-example.pdf',
    status: '凭证草稿已生成',
    ...overrides,
  };
}

function buildDecision(overrides: Partial<DecisionDraft> = {}): DecisionDraft {
  return {
    version: 'gate-t5-test',
    gates: [],
    accountingConclusion: '建议计入业务招待费。',
    vatConclusion: '普通发票不得抵扣进项税。',
    citConclusion: '按业务招待费税前扣除限额复核。',
    otherRiskNotes: [],
    evidenceConclusion: '证据链完整。',
    riskLevel: '低',
    confidence: 0.9,
    remediation: [],
    approvalRequirement: '无需追加审批。',
    voucherDraft: { status: '可生成草稿', summary: '凭证草稿建议。' },
    humanReviewRecords: [],
    finalStatus: '凭证草稿已生成',
    postingAdvice: {
      primaryAccount: '管理费用',
      secondaryAccount: '业务招待费',
      detailAccount: '客户招待餐费',
      reason: '业务招待',
      conditions: '发生额60%与营业收入5‰孰低',
      manualReviewRequired: false,
    },
    ...overrides,
  };
}

// 解析 CSV 文本为行数组（按 \n 分割，处理转义双引号）
function parseCsvLines(csv: string): string[] {
  return csv.split('\n');
}

// 从 CSV 行中提取借方金额合计
function sumColumn(csv: string, header: '借方金额' | '贷方金额'): number {
  const lines = parseCsvLines(csv);
  const headerLine = lines[0];
  const headers = headerLine.split(',');
  const idx = headers.indexOf(header);
  if (idx === -1) throw new Error(`header ${header} not found`);
  let total = 0;
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    const fields = parseCsvLine(line);
    const value = fields[idx];
    if (value && value.trim() !== '') {
      total += Number(value);
    }
  }
  return Math.round(total * 100) / 100;
}

// 简单 CSV 行解析（处理双引号转义）
function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let i = 0;
  let current = '';
  let inQuotes = false;
  while (i < line.length) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i += 2;
        } else {
          inQuotes = false;
          i++;
        }
      } else {
        current += ch;
        i++;
      }
    } else {
      if (ch === ',') {
        fields.push(current);
        current = '';
        i++;
      } else if (ch === '"') {
        inQuotes = true;
        i++;
      } else {
        current += ch;
        i++;
      }
    }
  }
  fields.push(current);
  return fields;
}

describe('标准凭证 CSV 模板：表头', () => {
  it('表头与 CO_20260718 模板字段一致', () => {
    expect(VOUCHER_CSV_HEADERS).toEqual([
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
    ]);
  });
});

describe('标准凭证 CSV 模板：餐饮普通发票', () => {
  it('CSV 借贷金额平衡（借方合计 = 贷方合计）', () => {
    const invoice = buildInvoice(); // 普票，金额 1860，税额 55.8
    const decision = buildDecision();
    const result = buildVoucherCsv(invoice, decision);
    expect(result.blocked).toBe(false);
    expect(result.rowCount).toBe(2);

    const debit = sumColumn(result.csv, '借方金额');
    const credit = sumColumn(result.csv, '贷方金额');
    // 普票：借费用 = 价税合计 = 1915.8，贷方 = 1915.8
    expect(debit).toBe(1915.8);
    expect(credit).toBe(1915.8);
    expect(debit).toBe(credit);
  });

  it('包含发票号、销方、购方等票面关联字段', () => {
    const invoice = buildInvoice();
    const decision = buildDecision();
    const result = buildVoucherCsv(invoice, decision);
    expect(result.csv).toContain('10012001');
    expect(result.csv).toContain('杭州湖滨餐饮管理有限公司');
    expect(result.csv).toContain('浙江示例科技有限公司');
    expect(result.csv).toContain('CNY');
    expect(result.csv).toContain('餐饮');
  });

  it('使用 postingAdvice 拼接科目名称', () => {
    const invoice = buildInvoice();
    const decision = buildDecision();
    const result = buildVoucherCsv(invoice, decision);
    expect(result.csv).toContain('管理费用-业务招待费-客户招待餐费');
  });
});

describe('标准凭证 CSV 模板：住宿专票', () => {
  it('专票：借费用 + 借进项税 = 贷方金额，借贷平衡', () => {
    const invoice = buildInvoice({
      invoiceType: '增值税专用发票',
      invoiceCode: '033002600221',
      invoiceNumber: '20022002',
      issueDate: '2026-07-10',
      seller: '南京江北商务酒店有限公司',
      itemName: '住宿服务',
      amount: 980,
      taxAmount: 58.8,
      taxRate: '6%',
      category: '住宿',
    });
    const decision = buildDecision({
      accountingConclusion: '建议计入差旅费-住宿费。',
      postingAdvice: {
        primaryAccount: '管理费用',
        secondaryAccount: '差旅费',
        detailAccount: '住宿费',
        reason: '出差住宿',
        conditions: '出差申请一致',
        manualReviewRequired: false,
      },
    });
    const result = buildVoucherCsv(invoice, decision);
    expect(result.blocked).toBe(false);
    expect(result.rowCount).toBe(3); // 专票：借费用 + 借进项税 + 贷方

    const debit = sumColumn(result.csv, '借方金额');
    const credit = sumColumn(result.csv, '贷方金额');
    // 借费用 980 + 借进项税 58.8 = 1038.8；贷方 1038.8
    expect(debit).toBe(1038.8);
    expect(credit).toBe(1038.8);
    expect(debit).toBe(credit);

    // 包含进项税科目
    expect(result.csv).toContain('应交税费-应交增值税-进项税额');
    expect(result.csv).toContain('银行存款');
  });

  it('专票 CSV 行结构：借方两行（费用 + 进项税），贷方一行（价税合计）', () => {
    const invoice = buildInvoice({
      invoiceType: '增值税专用发票',
      amount: 10000,
      taxAmount: 600,
      category: '咨询服务',
      itemName: '咨询服务费',
    });
    const decision = buildDecision({
      postingAdvice: {
        primaryAccount: '管理费用',
        secondaryAccount: '咨询服务费',
        detailAccount: '管理咨询',
        reason: '咨询服务',
        conditions: '有合同和验收单',
        manualReviewRequired: false,
      },
    });
    const rows = buildVoucherCsvRows(invoice, decision);
    expect(rows.length).toBe(3);
    const debitRows = rows.filter((r) => r.借方金额 > 0);
    const creditRows = rows.filter((r) => r.贷方金额 > 0);
    expect(debitRows.length).toBe(2);
    expect(creditRows.length).toBe(1);

    const balance = checkDebitCreditBalance(rows);
    expect(balance.balanced).toBe(true);
    expect(balance.debitTotal).toBe(10600);
    expect(balance.creditTotal).toBe(10600);
  });
});

describe('标准凭证 CSV 模板：阻断导出', () => {
  it('凭证状态为「禁止生成」时，不输出可导入凭证行', () => {
    const invoice = buildInvoice();
    const decision = buildDecision({
      voucherDraft: { status: '禁止生成', summary: '高风险阻断。' },
      riskLevel: '高',
      finalStatus: '暂不能判断',
    });
    const result = buildVoucherCsv(invoice, decision);
    expect(result.blocked).toBe(true);
    expect(result.rowCount).toBe(0);
    // CSV 仅含表头 + 阻断说明行
    const lines = parseCsvLines(result.csv);
    expect(lines.length).toBe(2); // 表头 + 一行说明
    expect(lines[1]).toContain('阻断');
    expect(lines[1]).toContain('禁止生成');
  });

  it('验真失败时阻断导出', () => {
    const invoice = buildInvoice({
      verificationStatus: '验真失败',
    });
    const decision = buildDecision();
    const block = evaluateVoucherExportBlock(invoice, decision);
    expect(block.blocked).toBe(true);
    expect(block.reason).toContain('验真失败');
  });

  it('疑似重复时阻断导出', () => {
    const invoice = buildInvoice({
      duplicateStatus: '疑似重复',
    });
    const decision = buildDecision();
    const block = evaluateVoucherExportBlock(invoice, decision);
    expect(block.blocked).toBe(true);
    expect(block.reason).toContain('重复');
  });

  it('红冲发票阻断导出', () => {
    const invoice = buildInvoice({
      redLetterStatus: '已红冲',
    });
    const decision = buildDecision();
    const block = evaluateVoucherExportBlock(invoice, decision);
    expect(block.blocked).toBe(true);
    expect(block.reason).toContain('红冲');
  });

  it('作废发票阻断导出', () => {
    const invoice = buildInvoice({
      redLetterStatus: '已作废',
    });
    const decision = buildDecision();
    const block = evaluateVoucherExportBlock(invoice, decision);
    expect(block.blocked).toBe(true);
    expect(block.reason).toContain('作废');
  });

  it('高风险阻断导出', () => {
    const invoice = buildInvoice();
    const decision = buildDecision({
      riskLevel: '高',
      voucherDraft: { status: '禁止生成', summary: '高风险' },
    });
    const block = evaluateVoucherExportBlock(invoice, decision);
    expect(block.blocked).toBe(true);
    expect(block.reason).toContain('高');
  });

  it('阻断 CSV 不得包含可导入凭证行（不含应交税费-进项税）', () => {
    const invoice = buildInvoice();
    const decision = buildDecision({
      voucherDraft: { status: '禁止生成', summary: '阻断' },
      riskLevel: '高',
    });
    const result = buildVoucherCsv(invoice, decision);
    expect(result.csv).not.toContain('应交税费-应交增值税-进项税额');
    // 不应包含非零借贷金额
    const debit = sumColumn(result.csv, '借方金额');
    const credit = sumColumn(result.csv, '贷方金额');
    expect(debit).toBe(0);
    expect(credit).toBe(0);
  });
});

describe('标准凭证 CSV 模板：中风险待财务确认', () => {
  it('中风险事项仍可导出，但审核状态标注为「待财务确认」', () => {
    const invoice = buildInvoice();
    const decision = buildDecision({
      riskLevel: '中',
      voucherDraft: { status: '待人工确认', summary: '需财务确认' },
    });
    const result = buildVoucherCsv(invoice, decision);
    expect(result.blocked).toBe(false);
    expect(result.csv).toContain('待财务确认');
  });
});

describe('标准凭证 CSV 模板：CSV 转义', () => {
  it('含逗号的字段会被双引号包裹', () => {
    const invoice = buildInvoice({
      seller: '杭州,湖滨,餐饮',
    });
    const decision = buildDecision();
    const result = buildVoucherCsv(invoice, decision);
    expect(result.csv).toContain('"杭州,湖滨,餐饮"');
  });

  it('含双引号的字段会被转义', () => {
    const invoice = buildInvoice({
      itemName: '餐饮"贵宾"服务',
    });
    const decision = buildDecision();
    const result = buildVoucherCsv(invoice, decision);
    // itemName 进入摘要：餐饮-餐饮"贵宾"服务-10012001
    // 转义后应为：餐饮-餐饮""贵宾""服务-10012001（被双引号包裹）
    expect(result.csv).toContain('餐饮""贵宾""服务');
  });
});

describe('标准凭证 CSV 模板：文件名生成', () => {
  it('阻断案例文件名包含 blocked', () => {
    const invoice = buildInvoice();
    const decision = buildDecision({
      voucherDraft: { status: '禁止生成', summary: '阻断' },
      riskLevel: '高',
    });
    const filename = buildVoucherCsvFilename(invoice, decision);
    expect(filename).toContain('blocked');
    expect(filename).toContain('10012001');
    expect(filename.endsWith('.csv')).toBe(true);
  });

  it('正常草稿文件名包含 draft', () => {
    const invoice = buildInvoice();
    const decision = buildDecision();
    const filename = buildVoucherCsvFilename(invoice, decision);
    expect(filename).toContain('draft');
    expect(filename.endsWith('.csv')).toBe(true);
  });
});

describe('标准凭证 CSV 模板：借贷平衡校验工具', () => {
  it('checkDebitCreditBalance 检测不平衡', () => {
    const rows: VoucherCsvRow[] = [
      {
        凭证日期: '2026-07-18',
        凭证字: '记',
        凭证号: '',
        摘要: '测试',
        科目编码: '6602',
        科目名称: '管理费用',
        借方金额: 100,
        贷方金额: 0,
        币种: 'CNY',
        发票号码: '',
        发票代码: '',
        开票日期: '',
        销方名称: '',
        购方名称: '',
        业务类型: '',
        风险等级: '低',
        审核状态: '已确认',
        附件路径: '',
        外部系统编号: '',
        备注: '',
      },
      {
        凭证日期: '2026-07-18',
        凭证字: '记',
        凭证号: '',
        摘要: '测试',
        科目编码: '1002',
        科目名称: '银行存款',
        借方金额: 0,
        贷方金额: 99,
        币种: 'CNY',
        发票号码: '',
        发票代码: '',
        开票日期: '',
        销方名称: '',
        购方名称: '',
        业务类型: '',
        风险等级: '低',
        审核状态: '已确认',
        附件路径: '',
        外部系统编号: '',
        备注: '',
      },
    ];
    const balance = checkDebitCreditBalance(rows);
    expect(balance.balanced).toBe(false);
    expect(balance.debitTotal).toBe(100);
    expect(balance.creditTotal).toBe(99);
  });
});
