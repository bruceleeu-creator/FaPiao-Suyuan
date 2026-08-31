// DeepSeek 发票解释服务（前端调用层）
//
// 职责：OCR 识别成功后，把腾讯云返回的原始字段 + 当前表单发给后端代理
// （/api/deepseek/interpret），由 DeepSeek 判断发票类别并补齐缺失字段。
// API 密钥仅保存在后端 .env，前端不接触密钥。
import type { InvoiceCategory } from '../domain/types';
import { authHeaders } from '../auth/authStorage';
import { deepSeekCredentialBody } from '../integrations/sessionKeyStore';

export interface DeepSeekOcrField {
  name: string;
  value: string;
}

export interface DeepSeekInterpretFields {
  invoiceType: string;
  invoiceCode: string;
  invoiceNumber: string;
  issueDate: string;
  seller: string;
  buyer: string;
  itemName: string;
  totalAmount: number;
  taxRate: string;
}

export interface DeepSeekInterpretData {
  category: InvoiceCategory | null;
  reason: string;
  fields: DeepSeekInterpretFields;
}

export type DeepSeekInterpretResult =
  | { ok: true; data: DeepSeekInterpretData }
  | { ok: false; message: string };

export async function interpretInvoiceViaDeepSeek(
  ocrFields: DeepSeekOcrField[],
  currentForm: unknown,
): Promise<DeepSeekInterpretResult> {
  try {
    const response = await fetch('/api/deepseek/interpret', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ ocrFields, currentForm, ...deepSeekCredentialBody() }),
    });
    const text = await response.text();
    let result: { ok?: boolean; data?: DeepSeekInterpretData; message?: string } | null = null;
    try {
      result = text ? JSON.parse(text) : null;
    } catch {
      result = null;
    }
    if (!result) {
      return {
        ok: false,
        message: `后端代理未启动或不可用（HTTP ${response.status}）`,
      };
    }
    if (result.ok && result.data) {
      return { ok: true, data: result.data };
    }
    return { ok: false, message: result.message || 'DeepSeek 识别失败。' };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : 'DeepSeek 请求失败。',
    };
  }
}
