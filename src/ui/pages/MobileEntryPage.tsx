import { Smartphone } from 'lucide-react';
import { PageHeader } from '../components/PageHeader';

export function MobileEntryPage() {
  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="手机端 · 一期预留入口"
        title="电脑端是主入口，手机端规划三件事"
        description="系统一期已上线（http://49.232.160.7:8083/）。发票录入、三阶段审核与凭证草稿确认请在电脑端完成；手机端后续优先做「拍照传票、补传证据、审批提醒」。"
      />

      <section className="mobile-placeholder">
        <div className="phone-frame" aria-hidden="true">
          <div className="phone-top" />
          <Smartphone size={44} />
          <strong>移动端规划中</strong>
          <span>后续优先上线三件事：拍照上传发票、补充证据材料、审批进度提醒。</span>
          <span>不承担财务审核闭环，完整流程仍以电脑端为准。</span>
        </div>
        <div className="boundary-list">
          <h2>现在用手机浏览器能做什么</h2>
          <p>打开线上地址并登录后，工作台指标、发票列表、异常队列、风险驾驶舱均为响应式布局，手机上可正常查看与跟进。</p>
          <h2>核心操作请回到电脑端</h2>
          <p>发票录入与 OCR 上传、业务追问、证据补充、人工复核、凭证草稿确认等操作页面按电脑端布局设计，手机上不建议操作。</p>
          <h2>一期边界与密钥说明</h2>
          <p>一期不做移动端财务审核闭环，不开发完整手机端流程；电脑端闭环稳定后再评估手机端范围。</p>
          <p>密钥安全在手机端同样适用：会话密钥仅存于当前浏览器会话，关闭页面自动清除，服务器不保存任何用户密钥。</p>
        </div>
      </section>
    </div>
  );
}
