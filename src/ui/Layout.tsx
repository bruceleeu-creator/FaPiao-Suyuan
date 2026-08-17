import { useEffect, useState } from 'react';
import { AlertTriangle, BarChart3, FilePlus2, Home, ListChecks, Plug, Settings2, Smartphone } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { getIntegrationModeSummaries, subscribeIntegrationChanges } from '../integrations/integrationConfigStore';

// 发票列表已并入录入页左侧「已录入发票」面板，侧边栏不再单独展示
const navItems = [
  { to: '/', label: '工作台首页', icon: Home },
  { to: '/intake', label: '录入发票', icon: FilePlus2 },
  { to: '/invoices', label: '三阶段处理', icon: ListChecks },
  { to: '/exceptions', label: '异常工作台', icon: AlertTriangle },
  { to: '/risks', label: '风险驾驶舱', icon: BarChart3 },
];

const boundaryItems = [
  { to: '/settings/integrations', label: '接口配置', icon: Plug },
  { to: '/settings/thresholds', label: '规则阈值', icon: Settings2 },
  { to: '/mobile', label: '手机端入口', icon: Smartphone },
];

export function Layout({ children }: { children: React.ReactNode }) {
  // 修复 Important：订阅 integrationConfigStore 变更，保存配置后侧边栏立即刷新最新模式
  // 旧实现仅在组件渲染时读取一次 localStorage，保存后不重新渲染 -> stale
  const [refreshTick, setRefreshTick] = useState(0);
  useEffect(() => {
    return subscribeIntegrationChanges(() => setRefreshTick((t) => t + 1));
  }, []);
  // refreshTick 变化时重新读取最新模式
  const summaries = getIntegrationModeSummaries();
  void refreshTick; // 标记依赖，确保 useMemo/渲染依赖触发

  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="主导航">
        <div className="brand">
          <span className="brand-mark">证</span>
          <div>
            <strong>发票溯源证据链系统</strong>
            <small>一期电脑端可操作闭环</small>
          </div>
        </div>
        <nav className="nav-list">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink key={item.label} to={item.to} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                <Icon size={18} aria-hidden="true" />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>
        <div className="mock-panel" aria-label="集成通道">
          <span className="panel-kicker">集成通道</span>
          <div className="boundary-link-list" aria-label="集成通道入口">
            {boundaryItems.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.label}
                  to={item.to}
                  className={({ isActive }) => `boundary-link ${isActive ? 'active' : ''}`}
                >
                  <Icon size={15} aria-hidden="true" />
                  <span>{item.label}</span>
                </NavLink>
              );
            })}
          </div>
          {summaries.map((item) => (
            <div className="mock-row" key={item.key}>
              <span>{item.name}</span>
              <b className={item.mode === '正式' ? 'mode-official' : 'mode-mock'}>
                {item.mode}{item.enabled ? '' : '/未启用'}
              </b>
            </div>
          ))}
        </div>
      </aside>
      <main className="main-content">{children}</main>
    </div>
  );
}
