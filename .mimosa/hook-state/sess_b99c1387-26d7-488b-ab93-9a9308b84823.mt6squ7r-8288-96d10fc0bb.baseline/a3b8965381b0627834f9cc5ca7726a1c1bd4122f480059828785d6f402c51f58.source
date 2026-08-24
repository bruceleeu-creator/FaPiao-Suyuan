// 税额自动计算 helper
//
// 口径（2026-07-18 修正，依据 TR_TRAE_TAX_AMOUNT_FORMULA_FIX_TASK.md）：
//   不含税金额 = 价税合计 ÷ (1 + 税率)
//   税额 = 价税合计 - 不含税金额
// 保留 2 位小数。
//
// 官方依据：
//   - 国家税务总局：销售额 = 含税销售额 ÷（1 + 税率或征收率）；税额 = 含税总收入 - 销售额
//   - 上海税务问答：采用销售额和销项税额合并定价时，销售额 = 含税销售额 ÷（1 + 税率）
//
// 支持的税率字符串：'0%', '1%', '3%', '6%', '9%', '13%'

const TAX_RATE_PATTERN = /^(\d+(\.\d+)?)%$/;

// 解析税率字符串为小数（如 '3%' -> 0.03），无法解析时返回 0
export function parseTaxRate(rate: string): number {
  const match = TAX_RATE_PATTERN.exec(rate.trim());
  if (!match) return 0;
  return Number(match[1]) / 100;
}

// 保留 2 位小数（四舍五入）
function round2(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100) / 100;
}

// 价税合计拆分：基于含税总额和税率，计算不含税金额和税额
// - 税率为 0% 时：不含税金额 = 价税合计，税额 = 0
// - 价税合计为 0 或负数时返回 0/0（金额必须为正）
// - 税率无法解析时：不含税金额 = 价税合计，税额 = 0
//
// 验收样例：
//   980 / 6% -> { amount: 924.53, taxAmount: 55.47 }
//   1860 / 3% -> { amount: 1805.83, taxAmount: 54.17 }
//   48000 / 6% -> { amount: 45283.02, taxAmount: 2716.98 }
//   1000 / 13% -> { amount: 884.96, taxAmount: 115.04 }
//   任意 / 0% -> { amount: 原金额, taxAmount: 0 }
export function splitInclusiveTotal(
  inclusiveTotal: number,
  taxRate: string,
): { amount: number; taxAmount: number } {
  if (!Number.isFinite(inclusiveTotal) || inclusiveTotal <= 0) {
    return { amount: 0, taxAmount: 0 };
  }
  const rate = parseTaxRate(taxRate);
  if (rate <= 0) {
    // 0% 免征：不含税金额 = 价税合计，税额 = 0
    return { amount: round2(inclusiveTotal), taxAmount: 0 };
  }
  // 不含税金额 = 价税合计 ÷ (1 + 税率)
  const amount = round2(inclusiveTotal / (1 + rate));
  // 税额 = 价税合计 - 不含税金额
  // 用价税合计减去已四舍五入的不含税金额，保证 amount + taxAmount = 价税合计（无一分误差）
  const taxAmount = round2(inclusiveTotal - amount);
  return { amount, taxAmount };
}

// [已废弃] 旧版税额计算：金额 × 税率
// 保留是为了向后兼容（其他模块可能仍在使用），但录入页应改用 splitInclusiveTotal
// 新代码不应再调用此函数
export function computeTaxAmount(amount: number, taxRate: string): number {
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  const rate = parseTaxRate(taxRate);
  if (rate <= 0) return 0;
  return round2(amount * rate);
}

// 一期支持的税率选项
export const SUPPORTED_TAX_RATES = ['0%', '1%', '3%', '6%', '9%', '13%'] as const;
