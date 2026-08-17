// 规则阈值仓库：集中管理规则引擎的可配置阈值
// 持久化：localStorage key = invoice_evidence_rule_thresholds
// 读取方：mockRiskAdvisor（闸门与风险等级判定）、caseStore（异常检测）
// 设计约束：localStore 在非浏览器环境（vitest node env）回落默认值，保证纯函数测试不依赖存储

import { readJSON, writeJSON, removeKey, STORAGE_KEYS } from '../storage/localStore';

// 阈值键定义：key 即 RiskThresholds 字段名
export type ThresholdKey = keyof RiskThresholds;

export interface RiskThresholds {
  // 业务置信度阻断线：低于该值业务闸门阻断，风险等级判高（原硬编码 0.5）
  businessConfidenceBlockLine: number;
  // 业务置信度告警线：低于该值风险等级判高、提示复核（原硬编码 0.7）
  businessConfidenceWarnLine: number;
  // 业务置信度审批线：低于该值风险等级至少中低（原硬编码 0.85）
  businessConfidenceApprovalLine: number;
  // OCR 置信度告警线：低于该值风险闸门阻断（原硬编码 0.6）
  ocrConfidenceWarnLine: number;
  // 大额支出线：金额达到该值风险等级至少中（原硬编码 30000 元）
  largeAmountLine: number;
  // 审批金额线：金额达到该值风险等级至少中低（原硬编码 5000 元）
  approvalAmountLine: number;
}

// 阈值元数据：供阈值管理页和驾驶舱概览展示口径说明
export interface ThresholdMeta {
  key: ThresholdKey;
  label: string;
  description: string;
  unit: '比例' | '元';
  min: number;
  max: number;
  step: number;
}

export const THRESHOLD_META: ThresholdMeta[] = [
  {
    key: 'businessConfidenceBlockLine',
    label: '业务置信度阻断线',
    description: '业务事件置信度低于该值时，业务闸门阻断、风险等级判高，必须补齐业务事实后放行。',
    unit: '比例',
    min: 0,
    max: 1,
    step: 0.05,
  },
  {
    key: 'businessConfidenceWarnLine',
    label: '业务置信度告警线',
    description: '业务事件置信度低于该值（但高于阻断线）时，风险等级判高，异常队列标记「业务事实不足」。',
    unit: '比例',
    min: 0,
    max: 1,
    step: 0.05,
  },
  {
    key: 'businessConfidenceApprovalLine',
    label: '业务置信度审批线',
    description: '业务事件置信度低于该值（但高于告警线）时，风险等级至少中低，进入审批关注范围。',
    unit: '比例',
    min: 0,
    max: 1,
    step: 0.05,
  },
  {
    key: 'ocrConfidenceWarnLine',
    label: 'OCR 置信度告警线',
    description: '票面识别置信度低于该值时，风险闸门阻断，异常队列标记「低置信度」。',
    unit: '比例',
    min: 0,
    max: 1,
    step: 0.05,
  },
  {
    key: 'largeAmountLine',
    label: '大额支出线',
    description: '发票金额达到该值时，风险等级至少为中，提示关注成果物和审批链。',
    unit: '元',
    min: 0,
    max: 10000000,
    step: 1000,
  },
  {
    key: 'approvalAmountLine',
    label: '审批金额线',
    description: '发票金额达到该值时，风险等级至少为中低，需要审批要求兜底。',
    unit: '元',
    min: 0,
    max: 10000000,
    step: 500,
  },
];

// 默认阈值：与原硬编码值保持一致，保证未配置时行为不变
export const DEFAULT_THRESHOLDS: RiskThresholds = {
  businessConfidenceBlockLine: 0.5,
  businessConfidenceWarnLine: 0.7,
  businessConfidenceApprovalLine: 0.85,
  ocrConfidenceWarnLine: 0.6,
  largeAmountLine: 30000,
  approvalAmountLine: 5000,
};

// 发布订阅：阈值调整后通知页面（风险驾驶舱概览、异常工作台统计）刷新
type Listener = () => void;
const listeners = new Set<Listener>();

export function subscribeThresholdChanges(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function notifyThresholdChanges() {
  listeners.forEach((l) => l());
}

// 读取阈值：以默认值为底合并已存储字段，坏数据回落默认值
export function getThresholds(): RiskThresholds {
  const stored = readJSON<Partial<RiskThresholds>>(STORAGE_KEYS.ruleThresholds, {});
  const merged: RiskThresholds = { ...DEFAULT_THRESHOLDS };
  for (const meta of THRESHOLD_META) {
    const value = stored[meta.key];
    if (typeof value === 'number' && Number.isFinite(value) && value >= meta.min && value <= meta.max) {
      merged[meta.key] = value;
    }
  }
  // 业务置信度三条线保持 阻断 <= 告警 <= 审批 的层次约束，违反时回落默认
  if (
    merged.businessConfidenceBlockLine > merged.businessConfidenceWarnLine ||
    merged.businessConfidenceWarnLine > merged.businessConfidenceApprovalLine
  ) {
    return { ...DEFAULT_THRESHOLDS };
  }
  return merged;
}

// 校验并保存阈值：任一字段非法返回 null 且不写入；合法返回归一化后的值
export function saveThresholds(input: Partial<RiskThresholds>): RiskThresholds | null {
  const merged: RiskThresholds = { ...getThresholds(), ...input };
  for (const meta of THRESHOLD_META) {
    const value = merged[meta.key];
    if (typeof value !== 'number' || !Number.isFinite(value) || value < meta.min || value > meta.max) {
      return null;
    }
  }
  if (
    merged.businessConfidenceBlockLine > merged.businessConfidenceWarnLine ||
    merged.businessConfidenceWarnLine > merged.businessConfidenceApprovalLine
  ) {
    return null;
  }
  const ok = writeJSON(STORAGE_KEYS.ruleThresholds, merged);
  if (!ok) return null;
  notifyThresholdChanges();
  return merged;
}

// 恢复默认阈值
export function resetThresholds(): RiskThresholds {
  removeKey(STORAGE_KEYS.ruleThresholds);
  notifyThresholdChanges();
  return { ...DEFAULT_THRESHOLDS };
}

// 阈值是否仍为默认值（驾驶舱概览提示用）
export function isDefaultThresholds(): boolean {
  const current = getThresholds();
  return THRESHOLD_META.every((meta) => current[meta.key] === DEFAULT_THRESHOLDS[meta.key]);
}
