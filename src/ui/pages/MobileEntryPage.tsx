import { Smartphone } from 'lucide-react';
import { PageHeader } from '../components/PageHeader';

export function MobileEntryPage() {
  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="手机端入口占位"
        title="一期只预留入口，不开发完整手机端"
        description="电脑端仍是财务审核、风险判断和凭证草稿处理主入口。"
      />

      <section className="mobile-placeholder">
        <div className="phone-frame" aria-hidden="true">
          <div className="phone-top" />
          <Smartphone size={44} />
          <strong>移动端占位</strong>
          <span>后续可接收上传和提醒，不承担财务审核闭环。</span>
        </div>
        <div className="boundary-list">
          <h2>本轮边界</h2>
          <p>不做移动端财务审核，不做完整手机端流程，不接入真实 OCR、验真或凭证服务。</p>
          <p>后续仅在电脑端闭环稳定后，再评估手机上传、补资料和审批提醒。</p>
        </div>
      </section>
    </div>
  );
}
