import type { ReactNode } from 'react';
import { Info } from 'lucide-react';

// 知识卡片：紧凑卡片 + 右下角「查看详情」角标
// 摘要内容超出截断时，鼠标悬停整卡弹出放大详情浮层（纯 CSS hover，无弹窗依赖）
// variant:
//   card  = 独立卡片（带边框和标题行）
//   plain = 无卡片外壳，仅截断文本 + 角标 + 浮层（用于表格单元格或已有卡片内部）
interface KnowledgeCardProps {
  // 卡片标题（card 变体显示；浮层标题自动复用）
  title: string;
  // 摘要区：正常显示的内容（过长由 CSS 截断）
  children: ReactNode;
  // 详情浮层内容：完整版说明
  detail: ReactNode;
  // 浮层宽度（px），默认 360
  detailWidth?: number;
  // 摘要区下方的固定区（输入框等，不参与截断）
  footer?: ReactNode;
  variant?: 'card' | 'plain';
  // 摘要截断行数（默认 2）
  lines?: 2 | 3;
  // 额外类名（用于布局网格定位）
  className?: string;
}

export function KnowledgeCard({
  title,
  children,
  detail,
  detailWidth = 360,
  footer,
  variant = 'card',
  lines = 2,
  className,
}: KnowledgeCardProps) {
  return (
    <article
      className={`knowledge-card ${variant === 'plain' ? 'knowledge-card-plain' : ''} ${className ?? ''}`}
      tabIndex={0}
    >
      {variant === 'card' && <span className="knowledge-card-title">{title}</span>}
      <div className={`knowledge-card-body ${lines === 3 ? 'allow-three-lines' : ''}`}>{children}</div>
      {footer}
      {/* 右下角详情角标：悬停整卡或角标弹出放大详情 */}
      <span className="knowledge-card-detail-badge" aria-hidden="true">
        <Info size={13} />
        查看详情
      </span>
      <div
        className="knowledge-card-detail-popover"
        style={{ width: `${detailWidth}px` }}
        role="tooltip"
      >
        <strong className="knowledge-card-detail-title">{title}</strong>
        <div className="knowledge-card-detail-body">{detail}</div>
      </div>
    </article>
  );
}
