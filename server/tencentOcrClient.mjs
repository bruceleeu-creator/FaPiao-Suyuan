// 腾讯云 OCR 真实调用客户端
//
// 当前已支持：
// - 使用加密存储或环境变量中的 SecretId/SecretKey
// - 腾讯云 TC3-HMAC-SHA256 签名
// - 调用 VatInvoiceOCR（增值税发票识别）
//
// 安全约束：
// - 不打印 SecretId / SecretKey
// - 不把密钥返回给前端
// - 调用失败时只返回统一错误结构，不暴露敏感信息

import https from 'node:https';
import { createHash, createHmac, randomInt } from 'node:crypto';
import { getEffectiveTencentCredentials } from './tencentProxyConfig.mjs';

const OCR_HOST = 'ocr.tencentcloudapi.com';
const OCR_SERVICE = 'ocr';
const OCR_VERSION = '2018-11-19';
const OCR_ACTION = 'VatInvoiceOCR';
const DEFAULT_REGION = process.env.TENCENT_CLOUD_REGION || 'ap-guangzhou';

// 超时保护：真实调用挂起（网络不通、连接半开）时主动中断，
// 避免后端请求无限等待导致"导入卡住"（前端 30s 兜底之外的服务端兜底）
const OCR_TIMEOUT_MS = 20000;
const OCR_TIMEOUT_MARK = 'OCR_REQUEST_TIMEOUT';

function sha256Hex(data) {
  return createHash('sha256').update(data).digest('hex');
}

function hmac(key, data) {
  return createHmac('sha256', key).update(data).digest();
}

