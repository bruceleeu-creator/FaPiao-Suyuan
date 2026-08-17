// 发票类别本地规则分类器（兜底）
//
// 边界（依据 AGENTS.md）：
// - AI（DeepSeek）负责语义理解和类别判断；本模块是 AI 不可用时的确定性规则兜底
// - 规则只做关键词匹配，资料不足时返回 null，不强行形成结论
import type { InvoiceCategory } from '../domain/types';

export const INVOICE_CATEGORY_KEYWORDS: Record<InvoiceCategory, string[]> = {
  餐饮: ['餐饮', '餐费', '餐厅', '饭店', '饮食', '食品', '外卖', '宴会', '火锅', '小吃'],
  住宿: ['住宿', '酒店', '宾馆', '旅馆', '客房', '房费', '度假村'],
  交通: ['客运', '铁路', '高铁', '动车', '机票', '航空', '出租', '网约车', '滴滴', '公交', '地铁', '轮船', '船票', '运输服务'],
  车辆: ['加油', '汽油', '柴油', '石油', '停车', '过路', '高速公路', '车辆维修', '汽车维修', '保养', '洗车', '充电桩', '汽车配件'],
  办公: ['办公', '文具', '纸张', '打印', '复印', '耗材', '书报', '电信', '通信', '流量', '宽带', '话费', '快递', '邮政', '软件', '电脑', '打印机'],
  咨询服务: ['咨询', '顾问', '审计', '评估', '法律', '代理记账', '技术服务费', '信息技术服务'],
  广告推广: ['广告', '推广', '宣传', '传媒', '营销', '会展', '展览', '媒体'],
  租赁物业: ['租赁', '房租', '物业', '水费', '电费', '水电', '取暖', '保洁', '绿化', '维修服务'],
};

// 根据项目名称 + 销方名称做关键词匹配，命中多类时返回命中词最多的类别
// 无命中返回 null（调用方保持当前类别，不强行判断）
export function classifyCategoryByRules(
  itemName: string,
  seller: string,
): InvoiceCategory | null {
  const text = `${itemName || ''} ${seller || ''}`;
  if (!text.trim()) return null;

  const categoryEntries = (Object.keys(INVOICE_CATEGORY_KEYWORDS) as InvoiceCategory[])
    .map((category) => {
      const hits = INVOICE_CATEGORY_KEYWORDS[category].filter((kw) => text.includes(kw));
      return { category, hits: hits.length };
    })
    .filter((entry) => entry.hits > 0)
    .sort((a, b) => b.hits - a.hits);

  if (categoryEntries.length === 0) return null;
  // 并列命中多类时规则无法裁决，交还给人工/AI
  if (categoryEntries.length > 1 && categoryEntries[0].hits === categoryEntries[1].hits) {
    return null;
  }
  return categoryEntries[0].category;
}
