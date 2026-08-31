// 会话密钥面板（v3 · 2026-08-31 会话制重构）
//
// 隐私模型（用户明确要求）：
//   - SecretId/SecretKey/API Key 由用户自己填入，仅存于浏览器 sessionStorage
//   - 关闭网站（标签页）即自动清除；也可随时「立即清除」
//   - 服务器不落盘：密钥随请求透传给后端代理，用完即弃
//   - 接口地址（Base URL）由后端代理固定，自动配置，无需填写
//
// 状态语义（沿用四档）：未配置 / 已保存·未验证 / 验证通过 / 验证失败
// 「已保存」= 已存入本会话；「验证」= 用该密钥发起一次最小真实调用
//
// 服务器全局密钥（管理员经 .env 或既有管理接口配置的加密存储）作为可选兜底：
// 请求未携带会话密钥时后端自动回退；本面板只读展示其有无，不在此配置。

import { useCallback, useEffect, useState } from 'react';
import {
  Cloud,
  Eraser,
  ExternalLink,
  KeyRound,
  Lightbulb,
  Link2,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Zap,
} from 'lucide-react';
import { useAuth } from '../../auth/AuthContext';
import { authHeaders } from '../../auth/authStorage';
import {
  clearSessionKeys,
  getTencentKeys,
  setTencentKeys,
  getDeepSeekKeys,
  setDeepSeekKeys,
  type SessionTencentKeys,
  type SessionDeepSeekKeys,
} from '../../integrations/sessionKeyStore';

// 控制台直达链接
const LINKS = {
  tencentKeys: 'https://console.cloud.tencent.com/cam/capi',
  tencentOcr: 'https://console.cloud.tencent.com/ocr',
  deepseekKeys: 'https://platform.deepseek.com/api_keys',
} as const;

interface ServiceState {
  phase: 'idle' | 'enabling' | 'testing';
  tested: null | boolean;
  message: string;
  testedAt: number | null;
}

const IDLE: ServiceState = { phase: 'idle', tested: null, message: '', testedAt: null };

const PILL = {
  unconfigured: { label: '未配置', cls: 'aks-pill--unconfigured' },
  unverified: { label: '已启用 · 未验证', cls: 'aks-pill--unverified' },
  ok: { label: '验证通过', cls: 'aks-pill--ok' },
  fail: { label: '验证失败', cls: 'aks-pill--fail' },
} as const;

function maskKey(value: string, keep = 4): string {
  if (!value) return '';
  if (value.length <= keep * 2) return '****';
  return `${value.slice(0, keep)}****${value.slice(-keep)}`;
}