function buildAuthorization({ secretId, secretKey, payload, timestamp, date }) {
  const hashedPayload = sha256Hex(payload);
  const canonicalHeaders = `content-type:application/json; charset=utf-8\nhost:${OCR_HOST}\n`;
  const signedHeaders = 'content-type;host';
  const canonicalRequest = [
    'POST',
    '/',
    '',
    canonicalHeaders,
    signedHeaders,
    hashedPayload,
  ].join('\n');

  const credentialScope = `${date}/${OCR_SERVICE}/tc3_request`;
  const hashedCanonicalRequest = sha256Hex(canonicalRequest);
  const stringToSign = [
    'TC3-HMAC-SHA256',
    String(timestamp),
    credentialScope,
    hashedCanonicalRequest,
  ].join('\n');

  const kDate = hmac(`TC3${secretKey}`, date);
  const kService = hmac(kDate, OCR_SERVICE);
  const kSigning = hmac(kService, 'tc3_request');
  const signature = createHmac('sha256', kSigning).update(stringToSign).digest('hex');

  return `TC3-HMAC-SHA256 Credential=${secretId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
}

function requestOcr(payload) {
  const timestamp = Math.floor(Date.now() / 1000);
  const date = new Date(timestamp * 1000).toISOString().slice(0, 10);
  const creds = getEffectiveTencentCredentials();
  const body = JSON.stringify(payload);
  const authorization = buildAuthorization({
    secretId: creds.secretId,
    secretKey: creds.secretKey,
    payload: body,
    timestamp,
    date,
  });

  const headers = {
    'Authorization': authorization,
    'Content-Type': 'application/json; charset=utf-8',
    'Host': OCR_HOST,
    'X-TC-Action': OCR_ACTION,
    'X-TC-Version': OCR_VERSION,
    'X-TC-Timestamp': String(timestamp),
    'X-TC-Nonce': String(randomInt(0, 2147483647)),
    'X-TC-Region': DEFAULT_REGION,
    'Content-Length': Buffer.byteLength(body, 'utf8'),
  };

  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(hardTimer);
      fn(value);
    };

    const req = https.request({
      hostname: OCR_HOST,
      path: '/',
      method: 'POST',
      headers,
    }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        let json = null;
        try {
          json = JSON.parse(raw);
        } catch {
          json = null;
        }
        finish(resolve, { statusCode: res.statusCode, json, raw });
      });
    });

    // 超时保护：socket 空闲超时 + 总时长硬超时，任一触发都销毁请求并拒绝
    const hardTimer = setTimeout(() => {
      req.destroy(new Error(`${OCR_TIMEOUT_MARK}: 超时（${OCR_TIMEOUT_MS}ms）`));
    }, OCR_TIMEOUT_MS);
    req.setTimeout(OCR_TIMEOUT_MS, () => {
      req.destroy(new Error(`${OCR_TIMEOUT_MARK}: 响应超时（${OCR_TIMEOUT_MS}ms）`));
    });

    req.on('error', (err) => {
      finish(reject, err);
    });

    req.write(body);
    req.end();
  });
}

// 判定腾讯云 OCR 响应是否真实成功（纯函数，供冒烟测试回归）
// 腾讯云 API 约定：业务/鉴权错误也可能以 HTTP 200 返回，错误在 Response.Error 里
// （实测 AuthFailure.SecretIdNotFound 即为 200 + Error），
// 必须检查 Error 字段，否则密钥错误会被误判为"识别成功"，前端拿到空数据表现为"导入无反应"
export function classifyOcrApiResponse(statusCode, json) {
  const apiError = json?.Response?.Error;
  if (statusCode === 200 && json?.Response && !apiError) {
    return { ok: true };
  }
  return {
    ok: false,
    message: apiError?.Message || apiError?.Code || `腾讯云 OCR 调用失败（HTTP ${statusCode}）。`,
  };
}

// 识别增值税发票
// 入参：imageBase64 或 imageUrl 至少提供一个
export async function recognizeVatInvoice({ imageBase64, imageUrl, isPdf, pdfPageNumber } = {}) {
  const creds = getEffectiveTencentCredentials();
  if (creds.source === 'none') {
    return {
      ok: false,
      status: 'not_configured',
      message: '腾讯云 OCR 尚未配置 SecretId/SecretKey，无法发起真实调用。',
    };
  }

  if (!imageBase64 && !imageUrl) {
    return {
      ok: false,
      status: 'missing_image',
      message: '缺少发票图片/PDF 数据，请上传文件后再调用 OCR。',
    };
  }

  const payload = {};
  if (imageBase64) payload.ImageBase64 = imageBase64;
  if (imageUrl) payload.ImageUrl = imageUrl;
  if (isPdf) {
    payload.IsPdf = true;
    if (pdfPageNumber) payload.PdfPageNumber = pdfPageNumber;
  }

  try {
    const response = await requestOcr(payload);
    const classified = classifyOcrApiResponse(response.statusCode, response.json);
    if (classified.ok) {
      return {
        ok: true,
        status: 'success',
        data: response.json.Response,
        raw: response.json,
      };
    }
    return {
      ok: false,
      status: 'failed',
      statusCode: response.statusCode,
      message: classified.message,
      raw: response.json,
    };
  } catch (err) {
    if (err?.message?.startsWith(OCR_TIMEOUT_MARK)) {
      return {
        ok: false,
        status: 'timeout',
        message: `腾讯云 OCR 请求超时（${OCR_TIMEOUT_MS / 1000} 秒），已中断。请检查服务器网络后重试。`,
      };
    }
    return {
      ok: false,
      status: 'error',
      message: `腾讯云 OCR 请求异常：${err.message}`,
    };
  }
}

// ============ 管理员密钥连通性测试 ============
// 用 1x1 像素 PNG 发起一次真实 VatInvoiceOCR 调用：
// - 能通过腾讯云鉴权（即使因图片太小返回业务错误）即说明 SecretId/SecretKey 有效
// - AuthFailure 系错误码说明密钥错误/被禁用
// - 超时/网络异常说明服务器到腾讯云不通
const TINY_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

export async function testTencentOcrCredentials() {
  const creds = getEffectiveTencentCredentials();
  if (creds.source === 'none') {
    return {
      ok: false,
      status: 'not_configured',
      message: '尚未保存腾讯云密钥，请先填写 SecretId/SecretKey 并保存。',
    };
  }

  const result = await recognizeVatInvoice({ imageBase64: TINY_PNG_BASE64 });
  if (result.ok) {
    return { ok: true, status: 'success', message: '腾讯云密钥有效，OCR 调用成功。' };
  }

  const errorCode = result.raw?.Response?.Error?.Code || '';
  const authRejected =
    errorCode.startsWith('AuthFailure') ||
    errorCode.startsWith('InvalidCredential') ||
    result.statusCode === 401 ||
    result.statusCode === 403;
  if (authRejected) {
    return {
      ok: false,
      status: 'auth_failed',
      message: `腾讯云拒绝了该密钥（${errorCode || `HTTP ${result.statusCode}`}）：请核对 SecretId/SecretKey 是否正确、是否已被禁用或删除。`,
    };
  }
  if (result.status === 'timeout' || result.status === 'error') {
    return {
      ok: false,
      status: result.status,
      message: result.message,
    };
  }

  // 非鉴权类业务错误（如 1x1 图片无法识别出票面）：说明签名与密钥已通过校验
  return {
    ok: true,
    status: 'success',
    message: `密钥有效（腾讯云已通过鉴权并返回业务响应${errorCode ? `：${errorCode}` : ''}）。上传真实发票即可识别。`,
  };
}
