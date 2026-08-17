import { ArrowLeft, FilePlus2, FilterX, Search, ShieldAlert } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMemo, useState } from 'react';
import { useWorkflow } from '../../workflow/WorkflowContext';
import { demoCases } from '../../data/demoCases';
import { detectCaseExceptions } from '../../cases/caseStore';
import { PageHeader } from '../components/PageHeader';
import { KnowledgeCard } from '../components/KnowledgeCard';
import {
  buildRiskDrilldownRows,
  getRiskDrilldownSummary,
  type RiskDrilldownQuery,
  type RiskFilterKey,
  type GateFilterKey,
  type DimensionKey,
  type KpiFilterKey,
} from '../riskDrilldown';

const VALID_RISK_FILTERS: RiskFilterKey[] = ['high-risk', 'remediation', 'pending-judgment'];
const VALID_GATE_FILTERS: GateFilterKey[] = ['发票闸门', '业务闸门', '证据闸门', '风险闸门'];
const VALID_DIMENSIONS: DimensionKey[] = ['department', 'person', 'supplier'];
const VALID_KPIS: KpiFilterKey[] = ['ai-adoption', 'manual-modify', 'voucher-pass', 'false-positive'];

export function InvoiceListPage() {
  const { cases, loadCase } = useWorkflow();
  const [searchParams, setSearchParams] = useSearchParams();
  const [keyword, setKeyword] = useState('');

  // 读取下钻筛选参数并校验
  const riskFilterRaw = searchParams.get('riskFilter');
  const gateRaw = searchParams.get('gate');
  const dimensionRaw = searchParams.get('dimension');
  const kpiRaw = searchParams.get('kpi');
  const riskFilter = VALID_RISK_FILTERS.includes(riskFilterRaw as RiskFilterKey)
    ? (riskFilterRaw as RiskFilterKey)
    : undefined;
  const gate = VALID_GATE_FILTERS.includes(gateRaw as GateFilterKey)
    ? (gateRaw as GateFilterKey)
    : undefined;
  const dimension = VALID_DIMENSIONS.includes(dimensionRaw as DimensionKey)
    ? (dimensionRaw as DimensionKey)
    : undefined;
  const dimensionValue = dimension ? (searchParams.get('value') ?? undefined) : undefined;
  const kpi = VALID_KPIS.includes(kpiRaw as KpiFilterKey) ? (kpiRaw as KpiFilterKey) : undefined;
  const query: RiskDrilldownQuery = { riskFilter, gate, dimension, dimensionValue, kpi };
  const isDrilldown = !!(riskFilter || gate || (dimension && dimensionValue) || kpi);
  // 比率指标下钻：明细按票据逐行展示复核结果
  const isKpiDrilldown = !!kpi;

  // 统一构建下钻行：仅本地真实 case（与风险驾驶舱统计口径一致；典型案例只在浏览模式展示）
  const allRows = useMemo(() => buildRiskDrilldownRows(cases, []), [cases]);

  // 下钻摘要（用于顶部摘要条 + 命中行展示）
  const summary = useMemo(() => getRiskDrilldownSummary(allRows, query), [allRows, query]);

  // 下钻模式下使用命中行；非下钻模式使用关键字过滤的常规列表
  const drilldownRows = isDrilldown ? summary.matchedRows : [];

  // 非下钻模式：关键字过滤（沿用原逻辑，本地与案例分别展示）
  const filteredLocalCases = cases.filter((c) => {
    if (!keyword.trim()) return true;
    const kw = keyword.trim().toLowerCase();
    return (
      c.invoice.invoiceNumber.toLowerCase().includes(kw) ||
      c.invoice.seller.toLowerCase().includes(kw) ||
      c.invoice.category.toLowerCase().includes(kw)
    );
  });

  const filteredDemoCases = demoCases.filter((item) => {
    if (!keyword.trim()) return true;
    const kw = keyword.trim().toLowerCase();
    return (
      item.invoice.invoiceNumber.toLowerCase().includes(kw) ||
      item.invoice.seller.toLowerCase().includes(kw) ||
      item.invoice.category.toLowerCase().includes(kw)
    );
  });

  // 下钻模式下：清除筛选
  const handleClearFilter = () => {
    setSearchParams({});
    setKeyword('');
  };

  // 从下钻行找到对应的本地 session（用于「继续处理」按钮调用 loadCase）
  const findLocalSession = (rowId: string) => cases.find((c) => c.caseId === rowId);

  const riskOf = (c: (typeof cases)[number]) => c.decisionDraft?.riskLevel ?? null;

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="发票列表"
        title="发票台账与典型案例"
        description="列表上半部分为本轮录入并持久化的发票台账，下半部分为典型案例库。OCR 已接入腾讯云识别，验真与凭证通道已配置。"
      />

      <div className="toolbar">
        <div className="search-box">
          <Search size={18} aria-hidden="true" />
          <input
            type="text"
            placeholder="搜索票号、销方、场景"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            aria-label="搜索发票"
            disabled={isDrilldown}
          />
        </div>
        <Link className="button-link primary" to="/intake">
          <FilePlus2 size={16} aria-hidden="true" /> 录入发票
        </Link>
        <span className="mock-badge">验真通道已配置</span>
      </div>

      {/* 下钻模式：顶部展示筛选摘要条 */}
      {isDrilldown && (
        <section className="drilldown-banner" aria-label="下钻筛选摘要" role="status">
          <div className="drilldown-banner-head">
            <ShieldAlert size={18} aria-hidden="true" />
            <div className="drilldown-banner-title">
              <span className="eyebrow">下钻来源</span>
              <strong>{summary.sourceName}</strong>
            </div>
            <div className="drilldown-banner-stats">
              <span className="stat-item">
                命中发票 <strong>{summary.matchedCount}</strong> 张
              </span>
              <span className="stat-item">
                金额合计 <strong>{summary.totalAmount.toLocaleString('zh-CN')}</strong> 元
              </span>
            </div>
            <div className="drilldown-banner-actions">
              <Link className="text-link back-link" to={summary.backToDashboard}>
                <ArrowLeft size={14} aria-hidden="true" />
                返回风险驾驶舱
              </Link>
              <button
                type="button"
                className="text-button clear-filter-button"
                onClick={handleClearFilter}
              >
                <FilterX size={14} aria-hidden="true" />
                清除筛选
              </button>
            </div>
          </div>
          <p className="drilldown-banner-description">{summary.description}</p>
        </section>
      )}

      {/* 下钻模式：只展示命中行 */}
      {isDrilldown ? (
        <section className="table-panel" aria-label="下钻命中发票列表">
          <div className="section-head">
            <div>
              <span className="eyebrow">下钻结果</span>
              <h2>命中发票组成（共 {drilldownRows.length} 条）</h2>
            </div>
            <span className="mock-badge">本地 case（与驾驶舱口径一致）</span>
          </div>
          {drilldownRows.length === 0 ? (
            <p className="empty-hint">当前筛选条件下没有命中的发票。</p>
          ) : (
            <>
              <div className="invoice-table table-header has-drilldown">
                <span>发票</span>
                <span>场景</span>
                <span>金额</span>
                <span>风险/状态</span>
                <span>{isKpiDrilldown ? '本票据复核结果' : '命中原因'}</span>
                <span>下一步建议</span>
                <span>处理</span>
              </div>
              {drilldownRows.map((row) => {
                const localSession = row.source === 'local' ? findLocalSession(row.id) : undefined;
                // 本地行存在异常时提供「去异常工作台」入口（管理与财务处理链路打通）
                const hasExceptions =
                  localSession !== undefined && detectCaseExceptions(localSession).length > 0;
                return (
                  <div className="invoice-table table-row has-drilldown" key={`${row.source}-${row.id}`}>
                    <span>
                      <b>{row.invoiceNumber}</b>
                      <small>{row.seller}</small>
                      <small className="case-id-hint">本地 {row.id}</small>
                    </span>
                    <span>{row.category}</span>
                    <span>{row.amount.toLocaleString('zh-CN')} 元</span>
                    <span>
                      <span className={`risk-pill risk-${row.riskLevel}`}>{row.riskLevel}</span>
                      <small className={`status-pill status-${row.finalStatus}`}>{row.finalStatus}</small>
                    </span>
                    <span className="drilldown-reason-list">
                      <KnowledgeCard
                        variant="plain"
                        title="命中原因"
                        detailWidth={320}
                        detail={
                          isKpiDrilldown ? (
                            <ul className="review-outcome-list">
                              <li>AI 结论复核：{row.aiAdoption}</li>
                              <li>凭证确认：{row.voucherConfirmation}</li>
                              {row.riskCardCount > 0 && (
                                <li>误报标记：{row.falsePositiveCount}/{row.riskCardCount} 张风险卡片</li>
                              )}
                            </ul>
                          ) : (
                            <ul>
                              {row.matchedReasons.map((reason, idx) => (
                                <li key={idx}>{reason}</li>
                              ))}
                            </ul>
                          )
                        }
                      >
                        {isKpiDrilldown ? (
                          <ul className="review-outcome-list">
                            <li>AI 结论复核：<b className={`adoption-${row.aiAdoption}`}>{row.aiAdoption}</b></li>
                            <li>凭证确认：<b className={`confirm-${row.voucherConfirmation}`}>{row.voucherConfirmation}</b></li>
                            {row.riskCardCount > 0 && (
                              <li>误报标记：{row.falsePositiveCount}/{row.riskCardCount} 张风险卡片</li>
                            )}
                          </ul>
                        ) : (
                          <ul>
                            {row.matchedReasons.map((reason, idx) => (
                              <li key={idx}>{reason}</li>
                            ))}
                          </ul>
                        )}
                      </KnowledgeCard>
                    </span>
                    <span className="next-action-hint">
                      <KnowledgeCard
                        variant="plain"
                        title="下一步建议"
                        detailWidth={320}
                        detail={<p>{row.nextActionHint}</p>}
                      >
                        {row.nextActionHint}
                      </KnowledgeCard>
                    </span>
                    <span className="action-links">
                      {row.source === 'local' && row.workflowPath && (
                        <Link
                          className="text-link"
                          to={row.workflowPath}
                          onClick={() => localSession && loadCase(row.id)}
                        >
                          继续处理
                        </Link>
                      )}
                      {hasExceptions && (
                        <Link className="text-link" to={`/exceptions?focus=${encodeURIComponent(row.id)}`}>
                          去异常工作台
                        </Link>
                      )}
                      <Link className="text-link" to={row.detailPath}>
                        查看详情
                      </Link>
                    </span>
                  </div>
                );
              })}
            </>
          )}
        </section>
      ) : (
        <>
          {/* 非下钻模式：沿用原「本地台账 + 典型案例」分块展示 */}
          <section className="table-panel" aria-label="本地发票 case 列表">
            <div className="section-head">
              <div>
                <span className="eyebrow">本地 case</span>
                <h2>已持久化的多发票会话（共 {filteredLocalCases.length} 条）</h2>
              </div>
              <span className="mock-badge">刷新不丢失</span>
            </div>
            {filteredLocalCases.length === 0 ? (
              <p className="empty-hint">暂无本地 case，请录入第一张发票。</p>
            ) : (
              <div className="invoice-table table-header has-status">
                <span>发票</span>
                <span>场景</span>
                <span>金额</span>
                <span>验真/重复</span>
                <span>状态</span>
                <span>风险</span>
                <span>处理</span>
              </div>
            )}
            {filteredLocalCases.map((c) => (
              <div className="invoice-table table-row has-status" key={c.caseId}>
                <span>
                  <b>{c.invoice.invoiceNumber}</b>
                  <small>{c.invoice.seller}</small>
                  <small className="case-id-hint">{c.caseId}</small>
                </span>
                <span>{c.invoice.category}</span>
                <span>{c.invoice.amount.toLocaleString('zh-CN')} 元</span>
                <span>
                  {c.invoice.verificationStatus}
                  <small>{c.invoice.duplicateStatus}</small>
                </span>
                <span className={`status-pill status-${c.finalStatus}`}>{c.finalStatus}</span>
                <span>
                  {riskOf(c) ? (
                    <span className={`risk-pill risk-${riskOf(c)}`}>{riskOf(c)}</span>
                  ) : (
                    <span className="muted-text">待生成</span>
                  )}
                </span>
                <span className="action-links">
                  <Link
                    className="text-link"
                    to={`/invoices/${c.caseId}/workflow`}
                    onClick={() => loadCase(c.caseId)}
                  >
                    继续处理
                  </Link>
                  <Link className="text-link" to={`/invoices/${c.caseId}`}>
                    查看详情
                  </Link>
                </span>
              </div>
            ))}
          </section>

          <section className="table-panel" aria-label="典型案例库">
            <div className="section-head">
              <div>
                <span className="eyebrow">典型案例</span>
                <h2>典型案例（共 {filteredDemoCases.length} 条）</h2>
              </div>
            </div>
            <div className="invoice-table table-header">
              <span>发票</span>
              <span>场景</span>
              <span>金额</span>
              <span>验真/重复</span>
              <span>风险</span>
              <span>处理</span>
            </div>
            {filteredDemoCases.map((item) => (
              <div className="invoice-table table-row demo-row" key={item.id}>
                <span>
                  <b>{item.invoice.invoiceNumber}</b>
                  <small>{item.invoice.seller}</small>
                </span>
                <span>{item.invoice.category}</span>
                <span>{item.invoice.amount.toLocaleString('zh-CN')} 元</span>
                <span>
                  {item.invoice.verificationStatus}
                  <small>{item.invoice.duplicateStatus}</small>
                </span>
                <span className={`risk-pill risk-${item.riskDecision.riskLevel}`}>{item.riskDecision.riskLevel}</span>
                <span className="action-links">
                  <Link className="text-link" to={`/invoices/${item.id}`}>
                    查看案例
                  </Link>
                  <Link className="text-link" to={`/invoices/${item.id}/decision`}>
                    查看案例结果
                  </Link>
                </span>
              </div>
            ))}
          </section>
        </>
      )}
    </div>
  );
}
