import { describe, it, expect, beforeEach } from 'vitest';
import {
  DEFAULT_THRESHOLDS,
  getThresholds,
  isDefaultThresholds,
  resetThresholds,
  saveThresholds,
  subscribeThresholdChanges,
} from './thresholdStore';

// 内存 localStorage：thresholdStore 依赖 window.localStorage，测试注入替代
class MemoryStorage implements Storage {
  private map = new Map<string, string>();
  get length() {
    return this.map.size;
  }
  clear() {
    this.map.clear();
  }
  getItem(key: string) {
    return this.map.has(key) ? this.map.get(key)! : null;
  }
  key(index: number) {
    return [...this.map.keys()][index] ?? null;
  }
  removeItem(key: string) {
    this.map.delete(key);
  }
  setItem(key: string, value: string) {
    this.map.set(key, value);
  }
}

describe('thresholdStore', () => {
  beforeEach(() => {
    const storage = new MemoryStorage();
    (globalThis as Record<string, unknown>).window = { localStorage: storage };
    resetThresholds();
  });

  it('未配置时返回默认阈值', () => {
    expect(getThresholds()).toEqual(DEFAULT_THRESHOLDS);
    expect(isDefaultThresholds()).toBe(true);
  });

  it('保存合法阈值后读取生效', () => {
    const saved = saveThresholds({ largeAmountLine: 50000, ocrConfidenceWarnLine: 0.7 });
    expect(saved).not.toBeNull();
    const current = getThresholds();
    expect(current.largeAmountLine).toBe(50000);
    expect(current.ocrConfidenceWarnLine).toBe(0.7);
    expect(current.businessConfidenceBlockLine).toBe(DEFAULT_THRESHOLDS.businessConfidenceBlockLine);
    expect(isDefaultThresholds()).toBe(false);
  });

  it('非法值被拒绝且不写入', () => {
    expect(saveThresholds({ largeAmountLine: -1 })).toBeNull();
    expect(saveThresholds({ ocrConfidenceWarnLine: 1.5 })).toBeNull();
    expect(saveThresholds({ largeAmountLine: Number.NaN })).toBeNull();
    expect(getThresholds().largeAmountLine).toBe(DEFAULT_THRESHOLDS.largeAmountLine);
  });

  it('业务置信度三层约束被打破时拒绝保存', () => {
    // 阻断线高于告警线：违反 0.5 <= 0.7 <= 0.85 层次
    expect(saveThresholds({ businessConfidenceBlockLine: 0.8 })).toBeNull();
    // 告警线高于审批线
    expect(saveThresholds({ businessConfidenceApprovalLine: 0.6 })).toBeNull();
  });

  it('存储中的非法或越界字段在读取时回落默认', () => {
    window.localStorage.setItem(
      'invoice_evidence_rule_thresholds',
      JSON.stringify({ largeAmountLine: -100, ocrConfidenceWarnLine: 'bad', approvalAmountLine: 8000 }),
    );
    const current = getThresholds();
    expect(current.largeAmountLine).toBe(DEFAULT_THRESHOLDS.largeAmountLine);
    expect(current.ocrConfidenceWarnLine).toBe(DEFAULT_THRESHOLDS.ocrConfidenceWarnLine);
    expect(current.approvalAmountLine).toBe(8000);
  });

  it('保存和重置都会通知订阅者', () => {
    let notified = 0;
    const unsubscribe = subscribeThresholdChanges(() => {
      notified += 1;
    });
    saveThresholds({ approvalAmountLine: 6000 });
    resetThresholds();
    expect(notified).toBe(2);
    unsubscribe();
  });

  it('重置后恢复默认值', () => {
    saveThresholds({ largeAmountLine: 999999 });
    const current = resetThresholds();
    expect(current).toEqual(DEFAULT_THRESHOLDS);
    expect(isDefaultThresholds()).toBe(true);
  });
});
