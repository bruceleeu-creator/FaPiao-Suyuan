// 密钥与服务状态面板（v2 · 2026-08-31 重构）
//
// 职责：管理员在网页上完成密钥全生命周期——获取 → 保存（加密落盘）→ 真实验证。
// 设计要点：
//   - 状态四档语义：未配置 / 已保存·未验证 / 验证通过 / 验证失败
//     「已配置」只代表格式合法；真实可用以「测试连接」（最小真实调用）为准
//   - 「保存并验证」一键完成：保存 → 刷新状态 → 自动发起真实测试 → 展示带时间戳的结果
//   - 顶部服务总览条：两个服务的真实可用性一眼可见（这是上传发票能否自动识别的直接答案）
//   - 输入框 type=password，保存成功即清空，永不回显密钥值（状态接口只返回布尔/掩码）
//   - 仅第一个注册的账户（管理员）可见可操作；普通用户显示说明卡片

import { useCallback, useEffect, useState } from 'react';
import {
  Cloud,
  ExternalLink,
  KeyRound,
  Lightbulb,
  Lock,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Zap,
} from 'lucide-react';
import { useAuth } from '../../auth/AuthContext';
import { authHeaders } from '../../auth/authStorage';

interface KeysStatus {
  deepseek: { configured: boolean; model: string | null };
  tencent: { configured: boolean; secretIdMasked: string | null };
}

// 单个服务的验证状态（内存态，刷新后回到「未验证」——测试是时点性行为，如实展示）
interface ServiceState {
  phase: 'idle' | 'saving' | 'testing';
  tested: null | boolean;
  message: string;
  testedAt: number | null;
}

const IDLE_STATE: ServiceState = { phase: 'idle', tested: null, message: '', testedAt: null };

type Availability = 'unconfigured' | 'unverified' | 'ok' | 'fail';

const AVAILABILITY_META: Record<Availability, { label: string; className: string }> = {
  unconfigured: { label: '未配置', className: 'aks-pill--unconfigured' },
  unverified: { label: '已保存 · 未验证', className: 'aks-pill--unverified' },
  ok: { label: '验证通过', className: 'aks-pill--ok' },
  fail: { label: '验证失败', className: 'aks-pill--fail' },
};

function deriveAvailability(configured: boolean, state: ServiceState): Availability {
  if (!configured) return 'unconfigured';
  if (state.tested === null) return 'unverified';
  return state.tested ? 'ok' : 'fail';
}

// 控制台直达链接：获取密钥的必经入口（用户高频卡点，一步直达）
const LINKS = {
  tencentKeys: 'https://console.cloud.tencent.com/cam/capi',
  tencentOcr: 'https://console.cloud.tencent.com/ocr',
  deepseekKeys: 'https://platform.deepseek.com/api_keys',
} as const;

