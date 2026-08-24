// 腾讯云 OCR 回填映射测试
// 重点覆盖真实数电票场景：半角括号字段名、货币符号、明细行税率、金额缺失时默认值
import { describe, expect, it } from 'vitest';
import type { IntakeForm } from '../../domain/types';
import { mapTencentOcrToIntakeForm, buildSimulatedOcrData } from './InvoiceIntakePage';

const baseForm: IntakeForm = {
  source: '手工',
  invoiceType: '增值税普通发票',
  invoiceCode: '',
  invoiceNumber: '',
  issueDate: '2026-08-17',
  seller: '',
  buyer: '浙江示例科技有限公司',
  itemName: '',
  totalAmount: 0,
  amount: 0,
  taxAmount: 0,
  taxRate: '3%',
  category: '餐饮',
};

describe('mapTencentOcrToIntakeForm 金额与税率映射', () => {
  it('识别半角括号的"价税合计(小写)"并按税率自动拆分', () => {
    const data = {
      VatInvoiceInfos: [
        { Name: '购买方名称', Value: '杨福昆' },
        { Name: '价税合计(小写)', Value: '￥116.00' },
        { Name: '价税合计(大写)', Value: '壹佰壹拾陆元整' },
      ],
      Items: [{ Name: '*基础电信服务*流量服务', LineTaxRate: '0.03' }],
    };
    const { form, usedDefaultTotal } = mapTencentOcrToIntakeForm(data, baseForm);
    expect(usedDefaultTotal).toBe(false);
    expect(form.buyer).toBe('杨福昆');
    expect(form.itemName).toBe('*基础电信服务*流量服务');
    expect(form.taxRate).toBe('3%');
    expect(form.totalAmount).toBe(116);
    expect(form.amount).toBe(112.62);
    expect(form.taxAmount).toBe(3.38);
  });

  it('全角括号"价税合计（小写）"同样兼容，税率 6% 写法直接保留', () => {
    const data = {
      VatInvoiceInfos: [
        { Name: '价税合计（小写）', Value: '¥980.00' },
        { Name: '税率', Value: '6%' },
      ],
    };
    const { form } = mapTencentOcrToIntakeForm(data, baseForm);
    expect(form.totalAmount).toBe(980);
    expect(form.amount).toBe(924.53);
    expect(form.taxAmount).toBe(55.47);
  });

  it('仅有合计金额/合计税额时倒推价税合计', () => {
    const data = {
      VatInvoiceInfos: [
        { Name: '合计金额', Value: '1,805.83' },
        { Name: '合计税额', Value: '54.17' },
      ],
    };
    const { form, usedDefaultTotal } = mapTencentOcrToIntakeForm(data, baseForm);
    expect(usedDefaultTotal).toBe(false);
    expect(form.totalAmount).toBe(1860);
    expect(form.amount).toBe(1805.83);
    expect(form.taxAmount).toBe(54.17);
  });

  it('仅有不含税金额时按税率倒推税额与价税合计', () => {
    const data = {
      VatInvoiceInfos: [{ Name: '金额', Value: '1000.00' }],
    };
    const { form } = mapTencentOcrToIntakeForm(data, { ...baseForm, taxRate: '6%' });
    expect(form.taxAmount).toBe(60);
    expect(form.totalAmount).toBe(1060);
  });

  it('OCR 未识别到任何金额时填入默认价税合计并标记 usedDefaultTotal', () => {
    const data = {
      VatInvoiceInfos: [{ Name: '购买方名称', Value: '杨福昆' }],
      Items: [{ Name: '*基础电信服务*流量服务' }],
    };
    const { form, usedDefaultTotal } = mapTencentOcrToIntakeForm(data, baseForm);
    expect(usedDefaultTotal).toBe(true);
    expect(form.totalAmount).toBe(100);
    expect(form.amount).toBe(97.09);
    expect(form.taxAmount).toBe(2.91);
  });

  it('免税写法归一为 0%，此时税额为 0', () => {
    const data = {
      VatInvoiceInfos: [
        { Name: '价税合计', Value: '200' },
        { Name: '税率', Value: '免税' },
      ],
    };
    const { form } = mapTencentOcrToIntakeForm(data, baseForm);
    expect(form.taxRate).toBe('0%');
    expect(form.amount).toBe(200);
    expect(form.taxAmount).toBe(0);
  });
});

describe('buildSimulatedOcrData 后端不可达时的模拟降级数据', () => {
  it('已填表单构造的模拟数据可回填映射且字段一致（金额按税率拆分）', () => {
    const filled: IntakeForm = {
      ...baseForm,
      invoiceCode: '044002600111',
      invoiceNumber: '10012001',
      seller: '杭州湖滨餐饮管理有限公司',
      itemName: '餐饮服务',
      totalAmount: 116,
      taxRate: '6%',
    };
    const simulated = buildSimulatedOcrData(filled);
    const { form, usedDefaultTotal } = mapTencentOcrToIntakeForm(simulated, baseForm);
    expect(usedDefaultTotal).toBe(false);
    expect(form.invoiceCode).toBe('044002600111');
    expect(form.invoiceNumber).toBe('10012001');
    expect(form.seller).toBe('杭州湖滨餐饮管理有限公司');
    expect(form.itemName).toBe('餐饮服务');
    expect(form.totalAmount).toBe(116);
    expect(form.amount).toBe(109.43);
    expect(form.taxAmount).toBe(6.57);
  });

  it('空表单时模拟数据回填走默认价税合计兜底，购方信息保留', () => {
    const simulated = buildSimulatedOcrData(baseForm);
    const { form, usedDefaultTotal } = mapTencentOcrToIntakeForm(simulated, baseForm);
    expect(usedDefaultTotal).toBe(true);
    expect(form.totalAmount).toBe(100);
    expect(form.buyer).toBe('浙江示例科技有限公司');
    expect(form.invoiceType).toBe('增值税普通发票');
  });

  it('金额为 0 的字段不写入模拟数据，避免误填 0 值触发假拆分', () => {
    const simulated = buildSimulatedOcrData({
      ...baseForm,
      invoiceNumber: '10012001',
      invoiceCode: '044002600111',
      seller: '测试销方',
      itemName: '测试项目',
      totalAmount: 0,
      amount: 0,
      taxAmount: 0,
    }) as {
      VatInvoiceInfos?: Array<{ Name: string; Value: string }>;
    };
    const names = (simulated.VatInvoiceInfos ?? []).map((item) => item.Name);
    expect(names).not.toContain('价税合计(小写)');
    expect(names).not.toContain('金额');
    expect(names).not.toContain('税额');
    // 非金额字段照常写入
    expect(names).toContain('发票号码');
    expect(names).toContain('税率');
    expect(names).toContain('销售方名称');
  });
});
