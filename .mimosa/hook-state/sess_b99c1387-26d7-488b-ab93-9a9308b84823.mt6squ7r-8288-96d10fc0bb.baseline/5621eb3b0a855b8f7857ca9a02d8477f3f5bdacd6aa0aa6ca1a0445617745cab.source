import type { IntegrationConfig, IntegrationTestResult } from './types';

// 模拟连接测试：当前阶段绝对不调用真实外部接口
// 测试逻辑：
// - 模拟模式：返回模拟成功，并明确标记 simulated=true
// - 正式模式：不发送真实请求，返回"仅保存配置"提示，同样 simulated=true
//
// 设计依据：CO_Gate2B多发票状态机与API配置方案.md 第四节
//   "如果模式切换到正式，页面必须提示：当前仅保存配置，不调用真实接口"
//   "测试连接使用模拟结果，不发真实外部请求"

export interface MockTestInput {
  config: IntegrationConfig;
}

export function mockTestConnection({ config }: MockTestInput): IntegrationTestResult {
  const start = Date.now();
  // 模拟网络延迟
  const durationMs = 80 + Math.floor(Math.random() * 220);

  // 即使是"正式"模式，也绝不发真实请求，只返回提示信息
  if (config.mode === '正式') {
    return {
      timestamp: new Date().toISOString(),
      success: false,
      message: '当前仅保存配置，不调用真实接口。正式模式将在后续 Gate 中接入真实调用。',
      durationMs: Date.now() - start + durationMs,
      mode: '正式',
      simulated: true,
    };
  }

  // 模拟模式：始终返回成功（不带 baseUrl 也允许，因为是模拟）
  const missingFields: string[] = [];
  if (!config.baseUrl) missingFields.push('Base URL');
  const hint = missingFields.length > 0
    ? `连通性检查通过（${missingFields.join('、')}未填写，内置模式可留空）。`
    : '连通性检查通过：连接参数已记录。';

  return {
    timestamp: new Date().toISOString(),
    success: true,
    message: hint,
    durationMs: Date.now() - start + durationMs,
    mode: '内置',
    simulated: true,
  };
}
