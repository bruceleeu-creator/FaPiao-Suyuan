// 接口配置页（v3 · 2026-08-31 会话密钥制）
//
// 信息架构：
//   1. 会话密钥（SessionKeysPanel）——用户自己填密钥，仅存浏览器会话，关站自动清除
//   2. 一期接口边界——验真/凭证不再配置外部接口，由 DeepSeek AI 能力实现
//
// 设计原则：服务器不保存任何用户密钥（隐私保护，用户明确要求）；
// 接口地址由后端代理固定，无需用户填写。

import { Milestone, Sparkles } from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { SessionKeysPanel } from '../components/SessionKeysPanel';

export function IntegrationSettingsPage() {
  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="接口配置"
        title="密钥与服务状态"
        description="在此填入你自己的腾讯云 OCR 与 DeepSeek 密钥：仅存于当前浏览器会话，关闭网站自动清除，服务器不保存。「验证」发起一次最小真实调用确认密钥真实可用。"
      />

      <SessionKeysPanel />

      <section className="boundary-callout" aria-label="接口实现方式说明">
        <Milestone size={18} aria-hidden="true" />
        <div>
          <strong>接口实现方式</strong>
          <p>
            <b>腾讯云 OCR</b>（增值税发票识别）与 <b>DeepSeek</b>（类别识别 / 业务追问 / 风险初判）为真实调用，
            密钥按上方会话方式提供。<b>发票验真</b>与<b>凭证草稿</b>无需任何额外配置——
            由 DeepSeek 实现：
          </p>
          <ul className="aks-boundary-list">
            <li>
              <Sparkles size={12} aria-hidden="true" />
              验真 = 票面规则核验（号码位数 / 日期 / 价税勾稽）+ AI 一致性核验，
              结果标注「AI 辅助核验，非官方查验平台」，存疑一律交人工；
            </li>
            <li>
              <Sparkles size={12} aria-hidden="true" />
              凭证 = AI 生成借贷分录草稿（强制借贷平衡校验），失败自动回退本地规则生成；
            </li>
          </ul>
        </div>
      </section>
    </div>
  );
}
