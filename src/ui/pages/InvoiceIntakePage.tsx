import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Cloud, FileText, Upload } from 'lucide-react';
import type { IntakeForm, InvoiceCategory } from '../../domain/types';
import { mockOcrRecognize } from '../../ai/mockOcrService';
import { authHeaders } from '../../auth/authStorage';
import { useAuth } from '../../auth/AuthContext';
import { tencentCredentialBody, deepSeekCredentialBody } from '../../integrations/sessionKeyStore';
import { classifyCategoryByRules } from '../../ai/categoryRules';
import { interpretInvoiceViaDeepSeek, type DeepSeekOcrField } from '../../ai/deepSeekInterpreter';
import { useWorkflow } from '../../workflow/WorkflowContext';
import { PageHeader } from '../components/PageHeader';
import { parseTaxRate, splitInclusiveTotal, SUPPORTED_TAX_RATES } from '../taxCalc';

// OCR 未识别到任何金额时填入的默认价税合计（元）：
// 仅用于让用户看到自动拆分效果，提示后可按票面实际金额修改
const DEFAULT_DEMO_TOTAL = 100;

const categories: InvoiceCategory[] = [
  '餐饮', '住宿', '交通', '车辆', '办公', '咨询服务', '广告推广', '租赁物业',
];

const emptyForm: IntakeForm = {
  source: '手工',
  invoiceType: '增值税普通发票',
  invoiceCode: '',
  invoiceNumber: '',
  issueDate: new Date().toISOString().slice(0, 10),
  seller: '',
  buyer: '浙江示例科技有限公司',
  itemName: '',
  totalAmount: 0,
  amount: 0,
  taxAmount: 0,
  taxRate: '3%',
  category: '餐饮',
};

