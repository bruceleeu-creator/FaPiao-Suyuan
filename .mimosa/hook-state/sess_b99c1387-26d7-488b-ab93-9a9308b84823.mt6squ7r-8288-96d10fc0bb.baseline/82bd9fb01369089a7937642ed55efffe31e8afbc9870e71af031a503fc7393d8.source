import { describe, expect, it } from 'vitest';
import { mockGenerateQuestions } from './mockQuestionService';

describe('三类做深的追问模板差异', () => {
  it('餐饮问招待对象、参与人、业务目的、审批记录', () => {
    const qs = mockGenerateQuestions('餐饮');
    expect(qs.some((q) => q.includes('招待') || q.includes('对象'))).toBe(true);
    expect(qs.some((q) => q.includes('参与人'))).toBe(true);
    expect(qs.some((q) => q.includes('业务目的'))).toBe(true);
    expect(qs.some((q) => q.includes('审批'))).toBe(true);
  });

  it('住宿问出差申请、行程、住宿人员、项目归属', () => {
    const qs = mockGenerateQuestions('住宿');
    expect(qs.some((q) => q.includes('出差申请'))).toBe(true);
    expect(qs.some((q) => q.includes('行程'))).toBe(true);
    expect(qs.some((q) => q.includes('住宿人员'))).toBe(true);
    expect(qs.some((q) => q.includes('项目') || q.includes('部门'))).toBe(true);
  });

  it('咨询服务问合同、服务内容、成果物、验收单、付款记录', () => {
    const qs = mockGenerateQuestions('咨询服务');
    expect(qs.some((q) => q.includes('合同'))).toBe(true);
    expect(qs.some((q) => q.includes('服务内容'))).toBe(true);
    expect(qs.some((q) => q.includes('成果物'))).toBe(true);
    expect(qs.some((q) => q.includes('验收单'))).toBe(true);
    expect(qs.some((q) => q.includes('付款记录'))).toBe(true);
  });

  it('三类追问模板互不相同', () => {
    const catering = mockGenerateQuestions('餐饮').join('|');
    const lodging = mockGenerateQuestions('住宿').join('|');
    const consulting = mockGenerateQuestions('咨询服务').join('|');
    expect(catering).not.toBe(lodging);
    expect(catering).not.toBe(consulting);
    expect(lodging).not.toBe(consulting);
  });
});
