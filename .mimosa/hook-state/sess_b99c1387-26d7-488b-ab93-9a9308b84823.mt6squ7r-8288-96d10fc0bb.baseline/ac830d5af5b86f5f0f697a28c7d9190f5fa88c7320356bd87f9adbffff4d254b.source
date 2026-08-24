import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import type { Invoice, WorkflowSession } from '../domain/types';
import { createWorkflowSession, workflowReducer, type WorkflowAction } from './workflowReducer';
import { canTransition, formatTransitionLog } from './statusMachine';
import {
  addCase,
  findCase,
  generateCaseId,
  loadActiveCaseId,
  loadAllCases,
  saveActiveCaseId,
  updateCase,
} from '../cases/caseStore';

interface WorkflowContextValue {
  // 当前激活的 case session（active caseId 对应的 session）
  session: WorkflowSession | null;
  activeCaseId: string | null;
  // 所有本地 case 列表
  cases: WorkflowSession[];
  // 启动新 case：生成 caseId、持久化、设为 active
  startSession: (invoice: Invoice, caseId?: string) => string;
  // 切换 active case（用于从列表继续处理某张发票）
  loadCase: (caseId: string) => void;
  // 单次查询某个 case，不切换 active
  getCase: (caseId: string) => WorkflowSession | null;
  // 触发 reducer：自动持久化对应 case
  dispatch: (action: WorkflowAction) => void;
  // 兼容旧路由 /invoices/current/...：当 caseId 为 'current' 或不存在时使用 active
  resolveCaseId: (caseId?: string) => string | null;
  // 清空当前 active（不删除数据）
  clearActive: () => void;
}

const WorkflowContext = createContext<WorkflowContextValue | null>(null);

export function WorkflowProvider({ children }: { children: ReactNode }) {
  const [cases, setCases] = useState<WorkflowSession[]>(() => loadAllCases());
  const [activeCaseId, setActiveCaseId] = useState<string | null>(() => loadActiveCaseId());

  const activeSession = useMemo(() => {
    if (!activeCaseId) return null;
    return cases.find((c) => c.caseId === activeCaseId) ?? null;
  }, [cases, activeCaseId]);

  const startSession = useCallback((invoice: Invoice, caseId?: string): string => {
    const id = caseId ?? generateCaseId();
    // caseId 写入 session.caseId，便于日志和路由追溯
    const baseSession = createWorkflowSession(invoice);
    const session: WorkflowSession = { ...baseSession, caseId: id };
    addCase(session);
    setCases(loadAllCases());
    setActiveCaseId(id);
    saveActiveCaseId(id);
    return id;
  }, []);

  const loadCase = useCallback((caseId: string) => {
    const target = findCase(caseId);
    if (!target) return;
    setActiveCaseId(caseId);
    saveActiveCaseId(caseId);
  }, []);

  const getCase = useCallback(
    (caseId: string): WorkflowSession | null => {
      return cases.find((c) => c.caseId === caseId) ?? findCase(caseId);
    },
    [cases],
  );

  const dispatch = useCallback((action: WorkflowAction) => {
    setCases((prevCases) => {
      const targetCaseId = 'targetCaseId' in action && action.targetCaseId ? action.targetCaseId : activeCaseId;
      if (!targetCaseId) return prevCases;
      const idx = prevCases.findIndex((c) => c.caseId === targetCaseId);
      if (idx === -1) return prevCases;
      const prevSession = prevCases[idx];
      const nextSession = workflowReducer(prevSession, action);

      // 16 状态机校验：finalStatus 非法流转时拒绝写入，并追加一条拒绝日志
      const prevStatus = prevSession.finalStatus;
      const nextStatus = nextSession.finalStatus;
      if (prevStatus !== nextStatus && !canTransition(prevStatus, nextStatus)) {
        const rejectLog = {
          id: `LOG-REJECT-${Date.now()}`,
          operator: '当前用户',
          action: '状态流转被拒绝',
          fromStep: prevSession.currentStep,
          toStep: prevSession.currentStep,
          timestamp: new Date().toISOString(),
          note: `非法状态流转 ${prevStatus} -> ${nextStatus}，已拒绝并保留原状态。`,
        };
        const rejected: WorkflowSession = {
          ...prevSession,
          actionLogs: [...prevSession.actionLogs, rejectLog],
        };
        const newArr = [...prevCases];
        newArr[idx] = rejected;
        updateCase(rejected);
        return newArr;
      }

      // 合法流转：追加一条状态流转日志（仅当 finalStatus 变化且 reducer 自身未记录时）
      // reducer 已经在多数分支写了日志，这里仅补一条状态机视角的流转记录
      const needsTransitionLog = prevStatus !== nextStatus;
      const finalSession: WorkflowSession = needsTransitionLog
        ? {
            ...nextSession,
            actionLogs: [
              ...nextSession.actionLogs,
              {
                id: `LOG-TRANS-${Date.now()}`,
                operator: '当前用户',
                action: '状态机流转',
                fromStep: nextSession.currentStep,
                toStep: nextSession.currentStep,
                timestamp: new Date().toISOString(),
                note: formatTransitionLog(prevStatus, nextStatus),
              },
            ],
          }
        : nextSession;

      const newArr = [...prevCases];
      newArr[idx] = finalSession;
      updateCase(finalSession);
      return newArr;
    });
  }, [activeCaseId]);

  const resolveCaseId = useCallback(
    (caseId?: string): string | null => {
      if (!caseId || caseId === 'current') return activeCaseId;
      return caseId;
    },
    [activeCaseId],
  );

  const clearActive = useCallback(() => {
    setActiveCaseId(null);
    saveActiveCaseId(null);
  }, []);

  const value: WorkflowContextValue = {
    session: activeSession,
    activeCaseId,
    cases,
    startSession,
    loadCase,
    getCase,
    dispatch,
    resolveCaseId,
    clearActive,
  };

  return <WorkflowContext.Provider value={value}>{children}</WorkflowContext.Provider>;
}

export function useWorkflow() {
  const ctx = useContext(WorkflowContext);
  if (!ctx) throw new Error('useWorkflow 必须在 WorkflowProvider 内使用');
  return ctx;
}
