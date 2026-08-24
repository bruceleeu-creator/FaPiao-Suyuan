import type { IntegrationConfig, IntegrationKey } from './types';

// 三个集成接口的默认配置
// OCR 已通过后端代理接入腾讯云真实识别，默认正式；验真 / 凭证接口一期使用系统内置通道
export const INTEGRATION_NAMES: Record<IntegrationKey, string> = {
  ocr: 'OCR 识别 API',
  verify: '发票验真 API',
  voucher: '凭证接口 API',
};

// 腾讯云接口预留状态（Gate T1）
// 不保存 SecretId / SecretKey，只保存服务开通状态和推荐文档
// 真实密钥未来通过 .env 或部署环境变量注入，不进入前端 localStorage
export interface TencentCloudReservedStatus {
  // 腾讯云账号是否已有
  accountAvailable: boolean;
  // OCR 服务是否已开通
  ocrEnabled: boolean;
  // 发票核验服务是否已开通
  verifyEnabled: boolean;
  // 凭证接入：当前使用 CSV 模板第一版
  voucherIntegration: 'CSV 模板第一版' | '金蝶' | '用友' | '畅捷通' | '其他';
  // 推荐文档链接（来自 CO_20260718_腾讯云OCR验真与标准凭证导入方案.md 第二节）
  ocrDocUrl: string;
  verifyDocUrl: string;
  // 安全提示
  securityNote: string;
}

export const DEFAULT_TENCENT_CLOUD_STATUS: TencentCloudReservedStatus = {
  accountAvailable: true,
  ocrEnabled: false,
  verifyEnabled: false,
  voucherIntegration: 'CSV 模板第一版',
  ocrDocUrl: 'https://cloud.tencent.com/document/product/866/36210',
  verifyDocUrl: 'https://cloud.tencent.com/document/product/866/73674',
  securityNote:
    'SecretId 与 SecretKey 仅允许通过 .env 或部署环境变量注入，不得写入前端源码、localStorage、测试或文档示例。',
};

export function createDefaultIntegrationConfig(
  key: IntegrationKey,
  overrides: Partial<IntegrationConfig> = {},
): IntegrationConfig {
  return {
    key,
    name: INTEGRATION_NAMES[key],
    mode: '内置',
    baseUrl: '',
    apiKey: '',
    timeoutMs: 5000,
    retryCount: 1,
    enabled: true,
    lastTestResult: null,
    ...overrides,
  };
}

export function createDefaultIntegrationConfigs(): Record<IntegrationKey, IntegrationConfig> {
  return {
    // OCR：录入页经后端代理调用腾讯云 VatInvoiceOCR（真实调用）
    ocr: createDefaultIntegrationConfig('ocr', { mode: '正式' }),
    verify: createDefaultIntegrationConfig('verify'),
    voucher: createDefaultIntegrationConfig('voucher'),
  };
}

// 侧边栏展示文本：例如 "OCR 识别 API：内置/配置未启用"
export function buildIntegrationDisplayLabel(config: IntegrationConfig): string {
  const enabledSuffix = config.enabled ? '' : '配置未启用';
  if (config.mode === '正式') {
    return enabledSuffix ? `${config.name}：正式/${enabledSuffix}` : `${config.name}：正式`;
  }
  return enabledSuffix ? `${config.name}：内置/${enabledSuffix}` : `${config.name}：内置`;
}
