import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { RotateCcw, Save } from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { KnowledgeCard } from '../components/KnowledgeCard';
import {
  DEFAULT_THRESHOLDS,
  getThresholds,
  resetThresholds,
  saveThresholds,
  THRESHOLD_META,
  type RiskThresholds,
  type ThresholdKey,
} from '../../rules/thresholdStore';

// 规则阈值管理页：调整规则引擎的 6 个可配置阈值
// 生效范围：闸门判定、风险等级、异常检测（驾驶舱概览与异常工作台统计随阈值即时变化）
// 阈值项以知识卡片网格展示：描述截断两行，悬停查看完整口径
export function ThresholdSettingsPage() {
  const [draft, setDraft] = useState<RiskThresholds>(() => getThresholds());
  const [saveHint, setSaveHint] = useState('');

  // 保存/重置后即时同步最新值
  useEffect(() => {
    setDraft(getThresholds());
  }, []);

  // 自动清空保存提示
  useEffect(() => {
    if (!saveHint) return;
    const t = setTimeout(() => setSaveHint(''), 3500);
    return () => clearTimeout(t);
  }, [saveHint]);

  const isDirty = THRESHOLD_META.some((meta) => draft[meta.key] !== getThresholds()[meta.key]);

  const handleFieldChange = (key: ThresholdKey, raw: string) => {
    const value = Number(raw);
    setDraft((prev) => ({ ...prev, [key]: Number.isFinite(value) ? value : 0 }));
  };

  const handleSave = () => {
    const saved = saveThresholds(draft);
    if (saved === null) {
      setSaveHint('保存失败：存在非法阈值（越界或破坏业务置信度层次约束），请修正后重试。');
      return;
    }
    setDraft(saved);
    setSaveHint('已保存。闸门判定、风险等级和异常检测将按新阈值生效。');
  };

  const handleReset = () => {
    const defaults = resetThresholds();
    setDraft(defaults);
    setSaveHint('已恢复默认阈值。');
  };

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="规则阈值"
        title="规则引擎阈值管理"
        description="调整四道闸门、风险等级和异常检测使用的判定阈值。阈值保存在本地浏览器，即时生效。卡片描述截断时悬停可查看完整口径。"
      />

      <section className="threshold-settings-panel" aria-label="阈值编辑表单">
        <div className="section-head">
          <div>
            <span className="eyebrow">判定阈值</span>
            <h2>共 {THRESHOLD_META.length} 项（业务置信度三条线需保持 阻断 ≤ 告警 ≤ 审批）</h2>
          </div>
          <span className="mock-badge">本地持久化</span>
        </div>
        <div className="threshold-form-list">
          {THRESHOLD_META.map((meta) => (
            <KnowledgeCard
              key={meta.key}
              title={meta.label}
              detail={
                <>
                  <p>{meta.description}</p>
                  <p>
                    单位：{meta.unit}；范围 {meta.min} ~ {meta.max}；默认{' '}
                    {meta.unit === '比例'
                      ? DEFAULT_THRESHOLDS[meta.key].toFixed(2)
                      : DEFAULT_THRESHOLDS[meta.key].toLocaleString('zh-CN')}
                    {meta.unit === '元' ? ' 元' : ''}。
                  </p>
                </>
              }
              footer={
                <div className="threshold-form-input">
                  <input
                    type="number"
                    value={draft[meta.key]}
                    min={meta.min}
                    max={meta.max}
                    step={meta.step}
                    onChange={(e) => handleFieldChange(meta.key, e.target.value)}
                    aria-label={`${meta.label}（${meta.min} 至 ${meta.max}）`}
                  />
                  <span className="threshold-range">范围 {meta.min} ~ {meta.max}</span>
                </div>
              }
            >
              {meta.description}
            </KnowledgeCard>
          ))}
        </div>
        <div className="threshold-form-actions">
          <button type="button" className="primary-button" onClick={handleSave} disabled={!isDirty}>
            <Save size={14} aria-hidden="true" />
            {isDirty ? '保存阈值' : '无改动'}
          </button>
          <button type="button" className="secondary-button" onClick={handleReset}>
            <RotateCcw size={14} aria-hidden="true" />
            恢复默认
          </button>
          {saveHint && (
            <span className="threshold-save-hint" role="status">{saveHint}</span>
          )}
        </div>
      </section>

      <div className="workflow-footer">
        <Link className="text-link" to="/risks">返回风险驾驶舱</Link>
        <Link className="text-link" to="/exceptions">查看异常工作台</Link>
      </div>
    </div>
  );
}
