import type { IntegrationConfig, IntegrationKey, IntegrationModeSummary } from './types';
import { createDefaultIntegrationConfigs, buildIntegrationDisplayLabel } from './defaultConfigs';
import { readJSON, writeJSON, STORAGE_KEYS } from '../storage/localStore';
import { mockTestConnection } from './mockConnectionTest';

// 集成配置仓库：保存/读取/测试连接
// 持久化：localStorage key = invoice_evidence_integration_config
//
// 安全约束（Codex QA Rework P1）：
// - 前端不得保存任何 API Key / Token / SecretId / SecretKey
// - saveIntegrationConfigs 在写入前强制清空 apiKey 字段
// - loadIntegrationConfigs 在读取后强制清空 apiKey 字段
// - 这样可保证旧 localStorage 中的脏数据不会回流到 UI

// 发布订阅：保存配置后通知 Layout 等订阅者重新渲染，避免侧边栏接口边界 stale
type Listener = () => void;
const listeners = new Set<Listener>();

export function subscribeIntegrationChanges(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function notifyIntegrationChanges() {
  listeners.forEach((l) => l());
}

// 安全清理：强制将 apiKey 置为空字符串
// 防止任何来源（UI 输入、旧 localStorage、测试 fixture）的密钥泄漏到持久化层
function sanitizeConfig(config: IntegrationConfig): IntegrationConfig {
  // 兼容归一：旧版本存储的 mode '模拟' 统一迁移为 '内置'
  const mode: IntegrationConfig['mode'] = config.mode === '正式' ? '正式' : '内置';
  return { ...config, mode, apiKey: '' };
}

function sanitizeConfigMap(
  configs: Record<IntegrationKey, IntegrationConfig>,
): Record<IntegrationKey, IntegrationConfig> {
  return {
    ocr: sanitizeConfig(configs.ocr),
    verify: sanitizeConfig(configs.verify),
    voucher: sanitizeConfig(configs.voucher),
  };
}

export function loadIntegrationConfigs(): Record<IntegrationKey, IntegrationConfig> {
  const defaults = createDefaultIntegrationConfigs();
  const stored = readJSON<Partial<Record<IntegrationKey, IntegrationConfig>>>(
    STORAGE_KEYS.integrationConfig,
    {},
  );
  // 合并：以默认值为底，逐项覆盖已存储的字段，避免新字段缺失
  // 安全：合并后强制清空 apiKey，防止旧 localStorage 中的脏数据回流到 UI
  const merged: Record<IntegrationKey, IntegrationConfig> = {
    ocr: { ...defaults.ocr, ...stored.ocr },
    verify: { ...defaults.verify, ...stored.verify },
    voucher: { ...defaults.voucher, ...stored.voucher },
  };
  // OCR 已通过后端代理接入腾讯云真实识别，localStorage 里的旧「模拟」状态
  // 不再反映现实，强制以「正式」展示（密钥仍在后端 .env，前端不保存）
  merged.ocr.mode = '正式';
  return sanitizeConfigMap(merged);
}

export function saveIntegrationConfigs(
  configs: Record<IntegrationKey, IntegrationConfig>,
): boolean {
  // 安全：写入 localStorage 前强制清空 apiKey
  // 即使 UI 误传了 apiKey，也不会被持久化
  const sanitized = sanitizeConfigMap(configs);
  const ok = writeJSON(STORAGE_KEYS.integrationConfig, sanitized);
  // 通知 Layout 等订阅者刷新最新模式
  notifyIntegrationChanges();
  return ok;
}

export function updateSingleConfig(
  key: IntegrationKey,
  patch: Partial<IntegrationConfig>,
): Record<IntegrationKey, IntegrationConfig> {
  const all = loadIntegrationConfigs();
  // 安全：patch 中即使带 apiKey 也会在 saveIntegrationConfigs 中被清空
  const next: IntegrationConfig = { ...all[key], ...patch, key };
  all[key] = next;
  saveIntegrationConfigs(all);
  // 返回前再清空一次，保证调用方拿到的也是 sanitized 版本
  return sanitizeConfigMap(all);
}

// 执行模拟连接测试并保存结果
export function testConnection(
  key: IntegrationKey,
): { configs: Record<IntegrationKey, IntegrationConfig>; result: IntegrationConfig['lastTestResult'] } {
  const all = loadIntegrationConfigs();
  const config = all[key];
  const result = mockTestConnection({ config });
  all[key] = { ...config, lastTestResult: result };
  saveIntegrationConfigs(all);
  // 返回 sanitized 版本（apiKey 已被清空）
  return { configs: sanitizeConfigMap(all), result };
}

// 侧边栏模式摘要
export function getIntegrationModeSummaries(): IntegrationModeSummary[] {
  const all = loadIntegrationConfigs();
  return (Object.keys(all) as IntegrationKey[]).map((key) => {
    const config = all[key];
    return {
      key,
      name: config.name,
      mode: config.mode,
      enabled: config.enabled,
      displayLabel: buildIntegrationDisplayLabel(config),
    };
  });
}

// 重置为默认配置（调试用）
export function resetIntegrationConfigs(): Record<IntegrationKey, IntegrationConfig> {
  const defaults = createDefaultIntegrationConfigs();
  saveIntegrationConfigs(defaults);
  // 返回 sanitized 版本（保持一致性）
  return sanitizeConfigMap(defaults);
}
