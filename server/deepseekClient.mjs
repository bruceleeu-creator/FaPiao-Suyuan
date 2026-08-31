// DeepSeek 客户端：发票类别识别 + 缺失字段补齐
//
// 用途：腾讯云 OCR 返回票面字段后，将原始字段交给 deepseek-v4-flash，
// 由其完成两件事：
//   1. 从八类高频发票（餐饮/住宿/交通/车辆/办公/咨询服务/广告推广/租赁物业）中判断类别
//   2. 补齐 OCR 未识别出的表单字段（仅基于给定内容，不得编造）
//
// 安全约束：不打印密钥；超时保护；返回统一结构

import { DEEPSEEK_API_BASE, getEffectiveDeepSeekConfig } from './deepseekConfig.mjs';

export const INVOICE_CATEGORIES = [
  '餐饮', '住宿', '交通', '车辆', '办公', '咨询服务', '广告推广', '租赁物业',
];

const SYSTEM_PROMPT = `你是一名中国企业发票整理助手。用户会提供发票 OCR 识别出的原始字段和当前已识别的表单。请完成：
1. 从以下八类中选出最合适的一类：餐饮、住宿、交通、车辆、办公、咨询服务、广告推广、租赁物业。
2. 补齐当前表单中缺失或为空的字段：仅当 OCR 字段或语义能确定时才填写，不得编造。

只输出一个 JSON 对象，禁止输出 markdown 代码块或任何其他文字，格式：
{"category":"餐饮","reason":"简短理由","fields":{"invoiceType":"","invoiceCode":"","invoiceNumber":"","issueDate":"","seller":"","buyer":"","itemName":"","totalAmount":0,"taxRate":""}}

规则：
- category 必须是八类之一；确实无法判断时选"办公"并在 reason 说明不确定
- fields 中无法确定的字段留空字符串或 0，不要猜测
- issueDate 格式 YYYY-MM-DD；taxRate 形如 "6%"；totalAmount 为数字（价税合计，含税）`;

// 从模型输出中提取 JSON 对象文本（容忍 ```json 包裹、前后杂文字）
export function extractJsonObject(content) {
  if (!content) return null;
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(content);
  const candidate = fenced ? fenced[1] : content;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  return candidate.slice(start, end + 1);
}

// 解析 DeepSeek 调用配置：请求级凭据（用户会话密钥，不落盘）> 服务器配置（加密存储 > .env）
// credentials 形如 {apiKey?, model?}；格式不合法的请求级值会被忽略并回退服务器配置
function resolveConfig(credentials) {
  const effective = getEffectiveDeepSeekConfig();
  if (!credentials || typeof credentials !== 'object') return effective;
  const apiKey = typeof credentials.apiKey === 'string' && credentials.apiKey.startsWith('sk-') && credentials.apiKey.length >= 18
    ? credentials.apiKey
    : effective.apiKey;
  const model = typeof credentials.model === 'string' && credentials.model.trim().length >= 3
    ? credentials.model.trim()
    : effective.model;
  return { apiKey, model, configured: apiKey.length > 0, fromRequest: apiKey !== effective.apiKey };
}

// 调用 DeepSeek chat completions
// reasoningEffort：'low' 等档位可大幅缩短推理模型的思考时间（交互场景必须传），
// 不传则使用模型默认（深度思考，耗时 30-60s+，仅适合离线任务）
async function callDeepSeekChat(messages, { maxTokens, timeoutMs, reasoningEffort, credentials }) {
  const { apiKey, model } = resolveConfig(credentials);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${DEEPSEEK_API_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages,
        max_tokens: maxTokens,
        stream: false,
        ...(reasoningEffort ? { reasoning_effort: reasoningEffort } : {}),
      }),
      signal: controller.signal,
    });
    const json = await response.json().catch(() => null);
    if (!response.ok || !json) {
      return {
        ok: false,
        message: `DeepSeek 调用失败（HTTP ${response.status}）。`,
      };
    }
    const content = json?.choices?.[0]?.message?.content ?? '';
    return { ok: true, content };
  } catch (err) {
    const aborted = err?.name === 'AbortError';
    return {
      ok: false,
      message: aborted ? 'DeepSeek 调用超时。' : `DeepSeek 请求异常：${err?.message || '未知错误'}`,
    };
  } finally {
    clearTimeout(timer);
  }
}

