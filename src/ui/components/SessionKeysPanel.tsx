// 密钥配置面板（v4 · 2026-09-15 账户密钥库重构）
//
// 密钥模型（用户 2026-09-15 决策：不再存浏览器缓存）：
//   - SecretId/SecretKey/API Key 由用户自己填入，加密存入服务器账户密钥库
//     （node:sqlite + AES-256-GCM，按账户隔离，跨会话可用）
//   - 浏览器不再持久化任何密钥；页面永不回显完整值，只显示末 4 位掩码
//   - 旧版 sessionStorage 会话密钥仅作兼容：检测到时预填表单，保存成功后自动迁移清除
//
// 状态语义（沿用四档）：未配置 / 已保存·未验证 / 验证通过 / 验证失败
// 「验证」= 以当前实际生效的密钥（账户密钥库 > 服务器全局兜底）发起一次最小真实调用
//
// 服务器全局密钥（管理员 .env 配置）作为最后兜底；本面板只读展示其有无。

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
  getTencentKeys,
  setTencentKeys,
  getDeepSeekKeys,
  setDeepSeekKeys,
  clearSessionKeys,
} from '../../integrations/sessionKeyStore';
import {
  fetchStoredKeyStatus,
  saveStoredDeepSeekKeys,
  saveStoredTencentKeys,
  clearStoredKeys,
  type StoredKeysStatus,
} from '../../integrations/storedKeysApi';

// 控制台直达链接
const LINKS = {
  tencentKeys: 'https://console.cloud.tencent.com/cam/capi',
  tencentOcr: 'https://console.cloud.tencent.com/ocr',
  deepseekKeys: 'https://platform.deepseek.com/api_keys',
} as const;

interface ServiceState {
  phase: 'idle' | 'saving' | 'testing';
  tested: null | boolean;
  message: string;
  testedAt: number | null;
}

const IDLE: ServiceState = { phase: 'idle', tested: null, message: '', testedAt: null };

const PILL = {
  unconfigured: { label: '未配置', cls: 'aks-pill--unconfigured' },
  unverified: { label: '已保存 · 未验证', cls: 'aks-pill--unverified' },
  ok: { label: '验证通过', cls: 'aks-pill--ok' },
  fail: { label: '验证失败', cls: 'aks-pill--fail' },
} as const;

