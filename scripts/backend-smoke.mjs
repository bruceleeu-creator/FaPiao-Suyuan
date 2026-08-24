// 后端代理冒烟测试
//
// 启动临时后端服务，验证三个核心接口返回是否符合预期，然后关闭服务
// 不依赖外部环境，所有调用都打本地 127.0.0.1
//
// 依据：TR_TRAE_GATE_T2_BACKEND_PROXY_TASK.md 第 "Required Verification" 节
//      CO_20260718_本地页面验收与GateT2后端代理执行指令.md 第 7 节

import process from 'node:process';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { createServer } from '../server/tencentProxyServer.mjs';
import { DEFAULT_HOST, resolveBackendPort } from '../server/tencentProxyConfig.mjs';
import { registerUser, issueToken } from '../server/authStore.mjs';

// 测试结果收集
const results = [];

// 冒烟用登录令牌：OCR/DeepSeek 等受保护接口需要 Authorization 头
let smokeToken = '';

function assert(name, condition, detail = '') {
  results.push({ name, ok: !!condition, detail });
  if (!condition) {
    console.error(`  ✗ ${name}${detail ? `: ${detail}` : ''}`);
  } else {
    console.log(`  ✓ ${name}${detail ? `: ${detail}` : ''}`);
  }
}

// 调用本地接口
async function callEndpoint(method, path, body) {
  const port = resolveBackendPort();
  const url = `http://${DEFAULT_HOST}:${port}${path}`;
  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',
    },
  };
  if (smokeToken) {
    options.headers['Authorization'] = `Bearer ${smokeToken}`;
  }
  if (body !== undefined) {
    const bodyStr = JSON.stringify(body);
    options.headers['Content-Length'] = Buffer.byteLength(bodyStr, 'utf-8');
    options.body = bodyStr;
  }
  const response = await fetch(url, options);
  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    // 非 JSON 响应
  }
  return { status: response.status, json, text };
}

