// 演示样例适配器测试
// 验证 DemoCase -> DecisionDraft / WorkflowSession 的转换正确性
// 重点覆盖：
//   1. 低风险演示样例可生成可导出的 CSV
//   2. 高风险/验真失败/疑似重复演示样例保持阻断
//   3. 适配器不修改原始 demoCases
//   4. findDemoCaseAsSession 按 caseId 查找行为正确
//
// 依据：CO_20260718_本地页面验收与GateT2后端代理执行指令.md 第 2 节验收要求

import { describe, expect, it } from 'vitest';
import { demoCases } from './demoCases';
import {
  adaptDemoCaseToDecisionDraft,
  adaptDemoCaseToWorkflowSession,
  findDemoCaseAsSession,
} from './demoCaseToDecisionDraft';
import { evaluateVoucherExportBlock, buildVoucherCsvRows, checkDebitCreditBalance } from '../voucher/voucherCsvTemplate';

describe('演示样例适配器：DemoCase -> DecisionDraft', () => {
  it('餐饮低风险样例：DecisionDraft 字段完整映射', () => {
    const cateringCase = demoCases.find((c) => c.id === 'case-catering-001')!;
    const draft = adaptDemoCaseToDecisionDraft(cateringCase);

    expect(draft.accountingConclusion).toBe(cateringCase.riskDecision.accountingConclusion);
    expect(draft.vatConclusion).toBe(cateringCase.riskDecision.vatConclusion);
    expect(draft.citConclusion).toBe(cateringCase.riskDecision.citConclusion);
    expect(draft.riskLevel).toBe('低');
    expect(draft.voucherDraft.status).toBe('可生成草稿');
    expect(draft.gates).toHaveLength(4);
    expect(draft.postingAdvice).toBeDefined();
    expect(draft.postingAdvice?.primaryAccount).toContain('管理费用');
    expect(draft.businessQACompleted).toBe(true);
  });

  it('咨询服务中风险样例：manualReviewRequired 为 true', () => {
    const consultingCase = demoCases.find((c) => c.id === 'case-consulting-001')!;
    const draft = adaptDemoCaseToDecisionDraft(consultingCase);

    expect(draft.riskLevel).toBe('中');
    expect(draft.voucherDraft.status).toBe('待人工确认');
    // 中风险 -> manualReviewRequired = true
    expect(draft.postingAdvice?.manualReviewRequired).toBe(true);
  });

  it('阻断样例：高风险 + 验真失败 + 疑似重复 -> voucherDraft.status=禁止生成', () => {
    const blockedCase = demoCases.find((c) => c.id === 'case-blocked-001')!;
    const draft = adaptDemoCaseToDecisionDraft(blockedCase);

    expect(draft.riskLevel).toBe('高');
    expect(draft.voucherDraft.status).toBe('禁止生成');
    expect(draft.finalStatus).toBe('暂不能判断');
    // 高风险样例业务问答未完成
    expect(draft.businessQACompleted).toBe(false);
  });

  it('适配器不修改原始 demoCases 数据', () => {
    const cateringCase = demoCases.find((c) => c.id === 'case-catering-001')!;
    // 深拷贝原始数据用于对比
    const originalSnapshot = JSON.parse(JSON.stringify(cateringCase));

    adaptDemoCaseToDecisionDraft(cateringCase);
    adaptDemoCaseToWorkflowSession(cateringCase);

    expect(JSON.parse(JSON.stringify(cateringCase))).toEqual(originalSnapshot);
  });
});

describe('演示样例适配器：DemoCase -> WorkflowSession', () => {
  it('caseId 使用 demoCase.id，便于路由匹配', () => {
    const cateringCase = demoCases.find((c) => c.id === 'case-catering-001')!;
    const session = adaptDemoCaseToWorkflowSession(cateringCase);

    expect(session.caseId).toBe('case-catering-001');
    expect(session.decisionDraft).toBeDefined();
    expect(session.invoice.invoiceNumber).toBe(cateringCase.invoice.invoiceNumber);
  });

  it('currentStep 为"生成建议"，completedSteps 包含全部七步', () => {
    const session = adaptDemoCaseToWorkflowSession(demoCases[0]);

    expect(session.currentStep).toBe('生成建议');
    expect(session.completedSteps).toHaveLength(7);
    expect(session.completedSteps).toContain('生成建议');
  });
});

describe('演示样例适配器：findDemoCaseAsSession', () => {
  it('case-catering-001 可被查找到并转换为 session', () => {
    const session = findDemoCaseAsSession('case-catering-001');
    expect(session).not.toBeNull();
    expect(session!.caseId).toBe('case-catering-001');
    expect(session!.decisionDraft).toBeDefined();
  });

  it('不存在的 caseId 返回 null', () => {
    const session = findDemoCaseAsSession('case-nonexistent-999');
    expect(session).toBeNull();
  });
});

describe('演示样例适配器：CSV 导出阻断规则（验收硬约束）', () => {
  it('case-catering-001（低风险）：可导出，借贷平衡', () => {
    const cateringCase = demoCases.find((c) => c.id === 'case-catering-001')!;
    const session = adaptDemoCaseToWorkflowSession(cateringCase);
    const block = evaluateVoucherExportBlock(session.invoice, session.decisionDraft!);

    expect(block.blocked).toBe(false);

    const rows = buildVoucherCsvRows(session.invoice, session.decisionDraft!);
    expect(rows.length).toBeGreaterThan(0);
    const balance = checkDebitCreditBalance(rows);
    expect(balance.balanced).toBe(true);
  });

  it('case-lodging-001（中低风险 专票）：可导出，借贷平衡', () => {
    const lodgingCase = demoCases.find((c) => c.id === 'case-lodging-001')!;
    const session = adaptDemoCaseToWorkflowSession(lodgingCase);
    const block = evaluateVoucherExportBlock(session.invoice, session.decisionDraft!);

    expect(block.blocked).toBe(false);

    const rows = buildVoucherCsvRows(session.invoice, session.decisionDraft!);
    expect(rows.length).toBe(3); // 专票：3 行（费用借+进项税借+贷方）
    const balance = checkDebitCreditBalance(rows);
    expect(balance.balanced).toBe(true);
  });

  it('case-consulting-001（中风险 待人工确认）：可导出但状态为待确认', () => {
    const consultingCase = demoCases.find((c) => c.id === 'case-consulting-001')!;
    const session = adaptDemoCaseToWorkflowSession(consultingCase);
    const block = evaluateVoucherExportBlock(session.invoice, session.decisionDraft!);

    // 中风险不阻断，但 voucherDraft.status='待人工确认'
    expect(block.blocked).toBe(false);
    expect(session.decisionDraft!.voucherDraft.status).toBe('待人工确认');
  });

  it('case-blocked-001（高风险+验真失败+疑似重复）：必须阻断，不得导出可导入凭证', () => {
    const blockedCase = demoCases.find((c) => c.id === 'case-blocked-001')!;
    const session = adaptDemoCaseToWorkflowSession(blockedCase);
    const block = evaluateVoucherExportBlock(session.invoice, session.decisionDraft!);

    expect(block.blocked).toBe(true);
    expect(session.decisionDraft!.voucherDraft.status).toBe('禁止生成');

    // 阻断时 buildVoucherCsvRows 返回空数组
    const rows = buildVoucherCsvRows(session.invoice, session.decisionDraft!);
    expect(rows).toEqual([]);
  });
});
