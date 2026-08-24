// 腾讯云发票 OCR 预留适配器
// 依据：CO_20260718_腾讯云OCR验真与标准凭证导入方案.md 第五节
//   - 服务未开通，仅返回占位响应
//   - 不发真实 HTTP 请求
//   - 不保存 SecretId / SecretKey
//   - 输出结构可映射到系统 Invoice 对象
//
// 后续真实接入时，仅需在 tencentCloudInvoiceOcrRecognize 内部替换为后端代理调用，
// 不需要改 input/output 类型。

export type TencentCloudOcrStatus =
  | 'reserved' // 接口预留，未开通
  | 'simulated' // 模拟响应（占位）
  | 'success' // 真实调用成功（未来）
  | 'failed' // 真实调用失败（未来）
  | 'manual_check'; // 兜底：进入手工录入

// OCR 输入：与真实腾讯云 OCR 接口对齐的子集
export interface TencentCloudOcrInput {
  // 文件名（用于日志，不上传）
  fileName?: string;
  // 文件类型（pdf/jpg/png）
  fileType?: string;
  // 文件大小（字节）
  fileSize?: number;
  // 操作人
  operator?: string;
  // 业务单号
  caseId?: string;
  // 是否强制走预留路径（默认 true，未来真实接入后可由调用方关闭）
  forceReserved?: boolean;
}

// OCR 输出：标准化后的票面字段，可映射到 Invoice 对象
export interface TencentCloudOcrResult {
  status: TencentCloudOcrStatus;
  // 是否为占位响应（reserved/simulated 时为 true）
  simulated: boolean;
  // 是否为预留响应（未调用真实接口）
  reserved: boolean;
  // 错误信息（status=failed/manual_check 时）
  errorMessage?: string;
  // 用户提示文案
  userMessage: string;
  // 标准化票面字段（status=success/simulated 时有值）
  invoiceType?: string;
  invoiceCode?: string;
  invoiceNumber?: string;
  issueDate?: string;
  seller?: string;
  buyer?: string;
  itemName?: string;
  amount?: number;
  taxAmount?: number;
  taxRate?: string;
  // OCR 置信度（0-1）
  recognitionConfidence?: number;
  // 后端保存的文件引用（未来真实接入时由后端返回）
  sourceFile?: string;
  // 原始响应时间戳
  timestamp: string;
  // 调用耗时（毫秒）
  durationMs: number;
}

// 预留开关：环境变量 / 全局配置
// 真实接入前必须返回占位响应
const TENCENT_OCR_RESERVED = true;

// 预留 OCR 适配器：返回占位响应，绝不发真实请求
export function tencentCloudInvoiceOcrRecognize(
  input: TencentCloudOcrInput,
): TencentCloudOcrResult {
  const start = Date.now();
  const timestamp = new Date().toISOString();

  // 阻断条件 1：服务未开通（环境变量 / 配置开关）
  // 当前阶段 TENCENT_OCR_RESERVED === true，永远进入预留分支
  // forceReserved=false 可让调用方在测试中绕过预留，进入真实调用兜底分支（仍未配置）
  if (TENCENT_OCR_RESERVED && input.forceReserved !== false) {
    return {
      status: 'reserved',
      simulated: true,
      reserved: true,
      userMessage: '腾讯云 OCR 服务尚未开通，当前使用接口预留响应。请使用手工录入，服务开通后将自动接入真实识别。',
      errorMessage: 'Tencent Cloud OCR service not enabled. Reserved placeholder response.',
      timestamp,
      durationMs: Date.now() - start,
      // 不返回任何票面字段，强制调用方走兜底
    };
  }

  // 真实接入分支（未来 Gate T3 启用）
  // 当前阶段不可达，留作骨架
  return {
    status: 'manual_check',
    simulated: false,
    reserved: false,
    userMessage: '腾讯云 OCR 真实调用未配置，请走手工录入兜底。',
    errorMessage: 'Real Tencent Cloud OCR call not configured.',
    timestamp,
    durationMs: Date.now() - start,
  };
}

// OCR 结果映射到 Invoice 局部字段（用于调用方快速合并）
// 注意：只返回票面字段，不返回 verificationStatus / status / category 等业务字段
export function mapOcrResultToInvoicePatch(
  result: TencentCloudOcrResult,
): Partial<{
  invoiceType: string;
  invoiceCode: string;
  invoiceNumber: string;
  issueDate: string;
  seller: string;
  buyer: string;
  itemName: string;
  amount: number;
  taxAmount: number;
  taxRate: string;
  recognitionConfidence: number;
  sourceFile: string;
}> {
  if (result.reserved || result.simulated || result.status !== 'success') {
    return {};
  }
  return {
    invoiceType: result.invoiceType,
    invoiceCode: result.invoiceCode,
    invoiceNumber: result.invoiceNumber,
    issueDate: result.issueDate,
    seller: result.seller,
    buyer: result.buyer,
    itemName: result.itemName,
    amount: result.amount,
    taxAmount: result.taxAmount,
    taxRate: result.taxRate,
    recognitionConfidence: result.recognitionConfidence,
    sourceFile: result.sourceFile,
  };
}

// 检查是否已开通真实 OCR 服务
// 当前阶段始终返回 false
export function isTencentCloudOcrEnabled(): boolean {
  return !TENCENT_OCR_RESERVED;
}

// 服务状态文案（用于 UI 展示）
export function getTencentCloudOcrStatusText(): string {
  return TENCENT_OCR_RESERVED ? '待开通' : '已开通';
}
