// 管理员密钥配置面板
//
// 职责：管理员在网页上配置 DeepSeek API Key 与腾讯云密钥（保存到服务器加密存储，全局生效，立即生效）
// 安全：
//   - 输入框 type=password，保存成功后立即清空，永不回显密钥值（状态接口只返回布尔/掩码）
//   - 密钥经 POST 提交到后端 /api/admin/keys/*，AES-256-GCM 加密落盘，不进 localStorage
//   - 仅第一个注册的账户（管理员）可见可操作；普通用户显示说明卡片

import { useCallback, useEffect, useState } from 'react';
import { KeyRound, Lock, RefreshCw, Save, ShieldCheck } from 'lucide-react';
import { useAuth } from '../../auth/AuthContext';
import { authHeaders } from '../../auth/authStorage';

interface KeysStatus {
  deepseek: { configured: boolean; model: string | null };
  tencent: { configured: boolean; secretIdMasked: string | null };
}

export function AdminKeysPanel() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [status, setStatus] = useState<KeysStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);

  const [deepseekKey, setDeepseekKey] = useState('');
  const [deepseekModel, setDeepseekModel] = useState('');
  const [savingDeepseek, setSavingDeepseek] = useState(false);

  const [tencentId, setTencentId] = useState('');
  const [tencentKey, setTencentKey] = useState('');
  const [savingTencent, setSavingTencent] = useState(false);

  const [hint, setHint] = useState('');
  const [hintError, setHintError] = useState(false);

  useEffect(() => {
    if (!hint) return;
    const t = setTimeout(() => setHint(''), 4000);
    return () => clearTimeout(t);
  }, [hint]);

  const showHint = (text: string, isError = false) => {
    setHintError(isError);
    setHint(text);
  };

  const refreshStatus = useCallback(async () => {
    setStatusLoading(true);
    try {
      const response = await fetch('/api/admin/keys/status', { headers: authHeaders() });
      const payload = await response.json().catch(() => ({}));
      if (response.ok && payload.ok) {
        setStatus(payload.data as KeysStatus);
        if (payload.data?.deepseek?.model && !deepseekModel) {
          setDeepseekModel(payload.data.deepseek.model);
        }
      } else if (response.status === 403) {
        showHint('当前账户不是管理员（第一个注册的账户），无法配置密钥。', true);
      }
    } catch {
      showHint('无法连接后端服务，状态读取失败。', true);
    } finally {
      setStatusLoading(false);
    }
    // deepseekModel 仅用于初始化默认值，不作为刷新依赖
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (isAdmin) void refreshStatus();
  }, [isAdmin, refreshStatus]);

  const handleSaveDeepseek = async () => {
    if (savingDeepseek || !deepseekKey.trim()) return;
    setSavingDeepseek(true);
    try {
      const response = await fetch('/api/admin/keys/deepseek', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({
          apiKey: deepseekKey.trim(),
          ...(deepseekModel.trim() ? { model: deepseekModel.trim() } : {}),
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (response.ok && payload.ok) {
        setDeepseekKey('');
        showHint(payload.message || 'DeepSeek 密钥已保存，立即生效。');
        await refreshStatus();
      } else {
        showHint(payload.message || `保存失败（HTTP ${response.status}）。`, true);
      }
    } catch {
      showHint('网络错误，保存失败。', true);
    } finally {
      setSavingDeepseek(false);
    }
  };

  const handleSaveTencent = async () => {
    if (savingTencent || !tencentId.trim() || !tencentKey.trim()) return;
    setSavingTencent(true);
    try {
      const response = await fetch('/api/admin/keys/tencent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ secretId: tencentId.trim(), secretKey: tencentKey.trim() }),
      });
      const payload = await response.json().catch(() => ({}));
      if (response.ok && payload.ok) {
        setTencentId('');
        setTencentKey('');
        showHint(payload.message || '腾讯云密钥已保存，立即生效。');
        await refreshStatus();
      } else {
        showHint(payload.message || `保存失败（HTTP ${response.status}）。`, true);
      }
    } catch {
      showHint('网络错误，保存失败。', true);
    } finally {
      setSavingTencent(false);
    }
  };

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

  return (
    <section className="admin-keys-panel" aria-label="密钥配置（管理员）">
      <div className="admin-keys-head">
        <KeyRound size={18} aria-hidden="true" />
        <strong>密钥配置（管理员）</strong>
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
        密钥保存到服务器加密存储（AES-256-GCM），保存后<b>立即生效</b>、全局可用，不会出现在前端浏览器。
        配置前系统运行在模拟模式；配置后 OCR 与 DeepSeek 自动切换为真实调用。
      </p>

      <div className="admin-keys-grid">
        <div className="admin-keys-card">
          <header>
            <strong>DeepSeek（AI 追问 / 风险初判 / 类别识别）</strong>
            <span className={`key-status-pill ${status?.deepseek.configured ? 'configured' : ''}`}>
              {status === null ? '状态未知' : status.deepseek.configured ? `已配置${status.deepseek.model ? ` · ${status.deepseek.model}` : ''}` : '未配置（模拟模式）'}
            </span>
          </header>
          <label className="field">
            <span>API Key</span>
            <input
              type="password"
              value={deepseekKey}
              onChange={(e) => setDeepseekKey(e.target.value)}
              placeholder="sk- 开头（DeepSeek 开放平台「API Keys」页获取）"
              autoComplete="off"
            />
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
          <button
            type="button"
            className="primary-button"
            onClick={() => void handleSaveDeepseek()}
            disabled={savingDeepseek || !deepseekKey.trim()}
          >
            <Save size={14} aria-hidden="true" />
            {savingDeepseek ? '保存中…' : '保存 DeepSeek 密钥'}
          </button>
        </div>

        <div className="admin-keys-card">
          <header>
            <strong>腾讯云（增值税发票 OCR 识别）</strong>
            <span className={`key-status-pill ${status?.tencent.configured ? 'configured' : ''}`}>
              {status === null
                ? '状态未知'
                : status.tencent.configured
                  ? `已配置 · ${status.tencent.secretIdMasked ?? ''}`
                  : '未配置（模拟模式）'}
            </span>
          </header>
          <label className="field">
            <span>SecretId</span>
            <input
              type="password"
              value={tencentId}
              onChange={(e) => setTencentId(e.target.value)}
              placeholder="AKID 开头（腾讯云控制台「访问管理 → API 密钥管理」）"
              autoComplete="off"
            />
          </label>
          <label className="field">
            <span>SecretKey</span>
            <input
              type="password"
              value={tencentKey}
              onChange={(e) => setTencentKey(e.target.value)}
              placeholder="32 位字母数字"
              autoComplete="off"
            />
          </label>
          <button
            type="button"
            className="primary-button"
            onClick={() => void handleSaveTencent()}
            disabled={savingTencent || !tencentId.trim() || !tencentKey.trim()}
          >
            <Save size={14} aria-hidden="true" />
            {savingTencent ? '保存中…' : '保存腾讯云密钥'}
          </button>
        </div>
      </div>

      <div className="admin-keys-footnote" role="note">
        <ShieldCheck size={14} aria-hidden="true" />
        <span>密钥仅保存在服务器加密文件中，页面上永不回显完整值；忘记是否已配置点「刷新状态」即可。</span>
      </div>

      {hint && (
        <div className={`auth-error ${hintError ? '' : 'admin-keys-hint-ok'}`} role="status">
          {hint}
        </div>
      )}
    </section>
  );
}
