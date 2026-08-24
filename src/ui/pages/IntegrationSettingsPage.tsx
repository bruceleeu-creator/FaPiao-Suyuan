import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Cloud, FileText, Plug, RefreshCw, Save, Shield, Zap } from 'lucide-react';
import type { IntegrationConfig, IntegrationKey, IntegrationMode } from '../../integrations/types';
import {
  DEFAULT_TENCENT_CLOUD_STATUS,
  INTEGRATION_NAMES,
} from '../../integrations/defaultConfigs';
import {
  loadIntegrationConfigs,
  resetIntegrationConfigs,
  saveIntegrationConfigs,
  testConnection,
} from '../../integrations/integrationConfigStore';
import { getTencentCloudOcrStatusText } from '../../integrations/tencentCloudInvoiceOcr';
import { getTencentCloudVerifyStatusText } from '../../integrations/tencentCloudInvoiceVerify';
import { PageHeader } from '../components/PageHeader';
import { AdminKeysPanel } from '../components/AdminKeysPanel';

const INTEGRATION_KEYS: IntegrationKey[] = ['ocr', 'verify', 'voucher'];

export function IntegrationSettingsPage() {
  // 初始化：从 localStorage 读取，没有则用默认值
  const [configs, setConfigs] = useState<Record<IntegrationKey, IntegrationConfig>>(() =>
    loadIntegrationConfigs(),
  );
  const [testInFlight, setTestInFlight] = useState<IntegrationKey | null>(null);
  const [savedHint, setSavedHint] = useState<string>('');

  // 切换到正式模式时立即提示
  useEffect(() => {
    if (!savedHint) return;
    const t = setTimeout(() => setSavedHint(''), 2500);
    return () => clearTimeout(t);
  }, [savedHint]);

  const updateField = <K extends keyof IntegrationConfig>(
    key: IntegrationKey,
    field: K,
    value: IntegrationConfig[K],
  ) => {
    setConfigs((prev) => ({
      ...prev,
      [key]: { ...prev[key], [field]: value, key },
    }));
  };

  const handleModeChange = (key: IntegrationKey, mode: IntegrationMode) => {
    updateField(key, 'mode', mode);
    if (mode === '正式') {
      setSavedHint(`${INTEGRATION_NAMES[key]} 已切换为正式模式：当前仅保存配置，不调用真实接口。`);
    }
  };

  const handleSave = () => {
    const ok = saveIntegrationConfigs(configs);
    setSavedHint(ok ? '配置已保存到 localStorage（不含任何密钥），刷新后不丢失。' : '保存失败：localStorage 不可用。');
  };

  const handleReset = () => {
    const defaults = resetIntegrationConfigs();
    setConfigs(defaults);
    setSavedHint('已重置为默认配置（OCR 正式，验真 / 凭证内置）。');
  };

  const handleTest = (key: IntegrationKey) => {
    // 先保存当前配置（避免测试用的旧配置）
    saveIntegrationConfigs(configs);
    setTestInFlight(key);
    // 模拟异步测试
    setTimeout(() => {
      const { configs: latest, result } = testConnection(key);
      setConfigs(latest);
      setTestInFlight(null);
      setSavedHint(
        `${INTEGRATION_NAMES[key]} 测试完成（${result?.simulated ? '内置' : '真实'}）：${result?.message}`,
      );
    }, 320);
  };

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="接口配置中心"
        title="OCR / 验真 / 凭证接口配置"
        description="管理员可在下方「密钥配置」中直接填写 DeepSeek 与腾讯云密钥（保存即生效）；OCR 经后端代理调用腾讯云真实识别，验真与凭证接口一期使用内置通道。"
      />

      <AdminKeysPanel />

      <div className="boundary-callout" role="note">
        <Zap size={18} aria-hidden="true" />
        <div>
          <strong>接口边界提示</strong>
          <p>OCR 为真实调用（上传文件经后端代理请求腾讯云 VatInvoiceOCR）；验真与凭证的「测试连接」使用内置连通性检查（本地校验连接参数），正式通道在开通后自动切换。</p>
        </div>
      </div>

      {/* 腾讯云接口预留状态卡片（Gate T1） */}
      <section className="tencent-cloud-status-panel" aria-label="腾讯云接口预留状态">
        <div className="tencent-cloud-head">
          <Cloud size={20} aria-hidden="true" />
          <strong>腾讯云接口预留状态</strong>
          <span className="mock-badge">预留 · 未真实调用</span>
        </div>
        <div className="tencent-cloud-grid">
          <div className="tencent-cloud-tile">
            <span className="panel-kicker">腾讯云账号</span>
            <strong>{DEFAULT_TENCENT_CLOUD_STATUS.accountAvailable ? '已有，待配置' : '未提供'}</strong>
            <small>账号已就绪，密钥通过环境变量注入</small>
          </div>
          <div className="tencent-cloud-tile">
            <span className="panel-kicker">OCR 识别服务</span>
            <strong className="status-pending">{getTencentCloudOcrStatusText()}</strong>
            <small>推荐：腾讯云增值税发票识别</small>
            <a
              className="text-link"
              href={DEFAULT_TENCENT_CLOUD_STATUS.ocrDocUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              查看官方文档
            </a>
          </div>
          <div className="tencent-cloud-tile">
            <span className="panel-kicker">发票核验服务</span>
            <strong className="status-pending">{getTencentCloudVerifyStatusText()}</strong>
            <small>推荐：腾讯云增值税发票核验（新版）</small>
            <a
              className="text-link"
              href={DEFAULT_TENCENT_CLOUD_STATUS.verifyDocUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              查看官方文档
            </a>
          </div>
          <div className="tencent-cloud-tile">
            <span className="panel-kicker">凭证接入</span>
            <strong>{DEFAULT_TENCENT_CLOUD_STATUS.voucherIntegration}</strong>
            <small>第一版使用标准 CSV 模板，不自动过账</small>
          </div>
        </div>
        <div className="tencent-cloud-security" role="alert">
          <Shield size={16} aria-hidden="true" />
          <small>{DEFAULT_TENCENT_CLOUD_STATUS.securityNote}</small>
        </div>
        <div className="tencent-cloud-voucher-entry">
          <FileText size={16} aria-hidden="true" />
          <span>标准凭证模板：</span>
          <code>CO_20260718_标准凭证导入模板.csv</code>
        </div>
      </section>

      <section className="integration-grid" aria-label="接口配置列表">
        {INTEGRATION_KEYS.map((key) => {
          const config = configs[key];
          const isOfficial = config.mode === '正式';
          return (
            <article className="integration-card" key={key} aria-label={config.name}>
              <header className="integration-head">
                <div>
                  <Plug size={20} aria-hidden="true" />
                  <strong>{config.name}</strong>
                </div>
                <span className={`mode-pill mode-${isOfficial ? 'official' : 'mock'}`}>
                  {config.mode}{config.enabled ? '' : '/未启用'}
                </span>
              </header>

              <div className="integration-form">
                <label className="field">
                  <span>接口模式</span>
                  <select
                    value={config.mode}
                    onChange={(e) => handleModeChange(key, e.target.value as IntegrationMode)}
                    disabled={key === 'ocr'}
                    aria-label={key === 'ocr' ? 'OCR 接口模式（已固定为正式）' : `${config.name} 接口模式`}
                  >
                    <option value="内置">内置通道</option>
                    <option value="正式">正式</option>
                  </select>
                  {key === 'ocr' && (
                    <small className="field-hint">
                      已接入腾讯云 OCR（经后端代理真实调用），模式固定为正式，密钥保存在后端 .env。
                    </small>
                  )}
                </label>
                <label className="field">
                  <span>启用状态</span>
                  <select
                    value={config.enabled ? 'enabled' : 'disabled'}
                    onChange={(e) => updateField(key, 'enabled', e.target.value === 'enabled')}
                  >
                    <option value="enabled">启用</option>
                    <option value="disabled">未启用</option>
                  </select>
                </label>
                <label className="field field-wide">
                  <span>Base URL</span>
                  <input
                    type="text"
                    value={config.baseUrl}
                    onChange={(e) => updateField(key, 'baseUrl', e.target.value)}
                    placeholder="如 https://api.example.com/v1"
                  />
                </label>
                <div className="field field-wide api-key-notice" role="alert">
                  <Shield size={14} aria-hidden="true" />
                  <div>
                    <strong>API Key / Token：前端不保存</strong>
                    <small>
                      SecretId / SecretKey / Token 由后端代理通过环境变量注入，前端不提供输入框、不保存到 localStorage、不发送到任何外部接口。
                    </small>
                  </div>
                </div>
                <label className="field">
                  <span>超时时间（毫秒）</span>
                  <input
                    type="number"
                    min={500}
                    step={500}
                    value={config.timeoutMs}
                    onChange={(e) => updateField(key, 'timeoutMs', Number(e.target.value) || 5000)}
                  />
                </label>
                <label className="field">
                  <span>重试次数</span>
                  <input
                    type="number"
                    min={0}
                    max={5}
                    value={config.retryCount}
                    onChange={(e) => updateField(key, 'retryCount', Number(e.target.value) || 0)}
                  />
                </label>
              </div>

              {isOfficial && (
                <p className="official-warning" role="alert">
                  {key === 'ocr'
                    ? 'OCR 已通过后端代理调用腾讯云 VatInvoiceOCR 真实识别；SecretId/SecretKey 由后端 .env 注入，前端不保存。'
                    : '当前已切换到「正式」模式。仅保存模式与 Base URL，不调用真实接口，不保存任何 API Key / Token。真实调用将在后续 Gate 中由后端代理接入。'}
                </p>
              )}

              <div className="integration-actions">
                <button
                  type="button"
                  className="secondary-button"
                  disabled={testInFlight === key}
                  onClick={() => handleTest(key)}
                >
                  <RefreshCw size={14} aria-hidden="true" />
                  {testInFlight === key ? '测试中...' : '测试连接'}
                </button>
              </div>

              {config.lastTestResult && (
                <div
                  className={`test-result ${config.lastTestResult.success ? 'result-pass' : 'result-fail'}`}
                  role="status"
                >
                  <div>
                    <span>最后测试时间</span>
                    <small>{new Date(config.lastTestResult.timestamp).toLocaleString('zh-CN')}</small>
                  </div>
                  <div>
                    <span>结果</span>
                    <small>{config.lastTestResult.success ? '通过（内置）' : '未通过/仅保存'}</small>
                  </div>
                  <div>
                    <span>耗时</span>
                    <small>{config.lastTestResult.durationMs} ms</small>
                  </div>
                  <div>
                    <span>提示</span>
                    <small>{config.lastTestResult.message}</small>
                  </div>
                </div>
              )}
            </article>
          );
        })}
      </section>

      <div className="integration-footer">
        <button type="button" className="primary-button" onClick={handleSave}>
          <Save size={14} aria-hidden="true" /> 保存全部配置
        </button>
        <button type="button" className="secondary-button" onClick={handleReset}>
          重置为默认配置
        </button>
        <Link className="text-link" to="/">回工作台</Link>
        <Link className="text-link" to="/invoices">打开发票列表</Link>
      </div>

      {savedHint && (
        <div className="saved-hint" role="status">
          {savedHint}
        </div>
      )}
    </div>
  );
}
