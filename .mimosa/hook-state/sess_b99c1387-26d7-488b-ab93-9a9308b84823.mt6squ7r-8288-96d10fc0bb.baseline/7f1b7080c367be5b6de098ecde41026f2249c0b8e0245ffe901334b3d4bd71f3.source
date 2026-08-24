import { Link, useParams } from 'react-router-dom';
import { useWorkflow } from '../../workflow/WorkflowContext';
import { findDemoCase } from '../../data/demoCases';
import { GateRail } from '../components/GateRail';
import { PageHeader } from '../components/PageHeader';
import type { WorkflowSession } from '../../domain/types';

export function InvoiceDetailPage() {
  const { caseId } = useParams();
  const { getCase } = useWorkflow();

  // 优先匹配本地 case（CASE-... 前缀），找不到再回退到 demo 样例
  const localCase: WorkflowSession | null = caseId ? getCase(caseId) : null;
  const isLocalCase = !!localCase;

  if (isLocalCase && localCase) {
    const session = localCase;
    const decision = session.decisionDraft;
    return (
      <div className="page-stack">
        <PageHeader
          eyebrow={`单张发票详情 · Case ${session.caseId}`}
          title={session.invoice.itemName || session.invoice.invoiceNumber}
          description={`发票号 ${session.invoice.invoiceNumber} · ${session.invoice.category} · 当前状态：${session.finalStatus}`}
        />

        <section className="stage-grid">
          <article className="stage-panel">
            <span className="stage-number">01</span>
            <h2>发票识别</h2>
            <dl className="fact-list">
              <div>
                <dt>发票对象</dt>
                <dd>{session.invoice.invoiceType} / {session.invoice.category}</dd>
              </div>
              <div>
                <dt>销方</dt>
                <dd>{session.invoice.seller}</dd>
              </div>
              <div>
                <dt>金额税额</dt>
                <dd>{session.invoice.amount} 元 / {session.invoice.taxAmount} 元</dd>
              </div>
              <div>
                <dt>集成通道</dt>
                <dd>OCR：票据识别；验真：{session.invoice.verificationStatus}</dd>
              </div>
            </dl>
          </article>

          <article className="stage-panel">
            <span className="stage-number">02</span>
            <h2>业务还原</h2>
            <dl className="fact-list">
              <div>
                <dt>业务事件对象</dt>
                <dd>{session.businessEvent.scenario}</dd>
              </div>
              <div>
                <dt>目的</dt>
                <dd>{session.businessEvent.purpose}</dd>
              </div>
              <div>
                <dt>置信度</dt>
                <dd>{Math.round(session.businessEvent.confidence * 100)}%</dd>
              </div>
              <div>
                <dt>证据链对象</dt>
                <dd>完整度 {session.evidenceChain.completenessScore}%；缺口 {session.evidenceChain.missingEvidence.length} 项</dd>
              </div>
            </dl>
          </article>

          <article className="stage-panel">
            <span className="stage-number">03</span>
            <h2>入账风险</h2>
            <dl className="fact-list">
              <div>
                <dt>当前最终状态</dt>
                <dd>{session.finalStatus}</dd>
              </div>
              <div>
                <dt>风险等级</dt>
                <dd>{decision?.riskLevel ?? '风险建议尚未生成'}</dd>
              </div>
              <div>
                <dt>凭证草稿边界</dt>
                <dd>{decision?.voucherDraft.status ?? '待生成'}：{decision?.voucherDraft.summary ?? '请先在流程页生成风险建议'}</dd>
              </div>
              <div>
                <dt>操作日志</dt>
                <dd>共 {session.actionLogs.length} 条（详见流程页）</dd>
              </div>
            </dl>
          </article>
        </section>

        <div className="workflow-footer">
          <Link className="button-link primary" to={`/invoices/${session.caseId}/workflow`}>继续处理</Link>
          <Link className="text-link" to="/invoices">返回列表</Link>
          <Link className="text-link" to="/exceptions">异常工作台</Link>
        </div>
      </div>
    );
  }

  // 演示样例路径
  const item = findDemoCase(caseId);
  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="单张发票三阶段处理"
        title={item.title}
        description="页面按“发票识别 -> 业务还原 -> 入账风险”展示，同步显示四道闸门和凭证草稿边界。"
      />

      <GateRail gates={item.gates} />

      <section className="stage-grid">
        <article className="stage-panel">
          <span className="stage-number">01</span>
          <h2>发票识别</h2>
          <dl className="fact-list">
            <div>
              <dt>发票对象</dt>
              <dd>{item.invoice.invoiceType} / {item.invoice.category}</dd>
            </div>
            <div>
              <dt>销方</dt>
              <dd>{item.invoice.seller}</dd>
            </div>
            <div>
              <dt>金额税额</dt>
              <dd>{item.invoice.amount} 元 / {item.invoice.taxAmount} 元</dd>
            </div>
            <div>
              <dt>集成通道</dt>
              <dd>OCR：票据识别；验真：{item.invoice.verificationStatus}</dd>
            </div>
          </dl>
        </article>

        <article className="stage-panel">
          <span className="stage-number">02</span>
          <h2>业务还原</h2>
          <dl className="fact-list">
            <div>
              <dt>业务事件对象</dt>
              <dd>{item.businessEvent.scenario}</dd>
            </div>
            <div>
              <dt>目的</dt>
              <dd>{item.businessEvent.purpose}</dd>
            </div>
            <div>
              <dt>受益人与承担理由</dt>
              <dd>{item.businessEvent.beneficiary}；{item.businessEvent.companyBurdenReason}</dd>
            </div>
            <div>
              <dt>证据链对象</dt>
              <dd>完整度 {item.evidenceChain.completenessScore}%；缺口 {item.evidenceChain.missingEvidence.length} 项</dd>
            </div>
          </dl>
        </article>

        <article className="stage-panel">
          <span className="stage-number">03</span>
          <h2>入账风险</h2>
          <dl className="fact-list">
            <div>
              <dt>风险决策对象</dt>
              <dd>风险等级 {item.riskDecision.riskLevel}，置信度 {Math.round(item.riskDecision.confidence * 100)}%</dd>
            </div>
            <div>
              <dt>会计结论</dt>
              <dd>{item.riskDecision.accountingConclusion}</dd>
            </div>
            <div>
              <dt>凭证草稿边界</dt>
              <dd>{item.riskDecision.voucherDraft.status}：{item.riskDecision.voucherDraft.summary}</dd>
            </div>
            <div>
              <dt>人工复核</dt>
              <dd>{item.riskDecision.humanReviewRecords.join('；')}</dd>
            </div>
          </dl>
        </article>
      </section>
    </div>
  );
}
