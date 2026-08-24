import { describe, expect, it } from 'vitest';
import { classifyCategoryByRules } from './categoryRules';

describe('classifyCategoryByRules 本地规则兜底分类', () => {
  it('项目名称命中餐饮关键词', () => {
    expect(classifyCategoryByRules('餐饮服务', '杭州湖滨餐饮管理有限公司')).toBe('餐饮');
  });

  it('销方名称命中住宿关键词', () => {
    expect(classifyCategoryByRules('住宿费', '南京江北商务酒店有限公司')).toBe('住宿');
  });

  it('电信流量类项目命中办公关键词（对应数电票电信发票场景）', () => {
    expect(classifyCategoryByRules('*基础电信服务*流量服务', '中国电信')).toBe('办公');
  });

  it('咨询服务费命中咨询服务', () => {
    expect(classifyCategoryByRules('咨询服务费', '上海明策咨询有限公司')).toBe('咨询服务');
  });

  it('无命中时返回 null，不强行判断', () => {
    expect(classifyCategoryByRules('其他服务', '某某公司')).toBeNull();
  });

  it('空输入返回 null', () => {
    expect(classifyCategoryByRules('', '')).toBeNull();
  });
});
