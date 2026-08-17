#!/usr/bin/env node
// 腾讯云密钥加密存储脚本
//
// 用法：
//   TENCENT_CLOUD_SECRET_ID=... TENCENT_CLOUD_SECRET_KEY=... node scripts/store-tencent-credential.mjs
//   node scripts/store-tencent-credential.mjs --secret-id=... --secret-key=...
//
// 安全说明：
// - 只保存加密后的凭据文件，不保存明文
// - 只打印脱敏后的状态，不打印完整密钥
// - 凭据文件与本地加密密钥文件均已加入 .gitignore

import process from 'node:process';
import {
  saveTencentCredential,
  validateSecretId,
  validateSecretKey,
  maskSecret,
  getTencentCredentialStatus,
} from '../server/tencentCredentialStore.mjs';

function parseArgs(argv) {
  const args = {};
  for (const arg of argv) {
    if (arg.startsWith('--secret-id=')) {
      args.secretId = arg.slice('--secret-id='.length);
    } else if (arg.startsWith('--secret-key=')) {
      args.secretKey = arg.slice('--secret-key='.length);
    }
  }
  return args;
}

const cliArgs = parseArgs(process.argv.slice(2));
const secretId = cliArgs.secretId || process.env.TENCENT_CLOUD_SECRET_ID || '';
const secretKey = cliArgs.secretKey || process.env.TENCENT_CLOUD_SECRET_KEY || '';

if (!secretId && !secretKey) {
  console.error('请提供 TENCENT_CLOUD_SECRET_ID 或 TENCENT_CLOUD_SECRET_KEY。');
  process.exit(1);
}

if (secretId && !validateSecretId(secretId)) {
  console.error('SecretId 格式不正确：应以 AKID 开头，且长度/字符不符合腾讯云 Access Key ID 格式。');
  process.exit(1);
}

if (secretKey && !validateSecretKey(secretKey)) {
  console.error('SecretKey 格式不正确：应为 32 位字母数字。');
  process.exit(1);
}

const result = saveTencentCredential({ secretId: secretId || undefined, secretKey: secretKey || undefined });
const status = getTencentCredentialStatus();
console.log('腾讯云凭据已加密保存（不输出完整密钥）：');
console.log(JSON.stringify({
  secretIdStored: result.secretIdStored,
  secretKeyStored: result.secretKeyStored,
  secretIdValid: status.secretIdValid,
  secretKeyValid: status.secretKeyValid,
  secretIdMasked: status.secretIdMasked,
  configured: status.configured,
}, null, 2));
