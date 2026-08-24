// 登录/注册页：账户系统唯一入口
// - 未登录访问任何页面都会被重定向到这里
// - 注册成功自动登录进入系统
// - 每个账户的数据完全隔离（localStore 按账户命名空间存储）

import { useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { KeyRound, LogIn, ShieldCheck, UserPlus } from 'lucide-react';
import { useAuth } from '../../auth/AuthContext';

type AuthMode = 'login' | 'register';

export function LoginPage() {
  const { user, login, register } = useAuth();
  const [mode, setMode] = useState<AuthMode>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // 已登录（含刚注册成功）→ 进入系统
  if (user) {
    return <Navigate to="/" replace />;
  }

  const switchMode = (next: AuthMode) => {
    setMode(next);
    setError('');
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (submitting) return;
    setError('');

    if (mode === 'register' && password !== confirmPassword) {
      setError('两次输入的密码不一致。');
      return;
    }

    setSubmitting(true);
    try {
      if (mode === 'login') {
        await login(username.trim(), password);
      } else {
        await register(username.trim(), password);
      }
      // 成功后 user 状态更新，组件重渲染并跳转首页
    } catch (err) {
      setError(err instanceof Error ? err.message : '操作失败，请重试。');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="auth-brand">
          <span className="brand-mark">证</span>
          <div>
            <strong>发票溯源证据链系统</strong>
            <small>账户登录 · 数据按账户隔离</small>
          </div>
        </div>

        <div className="auth-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'login'}
            className={`auth-tab ${mode === 'login' ? 'active' : ''}`}
            onClick={() => switchMode('login')}
          >
            <LogIn size={15} aria-hidden="true" />
            <span>登录</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'register'}
            className={`auth-tab ${mode === 'register' ? 'active' : ''}`}
            onClick={() => switchMode('register')}
          >
            <UserPlus size={15} aria-hidden="true" />
            <span>注册新账户</span>
          </button>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          <label className="field">
            <span>用户名</span>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="2-24 位中文、字母、数字、下划线或连字符"
              autoComplete="username"
              required
              autoFocus
            />
          </label>

          <label className="field">
            <span>密码</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="6-64 位字符"
              required
            />
          </label>

          {mode === 'register' && (
            <label className="field">
              <span>确认密码</span>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="再输入一次密码"
                required
              />
            </label>
          )}

          {error && (
            <div className="auth-error" role="alert">
              {error}
            </div>
          )}

          <button type="submit" className="primary-button auth-submit" disabled={submitting}>
            <KeyRound size={15} aria-hidden="true" />
            <span>{submitting ? '处理中…' : mode === 'login' ? '登录' : '注册并进入系统'}</span>
          </button>
        </form>

        <div className="auth-footnote">
          <ShieldCheck size={14} aria-hidden="true" />
          <span>密码经 scrypt 加密存储；每个账户的发票与凭证数据相互独立。</span>
        </div>
      </div>
    </div>
  );
}