async function runSmokeTests() {
  console.log('=== 后端代理冒烟测试开始 ===');
  console.log(`目标: http://${DEFAULT_HOST}:${resolveBackendPort()}`);
  console.log('');

  // 0. 准备冒烟账户令牌（AUTH_DATA_DIR 已在 main 中指向临时目录）
  {
    const reg = registerUser({
      username: `smoke_api_${Date.now().toString(36)}`,
      password: 'smoke-pass-123',
    });
    assert('冒烟账户注册成功', reg.ok === true);
    if (reg.ok) {
      smokeToken = issueToken(reg.user).token;
      assert('冒烟令牌签发成功', typeof smokeToken === 'string' && smokeToken.length > 0);
    }
  }
  console.log('');

  // 1. GET /health
  console.log('[1/7] GET /health');
  {
    const res = await callEndpoint('GET', '/health');
    assert('状态码 200', res.status === 200, `实际: ${res.status}`);
    assert('返回 ok=true', res.json?.ok === true, `实际: ${res.json?.ok}`);
    assert('service 字段正确', res.json?.service === 'invoice-evidence-backend-proxy', `实际: ${res.json?.service}`);
    assert('mode 字段为 reserved', res.json?.mode === 'reserved', `实际: ${res.json?.mode}`);
    assert('包含 tencent.ocrConfigured', typeof res.json?.tencent?.ocrConfigured === 'boolean');
    assert('包含 tencent.verifyConfigured', typeof res.json?.tencent?.verifyConfigured === 'boolean');
    assert('包含 traceId', typeof res.json?.traceId === 'string' && res.json.traceId.length > 0);
  }
  console.log('');

  // 2. POST /api/tencent/ocr/invoice
  console.log('[2/7] POST /api/tencent/ocr/invoice');
  {
    // 鉴权负例：不带令牌调用受保护接口应 401
    const noAuth = await fetch(`http://${DEFAULT_HOST}:${resolveBackendPort()}/api/tencent/ocr/invoice`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ invoiceNumber: '10012001' }),
    });
    assert('未带令牌返回 401（密钥接口受保护）', noAuth.status === 401, `实际: ${noAuth.status}`);

    const res = await callEndpoint('POST', '/api/tencent/ocr/invoice', {
      invoiceNumber: '10012001',
      invoiceCode: '044002600111',
    });
    assert('状态码 200', res.status === 200, `实际: ${res.status}`);
    assert('返回 ok=false（预留）', res.json?.ok === false, `实际: ${res.json?.ok}`);
    assert('provider=tencent-cloud', res.json?.provider === 'tencent-cloud');
    assert('service=invoice-ocr', res.json?.service === 'invoice-ocr');
    assert('status=reserved', res.json?.status === 'reserved');
    assert('reserved=true', res.json?.reserved === true);
    assert('simulated=true', res.json?.simulated === true);
    assert('包含 message', typeof res.json?.message === 'string' && res.json.message.length > 0);
    assert('包含 traceId', typeof res.json?.traceId === 'string' && res.json.traceId.length > 0);
  }
  console.log('');

  // 3. POST /api/tencent/invoice/verify
  console.log('[3/7] POST /api/tencent/invoice/verify');
  {
    const res = await callEndpoint('POST', '/api/tencent/invoice/verify', {
      invoiceNumber: '10012001',
      invoiceCode: '044002600111',
      issueDate: '2026-07-12',
    });
    assert('状态码 200', res.status === 200, `实际: ${res.status}`);
    assert('返回 ok=false（预留）', res.json?.ok === false, `实际: ${res.json?.ok}`);
    assert('provider=tencent-cloud', res.json?.provider === 'tencent-cloud');
    assert('service=invoice-verify', res.json?.service === 'invoice-verify');
    assert('status=reserved', res.json?.status === 'reserved');
    assert('reserved=true', res.json?.reserved === true);
    assert('simulated=true', res.json?.simulated === true);
    assert('包含 message', typeof res.json?.message === 'string' && res.json.message.length > 0);
    assert('包含 traceId', typeof res.json?.traceId === 'string' && res.json.traceId.length > 0);
  }
  console.log('');

  // 4. 错误场景：不存在的路径
  console.log('[4/7] GET /nonexistent（应返回 404）');
  {
    const res = await callEndpoint('GET', '/nonexistent');
    assert('状态码 404', res.status === 404, `实际: ${res.status}`);
    assert('返回 ok=false', res.json?.ok === false);
    assert('包含 errorCode', typeof res.json?.errorCode === 'string');
    assert('包含 traceId', typeof res.json?.traceId === 'string' && res.json.traceId.length > 0);
  }
  console.log('');

  // 5. 错误场景：方法不对
  console.log('[5/7] DELETE /health（应返回 405）');
  {
    const res = await callEndpoint('DELETE', '/health');
    assert('状态码 405', res.status === 405, `实际: ${res.status}`);
    assert('返回 ok=false', res.json?.ok === false);
    assert('errorCode=METHOD_NOT_ALLOWED', res.json?.errorCode === 'METHOD_NOT_ALLOWED');
    assert('包含 traceId', typeof res.json?.traceId === 'string' && res.json.traceId.length > 0);
  }
  console.log('');

  // 6. 错误场景：非法 JSON
  console.log('[6/7] POST /api/tencent/ocr/invoice 非法 JSON');
  {
    const port = resolveBackendPort();
    const url = `http://${DEFAULT_HOST}:${port}/api/tencent/ocr/invoice`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not a json {{{',
    });
    const text = await response.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      // 非 JSON
    }
    assert('状态码 400', response.status === 400, `实际: ${response.status}`);
    assert('返回 ok=false', json?.ok === false);
    assert('errorCode=INVALID_JSON', json?.errorCode === 'INVALID_JSON');
    assert('包含 traceId', typeof json?.traceId === 'string' && json.traceId.length > 0);
  }
  console.log('');

  // 7. 账户系统：注册/登录/令牌校验（使用临时 AUTH_DATA_DIR，不触碰真实用户数据）
  console.log('[7/7] 账户系统 /api/auth/*');
  {
    const username = `smoke_${Date.now().toString(36)}`;
    const password = 'smoke-pass-123';

    const reg = await callEndpoint('POST', '/api/auth/register', { username, password });
    assert('注册返回 201', reg.status === 201, `实际: ${reg.status}`);
    assert('注册 ok=true', reg.json?.ok === true, `实际: ${reg.json?.ok}`);
    assert('注册返回 token', typeof reg.json?.data?.token === 'string' && reg.json.data.token.length > 0);
    assert('注册返回 userId', typeof reg.json?.data?.userId === 'string' && reg.json.data.userId.length > 0);
    assert('注册返回 username 一致', reg.json?.data?.username === username);

    const dup = await callEndpoint('POST', '/api/auth/register', { username, password });
    assert('重复注册返回 409', dup.status === 409, `实际: ${dup.status}`);
    assert('重复注册 ok=false', dup.json?.ok === false);

    const badName = await callEndpoint('POST', '/api/auth/register', { username: 'a', password });
    assert('非法用户名返回 400', badName.status === 400, `实际: ${badName.status}`);

    const login = await callEndpoint('POST', '/api/auth/login', { username, password });
    assert('登录返回 200', login.status === 200, `实际: ${login.status}`);
    assert('登录 ok=true', login.json?.ok === true);
    assert('登录返回 token', typeof login.json?.data?.token === 'string' && login.json.data.token.length > 0);
    assert('登录 userId 与注册一致', login.json?.data?.userId === reg.json?.data?.userId);

    const badLogin = await callEndpoint('POST', '/api/auth/login', { username, password: 'wrong-password' });
    assert('错误密码返回 401', badLogin.status === 401, `实际: ${badLogin.status}`);
    assert('错误密码 ok=false', badLogin.json?.ok === false);

    const me = await callEndpoint('POST', '/api/auth/me', { token: login.json?.data?.token });
    assert('令牌校验返回 200', me.status === 200, `实际: ${me.status}`);
    assert('令牌校验 ok=true', me.json?.ok === true);
    assert('令牌校验 userId 一致', me.json?.data?.userId === reg.json?.data?.userId);

    const tampered = await callEndpoint('POST', '/api/auth/me', {
      token: `${login.json?.data?.token?.slice(0, -4)}aaaa`,
    });
    assert('篡改令牌返回 401', tampered.status === 401, `实际: ${tampered.status}`);

    const noToken = await callEndpoint('POST', '/api/auth/me', {});
    assert('缺少令牌返回 401', noToken.status === 401, `实际: ${noToken.status}`);
  }
  console.log('');

  // 汇总
  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;
  console.log('=== 冒烟测试汇总 ===');
  console.log(`通过: ${passed} / ${results.length}`);
  if (failed > 0) {
    console.log(`失败: ${failed}`);
    results.filter((r) => !r.ok).forEach((r) => {
      console.log(`  ✗ ${r.name}${r.detail ? `: ${r.detail}` : ''}`);
    });
    process.exit(1);
  } else {
    console.log('全部通过');
  }
}

// 主流程：启动临时服务 -> 运行测试 -> 关闭服务
async function main() {
  // 账户数据指向临时目录：冒烟测试的注册/登录绝不写入真实 server/data/users.json
  const authDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'invoice-auth-smoke-'));
  process.env.AUTH_DATA_DIR = authDataDir;

  const port = resolveBackendPort();
  const server = createServer();

  // 启动服务
  await new Promise((resolve) => {
    server.listen(port, DEFAULT_HOST, () => {
      console.log(`临时后端服务启动于 http://${DEFAULT_HOST}:${port}`);
      console.log('');
      resolve();
    });
  });

  try {
    await runSmokeTests();
  } finally {
    // 确保服务关闭
    server.close();
    // 给 server.close 一点时间完成关闭
    await new Promise((resolve) => setTimeout(resolve, 200));
    // 清理临时账户数据目录
    try {
      fs.rmSync(authDataDir, { recursive: true, force: true });
    } catch {
      // 清理失败不影响结果
    }
  }
}

main().catch((err) => {
  console.error('冒烟测试执行失败:', err);
  process.exit(1);
});
