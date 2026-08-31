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
import path from 'node:path';
import { fileURLToPath } from 'node:url';
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
import { recognizeVatInvoice, testTencentOcrCredentials } from './tencentOcrClient.mjs';
import { checkDeepSeekConfigured } from './deepseekConfig.mjs';
import {
  interpretInvoiceFields,
  generateInvoiceQuestions,
  assessInvoiceRisk,
  testDeepSeekCredential,
  verifyInvoiceByAi,
  buildVoucherDraftByAi,
} from './deepseekClient.mjs';
import { registerUser, verifyCredential, issueToken, verifyToken } from './authStore.mjs';
import {
  saveDeepSeekCredential,
  getDeepSeekCredentialStatus,
  validateDeepSeekKey,
  validateDeepSeekModel,
} from './apiKeyStore.mjs';
import {
  saveTencentCredential,
  getTencentCredentialStatus,
  validateSecretId,
  validateSecretKey,
} from './tencentCredentialStore.mjs';

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
    headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization';
    headers['Vary'] = 'Origin';
  }
  res.writeHead(statusCode, headers);
  res.end(body);
}

// 公网部署安全：消耗腾讯云/DeepSeek 密钥额度的接口必须携带有效登录令牌
// （Authorization: Bearer <token>，由 /api/auth/login 签发）
// 未登录/令牌无效返回 401；健康检查与账户接口不受限
function requireApiToken(req, res, corsOrigin, pathname) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  const result = verifyToken(token);
  if (result.ok) return true;
  const traceId = generateTraceId();
  const payload = {
    ok: false,
    service: 'auth',
    status: 'error',
    message: result.message || '请先登录后再调用该接口。',
    traceId,
    timestamp: new Date().toISOString(),
  };
  logRequest(req.method, pathname, 401, traceId);
  sendJson(res, 401, payload, corsOrigin);
  return false;
}

