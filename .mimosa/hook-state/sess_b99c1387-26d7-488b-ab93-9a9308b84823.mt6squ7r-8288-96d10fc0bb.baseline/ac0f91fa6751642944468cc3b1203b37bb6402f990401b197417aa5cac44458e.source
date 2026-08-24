import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, RefreshCw, Upload } from 'lucide-react';
import { useWorkflow } from '../../workflow/WorkflowContext';
import { mockRequiredEvidenceGuidance } from '../../ai/mockEvidenceMatcher';
import {
  buildExceptionRows,
  buildExceptionTypeStats,
  buildResolvedExceptionRows,
  DEFAULT_EXCEPTION_FILTER,
  filterExceptionRows,
  sortExceptionRows,
  type ExceptionBoardFilter,
  ExceptionSortKey,
  type ExceptionBoardRow,
  type ExceptionType,
} from '../exceptionBoard';
import { PageHeader } from '../components/PageHeader';
import { KnowledgeCard } from '../components/KnowledgeCard';
import type { RiskLevel } from '../../domain/types';

// 异常类型 tag 的展示样式（沿用现有 exception-tag 类）
const RISK_LEVELS: RiskLevel[] = ['高', '中', '中低', '低'];

export function ExceptionsPage() {
  const { cases, loadCase, dispatch } = useWorkflow();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  // 驾驶舱/列表跳入的定位 caseId（高亮展示）
  const focusCaseId = searchParams.get('focus');

  // tab：待处理 / 已解除
  const [tab, setTab] = useState<'pending' | 'resolved'>('pending');
  // 筛选与排序
  const [filter, setFilter] = useState<ExceptionBoardFilter>(DEFAULT_EXCEPTION_FILTER);
  const [sortKey, setSortKey] = useState<ExceptionSortKey>('priority');
  // Gate 3：补资料 UI 状态 - 当前展开的 caseId 和选择的补料证据
  const [resupplyCaseId, setResupplyCaseId] = useState<string | null>(null);
  const [resupplySelection, setResupplySelection] = useState<string[]>([]);

  // 统一异常队列：仅本地真实录入的 case（演示样例为本不存在的数据，不进异常统计）
  const allRows = useMemo(() => buildExceptionRows(cases, []), [cases]);

  // 统计概览：8 类异常的计数与金额（基于未筛选全量行）
  const typeStats = useMemo(() => buildExceptionTypeStats(allRows), [allRows]);

  // 筛选 + 排序后的待处理队列
  const visibleRows = useMemo(
    () => sortExceptionRows(filterExceptionRows(allRows, filter), sortKey),
    [allRows, filter, sortKey],
  );

  // 已解除队列：本地 case 当前无异常但留有「异常已解除」日志
  const resolvedRows = useMemo(() => buildResolvedExceptionRows(cases), [cases]);

  const totalAmount = allRows.reduce((sum, row) => sum + row.amount, 0);

  const toggleTypeFilter = (type: ExceptionType) => {
    setFilter((prev) => ({
      ...prev,
      types: prev.types.includes(type)
        ? prev.types.filter((t) => t !== type)
        : [...prev.types, type],
    }));
  };

  // Gate 3：开始补料
  const startResupply = (caseId: string) => {
    setResupplyCaseId(caseId);
    setResupplySelection([]);
    loadCase(caseId); // 切换 active，便于 dispatch
  };

  // Gate 3：提交补料 -> dispatch RESUPPLY_EVIDENCE -> 跳转 workflow
  const submitResupply = (caseId: string) => {
    if (resupplySelection.length === 0) {
      return;
    }
    dispatch({ type: 'RESUPPLY_EVIDENCE', items: resupplySelection, fromException: true, targetCaseId: caseId });
    setResupplyCaseId(null);
    setResupplySelection([]);
    navigate(`/invoices/${caseId}/workflow`);
  };

  // Gate 3：补料证据指导清单（基于当前 case 的发票类别）
  const resupplyGuidance = useMemo(() => {
    if (!resupplyCaseId) return [];
    const targetCase = cases.find((c) => c.caseId === resupplyCaseId);
    if (!targetCase) return [];
    return mockRequiredEvidenceGuidance(targetCase.invoice.category);
  }, [resupplyCaseId, cases]);

  const clearFocus = () => {
    if (!focusCaseId) return;
    const next = new URLSearchParams(searchParams);
    next.delete('focus');
    setSearchParams(next);
  };

  // 单张异常卡片（本地行保留补料面板等全部操作）
  const renderExceptionCard = (item: ExceptionBoardRow) => {
    const isResupplying = resupplyCaseId === item.caseId;
    const isFocused = focusCaseId === item.caseId;
    const targetSession = cases.find((c) => c.caseId === item.caseId);
    const uploadedEvidence = targetSession?.evidenceChain?.uploadedEvidence ?? [];

    return (
      <article
        className={`exception-card ${isFocused ? 'exception-card-focus' : ''}`}
        key={item.caseId}
        id={`exception-${item.caseId}`}
      >
        <div className="section-head">
          <div>
            <span className="eyebrow">
              {item.invoiceNumber} · {item.caseId}
            </span>
            <h2>{item.seller} · {item.category} · {item.amount.toLocaleString('zh-CN')} 元</h2>
          </div>
          <span className={`risk-pill risk-${item.riskLevel}`}>风险 {item.riskLevel}</span>
        </div>
        <div className="exception-tags">
          {item.exceptions.map((ex: ExceptionType) => (
            <span className={`exception-tag tag-${ex}`} key={ex}>{ex}</span>
          ))}
        </div>
        {/* 证据缺口和补证建议：长文本截断，悬停查看完整缺口清单 */}
        {(item.evidenceGaps.length > 0 || item.insufficientEvidence.length > 0) && (
          <div className="resupply-hint" role="note">
            <AlertTriangle size={14} aria-hidden="true" />
            <KnowledgeCard
              variant="plain"
              title="证据缺口详情"
              detailWidth={380}
              detail={
                <>
                  {item.evidenceGaps.length > 0 && (
                    <p>证据缺口（{item.evidenceGaps.length} 项）：{item.evidenceGaps.join('、')}</p>
                  )}
                  {item.insufficientEvidence.length > 0 && (
                    <p>已上传但不足以证明（{item.insufficientEvidence.length} 项）：{item.insufficientEvidence.join('、')}</p>
                  )}
                  <p>可在下方「补充材料并重新分析」中逐项补齐，补料后旧 AI 风险初判将失效并需重新生成。</p>
                </>
              }
            >
              {item.evidenceGaps.length > 0 && `证据缺口（${item.evidenceGaps.length} 项）：${item.evidenceGaps.join('、')}`}
              {item.evidenceGaps.length > 0 && item.insufficientEvidence.length > 0 && '；'}
              {item.insufficientEvidence.length > 0 && `不足以证明：${item.insufficientEvidence.join('、')}`}
            </KnowledgeCard>
          </div>
        )}
        <div className="exception-actions">
          {item.workflowPath && (
            <>
              <Link
                className="button-link primary"
                to={item.workflowPath}
                onClick={() => loadCase(item.caseId)}
              >
                继续处理
              </Link>
              <button
                type="button"
                className="secondary-button"
                onClick={() => startResupply(item.caseId)}
                aria-expanded={isResupplying}
                aria-controls={`resupply-panel-${item.caseId}`}
              >
                <RefreshCw size={14} aria-hidden="true" />
                {isResupplying ? '收起补料' : '补充材料并重新分析'}
              </button>
            </>
          )}
          <Link className="text-link" to={item.detailPath}>查看详情</Link>
        </div>
        {/* Gate 3：就地展开的补料面板 */}
        {isResupplying && (
          <div className="resupply-panel" id={`resupply-panel-${item.caseId}`} aria-label="补充材料面板">
            <div className="resupply-panel-head">
              <Upload size={16} aria-hidden="true" />
              <strong>补充材料（{item.category}）</strong>
              <small>补料后旧 AI 风险初判将失效，需在三阶段处理页重新点击生成</small>
            </div>
            <div className="evidence-checklist structured">
              {resupplyGuidance.map((g) => {
                const isUploaded = uploadedEvidence.includes(g.name);
                const isSelected = resupplySelection.includes(g.name);
                return (
                  <label className="evidence-item structured" key={g.name}>
                    <div className="evidence-head">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => {
                          setResupplySelection((prev) =>
                            prev.includes(g.name)
                              ? prev.filter((i) => i !== g.name)
                              : [...prev, g.name],
                          );
                        }}
                        disabled={isUploaded}
                      />
                      <span className="evidence-name">
                        {g.name}
                        {g.required && <span className="required-mark"> *</span>}
                      </span>
                      <span className={`evidence-status ${isUploaded ? 'status-已上传' : 'status-未上传'}`}>
                        {isUploaded ? '已上传' : '未上传'}
                      </span>
                    </div>
                    <div className="evidence-purpose">
                      <strong>证明目的：</strong>{g.proofPurpose}
                    </div>
                    <div className="evidence-impact">
                      <strong>缺失影响：</strong>{g.missingImpact}
                    </div>
                  </label>
                );
              })}
            </div>
            {resupplySelection.length === 0 && (
              <div className="qa-warn" role="status">
                <AlertTriangle size={14} aria-hidden="true" />
                <span>请至少勾选一项证据后提交，否则补料无效。</span>
              </div>
            )}
            <div className="resupply-actions">
              <button
                type="button"
                className="primary-button"
                disabled={resupplySelection.length === 0}
                onClick={() => submitResupply(item.caseId)}
              >
                提交补料并跳转流程 <RefreshCw size={14} aria-hidden="true" />
              </button>
              <button
                type="button"
                className="text-link"
                onClick={() => {
                  setResupplyCaseId(null);
                  setResupplySelection([]);
                }}
              >
                取消
              </button>
            </div>
          </div>
        )}
      </article>
    );
  };

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="异常工作台"
        title="阻断和待补充事项优先处理"
        description="仅统计本地真实录入的发票，支持按类型/风险筛选和优先级排序；补料解异常后进入「已解除」留痕。"
      />

      {/* 定位高亮提示（从驾驶舱/列表跳入） */}
      {focusCaseId && (
        <div className="focus-banner" role="status">
          <AlertTriangle size={14} aria-hidden="true" />
          <span>已定位到 {focusCaseId} 的异常卡片（若不在当前筛选内请清除筛选）。</span>
          <button type="button" className="text-link" onClick={clearFocus}>清除定位</button>
        </div>
      )}

      {/* 统计概览条：8 类异常计数 chips（点击筛选） */}
      <section className="exception-stats" aria-label="异常类型统计">
        <div className="section-head">
          <div>
            <span className="eyebrow">异常类型统计</span>
            <h2>共 {allRows.length} 条待处理 · 金额合计 {totalAmount.toLocaleString('zh-CN')} 元</h2>
          </div>
          <span className="mock-badge">本地 case</span>
        </div>
        <div className="exception-stat-chips">
          {typeStats.map((stat) => (
            <button
              type="button"
              key={stat.type}
              className={`exception-stat-chip ${filter.types.includes(stat.type) ? 'active' : ''}`}
              onClick={() => toggleTypeFilter(stat.type)}
              aria-pressed={filter.types.includes(stat.type)}
              disabled={stat.count === 0 && !filter.types.includes(stat.type)}
            >
              <span className="chip-name">{stat.type}</span>
              <span className="chip-count">{stat.count}</span>
              <span className="chip-amount">{stat.totalAmount.toLocaleString('zh-CN')} 元</span>
            </button>
          ))}
        </div>
      </section>

      {/* 待处理 / 已解除 tab + 筛选排序栏 */}
      <div className="exception-toolbar">
        <div className="board-tabs" role="tablist" aria-label="异常队列视角">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'pending'}
            className={`board-tab ${tab === 'pending' ? 'active' : ''}`}
            onClick={() => setTab('pending')}
          >
            <AlertTriangle size={14} aria-hidden="true" />
            待处理（{allRows.length}）
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'resolved'}
            className={`board-tab ${tab === 'resolved' ? 'active' : ''}`}
            onClick={() => setTab('resolved')}
          >
            <CheckCircle2 size={14} aria-hidden="true" />
            已解除（{resolvedRows.length}）
          </button>
        </div>
        {tab === 'pending' && (
          <div className="exception-filter-bar">
            <label>
              风险
              <select
                value={filter.riskLevel ?? ''}
                onChange={(e) =>
                  setFilter((prev) => ({ ...prev, riskLevel: (e.target.value || undefined) as RiskLevel | undefined }))
                }
              >
                <option value="">全部</option>
                {RISK_LEVELS.map((level) => (
                  <option key={level} value={level}>{level}</option>
                ))}
              </select>
            </label>
            <label>
              排序
              <select value={sortKey} onChange={(e) => setSortKey(e.target.value as ExceptionSortKey)}>
                <option value="priority">优先级（默认）</option>
                <option value="amount">金额</option>
                <option value="time">时间</option>
                <option value="exceptionCount">异常数量</option>
              </select>
            </label>
            {(filter.types.length > 0 || filter.source !== 'all' || filter.riskLevel) && (
              <button
                type="button"
                className="text-link"
                onClick={() => setFilter(DEFAULT_EXCEPTION_FILTER)}
              >
                清除筛选
              </button>
            )}
          </div>
        )}
      </div>

      {tab === 'pending' ? (
        <section aria-label="统一异常队列">
          {visibleRows.length === 0 ? (
            <p className="empty-hint">
              {allRows.length === 0
                ? '暂无异常事项。录入高风险或证据缺失发票、或调整规则阈值后即可在此看到。'
                : '当前筛选下无匹配的异常事项，请调整筛选条件。'}
            </p>
          ) : (
            <div className="exception-list">{visibleRows.map(renderExceptionCard)}</div>
          )}
        </section>
      ) : (
        <section aria-label="已解除异常">
          {resolvedRows.length === 0 ? (
            <p className="empty-hint">暂无已解除记录。在待处理队列补齐材料使异常清空后，会在此留痕。</p>
          ) : (
            <div className="exception-list">
              {resolvedRows.map((row) => (
                <article className="exception-card resolved" key={row.caseId}>
                  <div className="section-head">
                    <div>
                      <span className="eyebrow">{row.invoiceNumber} · {row.caseId}</span>
                      <h2>{row.seller} · {row.category} · {row.amount.toLocaleString('zh-CN')} 元</h2>
                    </div>
                    <span className={`status-pill status-${row.currentStatus}`}>当前状态：{row.currentStatus}</span>
                  </div>
                  <div className="resolved-meta">
                    <span className="resolved-types">
                      已解除：{row.resolvedTypes.length > 0 ? row.resolvedTypes.join('、') : '（历史记录）'}
                    </span>
                    <span className="resolved-at">解除时间：{new Date(row.resolvedAt).toLocaleString('zh-CN')}</span>
                    <span className={`risk-pill risk-${row.riskLevel}`}>当前风险 {row.riskLevel}</span>
                  </div>
                  <div className="exception-actions">
                    <Link
                      className="button-link primary"
                      to={row.workflowPath}
                      onClick={() => loadCase(row.caseId)}
                    >
                      继续处理
                    </Link>
                    <Link className="text-link" to={row.detailPath}>查看详情</Link>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
