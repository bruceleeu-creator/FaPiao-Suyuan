import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AlertOctagon, CheckCircle2, Download, FileText, Layers } from 'lucide-react';
import { useWorkflow } from '../../workflow/WorkflowContext';
import { mockBuildVoucherDraft } from '../../ai/mockVoucherDraftService';
import { findDemoCaseAsSession } from '../../data/demoCaseToDecisionDraft';
import {
  buildVoucherCsv,
  buildVoucherCsvFilename,
  evaluateVoucherExportBlock,
} from '../../voucher/voucherCsvTemplate';
import { GateRail } from '../components/GateRail';
import { PageHeader } from '../components/PageHeader';

export function DecisionResultPage() {
  const { session: activeSession, activeCaseId, resolveCaseId, loadCase, getCase, dispatch } = useWorkflow();
  const params = useParams<{ caseId?: string }>();
  const resolvedCaseId = resolveCaseId(params.caseId);

  // 防串单：与 InvoiceWorkflowPage 保持一致，URL 带 caseId 且与 active 不符时切换 active
  useEffect(() => {
    if (params.caseId && params.caseId !== 'current' && params.caseId !== activeCaseId) {
      loadCase(params.caseId);
    }
  }, [params.caseId, activeCaseId, loadCase]);

  // 本地 session 优先；找不到时回退到 demoCases（仅用于演示预览，不写入 localStorage）
  // 依据：CO_20260718_本地页面验收与GateT2后端代理执行指令.md 第 2 节 P1 整改要求
  const session = useMemo(() => {
    if (!resolvedCaseId) return activeSession;
    if (activeSession && activeSession.caseId === resolvedCaseId) return activeSession;
    const localCase = getCase(resolvedCaseId);
    if (localCase && localCase.decisionDraft) return localCase;
    // 回退：按 caseId 在 demoCases 中查找（仅当本地 session 缺失或无 decisionDraft 时）
    return findDemoCaseAsSession(resolvedCaseId);
  }, [resolvedCaseId, activeSession, getCase]);

  // 标准凭证 CSV 导出状态（hooks 必须在 early return 之前调用）
  const [exportHint, setExportHint] = useState<string>('');

  // 自动清空导出提示
  useEffect(() => {
    if (!exportHint) return;
    const t = setTimeout(() => setExportHint(''), 3500);
    return () => clearTimeout(t);
  }, [exportHint]);

  if (!session || !session.decisionDraft) {
    return (
      <div className="page-stack">
        <PageHeader
          eyebrow="风险建议结果"
          title="尚未生成风险建议"
          description="请先完成流程，再查看风险建议结果。"
        />
        <Link className="button-link" to={`/invoices/${resolvedCaseId ?? 'current'}/workflow`}>前往流程页</Link>
      </div>
    );
  }

  const { decisionDraft, invoice } = session;
  const voucherText = mockBuildVoucherDraft(invoice, decisionDraft);
  const isBlocked = decisionDraft.voucherDraft.status === '禁止生成';
  // 本地 case 才能执行财务确认和误报标记（演示样例不持久化，dispatch 无效）
  const isLocalCase = session.caseId.startsWith('CASE-');
  // 财务确认动作：仅「凭证草稿已生成」状态下可用（通过->已完成，退回->待财务复核）
  const canConfirmVoucher = isLocalCase && session.finalStatus === '凭证草稿已生成' && !isBlocked;
  // 已标记误报的风险卡片
  const falsePositiveCards = decisionDraft.falsePositiveCards ?? [];

  // 标准凭证 CSV 导出状态
  const voucherBlock = evaluateVoucherExportBlock(invoice, decisionDraft);
  // 中风险待财务确认：可导出，但提示需财务确认
  const isPendingReview = decisionDraft.voucherDraft.status === '待人工确认';
  // 可导出条件：未阻断（包含可生成草稿 + 待人工确认）
  const canExportCsv = !voucherBlock.blocked;

  const handleExportVoucherCsv = () => {
    if (voucherBlock.blocked) {
      setExportHint(`禁止导出：${voucherBlock.reason}`);
      return;
    }
    const result = buildVoucherCsv(invoice, decisionDraft);
    const filename = buildVoucherCsvFilename(invoice, decisionDraft);
    try {
      // 使用 BOM 让 Excel 正确识别 UTF-8 编码
      const blob = new Blob([`\uFEFF${result.csv}`], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      // 释放 Blob URL，避免内存泄漏
      setTimeout(() => URL.revokeObjectURL(url), 0);
      setExportHint(
        isPendingReview
          ? `已导出标准凭证 CSV（${result.rowCount} 行）。中风险事项，需财务确认后才可正式导入。`
          : `已导出标准凭证 CSV（${result.rowCount} 行），借贷平衡。仅为草稿，不自动过账。`,
      );
    } catch (err) {
      setExportHint(`导出失败：${err instanceof Error ? err.message : '未知错误'}`);
    }
  };

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow={`风险决策与凭证草稿建议 · Case ${session.caseId}`}
        title={invoice.itemName || '风险建议结果'}
        description={`发票号 ${invoice.invoiceNumber} · ${invoice.category} · 最终状态：${decisionDraft.finalStatus}`}
      />

      {/* 最终状态横幅 */}
      <section
        className={`result-banner ${isBlocked ? 'banner-blocked' : decisionDraft.voucherDraft.status === '可生成草稿' ? 'banner-pass' : 'banner-pending'}`}
        role="status"
      >
        {isBlocked ? <AlertOctagon size={28} aria-hidden="true" /> : <CheckCircle2 size={28} aria-hidden="true" />}
        <div>
          <strong>{decisionDraft.voucherDraft.status}</strong>
          <p>{decisionDraft.voucherDraft.summary}</p>
        </div>
      </section>

      {/* 四道闸门 */}
      <section aria-label="四道闸门结果">
        <div className="section-head">
          <div>
            <span className="eyebrow">控制闸门</span>
            <h2>四道闸门结果</h2>
          </div>
        </div>
        <GateRail gates={decisionDraft.gates} />
      </section>

      {/* 建议详情 */}
      <section className="decision-grid" aria-label="风险建议详情">
        <article className="decision-tile">
          <span className="panel-kicker">会计处理建议</span>
          <p>{decisionDraft.accountingConclusion}</p>
        </article>
        <article className="decision-tile">
          <span className="panel-kicker">增值税处理建议</span>
          <p>{decisionDraft.vatConclusion}</p>
        </article>
        <article className="decision-tile">
          <span className="panel-kicker">企业所得税处理建议</span>
          <p>{decisionDraft.citConclusion}</p>
        </article>
        <article className="decision-tile">
          <span className="panel-kicker">其他风险提示{isLocalCase && '（可标记误报）'}</span>
          {decisionDraft.otherRiskNotes.length > 0 ? (
            <ul className="decision-list fp-card-list">
              {decisionDraft.otherRiskNotes.map((note) => {
                const marked = falsePositiveCards.includes(note);
                return (
                  <li key={note} className={marked ? 'fp-marked' : ''}>
                    <span className="fp-note-text">{note}</span>
                    {isLocalCase && (
                      <button
                        type="button"
                        className={`fp-toggle ${marked ? 'marked' : ''}`}
                        onClick={() =>
                          dispatch({ type: 'MARK_RISK_FALSE_POSITIVE', card: note, marked: !marked })
                        }
                        aria-pressed={marked}
                        title="标记后计入风险驾驶舱误报率统计"
                      >
                        {marked ? '已标误报' : '标记误报'}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p>无其他风险提示。</p>
          )}
        </article>
        <article className="decision-tile">
          <span className="panel-kicker">证据链结论</span>
          <p>{decisionDraft.evidenceConclusion}</p>
        </article>
        <article className="decision-tile">
          <span className="panel-kicker">风险等级与置信度</span>
          <p>
            风险等级：<span className={`risk-pill risk-${decisionDraft.riskLevel}`}>{decisionDraft.riskLevel}</span>
          </p>
          <p>置信度：{Math.round(decisionDraft.confidence * 100)}%</p>
          <p>
            业务问答完成：
            <span className={decisionDraft.businessQACompleted ? 'qa-pass' : 'qa-block'}>
              {decisionDraft.businessQACompleted ? '已完成（可入账判断）' : '未完成（业务闸门阻断）'}
            </span>
          </p>
          {session.aiRiskStale && (
            <p className="stale-warn">⚠ 旧 AI 风险初判已失效，需重新生成</p>
          )}
        </article>
        <article className="decision-tile">
          <span className="panel-kicker">整改建议</span>
          <ul className="decision-list">
            {decisionDraft.remediation.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </article>
        <article className="decision-tile">
          <span className="panel-kicker">审批要求</span>
          <p>{decisionDraft.approvalRequirement}</p>
        </article>
      </section>

      {/* Gate 3：入账建议卡片（完整版） */}
      {decisionDraft.postingAdvice && (
        <section className="posting-advice-panel" aria-label="入账科目建议">
          <div className="posting-advice-head">
            <Layers size={20} aria-hidden="true" />
            <strong>入账科目建议</strong>
            {decisionDraft.postingAdvice.manualReviewRequired && (
              <span className="manual-review-pill">需人工确认后正式生成</span>
            )}
            <span className="mock-badge">AI 建议 · 不自动过账</span>
          </div>
          <div className="posting-advice-body">
            <div className="advice-row">
              <span>一级科目</span>
              <strong>{decisionDraft.postingAdvice.primaryAccount}</strong>
            </div>
            <div className="advice-row">
              <span>二级科目</span>
              <strong>{decisionDraft.postingAdvice.secondaryAccount}</strong>
            </div>
            <div className="advice-row">
              <span>三级明细科目</span>
              <strong>{decisionDraft.postingAdvice.detailAccount}</strong>
            </div>
            <div className="advice-row advice-row-wide">
              <span>建议理由</span>
              <small>{decisionDraft.postingAdvice.reason}</small>
            </div>
            <div className="advice-row advice-row-wide">
              <span>适用条件</span>
              <small>{decisionDraft.postingAdvice.conditions}</small>
            </div>
          </div>
          <p className="posting-advice-note">
            入账建议由 AI 基于发票类别、业务事件和证据链综合判断，仅作为凭证草稿的科目参考。
            {decisionDraft.postingAdvice.manualReviewRequired
              ? '本案例涉及需要人工确认的情形，须由财务复核员确认后方可正式生成凭证。'
              : '低风险且证据完整的案例，可直接进入凭证草稿生成环节。'}
          </p>
        </section>
      )}

      {/* 凭证草稿 */}
      <section className="voucher-panel" aria-label="凭证草稿建议">
        <div className="voucher-head">
          <FileText size={20} aria-hidden="true" />
          <strong>凭证草稿建议</strong>
          <span className="mock-badge">草稿 · 不自动过账</span>
        </div>
        <pre className="voucher-text">{voucherText}</pre>
        <p className="voucher-note">
          凭证仅为草稿，不自动过账。高风险/阻断案例不生成可用凭证。
        </p>
      </section>

      {/* 标准凭证 CSV 导出入口（Gate T5） */}
      <section className="voucher-csv-panel" aria-label="标准凭证 CSV 导出">
        <div className="voucher-csv-head">
          <Download size={20} aria-hidden="true" />
          <strong>导出标准凭证 CSV</strong>
          <span className="mock-badge">标准 CSV 模板 · 不自动过账</span>
        </div>
        <div className="voucher-csv-body">
          <p className="voucher-csv-desc">
            基于 CO_20260718_标准凭证导入模板.csv 字段导出。借贷金额平衡；专票税额单独列示进项税；普票价税合计入费用。
          </p>
          {voucherBlock.blocked ? (
            <div className="voucher-csv-blocked" role="alert">
              <AlertOctagon size={16} aria-hidden="true" />
              <strong>禁止导出可导入凭证</strong>
              <small>{voucherBlock.reason}</small>
            </div>
          ) : isPendingReview ? (
            <div className="voucher-csv-pending" role="status">
              <CheckCircle2 size={16} aria-hidden="true" />
              <strong>中风险事项 · 待财务确认</strong>
              <small>可导出 CSV，但需财务确认后才可正式导入财务软件。</small>
            </div>
          ) : (
            <div className="voucher-csv-ready" role="status">
              <CheckCircle2 size={16} aria-hidden="true" />
              <strong>可导出标准凭证 CSV</strong>
              <small>低风险、验真通过、证据完整，导出后借贷平衡。</small>
            </div>
          )}
          <div className="voucher-csv-actions">
            <button
              type="button"
              className="primary-button"
              onClick={handleExportVoucherCsv}
              disabled={!canExportCsv}
              aria-disabled={!canExportCsv}
            >
              <Download size={14} aria-hidden="true" />
              {canExportCsv ? '导出标准凭证 CSV' : '禁止导出（已阻断）'}
            </button>
            <span className="voucher-csv-filename-hint">
              文件名格式：voucher-YYYYMMDD-{invoice.invoiceNumber}-draft.csv
            </span>
          </div>
          {exportHint && (
            <div className="voucher-csv-hint" role="status">
              {exportHint}
            </div>
          )}
        </div>
      </section>

      {/* 财务确认动作（凭证确认通过率统计来源） */}
      {isLocalCase && (
        <section className="finance-confirm-panel" aria-label="财务确认">
          <span className="panel-kicker">财务确认</span>
          {session.finalStatus === '已完成' ? (
            <p className="finance-confirm-done">
              <CheckCircle2 size={16} aria-hidden="true" />
              该 case 已完成财务确认通过，流程结束（凭证仍为草稿，不自动过账）。
            </p>
          ) : canConfirmVoucher ? (
            <div className="finance-confirm-actions">
              <p className="finance-confirm-hint">
                核对凭证草稿与入账建议后确认。通过后 case 完成；退回则回到待财务复核重新修正。
              </p>
              <div className="finance-confirm-buttons">
                <button
                  type="button"
                  className="primary-button"
                  onClick={() => dispatch({ type: 'CONFIRM_VOUCHER', mode: '通过' })}
                >
                  <CheckCircle2 size={14} aria-hidden="true" />
                  财务确认通过
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => dispatch({ type: 'CONFIRM_VOUCHER', mode: '退回修正' })}
                >
                  <AlertOctagon size={14} aria-hidden="true" />
                  退回修正
                </button>
              </div>
            </div>
          ) : (
            <p className="finance-confirm-hint">
              当前状态为「{session.finalStatus}」。凭证草稿生成后（状态「凭证草稿已生成」）可在此执行财务确认。
            </p>
          )}
        </section>
      )}

      {/* 人工复核记录 */}
      <section className="review-panel" aria-label="人工复核记录">
        <span className="panel-kicker">人工复核记录</span>
        <ul className="review-list">
          {decisionDraft.humanReviewRecords.map((r, i) => (
            <li key={i}>{r}</li>
          ))}
          <li>风险建议版本：{decisionDraft.version}</li>
        </ul>
      </section>

      <div className="workflow-footer">
        <Link className="text-link" to={`/invoices/${resolvedCaseId ?? 'current'}/workflow`}>返回流程</Link>
        <Link className="text-link" to="/intake">录入新发票</Link>
        <Link className="text-link" to="/invoices">发票列表</Link>
        <Link className="text-link" to="/">回工作台</Link>
      </div>
    </div>
  );
}
