// 腾讯云代理后端响应构造
//
// - OCR 接口在未提供图片/PDF 时返回预留响应
// - 提供图片/PDF 且密钥已配置时，由 tencentOcrClient 调用真实腾讯云 OCR
//
// 依据：CO_20260718_本地页面验收与GateT2后端代理执行指令.md 第 5 节

import { randomUUID } from 'node:crypto';
import { SERVICE_MODE } from './tencentProxyConfig.mjs';

// 生成 traceId：用于全链路追踪
// 使用 UUID v4，避免使用时间戳+随机数可能出现的碰撞
export function generateTraceId() {
  try {
    return randomUUID();
  } catch {
    // 兜底：如果 crypto.randomUUID 不可用，使用时间戳+随机数
    return `trace-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

// GET /health 响应
// 报告服务状态和腾讯云/DeepSeek 密钥配置情况（不泄露密钥值）
export function buildHealthResponse(tencentConfig, extras = {}) {
  return {
    ok: true,
    service: 'invoice-evidence-backend-proxy',
    mode: SERVICE_MODE,
    tencent: {
      ocrConfigured: tencentConfig.ocrConfigured,
      verifyConfigured: tencentConfig.verifyConfigured,
    },
    deepseek: {
      configured: Boolean(extras.deepseekConfigured),
    },
    traceId: generateTraceId(),
    timestamp: new Date().toISOString(),
  };
}

// POST /api/tencent/ocr/invoice 预留响应
// 不调用真实腾讯云 OCR 接口
export function buildOcrReservedResponse() {
  return {
    ok: false,
    provider: 'tencent-cloud',
    service: 'invoice-ocr',
    status: 'reserved',
    reserved: true,
    simulated: true,
    message: '当前未提供发票图片/PDF，无法调用真实 OCR，返回预留响应。',
    traceId: generateTraceId(),
    timestamp: new Date().toISOString(),
  };
}

// POST /api/tencent/invoice/verify 预留响应
// 不调用真实腾讯云发票核验接口
export function buildVerifyReservedResponse() {
  return {
    ok: false,
    provider: 'tencent-cloud',
    service: 'invoice-verify',
    status: 'reserved',
    reserved: true,
    simulated: true,
    message: '腾讯云发票核验服务尚未开通，后端代理入口已预留。',
    traceId: generateTraceId(),
    timestamp: new Date().toISOString(),
  };
}

// 统一错误响应
// 用于 invalid method / path / body 等场景
export function buildErrorResponse(errorCode, message) {
  return {
    ok: false,
    errorCode,
    message,
    traceId: generateTraceId(),
    timestamp: new Date().toISOString(),
  };
}

// 错误码常量（便于路由层引用）
export const ERROR_CODES = {
  BAD_REQUEST: 'BAD_REQUEST',
  NOT_FOUND: 'NOT_FOUND',
  METHOD_NOT_ALLOWED: 'METHOD_NOT_ALLOWED',
  INVALID_JSON: 'INVALID_JSON',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
};
