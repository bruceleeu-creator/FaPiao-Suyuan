// DeepSeek 配置
//
// 安全约束（与腾讯云凭据同一口径）：
// - 密钥通过本地 .env（不入库）或环境变量注入，不写入前端源码
// - 不打印、不返回密钥值，只返回是否已配置
//
// 模型：deepseek-v4-flash（推理模型，输出 content 前会产生 reasoning_content，
// 调用时需要给足 max_tokens）

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

// 启动时加载项目根目录 .env（若存在），仅填充未设置的环境变量
// 避免引入 dotenv 依赖；.env 不入库，仅本地使用
function loadDotEnv() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const envPath = path.join(root, '.env');
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, 'utf-8').split(/\r?\n/);
  for (const line of lines) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
    if (!match) continue;
    const key = match[1];
    let value = match[2];
    // 去除可选引号与行内注释
    const quoted = /^(['"])(.*)\1$/.exec(value);
    if (quoted) {
      value = quoted[2];
    } else {
      const hashIdx = value.indexOf(' #');
      if (hashIdx >= 0) value = value.slice(0, hashIdx).trim();
    }
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

loadDotEnv();

export const DEEPSEEK_API_BASE = 'https://api.deepseek.com';
export const DEEPSEEK_DEFAULT_MODEL = 'deepseek-v4-flash';

// 获取 DeepSeek 密钥与模型（仅后端内部使用）
export function getEffectiveDeepSeekConfig() {
  const apiKey = process.env.DEEPSEEK_API_KEY || '';
  const model = process.env.DEEPSEEK_MODEL || DEEPSEEK_DEFAULT_MODEL;
  return { apiKey, model, configured: apiKey.length > 0 };
}

// 检查是否已配置（仅返回布尔，不泄露值）
export function checkDeepSeekConfigured() {
  return getEffectiveDeepSeekConfig().configured;
}