// 格式化文件大小
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// 将腾讯云 OCR 返回的日期格式规范为 YYYY-MM-DD
function normalizeOcrDate(value: string): string {
  const match = value.match(/(\d{4})[年/-](\d{1,2})[月/-](\d{1,2})/);
  if (match) {
    return `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
  }
  return value;
}

// 解析 OCR 返回的金额字符串：去除货币符号（¥/￥）、千分位逗号、"元"等字符
function parseOcrNumber(value: string | undefined): number {
  if (!value) return 0;
  const cleaned = value.replace(/[^0-9.-]/g, '');
  const num = Number.parseFloat(cleaned);
  return Number.isFinite(num) ? num : 0;
}

// 规范化 OCR 税率：兼容 "6%"、"0.06"、"免税/不征税" 等写法
function normalizeOcrTaxRate(value: string | undefined): string {
  if (!value) return '';
  const text = String(value).trim();
  if (/免税|不征税/.test(text)) return '0%';
  const percentMatch = /(\d+(?:\.\d+)?)\s*%/.exec(text);
  if (percentMatch) return `${percentMatch[1]}%`;
  const decimal = parseOcrNumber(text);
  if (decimal > 0 && decimal < 1) return `${Math.round(decimal * 1000) / 10}%`;
  return '';
}

// 规范化 OCR 字段名：去空白、全角括号转半角，
// 避免真实数电票返回"价税合计(小写)"（半角）匹配不上"价税合计（小写）"（全角）
function normalizeOcrFieldName(name: string): string {
  return name.replace(/\s+/g, '').replace(/（/g, '(').replace(/）/g, ')');
}

// 将腾讯云 VatInvoiceOCR 返回结果映射为 IntakeForm
// - usedDefaultTotal=true 表示 OCR 未识别到任何金额，已填入默认价税合计自动拆分试算
// - ocrFilled 记录 OCR 实际识别到的字段，DeepSeek 补齐时只填缺口、不覆盖 OCR 结果
// （导出仅供测试使用）
export function mapTencentOcrToIntakeForm(
  data: unknown,
  fallback: IntakeForm,
): { form: IntakeForm; usedDefaultTotal: boolean; ocrFilled: Set<string> } {
  const response = (data ?? {}) as {
    VatInvoiceInfos?: Array<{ Name?: string; Value?: string }>;
    Items?: Array<{ Name?: string; Item?: string; LineTaxRate?: string; TaxRate?: string }>;
  };
  const infos = response.VatInvoiceInfos ?? [];
  const infoMap = new Map<string, string>();
  for (const item of infos) {
    if (item?.Name) infoMap.set(normalizeOcrFieldName(item.Name), item.Value ?? '');
  }
  const items = response.Items ?? [];
  const firstItem = items[0] ?? {};

  const get = (...names: string[]): string => {
    for (const name of names) {
      const value = infoMap.get(normalizeOcrFieldName(name));
      if (value) return value;
    }
    return '';
  };

  const next = { ...fallback };
  const ocrFilled = new Set<string>();
  const invoiceType = get('发票类型', '发票种类');
  if (invoiceType) {
    next.invoiceType = invoiceType;
    ocrFilled.add('invoiceType');
  }
  const invoiceCode = get('发票代码');
  if (invoiceCode) {
    next.invoiceCode = invoiceCode;
    ocrFilled.add('invoiceCode');
  }
  const invoiceNumber = get('发票号码');
  if (invoiceNumber) {
    next.invoiceNumber = invoiceNumber;
    ocrFilled.add('invoiceNumber');
  }
  const issueDate = get('开票日期');
  if (issueDate) {
    next.issueDate = normalizeOcrDate(issueDate);
    ocrFilled.add('issueDate');
  }
  const seller = get('销售方名称', '销方名称');
  if (seller) {
    next.seller = seller;
    ocrFilled.add('seller');
  }
  const buyer = get('购买方名称', '购方名称');
  if (buyer) {
    next.buyer = buyer;
    ocrFilled.add('buyer');
  }
  const itemName = get('项目名称', '货物或应税劳务、服务名称', '应税劳务、服务名称') || firstItem?.Name || firstItem?.Item || '';
  if (itemName) {
    next.itemName = String(itemName);
    ocrFilled.add('itemName');
  }

  const totalAmount = get('价税合计', '价税合计(小写)', '价税合计小写');
  const amount = get('金额', '不含税金额', '合计金额');
  const taxAmount = get('税额', '合计税额');
  // 数电票的税率通常在明细行 Items 里，不在 VatInvoiceInfos
  const taxRate = get('税率') || firstItem?.LineTaxRate || firstItem?.TaxRate || '';

  if (totalAmount) {
    next.totalAmount = parseOcrNumber(totalAmount);
    ocrFilled.add('totalAmount');
  }
  if (amount) {
    next.amount = parseOcrNumber(amount);
    ocrFilled.add('amount');
  }
  if (taxAmount) {
    next.taxAmount = parseOcrNumber(taxAmount);
    ocrFilled.add('taxAmount');
  }
  const normalizedRate = normalizeOcrTaxRate(taxRate);
  if (normalizedRate) {
    next.taxRate = normalizedRate;
    ocrFilled.add('taxRate');
  }

  if (next.totalAmount && next.totalAmount > 0) {
    // 有价税合计：缺不含税金额或税额时按税率拆分
    if (!next.amount || !next.taxAmount) {
      const split = splitInclusiveTotal(next.totalAmount, next.taxRate);
      next.amount = split.amount;
      next.taxAmount = split.taxAmount;
    }
  } else if (next.amount > 0) {
    // 只有不含税金额：按税率倒推税额和价税合计
    const rate = parseTaxRate(next.taxRate);
    if (!next.taxAmount) {
      next.taxAmount = rate > 0 ? Math.round(next.amount * rate * 100) / 100 : 0;
    }
    next.totalAmount = Math.round((next.amount + next.taxAmount) * 100) / 100;
  } else {
    // OCR 未识别到任何金额：填入默认价税合计自动拆分试算，提示用户修改
    next.totalAmount = DEFAULT_DEMO_TOTAL;
    const split = splitInclusiveTotal(next.totalAmount, next.taxRate);
    next.amount = split.amount;
    next.taxAmount = split.taxAmount;
    return { form: next, usedDefaultTotal: true, ocrFilled };
  }

  return { form: next, usedDefaultTotal: false, ocrFilled };
}

// 从腾讯 OCR 响应构造发给 DeepSeek 的原始字段对（含明细行项目名）
export function buildOcrFieldPairs(data: unknown): DeepSeekOcrField[] {
  const response = (data ?? {}) as {
    VatInvoiceInfos?: Array<{ Name?: string; Value?: string }>;
    Items?: Array<{ Name?: string; Item?: string }>;
  };
  const pairs: DeepSeekOcrField[] = [];
  for (const info of response.VatInvoiceInfos ?? []) {
    if (info?.Name) pairs.push({ name: info.Name, value: info.Value ?? '' });
  }
  for (const item of response.Items ?? []) {
    const name = item?.Name ?? item?.Item ?? '';
    if (name) pairs.push({ name: '明细项目', value: String(name) });
  }
  return pairs;
}

// 后端代理不可达时构造的"模拟 OCR"数据（腾讯云 VatInvoiceOCR 结构）。
// 让演示流程在后端未启动/崩溃时自动走通，后端恢复后上传文件自动切回真实识别。
// （导出仅供测试使用）
export function buildSimulatedOcrData(form: IntakeForm): unknown {
  const entries: Array<{ Name: string; Value: string }> = [];
  const push = (name: string, value: string | number | undefined) => {
    if (value !== undefined && value !== '' && value !== 0) {
      entries.push({ Name: name, Value: String(value) });
    }
  };
  push('发票类型', form.invoiceType);
  push('发票代码', form.invoiceCode);
  push('发票号码', form.invoiceNumber);
  push('开票日期', form.issueDate);
  push('销售方名称', form.seller);
  push('购买方名称', form.buyer);
  push('项目名称', form.itemName);
  push('价税合计(小写)', form.totalAmount);
  push('金额', form.amount);
  push('税额', form.taxAmount);
  push('税率', form.taxRate);
  return { VatInvoiceInfos: entries, Items: [] };
}

// 探测后端代理是否可达（经 Vite 代理转发到后端 /api/tencent/health）
async function probeBackendHealth(): Promise<boolean> {
  try {
    const response = await fetch('/api/tencent/health', {
      signal: AbortSignal.timeout(2500),
    });
    if (!response.ok) return false;
    const text = await response.text();
    const data = text ? (JSON.parse(text) as { ok?: boolean }) : null;
    return data?.ok === true;
  } catch {
    return false;
  }
}

// 将 DeepSeek 解释结果合并进表单：
// - 类别：直接采用（服务端已校验必须是八类之一）
// - 其他字段：只填 OCR 未识别且当前为空的缺口，不覆盖已有值
// 返回合并后的表单和实际补齐的字段名列表
export function mergeDeepSeekResult(
  form: IntakeForm,
  interpret: { category: InvoiceCategory | null; fields: Partial<IntakeForm> & { totalAmount?: number } },
  ocrFilled: Set<string>,
  usedDefaultTotal: boolean,
): { form: IntakeForm; filledKeys: string[] } {
  const next = { ...form };
  const filledKeys: string[] = [];

  if (interpret.category && categories.includes(interpret.category)) {
    next.category = interpret.category;
  }

  const textFields = ['invoiceType', 'invoiceCode', 'invoiceNumber', 'issueDate', 'seller', 'buyer', 'itemName'] as const;
  for (const key of textFields) {
    const value = interpret.fields[key];
    if (typeof value === 'string' && value && !ocrFilled.has(key) && !next[key]) {
      if (key === 'issueDate') {
        next.issueDate = normalizeOcrDate(value);
      } else {
        (next as Record<string, unknown>)[key] = value;
      }
      filledKeys.push(key);
    }
  }

  const dsTotal = Number(interpret.fields.totalAmount ?? 0);
  // OCR 没拿到价税合计（当前是默认值或 0）而 DeepSeek 从票面文本中识别到时，采用 DeepSeek 的值并重算拆分
  if (dsTotal > 0 && !ocrFilled.has('totalAmount') && (usedDefaultTotal || (next.totalAmount ?? 0) <= 0)) {
    next.totalAmount = dsTotal;
    const split = splitInclusiveTotal(next.totalAmount, next.taxRate);
    next.amount = split.amount;
    next.taxAmount = split.taxAmount;
    filledKeys.push('totalAmount');
  }

  const dsRate = typeof interpret.fields.taxRate === 'string' ? normalizeOcrTaxRate(interpret.fields.taxRate) : '';
  if (dsRate && !ocrFilled.has('taxRate')) {
    next.taxRate = dsRate;
    if (next.totalAmount && next.totalAmount > 0) {
      const split = splitInclusiveTotal(next.totalAmount, next.taxRate);
      next.amount = split.amount;
      next.taxAmount = split.taxAmount;
    }
    filledKeys.push('taxRate');
  }

  return { form: next, filledKeys };
}

export function InvoiceIntakePage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { startSession, cases, activeCaseId, loadCase } = useWorkflow();
  const [form, setForm] = useState<IntakeForm>(emptyForm);
  const [error, setError] = useState<string>('');
  // 已填入提示：OCR 识别或自动填入默认值后显示
  const [filledHint, setFilledHint] = useState<string>('');
  // DeepSeek 类别识别/字段补齐状态与提示
  const [aiStatus, setAiStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [aiHint, setAiHint] = useState<string>('');
  // 递增请求序号：仅最后一次发起的 DeepSeek 结果允许写回表单，避免过期覆盖
  const aiReqRef = useRef(0);
  // 后端代理可达状态：null=探测中 / true=已连接 / false=未启动（模拟模式）
  const [backendOnline, setBackendOnline] = useState<boolean | null>(null);

  // 挂载时探测一次后端状态，用于展示状态条（OCR 失败时也会重新探测）
  useEffect(() => {
    let cancelled = false;
    void probeBackendHealth().then((ok) => {
      if (!cancelled) setBackendOnline(ok);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  // 真实文件上传状态
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [ocrStatus, setOcrStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [ocrError, setOcrError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 自动识别预览：根据上方录入表单实时生成，仅用于只读预览
  const recognizedPreview = useMemo(() => mockOcrRecognize(form), [form]);
  // 已录入发票记录：按 caseId 倒序（caseId 内含时间戳），最新在前
  const sortedCases = useMemo(
    () => [...cases].sort((a, b) => b.caseId.localeCompare(a.caseId)),
    [cases],
  );
  const previewTotal = form.totalAmount ?? (form.amount + form.taxAmount);
  const previewSourceFile = selectedFile
    ? `tencent://ocr/uploaded-${selectedFile.name}`
    : recognizedPreview.sourceFile;
  const hasPreviewData = Boolean(
    form.invoiceNumber ||
    form.invoiceCode ||
    form.seller ||
    form.itemName ||
    (form.totalAmount ?? 0) > 0,
  );

  const updateField = <K extends keyof IntakeForm>(key: K, value: IntakeForm[K]) => {
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      // 价税合计或税率变化时，自动拆分不含税金额和税额。
      if (key === 'totalAmount' || key === 'taxRate') {
        const split = splitInclusiveTotal(next.totalAmount ?? 0, next.taxRate);
        next.amount = split.amount;
        next.taxAmount = split.taxAmount;
      }
      return next;
    });
    // 用户手动修改字段后清除"已填入"提示
    if (filledHint) setFilledHint('');
  };

  // 点击左侧已录入发票：载入对应 case 并跳转到它的处理流程页查看
  const openCase = (caseId: string) => {
    loadCase(caseId);
    navigate(`/invoices/${caseId}/workflow`);
  };

  // OCR 识别成功后调用 DeepSeek：自动识别发票类别 + 补齐缺失字段
  // DeepSeek 不可用时回退到本地关键词规则；两者都不行则提示手动选择
  async function applyAiInterpretation(
    ocrData: unknown,
    mapped: { form: IntakeForm; usedDefaultTotal: boolean; ocrFilled: Set<string> },
  ) {
    const reqId = ++aiReqRef.current;
    setAiStatus('loading');
    setAiHint('');
    const result = await interpretInvoiceViaDeepSeek(buildOcrFieldPairs(ocrData), mapped.form);
    if (reqId !== aiReqRef.current) return; // 已被新一次识别取代，丢弃过期结果

    if (result.ok) {
      const merged = mergeDeepSeekResult(mapped.form, result.data, mapped.ocrFilled, mapped.usedDefaultTotal);
      setForm(merged.form);
      setAiStatus('done');
      const filledText = merged.filledKeys.length > 0
        ? `，并补齐了 ${merged.filledKeys.length} 个缺失字段`
        : '';
      const reasonText = result.data.reason ? `（${result.data.reason}）` : '';
      setAiHint(
        `DeepSeek 已自动识别发票类别「${merged.form.category}」${reasonText}${filledText}，可手动修改。`,
      );
      return;
    }

    // DeepSeek 失败：本地规则兜底
    const ruleCategory = classifyCategoryByRules(mapped.form.itemName, mapped.form.seller);
    if (ruleCategory) {
      setForm((prev) => ({ ...prev, category: ruleCategory }));
      setAiStatus('error');
      setAiHint(`DeepSeek 不可用（${result.message}），已按本地规则识别类别「${ruleCategory}」，可手动修改。`);
      return;
    }
    setAiStatus('error');
    setAiHint(`DeepSeek 不可用（${result.message}），请手动选择发票类别。`);
  }

  // 后端代理不可达时的兜底：自动回退模拟识别，保证演示流程不被阻断。
  // 仅在请求彻底失败（代理 500 / 非 JSON 响应 / 网络错误）时触发；
  // 后端恢复后上传文件会自动切回真实腾讯云 OCR。
  function fallbackToSimulatedOcr() {
    void probeBackendHealth().then(setBackendOnline);
    const simulated = buildSimulatedOcrData(form);
    const mapped = mapTencentOcrToIntakeForm(simulated, form);
    setForm(mapped.form);
    setOcrStatus('success');
    setFilledHint(
      mapped.usedDefaultTotal
        ? `后端代理未启动，已自动使用模拟识别并填入默认价税合计 ${DEFAULT_DEMO_TOTAL} 元（可修改）；启动后端后上传文件将自动切换为真实腾讯云 OCR。`
        : '后端代理未启动，已自动使用模拟识别结果（可修改上方字段）；启动后端后上传文件将自动切换为真实腾讯云 OCR。',
    );
    // DeepSeek 识别类别/补齐字段照常进行（后端不可达时自动回退本地规则）
    void applyAiInterpretation(simulated, mapped);
  }

  // 调用后端真实腾讯云 OCR
  async function runRealOcr(file: File) {
    setOcrStatus('loading');
    setOcrError('');
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          const commaIndex = result.indexOf(',');
          resolve(commaIndex >= 0 ? result.slice(commaIndex + 1) : result);
        };
        reader.onerror = () => reject(new Error('文件读取失败'));
        reader.readAsDataURL(file);
      });
      const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
      const response = await fetch('/api/tencent/ocr/invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        // 携带会话密钥（用户在「接口配置」页填入，仅存浏览器会话）；未填时后端回退服务器配置
        body: JSON.stringify({ imageBase64: base64, isPdf, ...tencentCredentialBody() }),
        // 超时兜底：真实 OCR 大图耗时较长，30s 后按后端不可达处理并回退模拟
        signal: AbortSignal.timeout(30000),
      });
      const text = await response.text();
      let result: { ok?: boolean; data?: unknown; message?: string; status?: string } | null = null;
      try {
        result = text ? JSON.parse(text) : null;
      } catch {
        result = null;
      }

      // 后端代理不可达（Vite 代理 500 / 非 JSON 响应）：自动回退模拟识别，不再阻断流程
      if (!result || response.status >= 500) {
        fallbackToSimulatedOcr();
        return;
      }

      if (result.ok && result.data) {
        const mapped = mapTencentOcrToIntakeForm(result.data, form);
        setForm(mapped.form);
        setOcrStatus('success');
        setFilledHint(
          mapped.usedDefaultTotal
            ? `腾讯云 OCR 未识别到价税合计，已自动填入默认值 ${DEFAULT_DEMO_TOTAL} 元用于自动拆分试算，请按票面实际金额修改后自动重算。`
            : '已通过腾讯云 OCR 识别并自动拆分价税合计，请核对下方只读预览，可继续修正上方字段。',
        );
        // 异步交给 DeepSeek 识别类别并补齐缺失字段（有本地规则兜底）
        void applyAiInterpretation(result.data, mapped);
      } else {
        // 后端可达但识别失败：如实提示，用户可手动补录
        // 密钥未配置时给出可操作指引，避免"上传后没反应"的困惑
        const notConfigured = result.status === 'not_configured';
        const guidance = notConfigured
          ? user?.role === 'admin'
            ? '您是管理员：请在左侧「接口配置」页填写腾讯云 SecretId/SecretKey（可用「测试连接」验证），保存后重新上传即可自动识别。'
            : '请联系管理员在「接口配置」页配置腾讯云密钥后再上传；目前可先手动填写下方表单提交。'
          : '';
        setOcrStatus('error');
        setOcrError(
          `${result.message || '腾讯云 OCR 识别失败，请手动录入。'}${guidance ? ` ${guidance}` : ''}`,
        );
        setFilledHint('');
      }
    } catch (err) {
      // 网络级失败（代理拒绝连接、超时等）：同样回退模拟识别
      fallbackToSimulatedOcr();
    }
  }

  // 真实文件选择：自动读取文件并调用后端腾讯云 OCR
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSelectedFile(file);
    setFilledHint('');
    setError('');
    void runRealOcr(file);
  };

  // 点击上传占位区打开文件选择
  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  // 清除已选文件
  const clearSelectedFile = () => {
    setSelectedFile(null);
    setOcrStatus('idle');
    setOcrError('');
    // 取消进行中的 DeepSeek 解释并清空提示
    aiReqRef.current += 1;
    setAiStatus('idle');
    setAiHint('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // AI 核验（DeepSeek）：票面规则 + 一致性核验；失败/未配置不阻断，保持原状态
  // 返回 mappedStatus 仅在核验真实完成时使用（验真通过 / 待验真 / 验真失败）
  async function runAiVerify(invoiceForm: IntakeForm): Promise<{ status?: '验真通过' | '待验真' | '验真失败'; hint: string }> {
    if (!backendOnline) return { hint: '' };
    try {
      const response = await fetch('/api/deepseek/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({
          invoice: {
            invoiceType: invoiceForm.invoiceType,
            invoiceCode: invoiceForm.invoiceCode,
            invoiceNumber: invoiceForm.invoiceNumber,
            issueDate: invoiceForm.issueDate,
            seller: invoiceForm.seller,
            buyer: invoiceForm.buyer,
            itemName: invoiceForm.itemName,
            amount: invoiceForm.amount,
            taxAmount: invoiceForm.taxAmount,
            totalAmount: invoiceForm.totalAmount,
            taxRate: invoiceForm.taxRate,
          },
          ...deepSeekCredentialBody(),
        }),
        signal: AbortSignal.timeout(25000),
      });
      const result = await response.json().catch(() => null);
      if (result?.ok && result.data) {
        const d = result.data as { mappedStatus?: '验真通过' | '待验真' | '验真失败'; conclusion?: string; disclaimer?: string };
        return {
          status: d.mappedStatus,
          hint: `AI 辅助核验：${d.conclusion || '完成'}（${d.disclaimer || '非官方查验平台结果'}）`,
        };
      }
      // not_configured / failed：不提示错误（模拟模式下静默保持原状态）
      return { hint: '' };
    } catch {
      return { hint: 'AI 核验超时或失败，发票按原验真状态继续。' };
    }
  }

  const [verifying, setVerifying] = useState(false);

  const handleStart = async () => {
    if (ocrStatus === 'loading') {
      setError('正在调用腾讯云 OCR，请稍候...');
      return;
    }
    if (form.source === '手工') {
      if (!form.invoiceNumber || !form.seller || !form.itemName || form.amount <= 0) {
        setError(
          selectedFile
            ? ocrStatus === 'error'
              ? '腾讯云 OCR 识别失败，请手动补填发票号、销方、项目名称、金额，或重新上传文件。'
              : '请补填发票号、销方、项目名称、金额，或等待 OCR 识别完成。'
            : '手工录入需填写：发票号、销方、项目名称、金额。',
        );
        return;
      }
    }
    setError('');
    // 提交前 AI 核验（DeepSeek 可用时）：几秒内完成，结果写入发票验真状态
    let verifyStatus: '验真通过' | '待验真' | '验真失败' | undefined;
    let verifyHint = '';
    if (backendOnline) {
      setVerifying(true);
      const v = await runAiVerify(form);
      verifyStatus = v.status;
      verifyHint = v.hint;
      setVerifying(false);
    }
    const invoice = mockOcrRecognize(form);
    if (verifyStatus) invoice.verificationStatus = verifyStatus;
    // 如果用户上传了文件，记录真实 OCR 来源（保留验真状态字段）
    if (selectedFile) {
      invoice.sourceFile = `tencent://ocr/uploaded-${selectedFile.name}`;
    }
    // 生成独立 caseId 并持久化到 localStorage
    const caseId = startSession(invoice);
    if (verifyHint) setFilledHint(verifyHint);
    // 跳转到该 case 的专属流程页
    navigate(`/invoices/${caseId}/workflow`);
  };

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="发票录入"
        title="录入一张发票开始可操作闭环"
        description="上传 PDF/图片会自动调用腾讯云 OCR 识别，并由 DeepSeek 自动识别发票类别、补齐缺失字段；价税合计与税率联动自动拆分不含税金额和税额（未识别到金额时自动填入默认值，可修改）；识别结果自动显示在下方只读预览区。"
      />

      {/* 腾讯云 OCR + DeepSeek 状态提示（含后端代理连通状态） */}
      <div className="tencent-ocr-notice" role="note">
        <Cloud size={18} aria-hidden="true" />
        <div>
          {backendOnline === null ? (
            <strong>正在检查后端代理状态…</strong>
          ) : backendOnline ? (
            <>
              <strong>后端代理已连接（腾讯云 OCR + DeepSeek）</strong>
              <p>
                上传 PDF/图片后会自动调用腾讯云 OCR 识别票面，再由 DeepSeek
                自动识别发票类别并补齐缺失字段；如果识别失败，可以手动补录。
              </p>
            </>
          ) : (
            <>
              <strong>后端代理未启动：当前使用模拟识别，演示流程不受影响</strong>
              <p>
                OCR 自动使用模拟数据，DeepSeek 自动回退本地规则，完整流程仍可走通；
                <code>npm run dev</code> 会同时启动后端，或单独执行{' '}
                <code>npm run backend:dev</code> 后，上传文件将自动切换为真实识别。
              </p>
            </>
          )}
        </div>
      </div>

      <section className="intake-layout">
        {/* 左侧：已录入发票记录（提交后自动出现在这里，点击载入查看） */}
        <article className="intake-panel" aria-label="已录入发票记录">
          <div className="intake-head">
            <FileText size={18} aria-hidden="true" />
            <strong>已录入发票（{sortedCases.length}）</strong>
          </div>
          <p className="intake-hint">
            每次提交表单后，发票会自动记录在这里；点击任一记录可载入并查看它的处理进度。
          </p>
          {sortedCases.length === 0 ? (
            <p className="empty-hint">暂无记录，录入第一张发票后会显示在这里。</p>
          ) : (
            <div className="sample-list">
              {sortedCases.map((c) => {
                const total = c.invoice.amount + c.invoice.taxAmount;
                return (
                  <button
                    type="button"
                    key={c.caseId}
                    className={`sample-item ${c.caseId === activeCaseId ? 'active' : ''}`}
                    onClick={() => openCase(c.caseId)}
                    aria-pressed={c.caseId === activeCaseId}
                  >
                    <strong>{c.invoice.invoiceNumber || '（未填票号）'}</strong>
                    <small>{c.invoice.seller || '—'} · {c.invoice.category}</small>
                    <small>
                      {total.toLocaleString('zh-CN', { maximumFractionDigits: 2 })} 元 · {c.finalStatus}
                    </small>
                  </button>
                );
              })}
            </div>
          )}
        </article>

        {/* 右侧：手工录入 + 真实文件上传 */}
        <article className="intake-panel" aria-label="手工录入票面">
          <div className="intake-head">
            <Upload size={18} aria-hidden="true" />
            <strong>手工录入 / 上传文件</strong>
          </div>
          <p className="intake-hint">
            点击下方区域选择 PDF/图片文件，系统会自动上传到后端调用<strong>腾讯云 OCR</strong> 识别，
            再由 <strong>DeepSeek</strong> 自动识别发票类别并补齐缺失字段。
            识别完成后下方会显示只读预览；如识别失败可手动补录。
          </p>

          {/* 真实文件上传：可点击的 input[type=file] */}
          <div
            className="upload-area"
            onClick={triggerFileInput}
            role="button"
            tabIndex={0}
            aria-label="点击选择 PDF 或图片文件，自动调用腾讯云 OCR"
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                triggerFileInput();
              }
            }}
          >
            <Upload size={28} aria-hidden="true" />
            <span>点击选择 PDF / 图片文件，自动调用腾讯云 OCR</span>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.png,.jpg,.jpeg"
              onChange={handleFileSelect}
              style={{ display: 'none' }}
              aria-label="选择发票文件"
            />
          </div>

          {/* 已选文件信息 */}
          {selectedFile && (
            <div className="file-info" role="status">
              <FileText size={18} aria-hidden="true" />
              <div className="file-info-detail">
                <strong>{selectedFile.name}</strong>
                <small>
                  {formatFileSize(selectedFile.size)} ·{' '}
                  {ocrStatus === 'loading'
                    ? '正在调用腾讯云 OCR...'
                    : ocrStatus === 'success'
                      ? '腾讯云 OCR 识别完成，请在下方核对'
                      : ocrStatus === 'error'
                        ? '腾讯云 OCR 识别失败，可手动补录'
                        : '已选择文件'}
                </small>
                {ocrStatus === 'error' && ocrError && (
                  <small className="file-info-error" role="alert">{ocrError}</small>
                )}
              </div>
              <button
                type="button"
                className="text-button"
                onClick={clearSelectedFile}
                aria-label="清除已选文件"
              >
                清除
              </button>
            </div>
          )}

          {/* 已填入提示 */}
          {filledHint && (
            <div className="intake-hint-filled" role="status">
              {filledHint}
            </div>
          )}

          {/* DeepSeek 类别识别 / 字段补齐提示 */}
          {aiStatus === 'loading' && (
            <div className="intake-hint-filled" role="status">
              DeepSeek 正在识别发票类别并补齐缺失字段…
            </div>
          )}
          {aiStatus !== 'loading' && aiHint && (
            <div className="intake-hint-filled" role="status">
              {aiHint}
            </div>
          )}

          <div className="intake-form">
            <label className="field">
              <span>发票类型</span>
              <select
                value={form.invoiceType}
                onChange={(e) => updateField('invoiceType', e.target.value)}
              >
                <option>增值税普通发票</option>
                <option>增值税专用发票</option>
              </select>
            </label>
            <label className="field">
              <span>发票类别</span>
              <select
                value={form.category}
                onChange={(e) => updateField('category', e.target.value as InvoiceCategory)}
              >
                {categories.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>发票代码</span>
              <input
                value={form.invoiceCode}
                onChange={(e) => updateField('invoiceCode', e.target.value)}
                placeholder="如 044002600111"
              />
            </label>
            <label className="field">
              <span>发票号码 *</span>
              <input
                value={form.invoiceNumber}
                onChange={(e) => updateField('invoiceNumber', e.target.value)}
                placeholder="如 10012001"
              />
            </label>
            <label className="field">
              <span>开票日期</span>
              <input
                type="date"
                value={form.issueDate}
                onChange={(e) => updateField('issueDate', e.target.value)}
              />
            </label>
            <label className="field">
              <span>销方名称 *</span>
              <input
                value={form.seller}
                onChange={(e) => updateField('seller', e.target.value)}
                placeholder="如 杭州湖滨餐饮管理有限公司"
              />
            </label>
            <label className="field field-wide">
              <span>购方名称</span>
              <input
                value={form.buyer}
                onChange={(e) => updateField('buyer', e.target.value)}
              />
            </label>
            <label className="field field-wide">
              <span>项目名称 *</span>
              <input
                value={form.itemName}
                onChange={(e) => updateField('itemName', e.target.value)}
                placeholder="如 餐饮服务"
              />
            </label>
            <label className="field">
              <span>价税合计（元）*</span>
              <input
                type="number"
                value={form.totalAmount || ''}
                onChange={(e) => updateField('totalAmount', Number(e.target.value) || 0)}
                placeholder="输入价税合计后自动拆分"
              />
              <small className="field-hint">
                填写票面「价税合计（小写）」的含税总额；OCR 未识别到金额时会自动填入默认值（可修改），不含税金额与税额随之自动重算。
              </small>
            </label>
            <label className="field">
              <span>税率</span>
              <select
                value={form.taxRate}
                onChange={(e) => updateField('taxRate', e.target.value)}
              >
                {!(SUPPORTED_TAX_RATES as readonly string[]).includes(form.taxRate) && (
                  <option value={form.taxRate}>{form.taxRate}（票面税率）</option>
                )}
                {SUPPORTED_TAX_RATES.map((rate) => (
                  <option key={rate} value={rate}>{rate}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>不含税金额（元，自动计算）</span>
              <input
                type="number"
                value={Number.isFinite(form.amount) ? String(form.amount) : ''}
                readOnly
                aria-readonly="true"
                aria-label="不含税金额（自动计算，不可手动编辑）"
                placeholder="根据价税合计和税率自动计算"
              />
            </label>
            <label className="field">
              <span>税额（元，自动计算）</span>
              <input
                type="number"
                value={Number.isFinite(form.taxAmount) ? String(form.taxAmount) : ''}
                readOnly
                aria-readonly="true"
                aria-label="税额（自动计算，不可手动编辑）"
                placeholder="根据价税合计和税率自动计算"
              />
              <small className="field-hint">
                税额 = 价税合计 - 价税合计 ÷ (1 + 税率)，保留 2 位小数。0% 时税额为 0。
              </small>
            </label>
          </div>
        </article>
      </section>

      {/* 自动识别结果预览：只读，不可修改 */}
      <section className="intake-preview-panel" aria-label="识别结果预览">
        <div className="intake-head">
          <FileText size={18} aria-hidden="true" />
          <strong>识别结果预览（只读）</strong>
        </div>
        <p className="intake-hint">
          系统会根据上方录入内容自动识别并实时同步到下方。此区域仅供核对，不可直接修改；如需调整请返回上方表单修改。
        </p>
        {hasPreviewData ? (
          <div className="intake-preview-grid">
            <label className="intake-preview-field">
              <span>发票类型</span>
              <input value={recognizedPreview.invoiceType} readOnly aria-readonly="true" />
            </label>
            <label className="intake-preview-field">
              <span>发票类别</span>
              <input value={recognizedPreview.category} readOnly aria-readonly="true" />
            </label>
            <label className="intake-preview-field">
              <span>发票代码</span>
              <input value={recognizedPreview.invoiceCode} readOnly aria-readonly="true" placeholder="—" />
            </label>
            <label className="intake-preview-field">
              <span>发票号码</span>
              <input value={recognizedPreview.invoiceNumber} readOnly aria-readonly="true" placeholder="—" />
            </label>
            <label className="intake-preview-field">
              <span>开票日期</span>
              <input value={recognizedPreview.issueDate} readOnly aria-readonly="true" placeholder="—" />
            </label>
            <label className="intake-preview-field intake-preview-field-wide">
              <span>销方名称</span>
              <input value={recognizedPreview.seller} readOnly aria-readonly="true" placeholder="—" />
            </label>
            <label className="intake-preview-field intake-preview-field-wide">
              <span>购方名称</span>
              <input value={recognizedPreview.buyer} readOnly aria-readonly="true" placeholder="—" />
            </label>
            <label className="intake-preview-field intake-preview-field-wide">
              <span>项目名称</span>
              <input value={recognizedPreview.itemName} readOnly aria-readonly="true" placeholder="—" />
            </label>
            <label className="intake-preview-field">
              <span>价税合计（元）</span>
              <input value={Number.isFinite(previewTotal) ? Number(previewTotal).toFixed(2) : ''} readOnly aria-readonly="true" placeholder="0.00" />
            </label>
            <label className="intake-preview-field">
              <span>不含税金额（元）</span>
              <input value={Number.isFinite(recognizedPreview.amount) ? recognizedPreview.amount.toFixed(2) : ''} readOnly aria-readonly="true" placeholder="0.00" />
            </label>
            <label className="intake-preview-field">
              <span>税额（元）</span>
              <input value={Number.isFinite(recognizedPreview.taxAmount) ? recognizedPreview.taxAmount.toFixed(2) : ''} readOnly aria-readonly="true" placeholder="0.00" />
            </label>
            <label className="intake-preview-field">
              <span>税率</span>
              <input value={recognizedPreview.taxRate} readOnly aria-readonly="true" placeholder="—" />
            </label>
            <label className="intake-preview-field">
              <span>识别置信度</span>
              <input value={`${Math.round(recognizedPreview.recognitionConfidence * 100)}%`} readOnly aria-readonly="true" />
            </label>
            <label className="intake-preview-field intake-preview-field-wide">
              <span>识别来源</span>
              <input value={previewSourceFile} readOnly aria-readonly="true" placeholder="—" />
            </label>
          </div>
        ) : (
          <div className="intake-preview-empty" role="status">
            请在上方录入发票信息，识别结果将自动显示在这里。
          </div>
        )}
        {recognizedPreview.anomalies.length > 0 && (
          <div className="intake-preview-alerts" role="status">
            <strong>识别提示：</strong>
            {recognizedPreview.anomalies.join('；')}
          </div>
        )}
      </section>

      {error && <div className="intake-error" role="alert">{error}</div>}

      <div className="intake-actions">
        <button type="button" className="primary-button" onClick={() => void handleStart()} disabled={verifying}>
          {verifying ? 'AI 核验中…' : '提交表单'}
        </button>
        <span className="mock-badge">验真 / 查重：内置通道</span>
      </div>
    </div>
  );
}
