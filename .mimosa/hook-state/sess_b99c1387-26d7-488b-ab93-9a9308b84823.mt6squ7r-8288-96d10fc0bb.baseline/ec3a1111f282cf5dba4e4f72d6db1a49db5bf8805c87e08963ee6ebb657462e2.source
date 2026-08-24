import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  BarChart3,
  ChevronDown,
  ChevronRight,
  FileCheck2,
  FilePlus2,
  ListChecks,
  ScanLine,
  Stethoscope,
  Wallet,
} from 'lucide-react';
import { useWorkflow } from '../../workflow/WorkflowContext';
import { computeDashboardMetrics } from '../dashboardMetrics';
import { PageHeader } from '../components/PageHeader';

// 三阶段主线：可点击展开详情
const STAGE_CARDS = [
  {
    id: 'ocr',
    icon: ScanLine,
    title: '发票识别',
    entry: '/intake',
    entryLabel: '前往录入',
    summary: '录入、上传、OCR、验真、重复/红冲判断',
    detail:
      '经办上传 PDF 或图片，OCR 提取票面字段并标注置信度；系统调用验真接口校验真伪，匹配查重库识别重复报销，检查红冲/作废状态。任一异常会进入异常队列阻断后续流程。OCR 已接入腾讯云真实识别（经后端代理），验真为内置通道。',
  },
  {
    id: 'restore',
    icon: Stethoscope,
    title: '业务还原',
    entry: '/invoices',
    entryLabel: '打开发票列表',
    summary: '业务追问、场景还原、证据补充',
    detail:
      'AI 根据发票类别生成追问（餐饮招待、住宿差旅、咨询服务等），经办回答后系统还原业务事件对象（人员、对象、时间、地点、目的、项目、付款、受益人）。随后匹配证据链：合同、订单、付款、报销、审批、出差、会议、拜访、入库、验收等材料。证据缺口会回退到证据补充步骤。',
  },
  {
    id: 'risk',
    icon: Wallet,
    title: '入账决策',
    entry: '/exceptions',
    entryLabel: '打开异常工作台',
    summary: '风险初判、人工复核、凭证草稿边界',
    detail:
      'AI 综合发票、业务、证据输出四道闸门结果与风险等级。高风险、低置信度、证据缺失、关联交易必须人工复核。复核结果进入凭证草稿边界：可生成草稿 / 待人工确认 / 禁止生成。一期只生成草稿不自动过账，不自动申报。',
  },
] as const;

// 后续开发铺垫 roadmap
const ROADMAP_CATEGORIES = [
  { name: '餐饮', status: '深度覆盖', note: '业务招待、客户维护等典型场景已闭环。' },
  { name: '住宿', status: '深度覆盖', note: '员工出差住宿、专票抵扣场景已闭环。' },
  { name: '咨询服务', status: '深度覆盖', note: '大额服务支出复核场景已闭环。' },
  { name: '交通出行', status: '后续扩展', note: '机票、火车票、网约车等场景待补全。' },
  { name: '车辆相关', status: '后续扩展', note: '加油、维修、过路费等场景待补全。' },
  { name: '办公用品', status: '后续扩展', note: '采购发票、入库验收等场景待补全。' },
  { name: '广告推广', status: '后续扩展', note: '广告服务、推广费等场景待补全。' },
  { name: '租赁物业', status: '后续扩展', note: '房租、物业费等场景待补全。' },
] as const;

