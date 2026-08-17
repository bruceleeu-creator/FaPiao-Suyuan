import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkflowSession } from '../domain/types';
import { STORAGE_KEYS } from '../storage/localStore';

// 内存版 localStorage mock：在 vitest node 环境中没有 window.localStorage
class MemoryStorage {
  private store = new Map<string, string>();
  getItem(key: string) {
    return this.store.has(key) ? this.store.get(key)! : null;
  }
  setItem(key: string, value: string) {
    this.store.set(key, value);
  }
  removeItem(key: string) {
    this.store.delete(key);
  }
  clear() {
    this.store.clear();
  }
}

function buildSession(caseId: string, overrides: Partial<WorkflowSession> = {}): WorkflowSession {
  return {
    caseId,
    currentStep: '票面确认',
    completedSteps: ['发票输入'],
    invoice: {
      id: `INV-${caseId}`,
      invoiceType: '增值税普通发票',
      invoiceCode: '044002600111',
      invoiceNumber: '10012001',
      issueDate: '2026-07-12',
      seller: '杭州湖滨餐饮管理有限公司',
      buyer: '浙江示例科技有限公司',
      itemName: '餐饮服务',
      amount: 1860,
      taxAmount: 52.64,
      taxRate: '3%',
      verificationStatus: '验真通过',
      duplicateStatus: '未重复',
      redLetterStatus: '正常',
      recognitionConfidence: 0.94,
      category: '餐饮',
      anomalies: [],
      sourceFile: 'mock://ocr/test.pdf',
      status: '待确认票面',
    },
    businessEvent: {
      id: `BE-${caseId}`,
      invoiceId: `INV-${caseId}`,
      scenario: '客户业务招待',
      initiator: '销售部-陈立',
      handler: '销售部-陈立',
      claimant: '销售部-陈立',
      participants: ['陈立'],
      externalParty: '客户',
      occurredAt: '2026-07-12',
      location: '杭州',
      purpose: '续约谈判',
      businessContent: '续约',
      department: '销售部',
      project: 'Q3',
      contract: '无',
      paymentSubject: '公司',
      paymentMethod: '报销',
      beneficiary: '销售团队',
      companyBurdenReason: '客户维护',
      conflicts: [],
      confidence: 0.82,
    },
    evidenceChain: {
      id: `EC-${caseId}`,
      invoiceId: `INV-${caseId}`,
      businessEventId: `BE-${caseId}`,
      requiredEvidence: ['发票', '业务招待审批', '客户拜访记录', '付款记录'],
      uploadedEvidence: ['发票', '业务招待审批', '客户拜访记录', '付款记录'],
      matchedEvidence: ['业务招待审批', '客户拜访记录', '付款记录'],
      missingEvidence: [],
      conflictingEvidence: [],
      completenessScore: 98,
      status: '完整',
    },
    aiInterventions: [],
    actionLogs: [
      {
        id: 'LOG-1',
        operator: '当前用户',
        action: '开始识别',
        fromStep: '发票输入',
        toStep: '票面确认',
        timestamp: new Date().toISOString(),
      },
    ],
    finalStatus: '待确认票面',
    ...overrides,
  };
}

