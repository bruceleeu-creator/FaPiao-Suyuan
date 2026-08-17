import { Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './ui/Layout';
import { WorkflowProvider } from './workflow/WorkflowContext';
import { DashboardPage } from './ui/pages/DashboardPage';
import { DecisionResultPage } from './ui/pages/DecisionResultPage';
import { ExceptionsPage } from './ui/pages/ExceptionsPage';
import { IntegrationSettingsPage } from './ui/pages/IntegrationSettingsPage';
import { InvoiceDetailPage } from './ui/pages/InvoiceDetailPage';
import { InvoiceIntakePage } from './ui/pages/InvoiceIntakePage';
import { InvoiceListPage } from './ui/pages/InvoiceListPage';
import { InvoiceWorkflowPage } from './ui/pages/InvoiceWorkflowPage';
import { MobileEntryPage } from './ui/pages/MobileEntryPage';
import { RiskDashboardPage } from './ui/pages/RiskDashboardPage';
import { ThresholdSettingsPage } from './ui/pages/ThresholdSettingsPage';

export default function App() {
  return (
    <WorkflowProvider>
      <Layout>
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/intake" element={<InvoiceIntakePage />} />
          <Route path="/invoices" element={<InvoiceListPage />} />
          {/* 兼容旧路由 /invoices/current/...：自动转发到 active caseId */}
          <Route path="/invoices/current/workflow" element={<InvoiceWorkflowPage />} />
          <Route path="/invoices/current/decision" element={<DecisionResultPage />} />
          {/* 多发票会话：基于真实 caseId 的流程与结果页 */}
          <Route path="/invoices/:caseId/workflow" element={<InvoiceWorkflowPage />} />
          <Route path="/invoices/:caseId/decision" element={<DecisionResultPage />} />
          <Route path="/invoices/:caseId" element={<InvoiceDetailPage />} />
          <Route path="/exceptions" element={<ExceptionsPage />} />
          <Route path="/risks" element={<RiskDashboardPage />} />
          <Route path="/settings/integrations" element={<IntegrationSettingsPage />} />
          <Route path="/settings/thresholds" element={<ThresholdSettingsPage />} />
          <Route path="/mobile" element={<MobileEntryPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Layout>
    </WorkflowProvider>
  );
}