const formatTime = (at: number | null) =>
  at ? new Date(at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : null;

export function SessionKeysPanel() {
  const { user } = useAuth();
  const uid = user?.userId;

  const [tcEnabled, setTcEnabled] = useState(false);
  const [dsEnabled, setDsEnabled] = useState(false);
  const [serverStatus, setServerStatus] = useState<{ tencent: boolean; deepseek: boolean } | null>(null);

  const [tencentId, setTencentId] = useState('');
  const [tencentKey, setTencentKey] = useState('');
  const [deepseekKey, setDeepseekKey] = useState('');
  const [deepseekModel, setDeepseekModel] = useState('');

  const [tcState, setTcState] = useState<ServiceState>(IDLE);
  const [dsState, setDsState] = useState<ServiceState>(IDLE);

  const syncFromStore = useCallback(() => {
    setTcEnabled(Boolean(getTencentKeys(uid)));
    setDsEnabled(Boolean(getDeepSeekKeys(uid)));
    const model = getDeepSeekKeys(uid)?.model;
    if (model) setDeepseekModel((prev) => prev || model);
  }, [uid]);

  // 服务器全局兜底密钥状态（公开健康接口，只读展示）
  const fetchServerStatus = useCallback(async () => {
    try {
      const r = await fetch('/api/tencent/health', { signal: AbortSignal.timeout(3000) });
      const j = await r.json().catch(() => null);
      if (j?.ok) {
        setServerStatus({ tencent: Boolean(j.tencent?.ocrConfigured), deepseek: Boolean(j.deepseek?.configured) });
      }
    } catch {
      /* 后端不可达时保持 null */
    }
  }, []);

  useEffect(() => {
    syncFromStore();
    void fetchServerStatus();
  }, [syncFromStore, fetchServerStatus]);

  useEffect(() => {
    if (!tcState.message && !dsState.message) return;
    const t = setTimeout(() => {
      setTcState((s) => (s.phase === 'idle' ? { ...s, message: '' } : s));
      setDsState((s) => (s.phase === 'idle' ? { ...s, message: '' } : s));
    }, 8000);
    return () => clearTimeout(t);
  }, [tcState.message, dsState.message]);

  // 用指定凭据发起最小真实调用验证（会话密钥或服务器兜底）
  const runTest = async (
    kind: 'tencent' | 'deepseek',
    creds?: SessionTencentKeys | SessionDeepSeekKeys,
    setState: typeof setTcState = kind === 'tencent' ? setTcState : setDsState,
  ) => {
    setState((s) => ({ ...s, phase: 'testing', message: '正在发起真实调用验证…' }));
    const stored = kind === 'tencent' ? getTencentKeys(uid) : getDeepSeekKeys(uid);
    const effective = creds ?? stored;
    let body: Record<string, string> = {};
    if (kind === 'tencent' && effective && 'secretId' in effective) {
      body = { secretId: effective.secretId, secretKey: effective.secretKey };
    } else if (kind === 'deepseek' && effective && 'apiKey' in effective) {
      body = { apiKey: effective.apiKey, ...(effective.model ? { model: effective.model } : {}) };
    }
    try {
      const r = await fetch(`/api/keys/test/${kind}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify(body),
      });
      const payload = await r.json().catch(() => ({}));
      setState({
        phase: 'idle',
        tested: payload?.ok === true,
        message: payload?.message || payload?.data?.message || '测试完成。',
        testedAt: Date.now(),
      });
    } catch {
      setState({ phase: 'idle', tested: false, message: '网络错误：无法连接后端服务。', testedAt: Date.now() });
    }
  };

  // 启用并验证：写入 sessionStorage → 立即真实测试（输入框随即清空，页面永不回显完整值）
  const enableAndVerify = async (kind: 'tencent' | 'deepseek') => {
    if (kind === 'tencent') {
      const keys = { secretId: tencentId.trim(), secretKey: tencentKey.trim() };
      if (!setTencentKeys(uid, keys)) {
        setTcState({ ...IDLE, tested: false, message: '会话存储不可用，未能启用。', testedAt: Date.now() });
        return;
      }
      setTencentId('');
      setTencentKey('');
      syncFromStore();
      await runTest('tencent', keys, setTcState);
    } else {
      const keys: SessionDeepSeekKeys = { apiKey: deepseekKey.trim() };
      if (deepseekModel.trim()) keys.model = deepseekModel.trim();
      if (!setDeepSeekKeys(uid, keys)) {
        setDsState({ ...IDLE, tested: false, message: '会话存储不可用，未能启用。', testedAt: Date.now() });
        return;
      }
      setDeepseekKey('');
      syncFromStore();
      await runTest('deepseek', keys, setDsState);
    }
  };

  const clearAll = () => {
    clearSessionKeys(uid);
    setTcState(IDLE);
    setDsState(IDLE);
    syncFromStore();
  };

  const tcBusy = tcState.phase !== 'idle';
  const dsBusy = dsState.phase !== 'idle';
  const tcAvail = !tcEnabled ? 'unconfigured' : tcState.tested === null ? 'unverified' : tcState.tested ? 'ok' : 'fail';
  const dsAvail = !dsEnabled ? 'unconfigured' : dsState.tested === null ? 'unverified' : dsState.tested ? 'ok' : 'fail';

  const tcSession = getTencentKeys(uid);
  const dsSession = getDeepSeekKeys(uid);

  return (
    <section className="admin-keys-panel" aria-label="会话密钥配置">
      <div className="admin-keys-head">
        <KeyRound size={18} aria-hidden="true" />
        <strong>密钥配置（仅本次浏览会话）</strong>
        <button type="button" className="secondary-button admin-keys-refresh" onClick={() => { syncFromStore(); void fetchServerStatus(); }}>
          <RefreshCw size={13} aria-hidden="true" />
          刷新状态
        </button>
      </div>

      <p className="admin-keys-note">
        密钥由你自己填入，<b>只保存在当前浏览器会话中，关闭网站自动清除</b>；服务器不保存。
        「验证」发起一次最小真实调用——只有验证通过，发票识别 / AI 核验才会真实生效。
        接口地址由后端代理自动配置，无需填写。
      </p>

      {/* 服务可用性总览 */}
      <div className="aks-overview" role="status" aria-label="服务可用性总览">
        <div className="aks-row">
          <Cloud size={16} aria-hidden="true" />
          <div className="aks-row-main">
            <strong>腾讯云 OCR</strong>
            <small>增值税发票识别 · 上传发票自动识别票面</small>
          </div>
          <span className={`aks-pill ${PILL[tcAvail].cls}`}>{PILL[tcAvail].label}</span>
          {tcState.testedAt && <span className="aks-tested-at">{formatTime(tcState.testedAt)} 验证</span>}
          <button
            type="button"
            className="secondary-button aks-row-test"
            onClick={() => void runTest('tencent', undefined, setTcState)}
            disabled={tcBusy || (!tcEnabled && !serverStatus?.tencent)}
          >
            <Zap size={13} aria-hidden="true" />
            {tcState.phase === 'testing' ? '验证中…' : '验证'}
          </button>
        </div>
        <div className="aks-row">
          <Sparkles size={16} aria-hidden="true" />
          <div className="aks-row-main">
            <strong>DeepSeek</strong>
            <small>类别识别 · 业务追问 · 风险初判 · AI 核验 · AI 凭证草稿</small>
          </div>
          <span className={`aks-pill ${PILL[dsAvail].cls}`}>{PILL[dsAvail].label}</span>
          {dsState.testedAt && <span className="aks-tested-at">{formatTime(dsState.testedAt)} 验证</span>}
          <button
            type="button"
            className="secondary-button aks-row-test"
            onClick={() => void runTest('deepseek', undefined, setDsState)}
            disabled={dsBusy || (!dsEnabled && !serverStatus?.deepseek)}
          >
            <Zap size={13} aria-hidden="true" />
            {dsState.phase === 'testing' ? '验证中…' : '验证'}
          </button>
        </div>
        {serverStatus && (serverStatus.tencent || serverStatus.deepseek) && (
          <div className="aks-server-fallback" role="note">
            服务器全局密钥兜底：腾讯云 {serverStatus.tencent ? '已配置' : '未配置'} · DeepSeek {serverStatus.deepseek ? '已配置' : '未配置'}
            （未启用会话密钥时自动使用；由管理员在服务器 .env 配置）
          </div>
        )}
      </div>

      <div className="admin-keys-grid">
        {/* ============ 腾讯云 OCR ============ */}
        <div className="admin-keys-card">
          <header>
            <strong>腾讯云 · 增值税发票 OCR</strong>
            <span className={`aks-pill ${PILL[tcAvail].cls}`}>{PILL[tcAvail].label}</span>
          </header>

          <div className="aks-baseurl" role="note">
            <Link2 size={13} aria-hidden="true" />
            <span>接口地址（自动配置）：<code>经后端代理 → ocr.tencentcloudapi.com</code></span>
          </div>

          {tcSession && (
            <p className="aks-current">
              本会话密钥：<code>{maskKey(tcSession.secretId, 6)}</code>
            </p>
          )}

          <ol className="aks-steps" aria-label="配置步骤">
            <li>
              <span className="aks-step-num">1</span>
              <div>
                <strong>获取密钥</strong>
                <small>新建密钥弹窗内的 SecretId + SecretKey <b>成对</b>复制（SecretKey 只显示一次）</small>
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
                <strong>粘贴并启用</strong>
                <small>仅存入当前浏览器会话（关闭网站自动清除），服务器不保存</small>
              </div>
            </li>
            <li>
              <span className="aks-step-num">3</span>
              <div>
                <strong>自动真实验证</strong>
                <small>启用后立即用最小图片真实调用一次，明确结论</small>
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
              onClick={() => void enableAndVerify('tencent')}
              disabled={tcBusy || !tencentId.trim() || !tencentKey.trim()}
            >
              {tcState.phase === 'enabling' ? '启用中…' : tcState.phase === 'testing' ? '验证中…' : '启用并验证'}
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={() => void runTest('tencent', undefined, setTcState)}
              disabled={tcBusy || (!tcEnabled && !serverStatus?.tencent)}
            >
              <Zap size={13} aria-hidden="true" />
              仅验证
            </button>
          </div>

          {tcState.message && (
            <p className={`aks-result ${tcState.tested === null ? '' : tcState.tested ? 'aks-result--ok' : 'aks-result--fail'}`} role="status">
              {tcState.message}
            </p>
          )}
        </div>

        {/* ============ DeepSeek ============ */}
        <div className="admin-keys-card">
          <header>
            <strong>DeepSeek · AI 能力（识别 / 核验 / 凭证）</strong>
            <span className={`aks-pill ${PILL[dsAvail].cls}`}>{PILL[dsAvail].label}</span>
          </header>

          <div className="aks-baseurl" role="note">
            <Link2 size={13} aria-hidden="true" />
            <span>接口地址（自动配置）：<code>经后端代理 → api.deepseek.com</code></span>
          </div>

          {dsSession && (
            <p className="aks-current">
              本会话密钥：<code>{maskKey(dsSession.apiKey, 5)}</code> · 模型 <code>{dsSession.model || 'deepseek-v4-flash'}</code>
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
                <strong>粘贴并启用</strong>
                <small>仅存入当前浏览器会话（关闭网站自动清除），服务器不保存</small>
              </div>
            </li>
            <li>
              <span className="aks-step-num">3</span>
              <div>
                <strong>自动真实验证</strong>
                <small>启用后立即发起一次最小真实请求，区分密钥无效 / 欠费 / 限流 / 超时</small>
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
              onClick={() => void enableAndVerify('deepseek')}
              disabled={dsBusy || !deepseekKey.trim()}
            >
              {dsState.phase === 'enabling' ? '启用中…' : dsState.phase === 'testing' ? '验证中…' : '启用并验证'}
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={() => void runTest('deepseek', undefined, setDsState)}
              disabled={dsBusy || (!dsEnabled && !serverStatus?.deepseek)}
            >
              <Zap size={13} aria-hidden="true" />
              仅验证
            </button>
          </div>

          {dsState.message && (
            <p className={`aks-result ${dsState.tested === null ? '' : dsState.tested ? 'aks-result--ok' : 'aks-result--fail'}`} role="status">
              {dsState.message}
            </p>
          )}
        </div>
      </div>

      <div className="admin-keys-footnote" role="note">
        <ShieldCheck size={14} aria-hidden="true" />
        <span>
          隐私保护：密钥仅存于当前标签页会话，关闭网站即清除，浏览器与服务器均不持久化；
          需要彻底退出时也可点下方按钮立即清除。密钥疑似泄露时到对应控制台禁用并新建即可。
        </span>
      </div>

      <div className="aks-actions aks-actions--footer">
        <button type="button" className="secondary-button" onClick={clearAll} disabled={!tcEnabled && !dsEnabled}>
          <Eraser size={13} aria-hidden="true" />
          立即清除本会话全部密钥
        </button>
      </div>

      <div className="aks-hint" role="note">
        <Lightbulb size={14} aria-hidden="true" />
        <span>
          上传发票「没反应」时先看上方总览：任一服务<span className="aks-hint-strong">未配置 / 验证失败</span>，
          发票识别与 AI 核验就不会真实生效——填入自己的密钥并验证通过即可恢复。
        </span>
      </div>
    </section>
  );
}
