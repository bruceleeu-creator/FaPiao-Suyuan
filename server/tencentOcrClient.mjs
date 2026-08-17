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
        resolve({ statusCode: res.statusCode, json, raw });
      });
    });

    req.on('error', (err) => {
      reject(err);
    });

    req.write(body);
    req.end();
  });
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
    if (response.statusCode === 200 && response.json?.Response) {
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
      message: response.json?.Response?.Error?.Message || response.json?.Response?.Error?.Code || '腾讯云 OCR 调用失败。',
      raw: response.json,
    };
  } catch (err) {
    return {
      ok: false,
      status: 'error',
      message: `腾讯云 OCR 请求异常：${err.message}`,
    };
  }
}