const formatTime = (at: number | null) =>
  at ? new Date(at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : null;

export function SessionKeysPanel() {
  const { user } = useAuth();
  const uid = user?.userId;

  const [storedStatus, setStoredStatus] = useState<StoredKeysStatus | null>(null);
  const [serverStatus, setServerStatus] = useState<{ tencent: boolean; deepseek: boolean } | null>(null);

  const [tencentId, setTencentId] = useState('');
  const [tencentKey, setTencentKey] = useState('');
  const [deepseekKey, setDeepseekKey] = useState('');
  const [deepseekModel, setDeepseekModel] = useState('');

  const [tcState, setTcState] = useState<ServiceState>(IDLE);
  const [dsState, setDsState] = useState<ServiceState>(IDLE);

  // 旧版 sessionStorage 会话密钥（2026-08-31 模型遗留）：仅用于一次性迁移预填
  const legacyTencent = getTencentKeys(uid);
  const legacyDeepSeek = getDeepSeekKeys(uid);

  const refreshStored = useCallback(async () => {
    const status = await fetchStoredKeyStatus();
    setStoredStatus(status);
  }, []);

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
    void refreshStored();
    void fetchServerStatus();
    // 旧版会话密钥迁移：检测到遗留密钥且服务器未存时预填表单，等待用户确认保存
    if (legacyTencent && !tencentId) {
      setTencentId(legacyTencent.secretId);
      setTencentKey(legacyTencent.secretKey);
    }
    if (legacyDeepSeek && !deepseekKey) {
      setDeepseekKey(legacyDeepSeek.apiKey);
      const legacyModel = legacyDeepSeek.model;
      if (legacyModel) setDeepseekModel((prev) => prev || legacyModel);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid]);

  useEffect(() => {
    if (!tcState.message && !dsState.message) return;
    const t = setTimeout(() => {
      setTcState((s) => (s.phase === 'idle' ? { ...s, message: '' } : s));
      setDsState((s) => (s.phase === 'idle' ? { ...s, message: '' } : s));
    }, 8000);
    return () => clearTimeout(t);
  }, [tcState.message, dsState.message]);

  // 以当前实际生效的密钥（账户密钥库 > 服务器兜底）发起最小真实调用
  const runTest = async (kind: 'tencent' | 'deepseek') => {
    const setState = kind === 'tencent' ? setTcState : setDsState;
    setState((s) => ({ ...s, phase: 'testing', message: '正在发起真实调用验证…' }));
    try {
      const r = await fetch(`/api/keys/test/${kind}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({}),
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

  // 保存到服务器账户密钥库 → 立即真实验证（输入框随即清空，页面永不回显完整值）
  const enableAndVerify = async (kind: 'tencent' | 'deepseek') => {
    if (kind === 'tencent') {
      const id = tencentId.trim();
      const key = tencentKey.trim();
      if (!id.startsWith('AKID') || key.length !== 32) {
        setTcState({ ...IDLE, tested: false, message: 'SecretId 应以 AKID 开头共 36 位，SecretKey 为 32 位字母数字。', testedAt: Date.now() });
        return;
      }
      setTcState((s) => ({ ...s, phase: 'saving', message: '正在加密保存到账户密钥库…' }));
      const result = await saveStoredTencentKeys(id, key);
      if (!result.ok) {
        setTcState({ ...IDLE, tested: false, message: result.message || '保存失败，请稍后重试。', testedAt: Date.now() });
        return;
      }
      setTencentId('');
      setTencentKey('');
      setTencentKeys(uid, null); // 迁移完成：清除旧版 sessionStorage 遗留
      await refreshStored();
      await runTest('tencent');
    } else {
      const key = deepseekKey.trim();
      if (!key.startsWith('sk-')) {
        setDsState({ ...IDLE, tested: false, message: 'API Key 应以 sk- 开头（DeepSeek 开放平台「API Keys」页获取）。', testedAt: Date.now() });
        return;
      }
      setDsState((s) => ({ ...s, phase: 'saving', message: '正在加密保存到账户密钥库…' }));
      const result = await saveStoredDeepSeekKeys(key, deepseekModel.trim() || undefined);
      if (!result.ok) {
        setDsState({ ...IDLE, tested: false, message: result.message || '保存失败，请稍后重试。', testedAt: Date.now() });
        return;
      }
      setDeepseekKey('');
      setDeepSeekKeys(uid, null); // 迁移完成：清除旧版 sessionStorage 遗留
      await refreshStored();
      await runTest('deepseek');
    }
  };

  // 清除服务器账户密钥库中本账户的全部密钥 + 旧版 sessionStorage 遗留
  const clearAll = async () => {
    const result = await clearStoredKeys('all');
    clearSessionKeys(uid);
    setTcState(IDLE);
    setDsState(IDLE);
    await refreshStored();
    if (!result.ok) {
      setTcState({ ...IDLE, tested: false, message: result.message || '清除失败，请稍后重试。', testedAt: Date.now() });
    }
  };

  const tcEnabled = Boolean(storedStatus?.tencent.configured || legacyTencent);
  const dsEnabled = Boolean(storedStatus?.deepseek.configured || legacyDeepSeek);
  const tcBusy = tcState.phase !== 'idle';
  const dsBusy = dsState.phase !== 'idle';
  const tcAvail = !tcEnabled ? 'unconfigured' : tcState.tested === null ? 'unverified' : tcState.tested ? 'ok' : 'fail';
  const dsAvail = !dsEnabled ? 'unconfigured' : dsState.tested === null ? 'unverified' : dsState.tested ? 'ok' : 'fail';

  return (
    <section className="admin-keys-panel" aria-label="密钥配置">
      <div className="admin-keys-head">
        <KeyRound size={18} aria-hidden="true" />
        <strong>密钥配置（服务器账户密钥库）</strong>
        <button type="button" className="secondary-button admin-keys-refresh" onClick={() => { void refreshStored(); void fetchServerStatus(); }}>
          <RefreshCw size={13} aria-hidden="true" />
          刷新状态
        </button>
      </div>

      <p className="admin-keys-note">
        密钥由你自己填入，<b>加密保存在服务器账户密钥库（AES-256-GCM，按账户隔离），浏览器不保存</b>；
        跨会话可用、可随时清除，页面只显示末 4 位掩码。「验证」发起一次最小真实调用——只有验证通过，
        发票识别 / AI 核验才会真实生效。接口地址由后端代理自动配置，无需填写。
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
            onClick={() => void runTest('tencent')}
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
            onClick={() => void runTest('deepseek')}
            disabled={dsBusy || (!dsEnabled && !serverStatus?.deepseek)}
          >
            <Zap size={13} aria-hidden="true" />
            {dsState.phase === 'testing' ? '验证中…' : '验证'}
          </button>
        </div>
        {serverStatus && (serverStatus.tencent || serverStatus.deepseek) && (
          <div className="aks-server-fallback" role="note">
            服务器全局密钥兜底：腾讯云 {serverStatus.tencent ? '已配置' : '未配置'} · DeepSeek {serverStatus.deepseek ? '已配置' : '未配置'}
            （账户未存密钥时自动使用；由管理员在服务器 .env 配置）
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

          {storedStatus?.tencent.configured && (
            <p className="aks-current">
              账户已存密钥：<code>{storedStatus.tencent.masked || '****'}</code>
            </p>
          )}
          {!storedStatus?.tencent.configured && legacyTencent && (
            <p className="aks-current" role="note">
              检测到旧版浏览器会话密钥，已预填到下方表单——点击「保存并验证」将转存到服务器密钥库。
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
                <strong>粘贴并保存</strong>
                <small>加密存入服务器账户密钥库（按账户隔离，页面只显示末 4 位掩码）</small>
              </div>
            </li>
            <li>
              <span className="aks-step-num">3</span>
              <div>
                <strong>自动真实验证</strong>
                <small>保存后立即用最小图片真实调用一次，明确结论</small>
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
              {tcState.phase === 'saving' ? '保存中…' : tcState.phase === 'testing' ? '验证中…' : '保存并验证'}
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={() => void runTest('tencent')}
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

          {storedStatus?.deepseek.configured && (
            <p className="aks-current">
              账户已存密钥：<code>{storedStatus.deepseek.masked || '****'}</code>
              {storedStatus.deepseek.model ? <> · 模型 <code>{storedStatus.deepseek.model}</code></> : null}
            </p>
          )}
          {!storedStatus?.deepseek.configured && legacyDeepSeek && (
            <p className="aks-current" role="note">
              检测到旧版浏览器会话密钥，已预填到下方表单——点击「保存并验证」将转存到服务器密钥库。
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
                <small>加密存入服务器账户密钥库（按账户隔离，页面只显示末 4 位掩码）</small>
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
              onClick={() => void enableAndVerify('deepseek')}
              disabled={dsBusy || !deepseekKey.trim()}
            >
              {dsState.phase === 'saving' ? '保存中…' : dsState.phase === 'testing' ? '验证中…' : '保存并验证'}
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={() => void runTest('deepseek')}
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
          安全说明：密钥经 AES-256-GCM 加密存储于服务器账户密钥库，按账户隔离、永不回显明文；
          浏览器不再持久化任何密钥。需要退出时点下方按钮立即清除；密钥疑似泄露时到对应控制台禁用并新建即可。
        </span>
      </div>

      <div className="aks-actions aks-actions--footer">
        <button type="button" className="secondary-button" onClick={() => void clearAll()} disabled={!tcEnabled && !dsEnabled}>
          <Eraser size={13} aria-hidden="true" />
          立即清除本账户全部已存密钥
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
