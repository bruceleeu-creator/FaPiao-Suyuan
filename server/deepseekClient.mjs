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
async function callDeepSeekChat(messages, { maxTokens, timeoutMs, reasoningEffort, credentials, jsonMode }) {
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
        // DeepSeek 官方 JSON Output（api-docs.deepseek.com/guides/json_mode）：
        // 强制合法 JSON 字符串；要求提示词中包含 "json" 字样并给出输出示例
        ...(jsonMode ? { response_format: { type: 'json_object' } } : {}),
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
//
// 确定性预检规则（全部有官方出处，详见 docs/验真与凭证规则设计.md）：
//   [税总公告] 数电发票号码 20 位：1-2 年度、3-4 省级区域代码、5 渠道、6-20 顺序编码，
//             无校验码、无发票代码（来源：国家税务总局关于推广应用全面数字化电子发票的公告）
//   [税总公告] 电子专票发票代码 12 位：第 1 位 0，2-5 省市，6-7 年度，8-10 批次，11-12 位票种（电子专票=13），
//             发票号码 8 位按年度分批次编制（来源：国家税务总局公告 2020 年第 22 号附件）
//   [票种识别] 10 位发票代码第 8 位为 1/2/5/7 → 增值税专用发票（行业通行规则）
//   [查验要素] 官方查验平台以 发票号码+开票日期+价税合计 为要素（inv-veri.chinatax.gov.cn）
function deterministicPreCheck(invoice = {}) {
  const findings = [];
  let hardFail = false;
  const warn = (msg) => findings.push(msg);
  const fail = (msg) => {
    findings.push(msg);
    hardFail = true;
  };

  const number = String(invoice.invoiceNumber || '').trim();
  const code = String(invoice.invoiceCode || '').trim();
  const invoiceType = String(invoice.invoiceType || '').trim();
  const isSpecialVat = invoiceType.includes('专') || invoiceType.includes('专用发票');
  const isDigital = /^\d{20}$/.test(number);
  const isTaxControl = /^\d{8}$/.test(number);

  // --- 发票号码位数 ---
  if (!number) {
    fail('缺少发票号码，无法核验。');
  } else if (!isDigital && !isTaxControl) {
    fail(`发票号码位数异常（${number.length} 位）：应为 8 位（税控发票）或 20 位（数电发票）。`);
  }

  // --- 数电票（20 位）专项 ---
  if (isDigital) {
    if (code) {
      warn('数电发票（20 位号码）不应再有发票代码：票面同时出现 20 位号码与发票代码属于版式矛盾，请核对是否混录。');
    }
    const yy = number.slice(0, 2);
    const dateYear = extractIssueYear(invoice.issueDate);
    if (dateYear && yy !== dateYear) {
      fail(`数电发票号码年度位与开票日期矛盾：号码前两位 ${yy} 应等于开票年份后两位 ${dateYear}。`);
    }
    const region = Number(number.slice(2, 4));
    // 省级税务局区域代码落在常见行政区划代码区间之外时提示（不硬伤：区间存在调整可能）
    if (!(region >= 11 && region <= 82)) {
      warn(`数电发票号码第 3-4 位（${number.slice(2, 4)}）不在省级税务局区域代码常见区间（11-82）内，建议人工核对。`);
    }
  }

  // --- 税控发票代码（10/12 位）专项 ---
  if (code) {
    if (!/^\d{10}$|^\d{12}$/.test(code)) {
      fail(`发票代码位数异常（${code.length} 位）：应为 10 或 12 位。`);
    } else if (/^\d{12}$/.test(code)) {
      if (code[0] !== '0') {
        fail(`12 位发票代码首位应为 0（实际 ${code[0]}）：与电子发票编码规则不符。`);
      }
      const codeYear = code.slice(5, 7);
      const dateYear = extractIssueYear(invoice.issueDate);
      if (dateYear && codeYear !== dateYear) {
        fail(`发票代码年度位与开票日期矛盾：代码第 6-7 位 ${codeYear} 应等于开票年份后两位 ${dateYear}。`);
      }
      // 代码第 11-12 位 = 13 → 电子专票；与票种字段交叉
      const species = code.slice(10, 12);
      if (species === '13' && number.length === 8 && !isSpecialVat && invoiceType) {
        warn(`发票代码票种位为 13（电子专票）但票面类型为「${invoiceType}」：票种与代码不一致，请核对。`);
      }
    } else if (/^\d{10}$/.test(code)) {
      // 10 位代码第 8 位 ∈ {1,2,5,7} → 专票
      const digit8 = code[7];
      if (['1', '2', '5', '7'].includes(digit8) && !isSpecialVat && invoiceType) {
        warn(`10 位发票代码第 8 位为 ${digit8}（专票特征）但票面类型为「${invoiceType}」：票种与代码不一致，请核对。`);
      }
    }
    if (isDigital) {
      // 已在数电分支提示过
    }
  }

  // --- 开票日期 ---
  const date = String(invoice.issueDate || '').trim();
  if (date) {
    const parsed = new Date(date);
    const now = new Date();
    const fiveYearsAgo = new Date(now.getFullYear() - 5, now.getMonth(), now.getDate());
    if (Number.isNaN(parsed.getTime())) {
      fail('开票日期格式无法解析。');
    } else if (parsed > now) {
      fail('开票日期晚于今天（未来日期发票）。');
    } else if (parsed < fiveYearsAgo) {
      warn('开票日期早于五年前，超出常规核验范围。');
    }
  } else {
    warn('缺少开票日期，无法做年度一致性交叉校验。');
  }

  // --- 价税勾稽（官方查验要素之一） ---
  const amount = Number(invoice.amount) || 0;
  const taxAmount = Number(invoice.taxAmount) || 0;
  const total = Number(invoice.totalAmount) || 0;
  if (amount > 0 && taxAmount >= 0 && total > 0) {
    if (Math.abs(amount + taxAmount - total) > 0.05) {
      fail(`价税勾稽不符：金额 ${amount} + 税额 ${taxAmount} ≠ 价税合计 ${total}。`);
    }
  } else if (total <= 0) {
    warn('缺少价税合计，无法完成官方查验要素（号码+日期+价税合计）比对。');
  }

  // --- 税率合理集合（增值税现行税率） ---
  const rate = String(invoice.taxRate || '').trim();
  if (rate) {
    const normalized = rate.replace('%', '');
    const known = ['0', '1', '3', '5', '6', '9', '13', '0.01', '0.03', '0.05', '0.06', '0.09', '0.13'];
    if (!known.includes(normalized) && !/免[税征]|不征税/.test(rate)) {
      warn(`税率「${rate}」不在增值税现行税率集合（0/1%/3%/5%/6%/9%/13%/免税）内，请核对。`);
    }
  }

  return { findings, hardFail };
}

// 从开票日期提取年份后两位（支持 YYYY-MM-DD 与 YYYY年MM月DD日）
function extractIssueYear(issueDate) {
  const m = /(\d{4})/.exec(String(issueDate || ''));
  return m ? m[1].slice(2) : null;
}

// 验真提示词：角色→规则→输出 schema→禁止事项→拒答出口（DeepSeek 官方 JSON mode 配套要求：
// 提示词含 "json" 字样 + 给出输出示例；结论枚举封闭，防止模型自由发挥）
const VERIFY_SYSTEM_PROMPT = `你是增值税发票票面核验助手。你只能基于给定票面字段做内部一致性与常识核验——你无法联网查询官方查验平台，结论只反映票面逻辑是否自洽。

【核验范围（仅此四类，逐项检查）】
1. 票种与税率匹配：餐饮/住宿/租赁等现代服务业适用 6%，货物运输/不动产租赁 9%，货物销售 13%，农产品 9%/免税；明显错配才算发现（如"餐饮服务 13%"）。
2. 项目名称与销方/类别的语义合理性：如销方为"XX科技有限公司"而项目为"住宿服务"，需提示核对（措辞用"建议核对"，不定性为异常）。
3. 票种年代一致性：数电发票（20 位号码、无代码）不应出现"税控发票代码"表述；12 位代码第 11-12 位为 13 属电子专票，应与票面类型一致。
4. 金额勾稽复核（确定性预检已算过一遍，你只做补充复核，不要重复报告预检已列明的算术结果）。

【硬性纪律】
- 不得编造票面上不存在的字段值；不得推测发票真伪——你只能给出"票面内部是否自洽"的结论。
- 任何无法从给定字段判断的维度，直接跳过，不写入 findings。
- findings 每条必须引用具体字段值（如"税率 13% 与项目'餐饮服务'不匹配"），禁止空泛表述（如"存在风险"）。
- conclusion 只能取枚举值：一致 / 存疑 / 无法判断。字段齐全且未发现矛盾才可输出"一致"；有矛盾但不足以定性用"存疑"；关键字段缺失用"无法判断"。

【输出格式】只输出一个 JSON 对象，禁止 markdown 代码块和任何其他文字，结构示例：
{"conclusion":"一致","findings":["税率 6% 与项目'住宿服务'匹配"],"advice":"票面自洽，可进入后续流程"}`;

export async function verifyInvoiceByAi({ invoice, credentials }) {
  // 确定性预检先行（规则免费且不依赖任何密钥）：硬伤直接出结论，不消耗 AI 调用
  const pre = deterministicPreCheck(invoice);
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

  const config = resolveConfig(credentials);
  if (!config.configured) {
    // AI 未配置：规则提示级发现仍然带回（结论保守为无法判断），不静默吞掉
    return {
      ok: false,
      status: 'not_configured',
      message: 'AI 核验需要 DeepSeek 密钥：请在「接口配置」页填入（仅存于当前浏览器会话）。',
      data: {
        conclusion: '无法判断',
        mode: 'rule',
        findings: pre.findings,
        advice: '确定性规则未发现硬伤；AI 语义核验需配置 DeepSeek 密钥。',
        disclaimer: 'AI 辅助核验（票面一致性），非官方查验平台结果。',
        mappedStatus: '待验真',
      },
    };
  }

  const userContent = `发票票面字段：\n${JSON.stringify(invoice || {}, null, 0)}\n\n确定性预检发现（供参考）：${pre.findings.length ? pre.findings.join('；') : '无'}`;
  const result = await callDeepSeekChat(
    [
      { role: 'system', content: VERIFY_SYSTEM_PROMPT },
      { role: 'user', content: userContent },
    ],
    { maxTokens: 2000, timeoutMs: 30000, reasoningEffort: 'low', credentials, jsonMode: true },
  );
  if (!result.ok) {
    // AI 不可用（未配置/欠费/超时等）：确定性预检的提示级发现仍然有效，随失败结果带回，
    // 结论保守为"无法判断"（不映射验真失败），由调用方决定是否展示
    return {
      ok: false,
      status: result.status || 'failed',
      message: result.message,
      data: {
        conclusion: '无法判断',
        mode: 'rule',
        findings: pre.findings,
        advice: 'AI 核验暂不可用；以下为确定性规则预检结果。',
        disclaimer: 'AI 辅助核验（票面一致性），非官方查验平台结果。',
        mappedStatus: '待验真',
      },
    };
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
// 凭证提示词：受控科目词表（防止模型自造科目）+ 借贷平衡铁律 + 资料不足拒答出口。
// 科目依据《企业会计准则》常用费用科目与项目八类发票映射（详见 docs/验真与凭证规则设计.md）
const VOUCHER_ALLOWED_ACCOUNTS = [
  '管理费用-业务招待费', '销售费用-业务招待费', '管理费用-职工福利费',
  '管理费用-差旅费', '销售费用-差旅费',
  '管理费用-车辆使用费', '管理费用-办公费', '管理费用-咨询顾问费',
  '销售费用-广告宣传费', '管理费用-租赁费', '销售费用-租赁费',
];
const VOUCHER_ALLOWED_CREDITS = ['其他应付款-员工报销', '银行存款', '库存现金'];
const VOUCHER_TAX_ACCOUNT = '应交税费-应交增值税-进项税额';

const VOUCHER_SYSTEM_PROMPT = `你是会计凭证草稿生成器，严格按借贷记账法（法定记账方法）生成费用报销凭证草稿。

【科目白名单（借方费用科目只能从中选择；若入账建议已给出科目路径则优先沿用）】
${VOUCHER_ALLOWED_ACCOUNTS.join(' / ')}

【贷方科目枚举（只能取以下之一）】
${VOUCHER_ALLOWED_CREDITS.join(' / ')}

【分录铁律（违反任何一条即输出 insufficient）】
1. 借贷平衡：借方合计 = 贷方合计。专票（票种含"专"）：借费用=不含税金额、借${VOUCHER_TAX_ACCOUNT}=税额、贷方=价税合计；普票：借费用=价税合计、贷方=价税合计。
2. 金额只能取自给定字段（amount/taxAmount/totalAmount），禁止计算出新金额、禁止四舍五入到整数、禁止编造。
3. 借方费用科目必须与发票类别的常见映射一致（餐饮招待→业务招待费；出差住宿/交通→差旅费；办公→办公费；咨询→咨询顾问费；广告推广→广告宣传费；租赁→租赁费；车辆相关→车辆使用费）。类别与科目明显矛盾时输出 insufficient 并在 note 说明。
4. 只生成草稿，summary 不得出现"过账""入账完成"等表述。
5. 若发票号码、价税合计、发票类别任一缺失，或金额≤0，输出 insufficient——不得凭猜测生成分录。

【输出格式】只输出一个 JSON 对象，禁止 markdown 代码块和任何其他文字。
正常输出示例：
{"summary":"餐饮费报销","entries":[{"direction":"借","account":"管理费用-业务招待费","amount":580},{"direction":"贷","account":"其他应付款-员工报销","amount":580}],"note":"草稿需财务复核"}
资料不足时输出示例：
{"insufficient":true,"note":"缺少价税合计，无法生成分录"}`;

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
    { maxTokens: 2500, timeoutMs: 30000, reasoningEffort: 'low', credentials, jsonMode: true },
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

  // 模型按纪律主动拒答（资料不足）：尊重并回退本地规则，不硬造分录
  if (parsed.insufficient === true) {
    return {
      ok: false,
      status: 'insufficient',
      message: typeof parsed.note === 'string' && parsed.note ? `AI 拒绝生成分录：${parsed.note}` : 'AI 判定资料不足，拒绝生成分录（回退本地规则）。',
    };
  }

  const entries = Array.isArray(parsed.entries)
    ? parsed.entries
        .filter((e) => e && (e.direction === '借' || e.direction === '贷') && typeof e.account === 'string' && e.account.trim() && Number.isFinite(Number(e.amount)) && Number(e.amount) > 0)
        .map((e) => ({ direction: e.direction, account: e.account.trim(), amount: Math.round(Number(e.amount) * 100) / 100 }))
    : [];
  // 质量闸 1：至少 2 条分录且借贷平衡（±0.05），否则拒绝并让前端回退本地规则
  const debit = entries.filter((e) => e.direction === '借').reduce((s, e) => s + e.amount, 0);
  const credit = entries.filter((e) => e.direction === '贷').reduce((s, e) => s + e.amount, 0);
  if (entries.length < 2 || Math.abs(debit - credit) > 0.05) {
    return {
      ok: false,
      status: 'unbalanced',
      message: 'AI 生成的分录借贷不平衡，已拒绝（回退本地规则生成）。',
    };
  }

  // 质量闸 2：科目白名单后置校验（纵深防御，防模型自造科目）——
  // 允许：白名单费用科目 / 贷方枚举 / 进项税科目 / 决策建议已给出的科目路径
  const adviceAccounts = new Set();
  if (decision && typeof decision === 'object') {
    const pa = decision.postingAdvice || {};
    [pa.primaryAccount, pa.secondaryAccount, pa.detailAccount].filter(Boolean).forEach((a) => adviceAccounts.add(String(a)));
    // 组合路径（一级/二级/三级）
    const path = [pa.primaryAccount, pa.secondaryAccount, pa.detailAccount].filter(Boolean).join('/');
    if (path) adviceAccounts.add(path);
  }
  const allowed = new Set([...VOUCHER_ALLOWED_ACCOUNTS, ...VOUCHER_ALLOWED_CREDITS, VOUCHER_TAX_ACCOUNT, ...adviceAccounts]);
  const illegal = entries.filter((e) => !allowed.has(e.account));
  if (illegal.length > 0) {
    return {
      ok: false,
      status: 'illegal_account',
      message: `AI 使用了白名单外科目（${illegal.map((e) => e.account).join('、')}），已拒绝（回退本地规则生成）。`,
    };
  }

  // 质量闸 3：金额必须来自票面字段（专票进项税=税额、普票借方=价税合计的容差校验）
  const amount = Number(invoice?.amount) || 0;
  const taxAmount = Number(invoice?.taxAmount) || 0;
  const total = Number(invoice?.totalAmount) || amount + taxAmount;
  const invoiceType = String(invoice?.invoiceType || '');
  const isSpecialVat = invoiceType.includes('专');
  const expectDebit = isSpecialVat ? amount + taxAmount : total;
  if (expectDebit > 0 && Math.abs(debit - expectDebit) > 0.05) {
    return {
      ok: false,
      status: 'amount_mismatch',
      message: `AI 分录借方合计 ${debit} 与票面口径不符（应为 ${expectDebit}），已拒绝（回退本地规则生成）。`,
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
