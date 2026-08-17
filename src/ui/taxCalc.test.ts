import { describe, expect, it } from 'vitest';
import { computeTaxAmount, parseTaxRate, splitInclusiveTotal, SUPPORTED_TAX_RATES } from './taxCalc';

describe('税率解析', () => {
  it('parseTaxRate 解析 3% 为 0.03', () => {
    expect(parseTaxRate('3%')).toBe(0.03);
  });

  it('parseTaxRate 解析 0% 为 0', () => {
    expect(parseTaxRate('0%')).toBe(0);
  });

  it('parseTaxRate 解析 13% 为 0.13', () => {
    expect(parseTaxRate('13%')).toBe(0.13);
  });

  it('parseTaxRate 解析 6% 为 0.06', () => {
    expect(parseTaxRate('6%')).toBe(0.06);
  });

  it('parseTaxRate 无法解析返回 0', () => {
    expect(parseTaxRate('abc')).toBe(0);
    expect(parseTaxRate('')).toBe(0);
    expect(parseTaxRate('3')).toBe(0);
  });
});

// 价税合计拆分公式测试（P1 验收硬约束）
// 依据：TR_TRAE_TAX_AMOUNT_FORMULA_FIX_TASK.md 第 "P1：公式修正" 节
describe('价税合计拆分公式 splitInclusiveTotal', () => {
  it('980 / 6% -> 不含税 924.53，税额 55.47（住宿样例）', () => {
    const result = splitInclusiveTotal(980, '6%');
    expect(result.amount).toBe(924.53);
    expect(result.taxAmount).toBe(55.47);
    // 反向校验：不含税 + 税额 = 价税合计
    expect(result.amount + result.taxAmount).toBe(980);
  });

  it('1860 / 3% -> 不含税 1805.83，税额 54.17（餐饮样例）', () => {
    const result = splitInclusiveTotal(1860, '3%');
    expect(result.amount).toBe(1805.83);
    expect(result.taxAmount).toBe(54.17);
    expect(result.amount + result.taxAmount).toBe(1860);
  });

  it('48000 / 6% -> 不含税 45283.02，税额 2716.98（咨询服务样例）', () => {
    const result = splitInclusiveTotal(48000, '6%');
    expect(result.amount).toBe(45283.02);
    expect(result.taxAmount).toBe(2716.98);
    expect(result.amount + result.taxAmount).toBe(48000);
  });

  it('1000 / 13% -> 不含税 884.96，税额 115.04', () => {
    const result = splitInclusiveTotal(1000, '13%');
    expect(result.amount).toBe(884.96);
    expect(result.taxAmount).toBe(115.04);
    expect(result.amount + result.taxAmount).toBe(1000);
  });

  it('任意金额 / 0% -> 不含税=原金额，税额=0', () => {
    expect(splitInclusiveTotal(1860, '0%')).toEqual({ amount: 1860, taxAmount: 0 });
    expect(splitInclusiveTotal(980, '0%')).toEqual({ amount: 980, taxAmount: 0 });
    expect(splitInclusiveTotal(50000, '0%')).toEqual({ amount: 50000, taxAmount: 0 });
  });

  it('保留 2 位小数（四舍五入）', () => {
    // 999.99 / 1.03 = 970.8640... -> 970.86
    const r1 = splitInclusiveTotal(999.99, '3%');
    expect(r1.amount).toBe(970.86);
    expect(r1.amount + r1.taxAmount).toBe(999.99);
  });

  it('价税合计为 0 时返回 0/0', () => {
    expect(splitInclusiveTotal(0, '3%')).toEqual({ amount: 0, taxAmount: 0 });
  });

  it('价税合计为负数时返回 0/0（金额必须为正）', () => {
    expect(splitInclusiveTotal(-100, '3%')).toEqual({ amount: 0, taxAmount: 0 });
  });

  it('税率无法解析时：不含税=原金额，税额=0', () => {
    expect(splitInclusiveTotal(1000, 'abc')).toEqual({ amount: 1000, taxAmount: 0 });
    expect(splitInclusiveTotal(1000, '')).toEqual({ amount: 1000, taxAmount: 0 });
  });

  it('借贷平衡硬约束：不含税金额 + 税额 = 价税合计（无一分误差）', () => {
    // 多组样例验证：拆分后两者之和必须严格等于价税合计
    const samples = [
      { total: 980, rate: '6%' },
      { total: 1860, rate: '3%' },
      { total: 48000, rate: '6%' },
      { total: 1000, rate: '13%' },
      { total: 999.99, rate: '3%' },
      { total: 12345.67, rate: '9%' },
      { total: 100, rate: '1%' },
    ];
    for (const s of samples) {
      const r = splitInclusiveTotal(s.total, s.rate);
      expect(r.amount + r.taxAmount).toBe(s.total);
    }
  });

  it('真实联动场景：价税合计不变，切换税率', () => {
    // 用户输入价税合计 1860，切换不同税率
    const total = 1860;
    // 3%
    expect(splitInclusiveTotal(total, '3%')).toEqual({ amount: 1805.83, taxAmount: 54.17 });
    // 6%
    expect(splitInclusiveTotal(total, '6%')).toEqual({ amount: 1754.72, taxAmount: 105.28 });
    // 0%
    expect(splitInclusiveTotal(total, '0%')).toEqual({ amount: 1860, taxAmount: 0 });
  });

  it('真实联动场景：税率不变，价税合计变化', () => {
    const rate = '6%';
    expect(splitInclusiveTotal(980, rate)).toEqual({ amount: 924.53, taxAmount: 55.47 });
    expect(splitInclusiveTotal(48000, rate)).toEqual({ amount: 45283.02, taxAmount: 2716.98 });
  });

  it('SUPPORTED_TAX_RATES 包含 0% 选项', () => {
    expect(SUPPORTED_TAX_RATES).toContain('0%');
    expect(SUPPORTED_TAX_RATES).toContain('1%');
    expect(SUPPORTED_TAX_RATES).toContain('3%');
    expect(SUPPORTED_TAX_RATES).toContain('6%');
    expect(SUPPORTED_TAX_RATES).toContain('9%');
    expect(SUPPORTED_TAX_RATES).toContain('13%');
  });

  it('小规模纳税人 0% 免征场景：月均 10 万以内开票额', () => {
    // 小规模纳税人月均 10 万以内可免征增值税，税率为 0%
    const result = splitInclusiveTotal(80000, '0%');
    expect(result.amount).toBe(80000);
    expect(result.taxAmount).toBe(0);
  });
});

// 旧版 computeTaxAmount（已废弃，保留向后兼容）
// 新代码应使用 splitInclusiveTotal
describe('旧版 computeTaxAmount（向后兼容）', () => {
  it('税率 0% 时税额为 0', () => {
    expect(computeTaxAmount(1000, '0%')).toBe(0);
    expect(computeTaxAmount(1860, '0%')).toBe(0);
  });

  it('金额 × 税率，保留 2 位小数', () => {
    expect(computeTaxAmount(1000, '3%')).toBe(30);
    expect(computeTaxAmount(1860, '3%')).toBe(55.8);
  });

  it('金额为 0 或负数时税额为 0', () => {
    expect(computeTaxAmount(0, '3%')).toBe(0);
    expect(computeTaxAmount(-100, '3%')).toBe(0);
  });

  it('税率无法解析时税额为 0', () => {
    expect(computeTaxAmount(1000, 'abc')).toBe(0);
    expect(computeTaxAmount(1000, '')).toBe(0);
  });
});
