import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, MousePointerClick, Settings2 } from 'lucide-react';
import { useWorkflow } from '../../workflow/WorkflowContext';
import { PageHeader } from '../components/PageHeader';
import { KnowledgeCard } from '../components/KnowledgeCard';
import {
  buildRiskDrilldownLink,
  buildRiskDrilldownRows,
  getRiskDrilldownSummary,
  DRILLDOWN_GATE_ORDER,
} from '../riskDrilldown';
import { computeRiskKpis, formatKpiRate } from '../riskKpis';
import { buildDimensionBreakdown, DIMENSION_LABEL, type DimensionKey } from '../riskDimensions';
import { buildMonthlyTrend } from '../riskTrend';
import {
  getThresholds,
  isDefaultThresholds,
  subscribeThresholdChanges,
  THRESHOLD_META,
} from '../../rules/thresholdStore';

const DIMENSION_ORDER: DimensionKey[] = ['department', 'person', 'supplier'];

export function RiskDashboardPage() {
  const { cases } = useWorkflow();

  // 订阅阈值变更：阈值概览即时刷新（与侧边栏接口边界同一模式）
  const [thresholdTick, setThresholdTick] = useState(0);
  useEffect(() => {
    return subscribeThresholdChanges(() => setThresholdTick((t) => t + 1));
  }, []);

  // 统一构建下钻行：仅本地真实录入的 case（演示样例为本不存在的数据，不进任何统计）
  // 驾驶舱金额指标和下钻列表共用同一套筛选函数，确保金额一致
  const rows = useMemo(() => buildRiskDrilldownRows(cases, []), [cases]);

  // 三个金额指标：用 filterRiskDrilldownRows 计算命中行和金额合计
  const highRiskSummary = useMemo(
    () => getRiskDrilldownSummary(rows, { riskFilter: 'high-risk' }),
    [rows],
  );
  const remediationSummary = useMemo(
    () => getRiskDrilldownSummary(rows, { riskFilter: 'remediation' }),
    [rows],
  );
  const pendingJudgmentSummary = useMemo(
    () => getRiskDrilldownSummary(rows, { riskFilter: 'pending-judgment' }),
    [rows],
  );

  // 四个比率指标：基于操作日志/AI 介入记录的真实统计（分母为 0 时显示「暂无数据」）
  const kpis = useMemo(() => computeRiskKpis(cases), [cases]);

  // 三个维度聚合：部门 / 人员 / 供应商（仅本地 case）
  const dimensionBreakdowns = useMemo(
    () => DIMENSION_ORDER.map((dimension) => ({
      dimension,
      label: DIMENSION_LABEL[dimension],
      items: buildDimensionBreakdown(cases, [], dimension),
    })),
    [cases],
  );

  // 月度趋势：近 6 个月（按发票开具日期，仅本地 case）
  const trend = useMemo(() => buildMonthlyTrend(cases, [], 6), [cases]);
  const maxTrendAmount = Math.max(...trend.points.map((p) => p.totalAmount), 1);

  // 四个闸门指标：用 filterRiskDrilldownRows 计算命中数量
  const gateSummaries = useMemo(
    () =>
      DRILLDOWN_GATE_ORDER.map((gateName) => ({
        gateName,
        summary: getRiskDrilldownSummary(rows, { gate: gateName }),
      })),
    [rows],
  );

  const thresholds = useMemo(() => {
    void thresholdTick;
    return getThresholds();
  }, [thresholdTick]);
  const thresholdsAreDefault = useMemo(() => {
    void thresholdTick;
    return isDefaultThresholds();
  }, [thresholdTick]);

  // 指标卡片：金额 3 张（计算/可下钻）+ 比率 4 张（真实统计/可下钻，无数据显示「暂无数据」）
  const amountCards = [
    {
      label: '高风险金额',
      value: `${highRiskSummary.totalAmount.toLocaleString('zh-CN')} 元`,
      note: `共 ${highRiskSummary.matchedCount} 张发票（本地 case）`,
      source: '计算' as const,
      drilldownLink: buildRiskDrilldownLink({ riskFilter: 'high-risk' }),
    },
    {
      label: '待整改金额',
      value: `${remediationSummary.totalAmount.toLocaleString('zh-CN')} 元`,
      note: `共 ${remediationSummary.matchedCount} 张发票（任一闸门阻断或待补充）`,
      source: '计算' as const,
      drilldownLink: buildRiskDrilldownLink({ riskFilter: 'remediation' }),
    },
    {
      label: '暂不能判断金额',
      value: `${pendingJudgmentSummary.totalAmount.toLocaleString('zh-CN')} 元`,
      note: `共 ${pendingJudgmentSummary.matchedCount} 张发票（最终状态为暂不能判断）`,
      source: '计算' as const,
      drilldownLink: buildRiskDrilldownLink({ riskFilter: 'pending-judgment' }),
    },
  ];

  const kpiCards = [
    {
      label: 'AI 判断采纳率',
      value: formatKpiRate(kpis.aiAdoptionRate),
      note:
        kpis.reviewedCount > 0
          ? `已复核 ${kpis.reviewedCount} 张本地票据（采纳/(采纳+修改+退回)）`
          : '完成一次三阶段人工复核后产生真实统计，点击查看按票据明细',
      drilldownLink: buildRiskDrilldownLink({ kpi: 'ai-adoption' as const }),
    },
    {
      label: '人工修改率',
      value: formatKpiRate(kpis.manualModifyRate),
      note:
        kpis.reviewedCount > 0
          ? `已复核 ${kpis.reviewedCount} 张本地票据（修改/(采纳+修改+退回)）`
          : '财务复核中修改结论的占比，无数据显示暂无数据',
      drilldownLink: buildRiskDrilldownLink({ kpi: 'manual-modify' as const }),
    },
    {
      label: '凭证确认通过率',
      value: formatKpiRate(kpis.voucherPassRate),
      note:
        kpis.voucherConfirmedCount > 0
          ? `已确认 ${kpis.voucherConfirmedCount} 张本地票据（通过/(通过+退回修正)）`
          : '在结果页执行「财务确认通过/退回修正」后产生真实统计',
      drilldownLink: buildRiskDrilldownLink({ kpi: 'voucher-pass' as const }),
    },
    {
      label: '误报率',
      value: formatKpiRate(kpis.falsePositiveRate),
      note:
        kpis.totalRiskCards > 0
          ? `误报标记 ${kpis.falsePositiveCards}/${kpis.totalRiskCards} 张风险卡片`
          : '在结果页标记误报风险卡片后产生真实统计',
      drilldownLink: buildRiskDrilldownLink({ kpi: 'false-positive' as const }),
    },
  ];

  const renderMetricCard = (
    card: { label: string; value: string; note: string; source?: '计算'; drilldownLink: string },
  ) => {
    const inner = (
      <article className="metric-card kpi-card clickable" key={card.label}>
        <span className="metric-label">{card.label}</span>
        <strong>{card.value}</strong>
        <p>{card.note}</p>
        {card.source && (
          <span className={`source-pill source-${card.source === '计算' ? 'calc' : 'mock'}`}>
            {card.source}
          </span>
        )}
        <span className="metric-cta">
          <MousePointerClick size={12} aria-hidden="true" />
          点击查看明细
          <ArrowRight size={12} aria-hidden="true" />
        </span>
      </article>
    );
    return (
      <Link className="metric-card-link" key={card.label} to={card.drilldownLink}>
        {inner}
      </Link>
    );
  };

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="风险驾驶舱"
        title="管理端核心指标与闸门风险结构"
        description="全部指标仅统计本地真实录入的发票；比率指标来自真实操作日志，无数据显示「暂无数据」。指标可下钻到按票据明细。"
      />

      <section className="kpi-board" aria-label="管理端核心指标">
        <div className="kpi-head">
          <span className="panel-kicker">管理端核心指标</span>
          <span className="mock-badge">金额=计算 / 比率=真实统计</span>
        </div>
        <div className="metric-grid">
          {amountCards.map(renderMetricCard)}
        </div>
        <div className="metric-grid">
          {kpiCards.map(renderMetricCard)}
        </div>
      </section>

      {/* 部门 / 人员 / 供应商 维度风险结构 */}
      {dimensionBreakdowns.map(({ dimension, label, items }) => (
        <section className="risk-matrix" aria-label={`${label}风险结构`} key={dimension}>
          <div className="section-head">
            <div>
              <span className="eyebrow">{label}风险结构</span>
              <h2>按{label}聚合的风险与待整改（点击下钻到发票明细）</h2>
            </div>
            <span className="mock-badge">本地 case · 按金额 Top 8</span>
          </div>
          {items.length === 0 ? (
            <p className="empty-hint">暂无数据。</p>
          ) : (
            <div className="dimension-tile-grid">
              {items.map((item) => (
                <Link className="risk-tile-link" key={`${dimension}-${item.label}`} to={item.drilldownLink}>
                  <article className="risk-tile clickable">
                    <div className="risk-tile-main">
                      <span className="risk-tile-name">{item.label}</span>
                      <span className="risk-tile-amount">
                        金额合计 {item.totalAmount.toLocaleString('zh-CN')} 元
                      </span>
                    </div>
                    <div className="risk-tile-stats">
                      <strong>{item.count}</strong>
                      <p>高风险 {item.highRiskCount} / 待整改 {item.remediationCount}</p>
                    </div>
                    <span className="metric-cta">
                      <MousePointerClick size={12} aria-hidden="true" />
                      点击查看明细
                      <ArrowRight size={12} aria-hidden="true" />
                    </span>
                  </article>
                </Link>
              ))}
            </div>
          )}
        </section>
      ))}

      {/* 月度风险趋势：月份小卡片（hover 放大查看） */}
      <section className="risk-matrix" aria-label="月度风险趋势">
        <div className="section-head">
          <div>
              <span className="eyebrow">月度风险趋势</span>
              <h2>近 6 个月发票张数、金额与高风险（按发票开具日期）</h2>
            </div>
          <span className="mock-badge">本地 case</span>
        </div>
        {trend.points.length === 0 ? (
          <p className="empty-hint">暂无可统计的发票日期数据。</p>
        ) : (
          <div className="trend-card-grid" aria-label="近 6 个月发票金额与高风险趋势">
            {trend.points.map((point) => (
              <article
                className={`trend-card ${point.highRiskCount > 0 ? 'has-high-risk' : ''}`}
                key={point.month}
                aria-label={`${point.month}：${point.count} 张发票，金额 ${point.totalAmount.toLocaleString('zh-CN')} 元${point.highRiskCount > 0 ? `，高风险 ${point.highRiskCount} 张` : ''}`}
              >
                <div className="trend-card-head">
                  <span className="trend-card-month">{point.month}</span>
                  {point.highRiskCount > 0 && (
                    <span className="trend-card-risk-badge">高风险 {point.highRiskCount}</span>
                  )}
                </div>
                <strong className="trend-card-amount">
                  {point.totalAmount.toLocaleString('zh-CN')} 元
                </strong>
                <span className="trend-card-count">{point.count} 张发票</span>
                <div className="trend-card-track" aria-hidden="true">
                  <div
                    className="trend-card-bar"
                    style={{ width: `${Math.max((point.totalAmount / maxTrendAmount) * 100, 6)}%` }}
                  />
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="risk-matrix" aria-label="闸门风险结构">
        <div className="section-head">
          <div>
              <span className="eyebrow">闸门风险结构</span>
              <h2>四道闸门下钻（点击查看对应发票组成）</h2>
            </div>
          <span className="mock-badge">本地 case</span>
        </div>
        <div className="risk-tile-grid">
          {gateSummaries.map(({ gateName, summary }) => {
            // 拆分阻断和待补充数量
            const blockedRows = rows.filter(
              (r) => r.gates.find((g) => g.name === gateName)?.status === '阻断',
            );
            const pendingCount = summary.matchedCount - blockedRows.length;
            return (
              <Link
                className="risk-tile-link"
                key={gateName}
                to={buildRiskDrilldownLink({ gate: gateName })}
              >
                <article className="risk-tile clickable">
                  <div className="risk-tile-main">
                    <span className="risk-tile-name">{gateName}</span>
                    <span className="risk-tile-amount">
                      金额合计 {summary.totalAmount.toLocaleString('zh-CN')} 元
                    </span>
                  </div>
                  <div className="risk-tile-stats">
                    <strong>{summary.matchedCount}</strong>
                    <p>阻断 {blockedRows.length} / 待补充 {pendingCount}</p>
                  </div>
                  <span className="metric-cta">
                    <MousePointerClick size={12} aria-hidden="true" />
                    点击查看明细
                    <ArrowRight size={12} aria-hidden="true" />
                  </span>
                </article>
              </Link>
            );
          })}
        </div>
      </section>

      {/* 规则阈值概览 */}
      <section className="table-panel" aria-label="规则阈值概览">
        <div className="section-head">
          <div>
            <span className="eyebrow">规则阈值概览</span>
            <h2>当前规则引擎生效阈值（{thresholdsAreDefault ? '全部为默认值' : '存在自定义调整'}）</h2>
          </div>
          <Link className="text-link" to="/settings/thresholds">
            <Settings2 size={14} aria-hidden="true" /> 管理阈值
          </Link>
        </div>
        <div className="threshold-overview-grid">
          {THRESHOLD_META.map((meta) => (
            <KnowledgeCard
              key={meta.key}
              title={meta.label}
              detailWidth={340}
              detail={
                <>
                  <p>{meta.description}</p>
                  <p>
                    当前生效值：
                    {meta.unit === '比例'
                      ? thresholds[meta.key].toFixed(2)
                      : thresholds[meta.key].toLocaleString('zh-CN')}
                    {meta.unit === '元' ? ' 元' : ''}
                    （可在阈值管理页调整）。
                  </p>
                </>
              }
            >
              <strong className="threshold-value">
                {meta.unit === '比例'
                  ? thresholds[meta.key].toFixed(2)
                  : thresholds[meta.key].toLocaleString('zh-CN')}
                {meta.unit === '元' ? ' 元' : ''}
              </strong>
            </KnowledgeCard>
          ))}
        </div>
      </section>
    </div>
  );
}
