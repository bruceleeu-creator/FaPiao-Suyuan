// 腾讯云代理后端配置
//
// 安全约束（Codex QA Rework P1）：
// - 不读取、不打印任何真实密钥值
// - 支持环境变量或本地 AES-256-GCM 加密存储的凭据
// - 只返回是否已配置的布尔状态，不返回密钥值
// - 不在前端源码、localStorage、测试、文档示例中保存真实密钥
//
// 依据：TR_TRAE_GATE_T2_BACKEND_PROXY_TASK.md 第 "Security" 节

import process from 'node:process';
import {
  loadTencentCredentials,
  validateSecretId,
  validateSecretKey,
} from './tencentCredentialStore.mjs';

// 后端代理默认配置
export const DEFAULT_HOST = '127.0.0.1';
export const DEFAULT_PORT = 8787;

// 允许的本地开发源（CORS 白名单）
// 不允许生产域名，避免被外部站点调用
export const ALLOWED_DEV_ORIGINS = [
  'http://127.0.0.1:5173',
  'http://localhost:5173',
  'http://127.0.0.1:53173',
  'http://localhost:53173',
  'http://127.0.0.1:4173',
  'http://localhost:4173',
  'http://127.0.0.1:8787',
  'http://localhost:8787',
];

// 从环境变量读取端口（允许覆盖）
export function resolveBackendPort() {
  const raw = process.env.BACKEND_PROXY_PORT;
  if (!raw) return DEFAULT_PORT;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 65535) {
    return DEFAULT_PORT;
  }
  return parsed;
}

// 获取当前生效的腾讯云密钥（仅后端内部使用）
// 优先级：管理页加密存储（server/.tencent-credentials.enc）> 环境变量
// 管理页保存后立即生效，无需重启
// 不打印、不输出到响应体
export function getEffectiveTencentCredentials() {
  const stored = loadTencentCredentials();
  if (validateSecretId(stored.secretId) && validateSecretKey(stored.secretKey)) {
    return { secretId: stored.secretId, secretKey: stored.secretKey, source: 'encrypted-store' };
  }

  const envSecretId = process.env.TENCENT_CLOUD_SECRET_ID;
  const envSecretKey = process.env.TENCENT_CLOUD_SECRET_KEY;
  if (validateSecretId(envSecretId) && validateSecretKey(envSecretKey)) {
    return { secretId: envSecretId, secretKey: envSecretKey, source: 'env' };
  }

  return { secretId: '', secretKey: '', source: 'none' };
}

// 检查腾讯云密钥是否已配置（仅返回布尔状态，不泄露值）
// 用于 /health 接口报告 configured 状态
export function checkTencentCloudConfigured() {
  const creds = getEffectiveTencentCredentials();
  const configured = creds.source !== 'none';
  return {
    ocrConfigured: configured,
    verifyConfigured: configured,
  };
}

// 解析 CORS 允许的源
// 白名单 = 本地开发源 + 环境变量 EXTRA_ALLOWED_ORIGIN（逗号分隔，部署时配置生产源）
// 如果请求 Origin 在白名单中，则返回该 Origin；否则返回空字符串（不允许跨域）
export function resolveCorsOrigin(requestOrigin) {
  if (!requestOrigin) return '';
  const extra = (process.env.EXTRA_ALLOWED_ORIGIN || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (ALLOWED_DEV_ORIGINS.includes(requestOrigin) || extra.includes(requestOrigin)) {
    return requestOrigin;
  }
  return '';
}

// 后端服务名称
export const SERVICE_NAME = 'invoice-evidence-backend-proxy';

// 当前模式：reserved（预留，不调用真实腾讯云接口）
// 真实接入后可改为 'live'，但当前阶段强制为 'reserved'
export const SERVICE_MODE = 'reserved';
