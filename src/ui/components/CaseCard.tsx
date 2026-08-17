import { Link } from 'react-router-dom';
import type { DemoCase } from '../../domain/types';

export function CaseCard({ item }: { item: DemoCase }) {
  return (
    <article className="case-card">
      <div className="card-topline">
        <span className={`risk-pill risk-${item.riskDecision.riskLevel}`}>风险 {item.riskDecision.riskLevel}</span>
        <span>{item.invoice.status}</span>
      </div>
      <h3>{item.title}</h3>
      <dl className="compact-facts">
        <div>
          <dt>类型</dt>
          <dd>{item.invoice.category}</dd>
        </div>
        <div>
          <dt>金额</dt>
          <dd>{item.invoice.amount.toLocaleString('zh-CN')} 元</dd>
        </div>
        <div>
          <dt>验真</dt>
          <dd>{item.invoice.verificationStatus}</dd>
        </div>
        <div>
          <dt>草稿</dt>
          <dd>{item.riskDecision.voucherDraft.status}</dd>
        </div>
      </dl>
      <Link className="text-link" to={`/invoices/${item.id}`}>
        查看三阶段处理
      </Link>
    </article>
  );
}
