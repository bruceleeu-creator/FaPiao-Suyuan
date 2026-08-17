import type { DecisionDraft, Invoice } from '../domain/types';

// 模拟凭证草稿服务：根据风险建议草稿生成凭证草稿文本
// 严格遵守：不自动过账，仅生成草稿；高风险/阻断案例不生成可用凭证
// Gate 3 升级：优先使用 postingAdvice（一级/二级/三级科目），向后兼容 accountingConclusion
// 借贷平衡规则：
//   - 普通发票（不得抵扣进项税）：借费用 = 价税合计，贷方 = 价税合计
//   - 专票（可抵扣进项税）：借费用 = 金额，借进项税 = 税额，贷方 = 价税合计
export function mockBuildVoucherDraft(invoice: Invoice, decision: DecisionDraft): string {
  if (decision.voucherDraft.status === '禁止生成') {
    return `【阻断】${invoice.invoiceNumber} 不得生成凭证草稿。原因：${decision.voucherDraft.summary}`;
  }

  // Gate 3：优先使用 postingAdvice 拼接科目路径
  // 格式：一级科目/二级科目/三级明细科目
  const buildAccountPath = (): string => {
    if (decision.postingAdvice) {
      const { primaryAccount, secondaryAccount, detailAccount } = decision.postingAdvice;
      return [primaryAccount, secondaryAccount, detailAccount]
        .filter(Boolean)
        .join('/');
    }
    // 向后兼容：从 accountingConclusion 提取
    return decision.accountingConclusion
      .replace(/^建议计入/, '')
      .replace(/[。.；;，,]+$/g, '')
      .trim();
  };

  const accountPath = buildAccountPath();
  const manualReviewNote = decision.postingAdvice?.manualReviewRequired
    ? '（注：需人工确认后正式生成）'
    : '';

  if (decision.voucherDraft.status === '待人工确认') {
    return `【待确认】${invoice.invoiceNumber} 凭证草稿建议：${decision.voucherDraft.summary}${manualReviewNote}`;
  }

  // 专票判断：兼容「增值税专用发票」「专票」等写法
  const isSpecialVat = invoice.invoiceType.includes('专票') || invoice.invoiceType.includes('专用发票');
  const amountText = `${invoice.amount.toLocaleString('zh-CN')} 元`;
  const taxText = `${invoice.taxAmount.toLocaleString('zh-CN')} 元`;
  const totalText = `${(invoice.amount + invoice.taxAmount).toLocaleString('zh-CN')} 元`;
  const creditAccount = isSpecialVat ? '银行存款' : '其他应付款-员工报销';

  const lines: string[] = [
    `【凭证草稿】${invoice.invoiceNumber}（草稿，不自动过账）`,
    `科目建议：${accountPath}`,
  ];

  if (isSpecialVat) {
    // 专票：借费用 amount，借进项税 taxAmount，贷方 amount + taxAmount
    lines.push(`借：${accountPath} ${amountText}`);
    lines.push(`借：应交税费-应交增值税-进项税额 ${taxText}`);
    lines.push(`贷：${creditAccount} ${totalText}`);
  } else {
    // 普通发票：不得抵扣进项税，费用借方 = 价税合计，贷方 = 价税合计
    lines.push(`借：${accountPath} ${totalText}`);
    lines.push(`贷：${creditAccount} ${totalText}`);
  }

  // Gate 3：附加适用条件（如有）
  if (decision.postingAdvice?.conditions) {
    lines.push(`适用条件：${decision.postingAdvice.conditions}`);
  }

  lines.push('注：本凭证为草稿，需财务复核确认后才可过账。');

  return lines.join('\n');
}
