// 集成接口配置类型定义
// 一期不接入真实接口，但保留正式 API 配置结构，便于后续替换。

export type IntegrationKey = 'ocr' | 'verify' | 'voucher';

export type IntegrationMode = '内置' | '正式';

export interface IntegrationConfig {
  key: IntegrationKey;
  name: string;
  mode: IntegrationMode;
  baseUrl: string;
  apiKey: string;
  timeoutMs: number;
  retryCount: number;
  enabled: boolean;
  lastTestResult: IntegrationTestResult | null;
}

export interface IntegrationTestResult {
  timestamp: string;
  success: boolean;
  message: string;
  durationMs: number;
  mode: IntegrationMode;
  // 始终为 true：内置通道的连通性检查不发起真实外部请求
  simulated: boolean;
}

// 侧边栏展示用模式摘要
export interface IntegrationModeSummary {
  key: IntegrationKey;
  name: string;
  mode: IntegrationMode;
  enabled: boolean;
  // 显示文本，例如 "OCR 识别：内置/正式配置未启用"
  displayLabel: string;
}