// 管理员接口鉴权：需登录且角色为 admin（第一个注册的账户）
// 未登录/令牌无效返回 401；已登录非管理员返回 403
function requireAdminToken(req, res, corsOrigin, pathname) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  const result = verifyToken(token);
  if (!result.ok) {
    const traceId = generateTraceId();
    const payload = {
      ok: false,
      service: 'auth',
      status: 'error',
      message: result.message || '请先登录。',
      traceId,
      timestamp: new Date().toISOString(),
    };
    logRequest(req.method, pathname, 401, traceId);
    sendJson(res, 401, payload, corsOrigin);
    return null;
  }
  if (result.user.role !== 'admin') {
    const traceId = generateTraceId();
    const payload = {
      ok: false,
      service: 'auth',
      status: 'error',
      message: '该操作需要管理员权限（第一个注册的账户）。',
      traceId,
      timestamp: new Date().toISOString(),
    };
    logRequest(req.method, pathname, 403, traceId);
    sendJson(res, 403, payload, corsOrigin);
    return null;
  }
  return result.user;
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
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
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

  // 2. POST /api/auth/register | /api/auth/login | /api/auth/me
  // 账户系统：注册/登录/令牌校验（数据按账户隔离的前置条件）
  if (method === 'POST' && pathname.startsWith('/api/auth/')) {
    const bodyResult = await parseJsonBody(req);
    if (!bodyResult.ok) {
      const payload = buildErrorResponse(ERROR_CODES.INVALID_JSON, bodyResult.error);
      logRequest(method, pathname, 400, payload.traceId);
      sendJson(res, 400, payload, corsOrigin);
      return;
    }

    const traceId = generateTraceId();
    const authFail = (statusCode, message) => {
      const payload = {
        ok: false,
        service: 'auth',
        status: 'error',
        message,
        traceId,
        timestamp: new Date().toISOString(),
      };
      logRequest(method, pathname, statusCode, traceId);
      sendJson(res, statusCode, payload, corsOrigin);
    };

    // 2.1 POST /api/auth/register {username, password} → 注册成功即登录（返回令牌）
    if (pathname === '/api/auth/register') {
      const { username, password } = bodyResult.data || {};
      const result = registerUser({ username, password });
      if (!result.ok) {
        authFail(result.status, result.message);
        return;
      }
      const { token, expiresAt } = issueToken(result.user);
      const payload = {
        ok: true,
        service: 'auth',
        status: 'success',
        data: { token, userId: result.user.id, username: result.user.username, role: result.user.role === 'admin' ? 'admin' : 'user', expiresAt },
        traceId,
        timestamp: new Date().toISOString(),
      };
      logRequest(method, pathname, 201, traceId);
      sendJson(res, 201, payload, corsOrigin);
      return;
    }

    // 2.2 POST /api/auth/login {username, password} → 登录失败统一 401，不区分用户名/密码错误
    if (pathname === '/api/auth/login') {
      const { username, password } = bodyResult.data || {};
      const user = verifyCredential({ username, password });
      if (!user) {
        authFail(401, '用户名或密码不正确。');
        return;
      }
      const { token, expiresAt } = issueToken(user);
      const payload = {
        ok: true,
        service: 'auth',
        status: 'success',
        data: { token, userId: user.id, username: user.username, role: user.role === 'admin' ? 'admin' : 'user', expiresAt },
        traceId,
        timestamp: new Date().toISOString(),
      };
      logRequest(method, pathname, 200, traceId);
      sendJson(res, 200, payload, corsOrigin);
      return;
    }

    // 2.3 POST /api/auth/me {token} → 校验令牌并返回账户信息（页面刷新后恢复会话）
    if (pathname === '/api/auth/me') {
      const { token } = bodyResult.data || {};
      const result = verifyToken(token);
      if (!result.ok) {
        authFail(result.status, result.message);
        return;
      }
      const payload = {
        ok: true,
        service: 'auth',
        status: 'success',
        data: {
          userId: result.user.id,
          username: result.user.username,
          role: result.user.role === 'admin' ? 'admin' : 'user',
          expiresAt: result.expiresAt,
        },
        traceId,
        timestamp: new Date().toISOString(),
      };
      logRequest(method, pathname, 200, traceId);
      sendJson(res, 200, payload, corsOrigin);
      return;
    }

    // /api/auth/ 下其他路径
    authFail(404, `路径 ${pathname} 不存在。`);
    return;
  }

  // 3. 管理员密钥配置：GET /api/admin/keys/status | POST /api/admin/keys/deepseek | POST /api/admin/keys/tencent
  // 网页端配置密钥（AES-256-GCM 加密落盘，保存即生效无需重启），仅第一个注册的管理员可用
  if (pathname.startsWith('/api/admin/keys')) {
    const traceId = generateTraceId();
    const admin = requireAdminToken(req, res, corsOrigin, pathname);
    if (!admin) return;

    // 3.1 GET /api/admin/keys/status —— 各密钥配置状态（布尔与掩码，不含密钥值）
    if (method === 'GET' && pathname === '/api/admin/keys/status') {
      const deepseek = getDeepSeekCredentialStatus();
      const tencent = getTencentCredentialStatus();
      const payload = {
        ok: true,
        service: 'admin-keys',
        status: 'success',
        data: {
          deepseek: { configured: deepseek.configured, model: deepseek.model },
          tencent: { configured: tencent.configured, secretIdMasked: tencent.secretIdMasked },
        },
        traceId,
        timestamp: new Date().toISOString(),
      };
      logRequest(method, pathname, 200, traceId);
      sendJson(res, 200, payload, corsOrigin);
      return;
    }

    // 3.2 POST /api/admin/keys/deepseek {apiKey, model?}
    if (method === 'POST' && pathname === '/api/admin/keys/deepseek') {
      const bodyResult = await parseJsonBody(req);
      if (!bodyResult.ok) {
        const payload = buildErrorResponse(ERROR_CODES.INVALID_JSON, bodyResult.error);
        logRequest(method, pathname, 400, payload.traceId);
        sendJson(res, 400, payload, corsOrigin);
        return;
      }
      const { apiKey, model } = bodyResult.data || {};
      if (!validateDeepSeekKey(apiKey)) {
        const payload = {
          ok: false, service: 'admin-keys', status: 'error',
          message: 'DeepSeek API Key 格式不正确：应以 sk- 开头（在 DeepSeek 开放平台「API Keys」页获取）。',
          traceId, timestamp: new Date().toISOString(),
        };
        logRequest(method, pathname, 400, traceId);
        sendJson(res, 400, payload, corsOrigin);
        return;
      }
      if (model !== undefined && model !== '' && !validateDeepSeekModel(model)) {
        const payload = {
          ok: false, service: 'admin-keys', status: 'error',
          message: '模型名格式不正确（3-64 位、不含空格）。',
          traceId, timestamp: new Date().toISOString(),
        };
        logRequest(method, pathname, 400, traceId);
        sendJson(res, 400, payload, corsOrigin);
        return;
      }
      saveDeepSeekCredential({ apiKey, model });
      const payload = {
        ok: true, service: 'admin-keys', status: 'success',
        data: getDeepSeekCredentialStatus(),
        message: 'DeepSeek 密钥已保存（加密存储），立即生效。',
        traceId, timestamp: new Date().toISOString(),
      };
      logRequest(method, pathname, 200, traceId);
      sendJson(res, 200, payload, corsOrigin);
      return;
    }

    // 3.3 POST /api/admin/keys/tencent {secretId, secretKey}
    if (method === 'POST' && pathname === '/api/admin/keys/tencent') {
      const bodyResult = await parseJsonBody(req);
      if (!bodyResult.ok) {
        const payload = buildErrorResponse(ERROR_CODES.INVALID_JSON, bodyResult.error);
        logRequest(method, pathname, 400, payload.traceId);
        sendJson(res, 400, payload, corsOrigin);
        return;
      }
      const { secretId, secretKey } = bodyResult.data || {};
      const idOk = validateSecretId(secretId);
      const keyOk = validateSecretKey(secretKey);
      if (!idOk || !keyOk) {
        const payload = {
          ok: false, service: 'admin-keys', status: 'error',
          message: !idOk
            ? '腾讯云 SecretId 格式不正确：应以 AKID 开头共 36 位（腾讯云控制台「访问管理 → API 密钥管理」获取）。'
            : '腾讯云 SecretKey 格式不正确：应为 32 位字母数字。',
          traceId, timestamp: new Date().toISOString(),
        };
        logRequest(method, pathname, 400, traceId);
        sendJson(res, 400, payload, corsOrigin);
        return;
      }
      saveTencentCredential({ secretId, secretKey });
      const payload = {
        ok: true, service: 'admin-keys', status: 'success',
        data: getTencentCredentialStatus(),
        message: '腾讯云密钥已保存（加密存储），立即生效。',
        traceId, timestamp: new Date().toISOString(),
      };
      logRequest(method, pathname, 200, traceId);
      sendJson(res, 200, payload, corsOrigin);
      return;
    }

    // 3.4 POST /api/admin/keys/tencent/test —— 真实调用一次 OCR 验证密钥可用性
    // 区分：未配置 / 密钥被拒（AuthFailure）/ 网络超时 / 密钥有效
    if (method === 'POST' && pathname === '/api/admin/keys/tencent/test') {
      const testResult = await testTencentOcrCredentials();
      const payload = {
        ok: testResult.ok,
        service: 'admin-keys',
        status: 'success',
        data: testResult,
        message: testResult.message,
        traceId,
        timestamp: new Date().toISOString(),
      };
      logRequest(method, pathname, 200, traceId);
      sendJson(res, 200, payload, corsOrigin);
      return;
    }

    // 3.5 POST /api/admin/keys/deepseek/test —— 最小真实请求验证密钥可用性
    // 区分：未配置 / 401 密钥无效 / 402 欠费 / 429 限流 / 超时 / 成功
    if (method === 'POST' && pathname === '/api/admin/keys/deepseek/test') {
      const testResult = await testDeepSeekCredential();
      const payload = {
        ok: testResult.ok,
        service: 'admin-keys',
        status: 'success',
        data: testResult,
        message: testResult.message,
        traceId,
        timestamp: new Date().toISOString(),
      };
      logRequest(method, pathname, 200, traceId);
      sendJson(res, 200, payload, corsOrigin);
      return;
    }

    // /api/admin/keys 下其他路径或方法
    const payload = buildErrorResponse(ERROR_CODES.NOT_FOUND, `路径 ${pathname} 不存在。`);
    logRequest(method, pathname, 404, payload.traceId);
    sendJson(res, 404, payload, corsOrigin);
    return;
  }

  // 4. POST /api/tencent/ocr/invoice
  if (method === 'POST' && pathname === '/api/tencent/ocr/invoice') {
      const bodyResult = await parseJsonBody(req);
      if (!bodyResult.ok) {
        const payload = buildErrorResponse(ERROR_CODES.INVALID_JSON, bodyResult.error);
        logRequest(method, pathname, 400, payload.traceId);
        sendJson(res, 400, payload, corsOrigin);
        return;
      }
      if (!requireApiToken(req, res, corsOrigin, pathname)) return;

      const { imageBase64, imageUrl, isPdf, pdfPageNumber, secretId, secretKey } = bodyResult.data || {};

    // 没有图片/PDF 数据时继续走预留响应，兼容当前前端仅传文件名的阶段
    if (!imageBase64 && !imageUrl) {
      const payload = buildOcrReservedResponse();
      logRequest(method, pathname, 200, payload.traceId);
      sendJson(res, 200, payload, corsOrigin);
      return;
    }

    // 有图片/PDF 数据时，尝试调用真实腾讯云 OCR
    // secretId/secretKey 为请求级凭据（用户会话密钥，仅本次调用使用，不落盘、不打印）
    const ocrResult = await recognizeVatInvoice({
      imageBase64,
      imageUrl,
      isPdf,
      pdfPageNumber,
      credentials: secretId || secretKey ? { secretId, secretKey } : undefined,
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
    if (!requireApiToken(req, res, corsOrigin, pathname)) return;
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
    if (!requireApiToken(req, res, corsOrigin, pathname)) return;

    const { ocrFields, currentForm, apiKey, model } = bodyResult.data || {};
    // apiKey/model 为请求级凭据（用户会话密钥，仅本次调用使用，不落盘、不打印）
    const credentials = apiKey || model ? { apiKey, model } : undefined;
    const deepseekResult = await interpretInvoiceFields({ ocrFields, currentForm, credentials });
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
    if (!requireApiToken(req, res, corsOrigin, pathname)) return;
    const { invoice, apiKey, model } = bodyResult.data || {};
    const questionsResult = await generateInvoiceQuestions({
      invoice,
      credentials: apiKey || model ? { apiKey, model } : undefined,
    });
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
    if (!requireApiToken(req, res, corsOrigin, pathname)) return;
    const { invoice, businessEvent, evidenceChain, answers, apiKey, model } = bodyResult.data || {};
    const credentials = apiKey || model ? { apiKey, model } : undefined;
    const riskResult = await assessInvoiceRisk({ invoice, businessEvent, evidenceChain, answers, credentials });
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

  // 6.5 POST /api/deepseek/verify
  // AI 辅助验真（替代腾讯云验真配置）：规则确定性预检 + DeepSeek 票面一致性核验
  // 结果标注"AI 辅助核验，非官方查验平台"；存疑交人工，不硬失败
  if (method === 'POST' && pathname === '/api/deepseek/verify') {
    const bodyResult = await parseJsonBody(req);
    if (!bodyResult.ok) {
      const payload = buildErrorResponse(ERROR_CODES.INVALID_JSON, bodyResult.error);
      logRequest(method, pathname, 400, payload.traceId);
      sendJson(res, 400, payload, corsOrigin);
      return;
    }
    if (!requireApiToken(req, res, corsOrigin, pathname)) return;
    const { invoice, apiKey, model } = bodyResult.data || {};
    const verifyResult = await verifyInvoiceByAi({
      invoice,
      credentials: apiKey || model ? { apiKey, model } : undefined,
    });
    const traceId = generateTraceId();
    const payload = {
      ok: verifyResult.ok,
      provider: 'deepseek',
      service: 'invoice-verify',
      status: verifyResult.status,
      ...(verifyResult.ok
        ? { data: verifyResult.data }
        : { message: verifyResult.message || 'AI 核验失败。' }),
      traceId,
      timestamp: new Date().toISOString(),
    };
    logRequest(method, pathname, 200, traceId);
    sendJson(res, 200, payload, corsOrigin);
    return;
  }

  // 6.6 POST /api/deepseek/voucher
  // AI 凭证草稿（替代凭证接口配置）：借贷平衡校验通过才返回，失败前端回退本地规则
  if (method === 'POST' && pathname === '/api/deepseek/voucher') {
    const bodyResult = await parseJsonBody(req);
    if (!bodyResult.ok) {
      const payload = buildErrorResponse(ERROR_CODES.INVALID_JSON, bodyResult.error);
      logRequest(method, pathname, 400, payload.traceId);
      sendJson(res, 400, payload, corsOrigin);
      return;
    }
    if (!requireApiToken(req, res, corsOrigin, pathname)) return;
    const { invoice, decision, apiKey, model } = bodyResult.data || {};
    const voucherResult = await buildVoucherDraftByAi({
      invoice,
      decision,
      credentials: apiKey || model ? { apiKey, model } : undefined,
    });
    const traceId = generateTraceId();
    const payload = {
      ok: voucherResult.ok,
      provider: 'deepseek',
      service: 'voucher-draft',
      status: voucherResult.status,
      ...(voucherResult.ok
        ? { data: voucherResult.data }
        : { message: voucherResult.message || 'AI 凭证草稿生成失败。' }),
      traceId,
      timestamp: new Date().toISOString(),
    };
    logRequest(method, pathname, 200, traceId);
    sendJson(res, 200, payload, corsOrigin);
    return;
  }

  // 6.7 POST /api/keys/test/tencent | /api/keys/test/deepseek
  // 会话密钥连通性测试：任何登录用户可用自己的密钥测试（密钥随请求传入，仅本次使用）
  // 与管理员端 /api/admin/keys/*/test（测服务器全局配置）互不冲突
  if (method === 'POST' && (pathname === '/api/keys/test/tencent' || pathname === '/api/keys/test/deepseek')) {
    const bodyResult = await parseJsonBody(req);
    if (!bodyResult.ok) {
      const payload = buildErrorResponse(ERROR_CODES.INVALID_JSON, bodyResult.error);
      logRequest(method, pathname, 400, payload.traceId);
      sendJson(res, 400, payload, corsOrigin);
      return;
    }
    if (!requireApiToken(req, res, corsOrigin, pathname)) return;
    const body = bodyResult.data || {};
    const testResult = pathname === '/api/keys/test/tencent'
      ? await testTencentOcrCredentials(body.secretId ? { secretId: body.secretId, secretKey: body.secretKey } : undefined)
      : await testDeepSeekCredential(body.apiKey ? { apiKey: body.apiKey, model: body.model } : undefined);
    const traceId = generateTraceId();
    const payload = {
      ok: testResult.ok,
      service: 'session-keys-test',
      status: 'success',
      data: testResult,
      message: testResult.message,
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
    '/api/auth/register',
    '/api/auth/login',
    '/api/auth/me',
    '/api/admin/keys/status',
    '/api/admin/keys/deepseek',
    '/api/admin/keys/deepseek/test',
    '/api/admin/keys/tencent',
    '/api/admin/keys/tencent/test',
    '/api/tencent/ocr/invoice',
    '/api/tencent/invoice/verify',
    '/api/deepseek/interpret',
    '/api/deepseek/questions',
    '/api/deepseek/risk',
    '/api/deepseek/verify',
    '/api/deepseek/voucher',
    '/api/keys/test/tencent',
    '/api/keys/test/deepseek',
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
// 用 fileURLToPath 对比真实路径：目录含中文/空格时 import.meta.url 会被百分号编码，
// 直接字符串拼接对比会失配导致服务静默不启动
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  startServer();
}