export function DashboardPage() {
  const { cases } = useWorkflow();
  // 订阅 integrationConfigStore 变更已在 Layout 处理；本页直接读取最新值
  const metrics = useMemo(() => computeDashboardMetrics(cases), [cases]);

  // 三阶段卡片展开状态
  const [expandedStage, setExpandedStage] = useState<string | null>(null);

  const toggleStage = (id: string) => {
    setExpandedStage((prev) => (prev === id ? null : id));
  };

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="工作台仪表盘"
        title="发票溯源证据链工作台"
        description="基于本地发票数据生成指标摘要。无数据时点击下方「录入第一张发票」开始。"
      />

      {/* 第一屏：仪表盘指标 */}
      <section className="dashboard-metrics" aria-label="仪表盘指标">
        <div className="metric-card">
          <span>已录入发票</span>
          <strong>{metrics.totalInvoices}</strong>
          <p>本地 case 总数（不含 demo）</p>
        </div>
        <div className="metric-card">
          <span>待处理发票</span>
          <strong>{metrics.pendingCount}</strong>
          <p>未进入已完成/已作废终态</p>
        </div>
        <div className="metric-card">
          <span>异常/阻断</span>
          <strong>{metrics.exceptionCount}</strong>
          <p>验真失败、疑似重复、证据缺失等</p>
        </div>
        <div className="metric-card">
          <span>已生成风险建议</span>
          <strong>{metrics.generatedDecisionCount}</strong>
          <p>有 decisionDraft 的 case 数</p>
        </div>
        <div className="metric-card">
          <span>待财务复核</span>
          <strong>{metrics.pendingReviewCount}</strong>
          <p>待财务复核 / 待负责人审批</p>
        </div>
        <div className="metric-card">
          <span>接口配置</span>
          <strong>{metrics.integrationSummaries.filter((i) => i.mode === '内置').length}/3</strong>
          <p>
            {metrics.hasDisabledOfficialIntegration
              ? '存在正式模式未启用接口'
              : '当前内置通道运行中'}
          </p>
        </div>
      </section>

      {/* 快速操作入口 */}
      <section className="dashboard-actions" aria-label="快速操作">
        <Link className="button-link primary" to="/intake">
          <FilePlus2 size={18} aria-hidden="true" />
          {metrics.totalInvoices === 0 ? '录入第一张发票' : '录入新发票'}
        </Link>
        <Link className="button-link" to="/invoices">
          <ListChecks size={18} aria-hidden="true" />
          发票列表
        </Link>
        <Link className="button-link" to="/exceptions">
          <AlertTriangle size={18} aria-hidden="true" />
          异常工作台
        </Link>
      </section>

      {/* 三阶段主线：可点击展开 */}
      <section className="stage-cards" aria-label="三阶段主线">
        <span className="panel-kicker">三阶段主线 · 点击展开功能说明</span>
        <div className="stage-cards-grid">
          {STAGE_CARDS.map((card) => {
            const Icon = card.icon;
            const isExpanded = expandedStage === card.id;
            return (
              <article
                key={card.id}
                className={`stage-card ${isExpanded ? 'expanded' : ''}`}
                role="button"
                tabIndex={0}
                aria-expanded={isExpanded}
                aria-label={`${card.title}：${card.summary}。点击展开详情。`}
                onClick={() => toggleStage(card.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    toggleStage(card.id);
                  }
                }}
              >
                <div className="stage-card-head">
                  <Icon size={22} aria-hidden="true" />
                  <strong>{card.title}</strong>
                  {isExpanded ? (
                    <ChevronDown size={18} aria-hidden="true" />
                  ) : (
                    <ChevronRight size={18} aria-hidden="true" />
                  )}
                </div>
                <p className="stage-card-summary">{card.summary}</p>
                {isExpanded && (
                  <div className="stage-card-detail">
                    <p>{card.detail}</p>
                    <Link
                      className="button-link"
                      to={card.entry}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {card.entryLabel}
                    </Link>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      </section>

      {/* 后续开发铺垫 roadmap */}
      <section className="coverage-board" aria-label="发票覆盖种类 / 后续开发铺垫">
        <div className="coverage-head">
          <span className="panel-kicker">发票覆盖种类 / 后续开发铺垫</span>
          <span className="mock-badge">一期已闭环：餐饮、住宿、咨询服务</span>
        </div>
        <div className="coverage-grid">
          {ROADMAP_CATEGORIES.map((cat) => (
            <article
              className={`coverage-tile coverage-${cat.status === '深度覆盖' ? 'deep' : 'basic'}`}
              key={cat.name}
              aria-label={`发票覆盖类别：${cat.name}，状态：${cat.status}。${cat.note}`}
              role="group"
            >
              <div className="coverage-topline">
                <strong>{cat.name}</strong>
                <span
                  className={`depth-pill depth-${cat.status === '深度覆盖' ? 'deep' : 'basic'}`}
                  aria-label={`状态：${cat.status}`}
                >
                  {cat.status}
                </span>
              </div>
              <p>{cat.note}</p>
            </article>
          ))}
        </div>
      </section>

      {/* 录入体验入口 */}
      <section className="demo-experience" aria-label="录入体验入口">
        <div className="section-head">
          <div>
            <span className="eyebrow">录入体验</span>
            <h2>上传发票即自动识别</h2>
          </div>
          <Link className="button-link" to="/intake">
            前往录入
          </Link>
        </div>
        <p className="demo-experience-hint">
          录入页上传 PDF/图片会自动调用腾讯云 OCR 识别票面，再由 DeepSeek
          自动识别发票类别并补齐缺失字段；提交表单后，发票会自动记录在录入页左侧的「已录入发票」列表中，点击即可载入查看处理进度。
        </p>
        <div className="demo-experience-actions">
          <Link className="button-link primary" to="/intake">
            <FileCheck2 size={18} aria-hidden="true" />
            打开录入页
          </Link>
          <Link className="button-link" to="/risks">
            <BarChart3 size={18} aria-hidden="true" />
            查看风险驾驶舱
          </Link>
        </div>
      </section>
    </div>
  );
}