describe('多发票 case store', () => {
  let memoryStorage: MemoryStorage;

  beforeEach(() => {
    memoryStorage = new MemoryStorage();
    globalThis.window = globalThis.window || {};
    // @ts-expect-error 注入测试用 localStorage（MemoryStorage 不完全匹配 Storage 类型）
    globalThis.window.localStorage = memoryStorage;
  });

  afterEach(() => {
    memoryStorage.clear();
  });

  it('generateCaseId 生成 CASE- 前缀且唯一', async () => {
    const { generateCaseId } = await import('./caseStore');
    const a = generateCaseId();
    const b = generateCaseId();
    expect(a.startsWith('CASE-')).toBe(true);
    expect(b.startsWith('CASE-')).toBe(true);
    expect(a).not.toBe(b);
  });

  it('addCase 写入 localStorage 并设为 active', async () => {
    const { addCase, loadAllCases, loadActiveCaseId } = await import('./caseStore');
    const session = buildSession('CASE-001');
    addCase(session);
    expect(loadAllCases().length).toBe(1);
    expect(loadAllCases()[0].caseId).toBe('CASE-001');
    expect(loadActiveCaseId()).toBe('CASE-001');
  });

  it('多发票 case 保存与读取：可同时保存多个 case', async () => {
    const { addCase, loadAllCases } = await import('./caseStore');
    addCase(buildSession('CASE-A'));
    addCase(buildSession('CASE-B'));
    addCase(buildSession('CASE-C'));
    const all = loadAllCases();
    expect(all.length).toBe(3);
    expect(all.map((c) => c.caseId).sort()).toEqual(['CASE-A', 'CASE-B', 'CASE-C']);
  });

  it('刷新后 localStorage 数据可恢复', async () => {
    const { addCase, loadAllCases, loadActiveCaseId } = await import('./caseStore');
    addCase(buildSession('CASE-PERSIST'));
    // 模拟"刷新"：重新 import 模块,重新读取 localStorage
    vi.resetModules();
    const fresh = await import('./caseStore');
    const all = fresh.loadAllCases();
    expect(all.length).toBe(1);
    expect(all[0].caseId).toBe('CASE-PERSIST');
    expect(fresh.loadActiveCaseId()).toBe('CASE-PERSIST');
  });

  it('findCase 按 caseId 查找', async () => {
    const { addCase, findCase } = await import('./caseStore');
    addCase(buildSession('CASE-FIND'));
    const found = findCase('CASE-FIND');
    expect(found).not.toBeNull();
    expect(found!.caseId).toBe('CASE-FIND');
    expect(findCase('CASE-NOT-EXIST')).toBeNull();
  });

  it('updateCase 保留 caseId 并更新字段', async () => {
    const { addCase, updateCase, findCase } = await import('./caseStore');
    addCase(buildSession('CASE-UPD'));
    const prev = findCase('CASE-UPD')!;
    const next: WorkflowSession = { ...prev, finalStatus: '待还原业务' };
    const ok = updateCase(next);
    expect(ok).toBe(true);
    expect(findCase('CASE-UPD')!.finalStatus).toBe('待还原业务');
  });

  it('updateCase 不存在的 caseId 返回 false', async () => {
    const { updateCase } = await import('./caseStore');
    const ok = updateCase(buildSession('CASE-NOT-EXIST'));
    expect(ok).toBe(false);
  });

  it('removeCase 删除单个 case', async () => {
    const { addCase, removeCase, loadAllCases, loadActiveCaseId } = await import('./caseStore');
    addCase(buildSession('CASE-A'));
    addCase(buildSession('CASE-B'));
    expect(loadAllCases().length).toBe(2);
    // 删除非 active 的 CASE-A，active 应保持 CASE-B
    removeCase('CASE-A');
    expect(loadAllCases().length).toBe(1);
    expect(loadAllCases()[0].caseId).toBe('CASE-B');
    expect(loadActiveCaseId()).toBe('CASE-B');
    // 删除 active 后,active 应被清空
    removeCase('CASE-B');
    expect(loadAllCases().length).toBe(0);
    expect(loadActiveCaseId()).toBeNull();
  });

  it('saveActiveCaseId 单独保存 active', async () => {
    const { saveActiveCaseId, loadActiveCaseId } = await import('./caseStore');
    saveActiveCaseId('CASE-X');
    expect(loadActiveCaseId()).toBe('CASE-X');
    saveActiveCaseId(null);
    expect(loadActiveCaseId()).toBeNull();
  });

  it('STORAGE_KEYS 命名空间正确', () => {
    expect(STORAGE_KEYS.cases).toBe('invoice_evidence_cases');
    expect(STORAGE_KEYS.activeCaseId).toBe('invoice_evidence_active_case_id');
    expect(STORAGE_KEYS.integrationConfig).toBe('invoice_evidence_integration_config');
  });
});
describe('异常 case 检测', () => {
  let memoryStorage: MemoryStorage;

  beforeEach(() => {
    memoryStorage = new MemoryStorage();
    globalThis.window = globalThis.window || {};
    // @ts-expect-error 注入测试用 localStorage（MemoryStorage 不完全匹配 Storage 类型）
    globalThis.window.localStorage = memoryStorage;
  });

  afterEach(() => {
    memoryStorage.clear();
  });

  it('验真失败的 case 进入异常队列', async () => {
    const { addCase, listExceptionCases } = await import('./caseStore');
    addCase(buildSession('CASE-VERIFY-FAIL', {
      invoice: {
        ...buildSession('CASE-VERIFY-FAIL').invoice,
        verificationStatus: '验真失败',
      },
      finalStatus: '暂不能判断',
    }));
    const exceptions = listExceptionCases();
    expect(exceptions.length).toBe(1);
    expect(exceptions[0].exceptions).toContain('验真失败');
    expect(exceptions[0].exceptions).toContain('暂不能判断');
  });

  it('疑似重复 case 进入异常队列', async () => {
    const { addCase, listExceptionCases } = await import('./caseStore');
    const base = buildSession('CASE-DUP');
    addCase(buildSession('CASE-DUP', {
      invoice: { ...base.invoice, duplicateStatus: '疑似重复' },
    }));
    const exceptions = listExceptionCases();
    expect(exceptions.length).toBe(1);
    expect(exceptions[0].exceptions).toContain('疑似重复');
  });

  it('红冲/作废 case 进入异常队列', async () => {
    const { addCase, listExceptionCases } = await import('./caseStore');
    const base = buildSession('CASE-RED');
    addCase(buildSession('CASE-RED', {
      invoice: { ...base.invoice, redLetterStatus: '已红冲' },
    }));
    const exceptions = listExceptionCases();
    expect(exceptions[0].exceptions).toContain('红冲/作废');
  });

  it('证据缺失 case 进入异常队列', async () => {
    const { addCase, listExceptionCases } = await import('./caseStore');
    const base = buildSession('CASE-MISS');
    addCase(buildSession('CASE-MISS', {
      evidenceChain: {
        ...base.evidenceChain,
        missingEvidence: ['付款记录'],
        status: '缺失',
      },
    }));
    const exceptions = listExceptionCases();
    expect(exceptions[0].exceptions).toContain('证据缺失');
  });

  it('低置信度 case 进入异常队列', async () => {
    const { addCase, listExceptionCases } = await import('./caseStore');
    const base = buildSession('CASE-LOW');
    addCase(buildSession('CASE-LOW', {
      invoice: { ...base.invoice, recognitionConfidence: 0.5 },
    }));
    const exceptions = listExceptionCases();
    expect(exceptions[0].exceptions).toContain('低置信度');
  });

  it('业务事实不足 case 进入异常队列', async () => {
    const { addCase, listExceptionCases } = await import('./caseStore');
    const base = buildSession('CASE-BIZ-LOW');
    addCase(buildSession('CASE-BIZ-LOW', {
      businessEvent: { ...base.businessEvent, confidence: 0.4 },
    }));
    const exceptions = listExceptionCases();
    expect(exceptions[0].exceptions).toContain('业务事实不足');
  });

  it('高风险 case（decisionDraft.riskLevel=高）进入异常队列', async () => {
    const { addCase, listExceptionCases } = await import('./caseStore');
    const base = buildSession('CASE-HIGH-RISK');
    addCase(buildSession('CASE-HIGH-RISK', {
      decisionDraft: {
        version: 'test',
        gates: [],
        accountingConclusion: '',
        vatConclusion: '',
        citConclusion: '',
        otherRiskNotes: [],
        evidenceConclusion: '',
        riskLevel: '高',
        confidence: 0.3,
        remediation: [],
        approvalRequirement: '',
        voucherDraft: { status: '禁止生成', summary: '' },
        humanReviewRecords: [],
        finalStatus: '暂不能判断',
      },
    }));
    const exceptions = listExceptionCases();
    expect(exceptions[0].exceptions).toContain('高风险');
  });

  it('正常 case 不进入异常队列', async () => {
    const { addCase, listExceptionCases } = await import('./caseStore');
    addCase(buildSession('CASE-OK')); // 默认完整证据、验真通过、置信度 0.82
    const exceptions = listExceptionCases();
    expect(exceptions.length).toBe(0);
  });
});

