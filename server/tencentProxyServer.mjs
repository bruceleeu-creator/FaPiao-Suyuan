// 腾讯云代理后端 - Node 原生 HTTP 服务器
//
// 设计原则：
//   1. 使用 Node 原生 http 模块，不引入 Express/Fastify
//   2. 未配置密钥或未上传图片/PDF 时返回预留/模拟；已配置且上传图片/PDF 时调用真实腾讯云 OCR
//   3. 不读取、不打印任何真实密钥值
//   4. CORS 仅允许本地开发源
//   5. 统一 JSON 错误格式
//
// 依据：TR_TRAE_GATE_T2_BACKEND_PROXY_TASK.md
//      CO_20260718_本地页面验收与GateT2后端代理执行指令.md 第 4-6 节

import http from 'node:http';
import process from 'node:process';
import {
  DEFAULT_HOST,
  SERVICE_NAME,
  SERVICE_MODE,
  checkTencentCloudConfigured,
  resolveBackendPort,
  resolveCorsOrigin,
} from './tencentProxyConfig.mjs';
import {
  ERROR_CODES,
  buildErrorResponse,
  buildHealthResponse,
  buildOcrReservedResponse,
  buildVerifyReservedResponse,
  generateTraceId,
} from './tencentProxyResponses.mjs';
import { recognizeVatInvoice } from './tencentOcrClient.mjs';
import { checkDeepSeekConfigured } from './deepseekConfig.mjs';
import { interpretInvoiceFields, generateInvoiceQuestions, assessInvoiceRisk } from './deepseekClient.mjs';