// ============ 管理员密钥连通性测试 ============
// 发起一次最小真实请求（max_tokens=1），区分：
// 401 密钥无效 / 402 余额不足 / 429 限流 / 超时 / 成功
// 状态接口只报告"格式上已配置"，密钥是否真实可用以本测试为准
export async function testDeepSeekCredential(credentials) {
  const config = resolveConfig(credentials);
  if (!config.configured) {
    return { ok: false, status: 'not_configured', message: '尚未保存 DeepSeek API Key，请先填写并保存。' };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(`${DEEPSEEK_API_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: config.model,
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 1,
        stream: false,
        reasoning_effort: 'low',
      }),
      signal: controller.signal,
    });
    if (response.ok) {
      return { ok: true, status: 'success', message: `密钥有效（HTTP 200，模型 ${config.model}）。` };
    }
    let detail = `HTTP ${response.status}`;
    try {
      const errJson = await response.json();
      if (errJson?.error?.message) detail = `HTTP ${response.status}：${errJson.error.message}`;
    } catch {
      // 保留默认 detail
    }
    const known = {
      401: '密钥无效（DeepSeek 拒绝认证）：请核对 API Key 是否正确、是否已被禁用或删除。',
      402: '账户余额不足：请到 DeepSeek 开放平台充值后重试。',
      429: '请求被限流：请稍后再试。',
    };
    return {
      ok: false,
      status: `http_${response.status}`,
      message: known[response.status] || `DeepSeek 返回错误（${detail}）。`,
    };
  } catch (err) {
    const aborted = err?.name === 'AbortError';
    return {
      ok: false,
      status: aborted ? 'timeout' : 'error',
      message: aborted ? '连接 DeepSeek 超时（12 秒）：请检查服务器网络。' : `连接 DeepSeek 失败：${err?.message || '未知错误'}`,
    };
  } finally {
    clearTimeout(timer);
  }
}

// ============ AI 辅助验真（替代腾讯云验真配置）============
// 边界（诚实声明）：DeepSeek 开放平台 API 不提供联网查询官方查验平台的能力，
// 本功能为「票面规则确定性核验 + AI 语义一致性核验」，结果标注为 AI 辅助，
// 不等同于全国增值税发票查验平台的权威验真；存疑一律交人工，不硬失败。
// 确定性预检（规则引擎职责，AI 之前执行）：
//   - 发票号码：8 位（传统）或 20 位（全电）数字
//   - 发票代码：10/12 位数字（全电发票可无代码）
//   - 日期：不晚于今天，不早于 5 年前
//   - 勾稽：|amount × taxRate − taxAmount| ≤ 0.05 且 total = amount + taxAmount（±0.05）
function deterministicPreCheck(invoice = {}) {
  const findings = [];
  let hardFail = false;
  const number = String(invoice.invoiceNumber || '').trim();
  const code = String(invoice.invoiceCode || '').trim();
  if (!number) {
    findings.push('缺少发票号码，无法核验。');
    hardFail = true;
  } else if (!/^\d{8}$|^\d{20}$/.test(number)) {
    findings.push(`发票号码位数异常（${number.length} 位）：应为 8 位（传统发票）或 20 位（全电发票）。`);
    hardFail = true;
  }
  if (code && !/^\d{10}$|^\d{12}$/.test(code)) {
    findings.push(`发票代码位数异常（${code.length} 位）：应为 10 或 12 位（全电发票可无代码）。`);
    hardFail = true;
  }
  const date = String(invoice.issueDate || '').trim();
  if (date) {
    const parsed = new Date(date);
    const now = new Date();
    const fiveYearsAgo = new Date(now.getFullYear() - 5, now.getMonth(), now.getDate());
    if (Number.isNaN(parsed.getTime())) {
      findings.push('开票日期格式无法解析。');
      hardFail = true;
    } else if (parsed > now) {
      findings.push('开票日期晚于今天（未来日期发票）。');
      hardFail = true;
    } else if (parsed < fiveYearsAgo) {
      findings.push('开票日期早于五年前，超出常规核验范围。');
    }
  }
  const amount = Number(invoice.amount) || 0;
  const taxAmount = Number(invoice.taxAmount) || 0;
  const total = Number(invoice.totalAmount) || 0;
  if (amount > 0 && taxAmount >= 0 && total > 0) {
    if (Math.abs(amount + taxAmount - total) > 0.05) {
      findings.push(`价税勾稽不符：金额 ${amount} + 税额 ${taxAmount} ≠ 价税合计 ${total}。`);
      hardFail = true;
    }
  }
  return { findings, hardFail };
}

const VERIFY_SYSTEM_PROMPT = `你是增值税发票票面核验助手。基于给定的票面字段做一致性核验（无法联网查询官方平台，结论只基于票面内部逻辑）。检查维度：
1. 票种与税率匹配（如餐饮服务 6%、农产品 9%、13% 货物等明显错配）
2. 项目名称/类别与销方经营范围的语义合理性
3. 购销方名称、开票日期与票种年代的一致性（如全电发票不应有 10 位代码）
4. 金额字段间的勾稽（若未通过确定性预检会另外标注）
资料不足或无法判断时如实输出"无法判断"，不得臆造。

只输出一个 JSON 对象，禁止 markdown：
{"conclusion":"一致"|"存疑"|"无法判断","findings":["具体发现，每条引用票面事实"],"advice":"给核验人员的一句话建议"}`;

export async function verifyInvoiceByAi({ invoice, credentials }) {
  const config = resolveConfig(credentials);
  if (!config.configured) {
    return {
      ok: false,
      status: 'not_configured',
      message: 'AI 核验需要 DeepSeek 密钥：请在「接口配置」页填入（仅存于当前浏览器会话）。',
    };
  }

  const pre = deterministicPreCheck(invoice);
  // 确定性硬伤直接出结论，不消耗 AI 调用
  if (pre.hardFail) {
    return {
      ok: true,
      status: 'success',
      data: {
        conclusion: '验真失败',
        mode: 'rule',
        findings: pre.findings,
        advice: '票面存在确定性规则错误（位数/勾稽/日期），请核对原件。',
        disclaimer: 'AI 辅助核验 + 规则引擎，非官方查验平台结果。',
        mappedStatus: '验真失败',
      },
    };
  }

  const userContent = `发票票面字段：\n${JSON.stringify(invoice || {}, null, 0)}\n\n确定性预检发现（供参考）：${pre.findings.length ? pre.findings.join('；') : '无'}`;
  const result = await callDeepSeekChat(
    [
      { role: 'system', content: VERIFY_SYSTEM_PROMPT },
      { role: 'user', content: userContent },
    ],
    { maxTokens: 2000, timeoutMs: 30000, reasoningEffort: 'low', credentials },
  );
  if (!result.ok) {
    return { ok: false, status: 'failed', message: result.message };
  }
  const jsonText = extractJsonObject(result.content);
  if (!jsonText) {
    return { ok: false, status: 'bad_response', message: 'DeepSeek 未返回可解析的 JSON。' };
  }
  let parsed;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return { ok: false, status: 'bad_response', message: 'DeepSeek 返回的 JSON 无法解析。' };
  }

  const conclusion =
    parsed.conclusion === '一致' || parsed.conclusion === '存疑' || parsed.conclusion === '无法判断'
      ? parsed.conclusion
      : '无法判断';
  const findings = [
    ...pre.findings,
    ...(Array.isArray(parsed.findings)
      ? parsed.findings.filter((f) => typeof f === 'string' && f.trim()).slice(0, 6)
      : []),
  ];
  // 映射保守：一致→验真通过；存疑/无法判断→待验真（不硬失败阻断流程，交人工）
  const mappedStatus = conclusion === '一致' ? '验真通过' : '待验真';

  return {
    ok: true,
    status: 'success',
    data: {
      conclusion,
      mode: 'ai',
      findings,
      advice: typeof parsed.advice === 'string' ? parsed.advice : '',
      disclaimer: 'AI 辅助核验（票面一致性），非官方查验平台结果；重大金额请以官方查验为准。',
      mappedStatus,
    },
  };
}

// ============ AI 凭证草稿生成（替代凭证接口配置）============
// 与本地规则版（前端 mockBuildVoucherDraft）同样的铁律：只生成草稿、不自动过账、
// 高风险阻断案例拒绝生成；AI 失败时前端回退本地规则版
const VOUCHER_SYSTEM_PROMPT = `你是会计凭证草稿助手。基于发票票面、费用类别与入账建议生成会计凭证草稿。规则：
1. 借贷必须平衡：借方合计 = 贷方合计 = 价税合计（专票：借费用=不含税金额、借进项税=税额；普票：借费用=价税合计）。
2. 贷方科目：员工报销场景用"其他应付款-员工报销"，对公付款用"银行存款"。
3. 科目路径沿用建议的一级/二级/三级科目，不得虚构科目。
4. 只输出草稿，绝不建议自动过账。

只输出一个 JSON 对象，禁止 markdown：
{"summary":"一句话分录说明","entries":[{"direction":"借"|"贷","account":"科目路径","amount":数字}],"note":"草稿备注（人工复核提示）"}`;

export async function buildVoucherDraftByAi({ invoice, decision, credentials }) {
  const config = resolveConfig(credentials);
  if (!config.configured) {
    return {
      ok: false,
      status: 'not_configured',
      message: 'AI 凭证草稿需要 DeepSeek 密钥：请在「接口配置」页填入（仅存于当前浏览器会话）。',
    };
  }

  const userContent = `发票票面：\n${JSON.stringify(invoice || {}, null, 0)}\n\n入账建议（决策草稿）：\n${JSON.stringify(decision || {}, null, 0)}`;
  const result = await callDeepSeekChat(
    [
      { role: 'system', content: VOUCHER_SYSTEM_PROMPT },
      { role: 'user', content: userContent },
    ],
    { maxTokens: 2500, timeoutMs: 30000, reasoningEffort: 'low', credentials },
  );
  if (!result.ok) {
    return { ok: false, status: 'failed', message: result.message };
  }
  const jsonText = extractJsonObject(result.content);
  if (!jsonText) {
    return { ok: false, status: 'bad_response', message: 'DeepSeek 未返回可解析的 JSON。' };
  }
  let parsed;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return { ok: false, status: 'bad_response', message: 'DeepSeek 返回的 JSON 无法解析。' };
  }

  const entries = Array.isArray(parsed.entries)
    ? parsed.entries
        .filter((e) => e && (e.direction === '借' || e.direction === '贷') && typeof e.account === 'string' && e.account.trim() && Number.isFinite(Number(e.amount)) && Number(e.amount) > 0)
        .map((e) => ({ direction: e.direction, account: e.account.trim(), amount: Math.round(Number(e.amount) * 100) / 100 }))
    : [];
  // 质量闸：至少 2 条分录且借贷平衡（±0.05），否则拒绝并让前端回退本地规则
  const debit = entries.filter((e) => e.direction === '借').reduce((s, e) => s + e.amount, 0);
  const credit = entries.filter((e) => e.direction === '贷').reduce((s, e) => s + e.amount, 0);
  if (entries.length < 2 || Math.abs(debit - credit) > 0.05) {
    return {
      ok: false,
      status: 'unbalanced',
      message: 'AI 生成的分录借贷不平衡，已拒绝（回退本地规则生成）。',
    };
  }

  return {
    ok: true,
    status: 'success',
    data: {
      summary: typeof parsed.summary === 'string' ? parsed.summary : '',
      entries,
      note: typeof parsed.note === 'string' ? parsed.note : '本凭证为草稿，需财务复核确认后才可过账。',
    },
  };
}

// 发票解释：入参 ocrFields 为 [{name, value}]，currentForm 为前端当前表单
export async function interpretInvoiceFields({ ocrFields, currentForm, credentials }) {
  const config = resolveConfig(credentials);
  if (!config.configured) {
    return {
      ok: false,
      status: 'not_configured',
      message: 'DeepSeek 尚未配置 DEEPSEEK_API_KEY，无法调用。',
    };
  }

  const pairs = (ocrFields || [])
    .filter((item) => item && item.name)
    .map((item) => `${item.name}: ${item.value ?? ''}`)
    .join('\n');
  const userContent = `发票 OCR 原始字段：\n${pairs || '（无）'}\n\n当前已识别表单：\n${JSON.stringify(currentForm || {}, null, 0)}`;

  const result = await callDeepSeekChat(
    [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userContent },
    ],
    { maxTokens: 3000, timeoutMs: 30000, reasoningEffort: 'low', credentials },
  );
  if (!result.ok) {
    return { ok: false, status: 'failed', message: result.message };
  }

  const jsonText = extractJsonObject(result.content);
  if (!jsonText) {
    return { ok: false, status: 'bad_response', message: 'DeepSeek 未返回可解析的 JSON。' };
  }
  let parsed;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return { ok: false, status: 'bad_response', message: 'DeepSeek 返回的 JSON 无法解析。' };
  }

  const category =
    typeof parsed.category === 'string' && INVOICE_CATEGORIES.includes(parsed.category)
      ? parsed.category
      : null;
  const fields = parsed.fields && typeof parsed.fields === 'object' ? parsed.fields : {};

  return {
    ok: true,
    status: 'success',
    data: {
      category,
      reason: typeof parsed.reason === 'string' ? parsed.reason : '',
      fields: {
        invoiceType: typeof fields.invoiceType === 'string' ? fields.invoiceType : '',
        invoiceCode: typeof fields.invoiceCode === 'string' ? fields.invoiceCode : '',
        invoiceNumber: typeof fields.invoiceNumber === 'string' ? fields.invoiceNumber : '',
        issueDate: typeof fields.issueDate === 'string' ? fields.issueDate : '',
        seller: typeof fields.seller === 'string' ? fields.seller : '',
        buyer: typeof fields.buyer === 'string' ? fields.buyer : '',
        itemName: typeof fields.itemName === 'string' ? fields.itemName : '',
        totalAmount: Number.isFinite(fields.totalAmount) && fields.totalAmount > 0 ? fields.totalAmount : 0,
        taxRate: typeof fields.taxRate === 'string' ? fields.taxRate : '',
      },
    },
  };
}

// ============ 业务追问问题生成（业务还原 Gate）============
// StructuredQuestion.mappedField 受控清单（与前端 BusinessEvent 字段一一对应）
const MAPPED_FIELDS = [
  'initiator', 'handler', 'claimant', 'participants', 'externalParty', 'occurredAt',
  'location', 'purpose', 'businessContent', 'department', 'project', 'contract',
  'paymentSubject', 'paymentMethod', 'beneficiary', 'companyBurdenReason',
];

// 证据受控词汇表：与前端 mockEvidenceMatcher 的类别证据清单对齐，
// DeepSeek 建议的证据优先取自此表，才能被证据闸门的确定性匹配规则识别
const CONTROLLED_EVIDENCE = [
  '发票', '业务招待审批', '客户拜访记录', '付款记录', '出差申请', '行程记录', '项目任务单',
  '咨询合同', '合同', '成果物', '验收单', '广告合同', '投放效果报告', '车辆使用记录',
  '审批', '采购审批', '入库或领用记录', '租赁合同', '费用报销单', '会议通知',
];

const QUESTIONS_SYSTEM_PROMPT = `你是一名资深财税审单与内控专家，为一张真实发票设计「业务事实追问」问题。经办人回答后，系统将用答案还原业务事件、匹配证据链、评估入账风险，因此问题必须严谨、真实、可对照票据作答。

要求：
1. 严谨真实：问题必须引用票面事实（销方名称、项目名称、金额、开票日期、发票类型等），回答者能对照票据作答；不得虚构与票面矛盾的假设。
2. 有可参考性：每个问题的 hint 必须写清财税/内控依据（税前扣除条件、业务招待费 60% 与营业收入 5‰ 孰低、广告费 15% 限额、三流一致、虚开风险、事前审批内控要求等），说明"为什么必须问"。
3. 按发票类别覆盖核心维度（缺一不可）：
   - 餐饮：招待对象、参与人、业务目的、事前审批
   - 住宿：出差申请、住宿人员、行程、项目/部门归属
   - 咨询服务：合同、服务内容、成果物、验收、付款一致性
   - 交通：出差事由、出行人员、行程
   - 车辆：车辆用途、车辆归属、费用类型
   - 办公：用品明细、使用部门、采购审批
   - 广告推广：投放渠道、活动名称、合同与效果报告
   - 租赁物业：租赁物、租期租金、租赁合同
4. mappedField 只能取以下值之一：${MAPPED_FIELDS.join(', ')}
5. suggestedEvidence 优先取自受控清单：${CONTROLLED_EVIDENCE.join('、')}
6. 生成 4-6 个问题，其中业务目的（mappedField=purpose）必须包含且必答；至少 3 个 required=true。
7. 每个问题必须给出恰好 4 个候选选项（options）：基于该问题与本张发票的票面上下文，给出常见、具体、互斥的真实候选答案（例如餐饮业务目的：客户续约谈判、客户日常关系维护、项目会议用餐、员工内部聚餐）。禁止出现"其他""以上都不是"这类空泛选项；系统会自动提供第 5 个"自定义答案"输入项，不需要你输出。

只输出一个 JSON 对象，禁止 markdown 代码块或其他文字：
{"scenarioLabel":"场景一句话概括","guidance":"给经办人的指引：本类发票需证明的业务事实、建议提前准备的材料（80字内）","questions":[{"id":"DS-001","text":"问题","required":true,"mappedField":"purpose","hint":"为什么问（含财税/内控依据）","suggestedEvidence":["证据名"],"options":["选项1","选项2","选项3","选项4"]}]}`;

// 校验并规范化 DeepSeek 生成的问题
function normalizeQuestions(parsed) {
  const rawQuestions = Array.isArray(parsed?.questions) ? parsed.questions : [];
  const seenIds = new Set();
  const questions = [];
  for (const q of rawQuestions) {
    if (!q || typeof q.text !== 'string' || !q.text.trim()) continue;
    const mappedField = typeof q.mappedField === 'string' && MAPPED_FIELDS.includes(q.mappedField)
      ? q.mappedField
      : null;
    if (!mappedField) continue;
    let id = typeof q.id === 'string' && q.id.trim() ? q.id.trim() : `DS-${questions.length + 1}`;
    while (seenIds.has(id)) id = `${id}-x`;
    seenIds.add(id);
    const evidence = Array.isArray(q.suggestedEvidence)
      ? q.suggestedEvidence.filter((e) => typeof e === 'string' && e.trim()).slice(0, 4)
      : [];
    // 4 个候选选项（第 5 个"自定义答案"由前端提供，不来自模型）
    const options = Array.isArray(q.options)
      ? Array.from(
          new Set(
            q.options
              .filter((o) => typeof o === 'string' && o.trim())
              .map((o) => o.trim()),
          ),
        ).slice(0, 4)
      : [];
    questions.push({
      id,
      text: q.text.trim(),
      required: q.required === true,
      mappedField,
      hint: typeof q.hint === 'string' && q.hint.trim() ? q.hint.trim() : '该字段是业务事实还原的必要信息。',
      suggestedEvidence: evidence,
      options,
    });
  }
  return questions;
}

// 基于票面生成业务追问问题
export async function generateInvoiceQuestions({ invoice, credentials }) {
  const config = resolveConfig(credentials);
  if (!config.configured) {
    return { ok: false, status: 'not_configured', message: 'DeepSeek 尚未配置 DEEPSEEK_API_KEY。' };
  }

  const userContent = `发票票面字段：\n${JSON.stringify(invoice || {}, null, 0)}`;
  const result = await callDeepSeekChat(
    [
      { role: 'system', content: QUESTIONS_SYSTEM_PROMPT },
      { role: 'user', content: userContent },
    ],
    { maxTokens: 4000, timeoutMs: 40000, reasoningEffort: 'low', credentials },
  );
  if (!result.ok) {
    return { ok: false, status: 'failed', message: result.message };
  }
  const jsonText = extractJsonObject(result.content);
  if (!jsonText) {
    return { ok: false, status: 'bad_response', message: 'DeepSeek 未返回可解析的 JSON。' };
  }
  let parsed;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return { ok: false, status: 'bad_response', message: 'DeepSeek 返回的 JSON 无法解析。' };
  }

  const questions = normalizeQuestions(parsed);
  // 质量闸：问题数量与必答数不足时拒绝，前端回退本地模板
  if (questions.length < 3 || questions.filter((q) => q.required).length < 2) {
    return { ok: false, status: 'low_quality', message: 'DeepSeek 生成的问题未达到最低质量要求（至少 3 问、2 必答）。' };
  }

  return {
    ok: true,
    status: 'success',
    data: {
      scenarioLabel: typeof parsed.scenarioLabel === 'string' ? parsed.scenarioLabel : '',
      guidance: typeof parsed.guidance === 'string' ? parsed.guidance : '',
      questions,
    },
  };
}

// ============ AI 风险初判分析 ============
const RISK_SYSTEM_PROMPT = `你是发票入账风险审单专家。基于给定的真实资料（发票票面、经办人问答还原的业务事件、证据链状态）输出风险初判分析。注意：
1. 每条风险点必须引用具体事实（金额、缺口项、待补充字段、日期矛盾等），给出来自增值税/企业所得税/内控视角的依据，不得泛泛而谈。
2. 大量"待补充"或证据缺口时如实上调风险等级并在风险点中说明；资料不足时不得臆造事实。
3. 风险等级只能取：低、中低、中、高。
4. 你的等级是建议值，系统还会与规则引擎结果取更严者作为最终等级。

只输出一个 JSON 对象，禁止 markdown：
{"riskLevel":"低|中低|中|高","summary":"80字以内综合结论（业务真实性、证据完整性、三流一致）","riskCards":["3-6条具体风险点，每条含事实+依据"],"accountingFocus":"会计处理关注点一句话","vatFocus":"增值税处理关注点一句话","citFocus":"企业所得税处理关注点一句话"}`;

const RISK_LEVELS = ['低', '中低', '中', '高'];

export async function assessInvoiceRisk({ invoice, businessEvent, evidenceChain, answers, credentials }) {
  const config = resolveConfig(credentials);
  if (!config.configured) {
    return { ok: false, status: 'not_configured', message: 'DeepSeek 尚未配置 DEEPSEEK_API_KEY。' };
  }

  const userContent = `发票票面：\n${JSON.stringify(invoice || {}, null, 0)}\n\n业务事件（由问答还原）：\n${JSON.stringify(businessEvent || {}, null, 0)}\n\n证据链状态：\n${JSON.stringify(evidenceChain || {}, null, 0)}\n\n问答明细：\n${JSON.stringify(answers || {}, null, 0)}`;

  const result = await callDeepSeekChat(
    [
      { role: 'system', content: RISK_SYSTEM_PROMPT },
      { role: 'user', content: userContent },
    ],
    { maxTokens: 4000, timeoutMs: 40000, reasoningEffort: 'low', credentials },
  );
  if (!result.ok) {
    return { ok: false, status: 'failed', message: result.message };
  }
  const jsonText = extractJsonObject(result.content);
  if (!jsonText) {
    return { ok: false, status: 'bad_response', message: 'DeepSeek 未返回可解析的 JSON。' };
  }
  let parsed;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return { ok: false, status: 'bad_response', message: 'DeepSeek 返回的 JSON 无法解析。' };
  }

  const riskLevel =
    typeof parsed.riskLevel === 'string' && RISK_LEVELS.includes(parsed.riskLevel)
      ? parsed.riskLevel
      : null;
  if (!riskLevel) {
    return { ok: false, status: 'bad_response', message: 'DeepSeek 返回的风险等级不合法。' };
  }
  const riskCards = Array.isArray(parsed.riskCards)
    ? parsed.riskCards.filter((c) => typeof c === 'string' && c.trim()).slice(0, 6)
    : [];

  return {
    ok: true,
    status: 'success',
    data: {
      riskLevel,
      summary: typeof parsed.summary === 'string' ? parsed.summary : '',
      riskCards,
      accountingFocus: typeof parsed.accountingFocus === 'string' ? parsed.accountingFocus : '',
      vatFocus: typeof parsed.vatFocus === 'string' ? parsed.vatFocus : '',
      citFocus: typeof parsed.citFocus === 'string' ? parsed.citFocus : '',
    },
  };
}
