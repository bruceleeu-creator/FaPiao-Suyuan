// DeepSeek 密钥服务端加密存储
//
// 安全设计（与 tencentCredentialStore 同一口径）：
// - 网页端（管理员）提交的 DeepSeek API Key 经 AES-256-GCM 加密后落盘，明文只在内存瞬时存在
// - 不打印、不返回完整密钥到日志/响应体，状态接口只返回布尔与掩码
// - 加密密钥复用 tencentCredentialStore 的解析逻辑（环境变量 TENCENT_CREDENTIALS_KEY 或本地密钥文件）
// - 存储位置默认在 server/ 目录，可用环境变量 CREDENTIAL_DATA_DIR 覆盖（冒烟测试用临时目录）
// - .deepseek-credentials.enc 与密钥文件均已加入 .gitignore

import {
  encryptJsonToFile,
  decryptJsonFromFile,
} from './tencentCredentialStore.mjs';

const FILE_NAME = '.deepseek-credentials.enc';

// DeepSeek API Key 形态：sk- 开头 + 至少 16 位字母数字（真实密钥更长，宽松校验）
export function validateDeepSeekKey(apiKey) {
  return typeof apiKey === 'string' && /^sk-[A-Za-z0-9]{16,}$/.test(apiKey);
}

// 模型名：非空、无空白、长度合理（允许未来新模型，不做白名单）
export function validateDeepSeekModel(model) {
  return typeof model === 'string' && model.trim().length >= 3 && model.trim().length <= 64 && !/\s/.test(model.trim());
}

// 保存 DeepSeek 密钥（可附带模型名）；apiKey 与 model 至少提供一个
export function saveDeepSeekCredential({ apiKey, model } = {}) {
  const existing = loadDeepSeekCredentials();
  const next = { ...existing };
  if (apiKey !== undefined && apiKey !== '') next.apiKey = apiKey;
  if (model !== undefined && model !== '') next.model = model.trim();
  if (apiKey === '' ) delete next.apiKey;
  if (model === '' ) delete next.model;
  encryptJsonToFile(FILE_NAME, next);
  return {
    apiKeyStored: Boolean(next.apiKey),
    model: next.model || null,
  };
}

export function loadDeepSeekCredentials() {
  return decryptJsonFromFile(FILE_NAME);
}

// 状态（不含密钥值）
export function getDeepSeekCredentialStatus() {
  const stored = loadDeepSeekCredentials();
  const valid = validateDeepSeekKey(stored.apiKey);
  return {
    apiKeyStored: Boolean(stored.apiKey),
    apiKeyValid: valid,
    model: stored.model || null,
    configured: valid,
  };
}