// 安全日志：只输出非敏感信息
// 不输出请求体原文（可能含敏感字段）、不输出密钥值、不输出完整 headers
function logRequest(method, url, statusCode, traceId) {
  // 仅记录方法、路径、状态码、traceId
  // 不记录 headers、body、query 参数（可能含敏感字段）
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${method} ${url} -> ${statusCode} traceId=${traceId}`);
}

// 发送 JSON 响应
function sendJson(res, statusCode, payload, corsOrigin) {
  const body = JSON.stringify(payload);
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body, 'utf-8'),
  };
  if (corsOrigin) {
    headers['Access-Control-Allow-Origin'] = corsOrigin;
    headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS';
    headers['Access-Control-Allow-Headers'] = 'Content-Type';
    headers['Vary'] = 'Origin';
  }
  res.writeHead(statusCode, headers);
  res.end(body);
}

// 解析请求 body 为 JSON
// 返回 { ok: true, data } 或 { ok: false, error }
function parseJsonBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    let totalSize = 0;
    let tooLarge = false;
    const MAX_BODY_SIZE = 20 * 1024 * 1024; // 20MB 上限（含 base64 膨胀）

    req.on('data', (chunk) => {
      if (tooLarge) return;
      totalSize += chunk.length;
      if (totalSize > MAX_BODY_SIZE) {
        tooLarge = true;
        resolve({ ok: false, error: '请求体过大（超过 20MB）。' });
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', () => {
      if (tooLarge) return; // 已在上方 resolve
      if (chunks.length === 0) {
        // 空 body：对于 POST 请求，返回空对象（兼容无 body 的调用）
        resolve({ ok: true, data: {} });
        return;
      }
      try {
        const raw = Buffer.concat(chunks).toString('utf-8');
        const parsed = JSON.parse(raw);
        resolve({ ok: true, data: parsed });
      } catch (err) {
        resolve({ ok: false, error: '请求体不是合法 JSON。' });
      }
    });

    req.on('error', (err) => {
      resolve({ ok: false, error: `请求读取失败：${err.message}` });
    });
  });
}

// 路由处理
async function handleRequest(req, res) {
  const { method, url } = req;
  const corsOrigin = resolveCorsOrigin(req.headers.origin);

  // 处理 CORS 预检请求
  if (method === 'OPTIONS') {
    const headers = {
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };
    if (corsOrigin) {
      headers['Access-Control-Allow-Origin'] = corsOrigin;
      headers['Vary'] = 'Origin';
    }
    res.writeHead(204, headers);
    res.end();
    return;
  }

  // 解析 URL（不解析 query，因为本服务所有接口都不需要 query）
  const pathname = url?.split('?')[0] || '/';

  // 路由匹配
  // 1. GET /health 与 GET /api/tencent/health（前端经 Vite 代理探测后端状态，响应一致）
  if (method === 'GET' && (pathname === '/health' || pathname === '/api/tencent/health')) {
    const tencentConfig = checkTencentCloudConfigured();
    const payload = buildHealthResponse(tencentConfig, {
      deepseekConfigured: checkDeepSeekConfigured(),
    });
    logRequest(method, pathname, 200, payload.traceId);
    sendJson(res, 200, payload, corsOrigin);
    return;
  }

  // 2. POST /api/tencent/ocr/invoice
  if (method === 'POST' && pathname === '/api/tencent/ocr/invoice') {
    const bodyResult = await parseJsonBody(req);
    if (!bodyResult.ok) {
      const payload = buildErrorResponse(ERROR_CODES.INVALID_JSON, bodyResult.error);
      logRequest(method, pathname, 400, payload.traceId);
      sendJson(res, 400, payload, corsOrigin);
      return;
    }

    const { imageBase64, imageUrl, isPdf, pdfPageNumber } = bodyResult.data || {};

    // 没有图片/PDF 数据时继续走预留响应，兼容当前前端仅传文件名的阶段
    if (!imageBase64 && !imageUrl) {
      const payload = buildOcrReservedResponse();
      logRequest(method, pathname, 200, payload.traceId);
      sendJson(res, 200, payload, corsOrigin);
      return;
    }

    // 有图片/PDF 数据时，尝试调用真实腾讯云 OCR
    const ocrResult = await recognizeVatInvoice({
      imageBase64,
      imageUrl,
      isPdf,
      pdfPageNumber,
    });
    const traceId = generateTraceId();
    if (ocrResult.ok) {
      const payload = {
        ok: true,
        provider: 'tencent-cloud',
        service: 'invoice-ocr',
        status: 'success',
        data: ocrResult.data,
        traceId,
        timestamp: new Date().toISOString(),
      };
      logRequest(method, pathname, 200, traceId);
      sendJson(res, 200, payload, corsOrigin);
      return;
    }

    const payload = {
      ok: false,
      provider: 'tencent-cloud',
      service: 'invoice-ocr',
      status: ocrResult.status || 'failed',
      message: ocrResult.message || '腾讯云 OCR 调用失败。',
      traceId,
      timestamp: new Date().toISOString(),
    };
    logRequest(method, pathname, 200, traceId);
    sendJson(res, 200, payload, corsOrigin);
    return;
  }

  // 3. POST /api/tencent/invoice/verify
  if (method === 'POST' && pathname === '/api/tencent/invoice/verify') {
    const bodyResult = await parseJsonBody(req);
    if (!bodyResult.ok) {
      const payload = buildErrorResponse(ERROR_CODES.INVALID_JSON, bodyResult.error);
      logRequest(method, pathname, 400, payload.traceId);
      sendJson(res, 400, payload, corsOrigin);
      return;
    }
    // 当前阶段：不调用真实腾讯云接口，直接返回预留响应
    const payload = buildVerifyReservedResponse();
    logRequest(method, pathname, 200, payload.traceId);
    sendJson(res, 200, payload, corsOrigin);
    return;
  }

  // 4. POST /api/deepseek/interpret
  // OCR 识别成功后，前端把原始 OCR 字段和当前表单发来，
  // 由 DeepSeek 判断发票类别并补齐缺失字段（密钥仅保存在后端）
  if (method === 'POST' && pathname === '/api/deepseek/interpret') {
    const bodyResult = await parseJsonBody(req);
    if (!bodyResult.ok) {
      const payload = buildErrorResponse(ERROR_CODES.INVALID_JSON, bodyResult.error);
      logRequest(method, pathname, 400, payload.traceId);
      sendJson(res, 400, payload, corsOrigin);
      return;
    }

    const { ocrFields, currentForm } = bodyResult.data || {};
    const deepseekResult = await interpretInvoiceFields({ ocrFields, currentForm });
    const traceId = generateTraceId();
    const payload = {
      ok: deepseekResult.ok,
      provider: 'deepseek',
      service: 'invoice-interpret',
      status: deepseekResult.status,
      ...(deepseekResult.ok
        ? { data: deepseekResult.data }
        : { message: deepseekResult.message || 'DeepSeek 调用失败。' }),
      traceId,
      timestamp: new Date().toISOString(),
    };
    logRequest(method, pathname, 200, traceId);
    sendJson(res, 200, payload, corsOrigin);
    return;
  }

  // 5. POST /api/deepseek/questions
  // 业务追问步骤：基于票面字段由 DeepSeek 生成严谨的结构化追问问题
  if (method === 'POST' && pathname === '/api/deepseek/questions') {
    const bodyResult = await parseJsonBody(req);
    if (!bodyResult.ok) {
      const payload = buildErrorResponse(ERROR_CODES.INVALID_JSON, bodyResult.error);
      logRequest(method, pathname, 400, payload.traceId);
      sendJson(res, 400, payload, corsOrigin);
      return;
    }
    const questionsResult = await generateInvoiceQuestions({ invoice: bodyResult.data?.invoice });
    const traceId = generateTraceId();
    const payload = {
      ok: questionsResult.ok,
      provider: 'deepseek',
      service: 'invoice-questions',
      status: questionsResult.status,
      ...(questionsResult.ok
        ? { data: questionsResult.data }
        : { message: questionsResult.message || 'DeepSeek 问题生成失败。' }),
      traceId,
      timestamp: new Date().toISOString(),
    };
    logRequest(method, pathname, 200, traceId);
    sendJson(res, 200, payload, corsOrigin);
    return;
  }

  // 6. POST /api/deepseek/risk
  // AI 风险初判：综合票面、业务事件（问答还原）、证据链由 DeepSeek 输出风险分析
  if (method === 'POST' && pathname === '/api/deepseek/risk') {
    const bodyResult = await parseJsonBody(req);
    if (!bodyResult.ok) {
      const payload = buildErrorResponse(ERROR_CODES.INVALID_JSON, bodyResult.error);
      logRequest(method, pathname, 400, payload.traceId);
      sendJson(res, 400, payload, corsOrigin);
      return;
    }
    const { invoice, businessEvent, evidenceChain, answers } = bodyResult.data || {};
    const riskResult = await assessInvoiceRisk({ invoice, businessEvent, evidenceChain, answers });
    const traceId = generateTraceId();
    const payload = {
      ok: riskResult.ok,
      provider: 'deepseek',
      service: 'invoice-risk',
      status: riskResult.status,
      ...(riskResult.ok
        ? { data: riskResult.data }
        : { message: riskResult.message || 'DeepSeek 风险分析失败。' }),
      traceId,
      timestamp: new Date().toISOString(),
    };
    logRequest(method, pathname, 200, traceId);
    sendJson(res, 200, payload, corsOrigin);
    return;
  }

  // 7. 未匹配的路由
  const knownPaths = [
    '/health',
    '/api/tencent/health',
    '/api/tencent/ocr/invoice',
    '/api/tencent/invoice/verify',
    '/api/deepseek/interpret',
    '/api/deepseek/questions',
    '/api/deepseek/risk',
  ];
  if (knownPaths.includes(pathname)) {
    // 路径存在但方法不对
    const payload = buildErrorResponse(
      ERROR_CODES.METHOD_NOT_ALLOWED,
      `路径 ${pathname} 不支持 ${method} 方法。`,
    );
    logRequest(method, pathname, 405, payload.traceId);
    sendJson(res, 405, payload, corsOrigin);
    return;
  }

  // 5. 完全未匹配
  const payload = buildErrorResponse(
    ERROR_CODES.NOT_FOUND,
    `路径 ${pathname} 不存在。`,
  );
  logRequest(method, pathname, 404, payload.traceId);
  sendJson(res, 404, payload, corsOrigin);
}

// 创建 HTTP 服务器
export function createServer() {
  return http.createServer(async (req, res) => {
    try {
      await handleRequest(req, res);
    } catch (err) {
      // 兜底：未捕获的错误返回 500
      const payload = buildErrorResponse(
        ERROR_CODES.INTERNAL_ERROR,
        '服务器内部错误。',
      );
      // 不输出 err.message 到响应体，避免泄露内部信息
      // 但记录到服务端日志（不输出敏感字段）
      console.error(`[INTERNAL_ERROR] ${req.method} ${req.url}:`, err.name);
      logRequest(req.method, req.url, 500, payload.traceId);
      const corsOrigin = resolveCorsOrigin(req.headers.origin);
      sendJson(res, 500, payload, corsOrigin);
    }
  });
}

// 启动服务器（仅当直接运行此文件时）
// 被 import 时不启动，便于 smoke test 复用
export function startServer() {
  const port = resolveBackendPort();
  const server = createServer();

  server.listen(port, DEFAULT_HOST, () => {
    const tencentConfig = checkTencentCloudConfigured();
    console.log(`[${SERVICE_NAME}] 启动于 http://${DEFAULT_HOST}:${port}`);
    console.log(`[${SERVICE_NAME}] 模式：${SERVICE_MODE}（不调用真实腾讯云接口）`);
    console.log(`[${SERVICE_NAME}] 腾讯云密钥配置状态：ocrConfigured=${tencentConfig.ocrConfigured}, verifyConfigured=${tencentConfig.verifyConfigured}`);
    console.log(`[${SERVICE_NAME}] 注意：不打印密钥值，仅检查环境变量存在性`);
    console.log(`[${SERVICE_NAME}] CORS 允许的源：仅本地开发源`);
  });

  // 优雅关闭
  const shutdown = (signal) => {
    console.log(`[${SERVICE_NAME}] 收到 ${signal}，正在关闭...`);
    server.close(() => {
      console.log(`[${SERVICE_NAME}] 已关闭`);
      process.exit(0);
    });
    // 强制关闭超时
    setTimeout(() => {
      console.error(`[${SERVICE_NAME}] 强制关闭`);
      process.exit(1);
    }, 5000);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  return server;
}

// 当直接运行此文件时（node server/tencentProxyServer.mjs）启动服务器
// 被 import 时不启动
if (import.meta.url === `file://${process.argv[1]}`) {
  startServer();
}
