// 接口配置页（v2 · 2026-08-31 重构）
//
// 信息架构：
//   1. 密钥与服务状态（AdminKeysPanel）——真实的密钥配置与验证，页面唯一的主角
//   2. 一期接口边界——验真/凭证为内置模拟通道，不在此配置（诚实说明，不放假配置卡）
//
// 历史说明：旧版此页曾含 localStorage 配置卡与「预留状态」瓦片（三代 UI 叠加），
// 与服务端真实密钥管理相互矛盾、造成误配；已随本次重构移除。
// 旧配置存储（integrationConfigStore）仍服务于侧栏「集成通道」指示，未删除。

import { Cloud, Milestone } from 'lucide-react';
import { DEFAULT_TENCENT_CLOUD_STATUS } from '../../integrations/defaultConfigs';
import { PageHeader } from '../components/PageHeader';
import { AdminKeysPanel } from '../components/AdminKeysPanel';

export function IntegrationSettingsPage() {
  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="接口配置"
        title="密钥与服务状态"
        description="在此配置腾讯云 OCR 与 DeepSeek 密钥：保存即生效（加密存储在服务器），「验证」发起一次最小真实调用确认密钥真实可用。"
      />

      <AdminKeysPanel />

      <section className="boundary-callout" aria-label="一期接口边界">
        <Milestone size={18} aria-hidden="true" />
        <div>
          <strong>一期接口边界</strong>
          <p>
            真实调用：<b>腾讯云 OCR</b>（增值税发票识别）与 <b>DeepSeek</b>（类别识别 / 业务追问 / 风险初判，失败自动回退本地规则）。
            内置模拟：<b>发票验真</b>与<b>凭证接口</b>为预留通道，一期不提供真实调用，也无需在此配置——真实发票识别不受影响。
          </p>
          <div className="aks-links aks-links--page">
            <a
              href={DEFAULT_TENCENT_CLOUD_STATUS.ocrDocUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Cloud size={11} aria-hidden="true" /> 增值税发票识别文档
            </a>
            <a
              href={DEFAULT_TENCENT_CLOUD_STATUS.verifyDocUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Cloud size={11} aria-hidden="true" /> 发票核验文档（后续开通）
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}