export function AdminKeysPanel() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [status, setStatus] = useState<KeysStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);

  const [deepseekKey, setDeepseekKey] = useState('');
  const [deepseekModel, setDeepseekModel] = useState('');
  const [tencentId, setTencentId] = useState('');
  const [tencentKey, setTencentKey] = useState('');

  const [dsState, setDsState] = useState<ServiceState>(IDLE_STATE);
  const [tcState, setTcState] = useState<ServiceState>(IDLE_STATE);

  useEffect(() => {
    if (!dsState.message && !tcState.message) return;
    const t = setTimeout(() => {
      setDsState((s) => (s.phase === 'idle' ? { ...s, message: '' } : s));
      setTcState((s) => (s.phase === 'idle' ? { ...s, message: '' } : s));
    }, 8000);
    return () => clearTimeout(t);
  }, [dsState.message, tcState.message]);

  const refreshStatus = useCallback(async () => {
    setStatusLoading(true);
    try {
      const response = await fetch('/api/admin/keys/status', { headers: authHeaders() });
      const payload = await response.json().catch(() => ({}));
      if (response.ok && payload.ok) {
        setStatus(payload.data as KeysStatus);
        if (payload.data?.deepseek?.model) {
          setDeepseekModel((prev) => prev || payload.data.deepseek.model);
        }
      }
    } catch {
      // 状态读取失败时保留上次结果；总览条会显示「状态未知」
    } finally {
      setStatusLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAdmin) void refreshStatus();
  }, [isAdmin, refreshStatus]);

  // 发起真实测试（最小调用：DeepSeek max_tokens=1 / 腾讯云 1px 图片 OCR）
  const runTest = async (
    path: 'deepseek' | 'tencent',
    setState: React.Dispatch<React.SetStateAction<ServiceState>>,
  ) => {
    setState((s) => ({ ...s, phase: 'testing', message: '正在发起真实调用验证…' }));
    try {
      const response = await fetch(`/api/admin/keys/${path}/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({}),
      });
      const payload = await response.json().catch(() => ({}));
      if (response.status === 401 || response.status === 403) {
        setState({
          phase: 'idle',
          tested: false,
          message: payload?.message || '无权限执行该测试（需管理员登录）。',
          testedAt: Date.now(),
        });
        return;
      }
      setState({
        phase: 'idle',
        tested: payload?.ok === true,
        message: payload?.message || payload?.data?.message || '测试完成。',
        testedAt: Date.now(),
      });
    } catch {
      setState({
        phase: 'idle',
        tested: false,
        message: '网络错误：无法连接后端服务。',
        testedAt: Date.now(),
      });
    }
  };

  // 保存并验证：保存 → 刷新状态 → 自动真实测试（核心路径，一步到位）
  const saveAndVerify = async (
    path: 'deepseek' | 'tencent',
    body: Record<string, string>,
    clearInputs: () => void,
    setState: React.Dispatch<React.SetStateAction<ServiceState>>,
  ) => {
    setState((s) => ({ ...s, phase: 'saving', message: '正在加密保存…' }));
    try {
      const response = await fetch(`/api/admin/keys/${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify(body),
      });
      const payload = await response.json().catch(() => ({}));
      if (!(response.ok && payload.ok)) {
        setState({
          phase: 'idle',
          tested: null,
          message: payload?.message || `保存失败（HTTP ${response.status}）。`,
          testedAt: null,
        });
        return;
      }
      clearInputs();
      await refreshStatus();
      await runTest(path, setState);
    } catch {
      setState({
        phase: 'idle',
        tested: null,
        message: '网络错误：保存请求未送达后端。',
        testedAt: null,
      });
    }
  };

  const dsBusy = dsState.phase !== 'idle';
  const tcBusy = tcState.phase !== 'idle';
  const dsAvail = deriveAvailability(status?.deepseek.configured ?? false, dsState);
  const tcAvail = deriveAvailability(status?.tencent.configured ?? false, tcState);

  if (!isAdmin) {
    return (
      <section className="admin-keys-panel" aria-label="密钥配置（仅管理员）">
        <div className="admin-keys-head">
          <Lock size={18} aria-hidden="true" />
          <strong>密钥配置（仅管理员）</strong>
        </div>
        <p className="admin-keys-note">
          真实接口密钥（DeepSeek / 腾讯云 OCR）由管理员配置。你是普通用户，无需配置即可使用系统；
          如需启用真实识别请联系管理员。
        </p>
      </section>
    );
  }

  const formatTime = (at: number | null) =>
    at ? new Date(at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : null;

  return (
    <section className="admin-keys-panel" aria-label="密钥与服务状态">
      <div className="admin-keys-head">
        <KeyRound size={18} aria-hidden="true" />
        <strong>密钥与服务状态</strong>
        <button
          type="button"
          className="secondary-button admin-keys-refresh"
          onClick={() => void refreshStatus()}
          disabled={statusLoading}
        >
          <RefreshCw size={13} aria-hidden="true" />
          {statusLoading ? '刷新中…' : '刷新状态'}
        </button>
      </div>

      <p className="admin-keys-note">
        密钥保存到服务器加密存储（AES-256-GCM），<b>保存即生效</b>、全局可用，不出现在浏览器。
        「验证」会发起一次最小真实调用——<b>只有验证通过，上传发票才会自动识别</b>；
        「已保存」仅代表格式合法，不代表密钥真实可用。
      </p>

      {/* 服务可用性总览：两个服务能否真实工作，一眼看清 */}
      <div className="aks-overview" role="status" aria-label="服务可用性总览">
        <div className="aks-row">
          <Cloud size={16} aria-hidden="true" />
          <div className="aks-row-main">
            <strong>腾讯云 OCR</strong>
            <small>增值税发票识别 · 上传发票自动识别票面</small>
          </div>
          <span className={`aks-pill ${AVAILABILITY_META[tcAvail].className}`}>
            {status === null ? '状态未知' : AVAILABILITY_META[tcAvail].label}
          </span>
          {tcState.testedAt && <span className="aks-tested-at">{formatTime(tcState.testedAt)} 验证</span>}
          <button
            type="button"
            className="secondary-button aks-row-test"
            onClick={() => void runTest('tencent', setTcState)}
            disabled={tcBusy || !status?.tencent.configured}
          >
            <Zap size={13} aria-hidden="true" />
            {tcState.phase === 'testing' ? '验证中…' : '验证'}
          </button>
        </div>
        <div className="aks-row">
          <Sparkles size={16} aria-hidden="true" />
          <div className="aks-row-main">
            <strong>DeepSeek</strong>
            <small>类别识别 · 业务追问 · 风险初判</small>
          </div>
          <span className={`aks-pill ${AVAILABILITY_META[dsAvail].className}`}>
            {status === null ? '状态未知' : AVAILABILITY_META[dsAvail].label}
          </span>
          {dsState.testedAt && <span className="aks-tested-at">{formatTime(dsState.testedAt)} 验证</span>}
          <button
            type="button"
            className="secondary-button aks-row-test"
            onClick={() => void runTest('deepseek', setDsState)}
            disabled={dsBusy || !status?.deepseek.configured}
          >
            <Zap size={13} aria-hidden="true" />
            {dsState.phase === 'testing' ? '验证中…' : '验证'}
          </button>
        </div>
      </div>

      <div className="admin-keys-grid">
        {/* ============ 腾讯云 OCR ============ */}
        <div className="admin-keys-card">
          <header>
            <strong>腾讯云 · 增值税发票 OCR</strong>
            <span className={`aks-pill ${AVAILABILITY_META[tcAvail].className}`}>
              {status === null ? '状态未知' : AVAILABILITY_META[tcAvail].label}
            </span>
          </header>

          {status?.tencent.configured && (
            <p className="aks-current">
              当前密钥：<code>{status.tencent.secretIdMasked ?? '—'}</code>
            </p>
          )}

          <ol className="aks-steps" aria-label="配置步骤">
            <li>
              <span className="aks-step-num">1</span>
              <div>
                <strong>获取密钥</strong>
                <small>新建密钥时弹窗内的 SecretId + SecretKey <b>成对</b>复制（SecretKey 只显示一次）</small>
                <div className="aks-links">
                  <a href={LINKS.tencentKeys} target="_blank" rel="noopener noreferrer">
                    API 密钥管理 <ExternalLink size={11} aria-hidden="true" />
                  </a>
                  <a href={LINKS.tencentOcr} target="_blank" rel="noopener noreferrer">
                    OCR 控制台（确认已开通） <ExternalLink size={11} aria-hidden="true" />
                  </a>
                </div>
              </div>
            </li>
            <li>
              <span className="aks-step-num">2</span>
              <div>
                <strong>粘贴并保存</strong>
                <small>加密存到服务器，立即生效，页面永不回显</small>
              </div>
            </li>
            <li>
              <span className="aks-step-num">3</span>
              <div>
                <strong>自动真实验证</strong>
                <small>保存后立即用最小图片真实调用一次，给出能否使用的明确结论</small>
              </div>
            </li>
          </ol>

          <label className="field">
            <span>SecretId</span>
            <input
              type="password"
              value={tencentId}
              onChange={(e) => setTencentId(e.target.value)}
              placeholder="AKID 开头 · 36 位"
              autoComplete="off"
              aria-invalid={tencentId.length > 0 && !tencentId.trim().startsWith('AKID')}
            />
            {tencentId.length > 0 && !tencentId.trim().startsWith('AKID') && (
              <small className="aks-field-error">SecretId 应以 AKID 开头（腾讯云「API 密钥管理」新建）</small>
            )}
          </label>
          <label className="field">
            <span>SecretKey</span>
            <input
              type="password"
              value={tencentKey}
              onChange={(e) => setTencentKey(e.target.value)}
              placeholder="32 位字母数字（与上方 SecretId 同一弹窗成对出现）"
              autoComplete="off"
              aria-invalid={tencentKey.length > 0 && tencentKey.trim().length !== 32}
            />
            {tencentKey.length > 0 && tencentKey.trim().length !== 32 && (
              <small className="aks-field-error">SecretKey 应为 32 位字母数字</small>
            )}
          </label>

          <div className="aks-actions">
            <button
              type="button"
              className="primary-button"
              onClick={() =>
                void saveAndVerify(
                  'tencent',
                  { secretId: tencentId.trim(), secretKey: tencentKey.trim() },
                  () => {
                    setTencentId('');
                    setTencentKey('');
                  },
                  setTcState,
                )
              }
              disabled={tcBusy || !tencentId.trim() || !tencentKey.trim()}
            >
              {tcState.phase === 'saving' ? '保存中…' : tcState.phase === 'testing' ? '验证中…' : '保存并验证'}
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={() => void runTest('tencent', setTcState)}
              disabled={tcBusy || !status?.tencent.configured}
            >
              <Zap size={13} aria-hidden="true" />
              仅验证当前密钥
            </button>
          </div>

          {tcState.message && (
            <p
              className={`aks-result ${
                tcState.tested === null ? '' : tcState.tested ? 'aks-result--ok' : 'aks-result--fail'
              }`}
              role="status"
            >
              {tcState.message}
            </p>
          )}
        </div>

        {/* ============ DeepSeek ============ */}
        <div className="admin-keys-card">
          <header>
            <strong>DeepSeek · AI 识别与追问</strong>
            <span className={`aks-pill ${AVAILABILITY_META[dsAvail].className}`}>
              {status === null ? '状态未知' : AVAILABILITY_META[dsAvail].label}
            </span>
          </header>

          {status?.deepseek.configured && (
            <p className="aks-current">
              当前模型：<code>{status.deepseek.model || 'deepseek-v4-flash'}</code>
            </p>
          )}

          <ol className="aks-steps" aria-label="配置步骤">
            <li>
              <span className="aks-step-num">1</span>
              <div>
                <strong>获取 API Key</strong>
                <small>开放平台「API Keys」页创建，sk- 开头</small>
                <div className="aks-links">
                  <a href={LINKS.deepseekKeys} target="_blank" rel="noopener noreferrer">
                    DeepSeek API Keys <ExternalLink size={11} aria-hidden="true" />
                  </a>
                </div>
              </div>
            </li>
            <li>
              <span className="aks-step-num">2</span>
              <div>
                <strong>粘贴并保存</strong>
                <small>加密存到服务器，立即生效，页面永不回显</small>
              </div>
            </li>
            <li>
              <span className="aks-step-num">3</span>
              <div>
                <strong>自动真实验证</strong>
                <small>保存后立即发起一次最小真实请求，区分密钥无效 / 欠费 / 限流 / 超时</small>
              </div>
            </li>
          </ol>

          <label className="field">
            <span>API Key</span>
            <input
              type="password"
              value={deepseekKey}
              onChange={(e) => setDeepseekKey(e.target.value)}
              placeholder="sk- 开头（DeepSeek 开放平台「API Keys」页获取）"
              autoComplete="off"
              aria-invalid={deepseekKey.length > 0 && !deepseekKey.trim().startsWith('sk-')}
            />
            {deepseekKey.length > 0 && !deepseekKey.trim().startsWith('sk-') && (
              <small className="aks-field-error">API Key 应以 sk- 开头</small>
            )}
          </label>
          <label className="field">
            <span>模型（可选，默认 deepseek-v4-flash）</span>
            <input
              type="text"
              value={deepseekModel}
              onChange={(e) => setDeepseekModel(e.target.value)}
              placeholder="deepseek-v4-flash"
              autoComplete="off"
            />
          </label>

          <div className="aks-actions">
            <button
              type="button"
              className="primary-button"
              onClick={() =>
                void saveAndVerify(
                  'deepseek',
                  {
                    apiKey: deepseekKey.trim(),
                    ...(deepseekModel.trim() ? { model: deepseekModel.trim() } : {}),
                  },
                  () => setDeepseekKey(''),
                  setDsState,
                )
              }
              disabled={dsBusy || !deepseekKey.trim()}
            >
              {dsState.phase === 'saving' ? '保存中…' : dsState.phase === 'testing' ? '验证中…' : '保存并验证'}
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={() => void runTest('deepseek', setDsState)}
              disabled={dsBusy || !status?.deepseek.configured}
            >
              <Zap size={13} aria-hidden="true" />
              仅验证当前密钥
            </button>
          </div>

          {dsState.message && (
            <p
              className={`aks-result ${
                dsState.tested === null ? '' : dsState.tested ? 'aks-result--ok' : 'aks-result--fail'
              }`}
              role="status"
            >
              {dsState.message}
            </p>
          )}
        </div>
      </div>

      <div className="admin-keys-footnote" role="note">
        <ShieldCheck size={14} aria-hidden="true" />
        <span>密钥仅保存在服务器加密文件中，页面上永不回显完整值；泄露风险高时可在腾讯云控制台随时禁用并新建。</span>
      </div>

      <div className="aks-hint" role="note">
        <Lightbulb size={14} aria-hidden="true" />
        <span>
          上传发票「没反应」时先看上方总览：任一服务<span className="aks-hint-strong">未配置 / 验证失败</span>
          ，发票识别就不会自动填充——补齐密钥并验证通过即可恢复。
        </span>
      </div>
    </section>
  );
}
