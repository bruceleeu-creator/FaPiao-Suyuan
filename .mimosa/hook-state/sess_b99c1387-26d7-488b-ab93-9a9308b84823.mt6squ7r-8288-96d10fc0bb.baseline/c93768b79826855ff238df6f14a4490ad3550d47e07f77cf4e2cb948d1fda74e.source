// 腾讯云发票核验预留适配器
// 依据：CO_20260718_腾讯云OCR验真与标准凭证导入方案.md 第六节
//   - 服务未开通，仅返回占位响应
//   - 不发真实 HTTP 请求
//   - 不保存 SecretId / SecretKey
//   - 核验结果输出「待人工核验」或预留提示
//   - 输出可映射到 Invoice.verificationStatus / redLetterStatus

import type { Invoice } from '../domain/types';

// 腾讯云发票核验状态映射（与方案第六节表格一致）
export type TencentCloudVerifyStatus =
  | 'reserved' // 接口预留，未开通
  | 'manual_check' // 待人工核验（兜底）
  | 'verified_pass' // 核验通过（未来）
  | 'verified_fail' // 核验失败（未来）
  | 'voided' // 已作废（未来）
  | 'red_letter' // 已红冲（未来）
  | 'timeout' // 接口超时（未来）
  | 'unsupported_type'; // 票种不支持（未来）

// 核验输入：与真实腾讯云发票核验接口对齐的子集
export interface TencentCloudVerifyInput {
  invoiceCode?: string;
  invoiceNumber?: string;
  issueDate?: string;
  amount?: number;
  checkCode?: string;
  invoiceType?: string;
  // 操作人
  operator?: string;
  // 业务单号
  caseId?: string;
  // 是否强制走预留路径（默认 true）
  forceReserved?: boolean;
}

// 核验输出
export interface TencentCloudVerifyResult {
  status: TencentCloudVerifyStatus;
  // 是否为占位响应
  simulated: boolean;
  // 是否为预留响应
  reserved: boolean;
  // 用户提示文案
  userMessage: string;
  // 错误信息
  errorMessage?: string;
  // 映射到 Invoice.verificationStatus
  mappedVerificationStatus?: Invoice['verificationStatus'];
  // 映射到 Invoice.redLetterStatus
  mappedRedLetterStatus?: Invoice['redLetterStatus'];
  // 原始响应时间戳
  timestamp: string;
  // 调用耗时
  durationMs: number;
}

// 预留开关：真实接入前为 true
const TENCENT_VERIFY_RESERVED = true;

// 预留核验适配器：返回占位响应，绝不发真实请求
export function tencentCloudInvoiceVerify(
  input: TencentCloudVerifyInput,
): TencentCloudVerifyResult {
  const start = Date.now();
  const timestamp = new Date().toISOString();

  // 阻断条件：服务未开通
  // forceReserved=false 可让调用方在测试中绕过预留，进入真实调用兜底分支（仍未配置）
  if (TENCENT_VERIFY_RESERVED && input.forceReserved !== false) {
    return {
      status: 'reserved',
      simulated: true,
      reserved: true,
      userMessage:
        '腾讯云发票核验服务尚未开通，当前使用接口预留响应，发票核验结果暂为「待人工核验」。服务开通后将自动接入真实核验。',
      errorMessage: 'Tencent Cloud invoice verification service not enabled.',
      // 当前不映射到验真通过/失败，避免误导
      // 调用方应保持原有 verificationStatus 或走人工核验兜底
      mappedVerificationStatus: undefined,
      mappedRedLetterStatus: undefined,
      timestamp,
      durationMs: Date.now() - start,
    };
  }

  // 真实接入分支（未来 Gate T4 启用）
  // 当前阶段不可达
  return {
    status: 'manual_check',
    simulated: false,
    reserved: false,
    userMessage: '腾讯云发票核验真实调用未配置，请走待人工核验兜底。',
    errorMessage: 'Real Tencent Cloud invoice verification not configured.',
    timestamp,
    durationMs: Date.now() - start,
  };
}

// 将腾讯云核验状态映射为系统 Invoice 字段
// 依据方案第六节表格
export function mapVerifyResultToInvoicePatch(
  result: TencentCloudVerifyResult,
): Partial<{ verificationStatus: Invoice['verificationStatus']; redLetterStatus: Invoice['redLetterStatus'] }> {
  if (result.reserved || result.simulated) {
    return {};
  }
  switch (result.status) {
    case 'verified_pass':
      return { verificationStatus: '验真通过' };
    case 'verified_fail':
      return { verificationStatus: '验真失败' };
    case 'voided':
      return { redLetterStatus: '已作废' };
    case 'red_letter':
      return { redLetterStatus: '已红冲' };
    case 'timeout':
    case 'unsupported_type':
    case 'manual_check':
      // 待人工核验：不修改现有 verificationStatus，由调用方走兜底
      return {};
    default:
      return {};
  }
}

// 检查是否已开通真实核验服务
export function isTencentCloudVerifyEnabled(): boolean {
  return !TENCENT_VERIFY_RESERVED;
}

// 服务状态文案（用于 UI 展示）
export function getTencentCloudVerifyStatusText(): string {
  return TENCENT_VERIFY_RESERVED ? '待开通' : '已开通';
}

// 默认兜底建议：核验服务未开通时，提示用户走人工核验流程
export function getVerifyFallbackAdvice(): string {
  return '腾讯云发票核验服务尚未开通。当前发票状态以系统验真或人工核验为准，待服务开通后将自动接入真实核验。';
}