// 防串单测试：验证多 case 场景下，对某个 case 的操作不会写入其他 case
// 这是对 InvoiceWorkflowPage useEffect 修复的底层保证：
// WorkflowContext.dispatch 内部调用 updateCase(nextSession)，updateCase 按 caseId 精确更新
// 因此即使页面层误传，也不会跨 case 写入
describe('防串单：多 case 场景下操作不得写入错误 case', () => {
  let memoryStorage: MemoryStorage;

  beforeEach(() => {
    memoryStorage = new MemoryStorage();
    globalThis.window = globalThis.window || {};
    // @ts-expect-error 注入测试用 localStorage（MemoryStorage 不完全匹配 Storage 类型）
    globalThis.window.localStorage = memoryStorage;
  });

  afterEach(() => {
    memoryStorage.clear();
  });

  it('activeCaseId=B 时，更新 CASE-A 不得修改 CASE-B', async () => {
    const { addCase, updateCase, findCase, loadActiveCaseId } = await import('./caseStore');
    addCase(buildSession('CASE-A', { finalStatus: '待确认票面' }));
    addCase(buildSession('CASE-B', { finalStatus: '待还原业务' }));
    // addCase 最后会把 active 设为 CASE-B
    expect(loadActiveCaseId()).toBe('CASE-B');

    // 模拟 dispatch 写入 CASE-A（即使 active 是 B）
    const caseA = findCase('CASE-A')!;
    updateCase({ ...caseA, finalStatus: '待回答问题' });

    // CASE-A 被更新
    expect(findCase('CASE-A')!.finalStatus).toBe('待回答问题');
    // CASE-B 保持不变，没有串单
    expect(findCase('CASE-B')!.finalStatus).toBe('待还原业务');
    // activeCaseId 仍然是 CASE-B
    expect(loadActiveCaseId()).toBe('CASE-B');
  });

  it('URL caseId 与 activeCaseId 不一致时，updateCase 不影响 active case', async () => {
    // 场景：URL 是 /invoices/CASE-URL/workflow，但 activeCaseId 是 CASE-ACTIVE
    // 修复前：页面显示 CASE-URL，dispatch 写入 CASE-ACTIVE -> 串单
    // 修复后：useEffect 切换 activeCaseId 到 CASE-URL，dispatch 写入 CASE-URL
    // 本测试验证底层约束：updateCase 按 caseId 精确更新，不会误伤其他 case
    const { addCase, updateCase, findCase, loadAllCases } = await import('./caseStore');
    addCase(buildSession('CASE-URL', {
      finalStatus: '待确认票面',
      invoice: { ...buildSession('CASE-URL').invoice, invoiceNumber: 'URL-001' },
    }));
    addCase(buildSession('CASE-ACTIVE', {
      finalStatus: '待还原业务',
      invoice: { ...buildSession('CASE-ACTIVE').invoice, invoiceNumber: 'ACTIVE-001' },
    }));
    expect(loadAllCases().length).toBe(2);

    // 即使对 CASE-URL 做更新，CASE-ACTIVE 也不受影响
    const urlCase = findCase('CASE-URL')!;
    updateCase({ ...urlCase, finalStatus: '已完成' });

    expect(findCase('CASE-ACTIVE')!.finalStatus).toBe('待还原业务');
    expect(findCase('CASE-ACTIVE')!.invoice.invoiceNumber).toBe('ACTIVE-001');
    expect(findCase('CASE-URL')!.finalStatus).toBe('已完成');
    expect(findCase('CASE-URL')!.invoice.invoiceNumber).toBe('URL-001');
  });

  it('多 case 并存时，逐个更新互不干扰', async () => {
    const { addCase, updateCase, findCase, loadAllCases } = await import('./caseStore');
    addCase(buildSession('CASE-1', { finalStatus: '待确认票面' }));
    addCase(buildSession('CASE-2', { finalStatus: '待还原业务' }));
    addCase(buildSession('CASE-3', { finalStatus: '待回答问题' }));
    expect(loadAllCases().length).toBe(3);

    // 逐个更新，验证互不干扰
    updateCase({ ...findCase('CASE-1')!, finalStatus: '业务已还原' });
    updateCase({ ...findCase('CASE-3')!, finalStatus: '待补充证据' });

    expect(findCase('CASE-1')!.finalStatus).toBe('业务已还原');
    expect(findCase('CASE-2')!.finalStatus).toBe('待还原业务'); // 未被修改
    expect(findCase('CASE-3')!.finalStatus).toBe('待补充证据');
  });
});
