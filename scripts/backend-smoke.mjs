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
import { classifyOcrApiResponse } from '../server/tencentOcrClient.mjs';

// 测试结果收集
const results = [];

// 冒烟用登录令牌：OCR/DeepSeek 等受保护接口需要 Authorization 头
let smokeToken = '';
// 段 7 注册的普通用户名：段 8 用于验证非管理员 403
let normalUsername = '';

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
  console.log('[1/8] GET /health');
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
  console.log('[2/8] POST /api/tencent/ocr/invoice');
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
  console.log('[3/8] POST /api/tencent/invoice/verify');
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
  console.log('[4/8] GET /nonexistent（应返回 404）');
  {
    const res = await callEndpoint('GET', '/nonexistent');
    assert('状态码 404', res.status === 404, `实际: ${res.status}`);
    assert('返回 ok=false', res.json?.ok === false);
    assert('包含 errorCode', typeof res.json?.errorCode === 'string');
    assert('包含 traceId', typeof res.json?.traceId === 'string' && res.json.traceId.length > 0);
  }
  console.log('');

  // 5. 错误场景：方法不对
  console.log('[5/8] DELETE /health（应返回 405）');
  {
    const res = await callEndpoint('DELETE', '/health');
    assert('状态码 405', res.status === 405, `实际: ${res.status}`);
    assert('返回 ok=false', res.json?.ok === false);
    assert('errorCode=METHOD_NOT_ALLOWED', res.json?.errorCode === 'METHOD_NOT_ALLOWED');
    assert('包含 traceId', typeof res.json?.traceId === 'string' && res.json.traceId.length > 0);
  }
  console.log('');

  // 6. 错误场景：非法 JSON
  console.log('[6/8] POST /api/tencent/ocr/invoice 非法 JSON');
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
  console.log('[7/8] 账户系统 /api/auth/*');
  {
    const username = `smoke_${Date.now().toString(36)}`;
    normalUsername = username;
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

    // 角色断言：本段用户晚于段 0 的冒烟账户注册，应为普通用户
    assert('第二个注册的用户角色为 user', reg.json?.data?.role === 'user', `实际: ${reg.json?.data?.role}`);
  }
  console.log('');

  // 8. 管理员密钥配置接口（段 0 的冒烟账户是临时库的第一个用户 = 管理员）
  console.log('[8/8] 管理员密钥配置 /api/admin/keys/*');
  {
    const port = resolveBackendPort();
    const base = `http://${DEFAULT_HOST}:${port}`;

    // 无令牌 → 401
    const noAuth = await fetch(`${base}/api/admin/keys/status`);
    assert('密钥状态无令牌返回 401', noAuth.status === 401, `实际: ${noAuth.status}`);

    // 普通用户（段 7 注册的 smoke 账户）→ 403
    const normalLogin = await callEndpoint('POST', '/api/auth/login', {
      username: normalUsername,
      password: 'smoke-pass-123',
    });
    const normalRes = await fetch(`${base}/api/admin/keys/status`, {
      headers: { Authorization: `Bearer ${normalLogin.json?.data?.token}` },
    });
    assert('普通用户访问密钥接口返回 403', normalRes.status === 403, `实际: ${normalRes.status}`);

    // 管理员（smokeToken）→ 200，初始未配置
    const status1 = await callEndpoint('GET', '/api/admin/keys/status');
    assert('管理员读取状态返回 200', status1.status === 200, `实际: ${status1.status}`);
    assert('初始 DeepSeek 未配置', status1.json?.data?.deepseek?.configured === false);
    assert('初始腾讯云未配置', status1.json?.data?.tencent?.configured === false);

    // 密钥连通性测试接口：未配置时直接返回 not_configured，不发起真实外网调用
    const dsTest = await callEndpoint('POST', '/api/admin/keys/deepseek/test', {});
    assert('DeepSeek 测试接口（未配置）返回 200', dsTest.status === 200, `实际: ${dsTest.status}`);
    assert('DeepSeek 测试接口返回 not_configured', dsTest.json?.data?.status === 'not_configured', `实际: ${dsTest.json?.data?.status}`);
    assert('DeepSeek 测试接口包含 message', typeof dsTest.json?.message === 'string' && dsTest.json.message.length > 0);

    const tcTest = await callEndpoint('POST', '/api/admin/keys/tencent/test', {});
    assert('腾讯云测试接口（未配置）返回 200', tcTest.status === 200, `实际: ${tcTest.status}`);
    assert('腾讯云测试接口返回 not_configured', tcTest.json?.data?.status === 'not_configured', `实际: ${tcTest.json?.data?.status}`);
    assert('腾讯云测试接口包含 message', typeof tcTest.json?.message === 'string' && tcTest.json.message.length > 0);

    // 普通用户调用测试接口 → 403
    const normalTest = await fetch(`${base}/api/admin/keys/deepseek/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${normalLogin.json?.data?.token}` },
      body: '{}',
    });
    assert('普通用户调用测试接口返回 403', normalTest.status === 403, `实际: ${normalTest.status}`);

    // 非法 DeepSeek Key → 400
    const badKey = await callEndpoint('POST', '/api/admin/keys/deepseek', { apiKey: 'not-a-valid-key' });
    assert('非法 DeepSeek Key 返回 400', badKey.status === 400, `实际: ${badKey.status}`);

    // 合法形态假 Key → 200 且状态翻转（假输入仅验证链路，存于临时目录）
    const fakeDeepseek = `sk-${'a'.repeat(24)}`;
    const saveDs = await callEndpoint('POST', '/api/admin/keys/deepseek', { apiKey: fakeDeepseek, model: 'deepseek-v4-flash' });
    assert('保存 DeepSeek 密钥返回 200', saveDs.status === 200, `实际: ${saveDs.status}`);
    assert('保存后不回显密钥值', saveDs.json?.data?.apiKeyStored === true && saveDs.json?.data?.apiKeyValid === true);

    // 非法腾讯云 SecretId → 400
    const badTencent = await callEndpoint('POST', '/api/admin/keys/tencent', { secretId: 'BAD', secretKey: 'BAD' });
    assert('非法腾讯云密钥返回 400', badTencent.status === 400, `实际: ${badTencent.status}`);

    // 合法形态假密钥 → 200，状态翻转且只返回掩码
    const saveTc = await callEndpoint('POST', '/api/admin/keys/tencent', {
      secretId: `AKID${'b'.repeat(32)}`,
      secretKey: 'c'.repeat(32),
    });
    assert('保存腾讯云密钥返回 200', saveTc.status === 200, `实际: ${saveTc.status}`);
    const status2 = await callEndpoint('GET', '/api/admin/keys/status');
    assert('保存后 DeepSeek 已配置', status2.json?.data?.deepseek?.configured === true);
    assert('保存后腾讯云已配置', status2.json?.data?.tencent?.configured === true);
    assert('腾讯云状态只返回掩码', typeof status2.json?.data?.tencent?.secretIdMasked === 'string' && status2.json.data.tencent.secretIdMasked.includes('****'));
  }
  console.log('');

  // 9. OCR 响应分类回归：腾讯云以 HTTP 200 + Response.Error 返回鉴权/业务错误
  //    （曾因此把密钥错误误判为识别成功，前端拿到空数据表现为"导入无反应"）
  console.log('[9/10] OCR 响应分类 classifyOcrApiResponse');
  {
    const authFail = classifyOcrApiResponse(200, {
      Response: { Error: { Code: 'AuthFailure.SecretIdNotFound', Message: 'The SecretId is not found.' } },
    });
    assert('HTTP 200 + AuthFailure 判定为失败', authFail.ok === false);
    assert('AuthFailure 透出原始错误信息', String(authFail.message).includes('SecretId'), `实际: ${authFail.message}`);

    const bizFail = classifyOcrApiResponse(200, {
      Response: { Error: { Code: 'InvalidParameter.ImageError', Message: '图片无法解码。' } },
    });
    assert('HTTP 200 + 业务 Error 判定为失败', bizFail.ok === false);

    const realOk = classifyOcrApiResponse(200, {
      Response: { VatInvoiceInfos: [{ Name: '发票号码', Value: '10012001' }], RequestId: 'req-1' },
    });
    assert('真实成功（无 Error）判定为成功', realOk.ok === true);

    const httpErr = classifyOcrApiResponse(500, null);
    assert('HTTP 5xx 判定为失败', httpErr.ok === false && String(httpErr.message).includes('500'));
  }
  console.log('');

  // 10. 会话密钥制接口：请求级凭据测试 + AI 验真/凭证（未配置时 not_configured，不打真实外网）
  console.log('[10/10] 会话密钥 /api/keys/test/* 与 /api/deepseek/verify|voucher');
  {
    // 未带令牌 → 401
    const noAuth = await fetch(`http://${DEFAULT_HOST}:${resolveBackendPort()}/api/keys/test/tencent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    assert('会话密钥测试无令牌返回 401', noAuth.status === 401, `实际: ${noAuth.status}`);

    // 登录用户 + 无凭据 → 结构化结果（注：第 8 段可能已向临时库存入假密钥，
    // 此时回退服务器配置发起真实调用，返回 auth_failed/timeout 均属预期链路行为）
    const tcTest = await callEndpoint('POST', '/api/keys/test/tencent', {});
    assert('腾讯云会话测试返回 200', tcTest.status === 200, `实际: ${tcTest.status}`);
    assert('腾讯云会话测试返回结构化状态', typeof tcTest.json?.data?.status === 'string' && tcTest.json.data.status.length > 0, `实际: ${tcTest.json?.data?.status}`);
    assert('腾讯云会话测试包含 message', typeof tcTest.json?.message === 'string' && tcTest.json.message.length > 0);

    const dsTest = await callEndpoint('POST', '/api/keys/test/deepseek', {});
    assert('DeepSeek 会话测试返回结构化状态', typeof dsTest.json?.data?.status === 'string' && dsTest.json.data.status.length > 0, `实际: ${dsTest.json?.data?.status}`);

    // 携带格式合法的假凭据 → 发起真实调用并返回鉴权失败（外网可达时 AuthFailure；不可达时超时/错误，两者都算链路通）
    const fakePair = await callEndpoint('POST', '/api/keys/test/tencent', {
      secretId: `AKID${'b'.repeat(32)}`,
      secretKey: 'c'.repeat(32),
    });
    assert('携带会话凭据测试返回结构化结果', typeof fakePair.json?.data?.status === 'string' && fakePair.json.data.status !== 'not_configured', `实际: ${fakePair.json?.data?.status}`);

    // AI 验真：无会话密钥时回退服务器配置（第 8 段假密钥）→ not_configured 或真实调用失败，均证明路由通
    const verify = await callEndpoint('POST', '/api/deepseek/verify', {
      invoice: { invoiceNumber: '10012001', invoiceCode: '044002600111', issueDate: '2026-07-12', amount: 100, taxAmount: 6, totalAmount: 106 },
    });
    assert('AI 验真返回 200 且结构化', verify.status === 200 && ['not_configured', 'failed'].includes(verify.json?.status), `实际: ${verify.status}/${verify.json?.status}`);

    // AI 验真：确定性规则硬伤（发票号 5 位）不需要密钥即可出结论 → 验真失败
    const verifyRule = await callEndpoint('POST', '/api/deepseek/verify', {
      invoice: { invoiceNumber: '12345', amount: 100, taxAmount: 6, totalAmount: 106 },
    });
    assert('规则硬伤走确定性分支返回验真失败', verifyRule.json?.data?.mappedStatus === '验真失败', `实际: ${verifyRule.json?.data?.mappedStatus}`);
    assert('规则核验返回 findings', Array.isArray(verifyRule.json?.data?.findings) && verifyRule.json.data.findings.length > 0);

    // 确定性规则回归（官方出处见 docs/验真与凭证规则设计.md）：
    // 数电票号码年度位(23) ≠ 开票年份(26) → 硬伤
    const verifyYear = await callEndpoint('POST', '/api/deepseek/verify', {
      invoice: { invoiceNumber: '23310100000000000001', issueDate: '2026-08-01', amount: 100, taxAmount: 6, totalAmount: 106 },
    });
    assert('数电票年度位矛盾判验真失败', verifyYear.json?.data?.mappedStatus === '验真失败', `实际: ${verifyYear.json?.data?.mappedStatus}`);
    assert('年度位矛盾 findings 引用具体值', JSON.stringify(verifyYear.json?.data?.findings).includes('23'));

    // 数电票不应带发票代码 → 版式矛盾提示
    const verifyDigitalCode = await callEndpoint('POST', '/api/deepseek/verify', {
      invoice: { invoiceNumber: '26310100000000000001', invoiceCode: '044002600111', issueDate: '2026-08-01', amount: 100, taxAmount: 6, totalAmount: 106 },
    });
    assert('数电票带代码给出矛盾提示', JSON.stringify(verifyDigitalCode.json?.data?.findings).includes('发票代码'), `实际: ${JSON.stringify(verifyDigitalCode.json?.data?.findings).slice(0, 100)}`);

    // 12 位代码年度位(19)与开票日期(26)矛盾 → 硬伤
    const verifyCodeYear = await callEndpoint('POST', '/api/deepseek/verify', {
      invoice: { invoiceNumber: '10012001', invoiceCode: '044019600111', issueDate: '2026-08-01', amount: 100, taxAmount: 6, totalAmount: 106 },
    });
    assert('12位代码年度位矛盾判验真失败', verifyCodeYear.json?.data?.mappedStatus === '验真失败', `实际: ${verifyCodeYear.json?.data?.mappedStatus}`);

    // 税率区间外（17% 已废止）→ 提示但不硬失败（勾稽正常）
    const verifyRate = await callEndpoint('POST', '/api/deepseek/verify', {
      invoice: { invoiceNumber: '10012001', invoiceCode: '044026000111', issueDate: '2026-08-01', amount: 100, taxAmount: 6, totalAmount: 106, taxRate: '17%' },
    });
    assert('税率区间外给出提示', JSON.stringify(verifyRate.json?.data?.findings).includes('17%'), `实际: ${JSON.stringify(verifyRate.json?.data?.findings).slice(0, 120)}`);

    // AI 凭证：无会话密钥 → not_configured 或回退假密钥失败（前端回退本地规则）
    const voucher = await callEndpoint('POST', '/api/deepseek/voucher', {
      invoice: { invoiceNumber: '10012001', amount: 100, taxAmount: 6, totalAmount: 106, invoiceType: '增值税普通发票' },
      decision: { voucherDraft: { status: '可生成', summary: '' }, accountingConclusion: '建议计入管理费用' },
    });
    assert('AI 凭证返回结构化状态', ['not_configured', 'failed'].includes(voucher.json?.status), `实际: ${voucher.json?.status}`);
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
  // 密钥加密存储同样指向临时目录：管理员密钥接口测试不污染 server/ 下的真实凭据文件
  const credDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'invoice-cred-smoke-'));
  process.env.CREDENTIAL_DATA_DIR = credDataDir;

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
    // 清理临时账户/凭据数据目录
    for (const dir of [authDataDir, credDataDir]) {
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch {
        // 清理失败不影响结果
      }
    }
  }
}

main().catch((err) => {
  console.error('冒烟测试执行失败:', err);
  process.exit(1);
});
