import { describe, expect, it } from 'vitest';
import {
  ALL_STATUSES,
  canTransition,
  formatTransitionLog,
  isTerminalStatus,
  nextAllowedStatuses,
  transitionStatus,
} from './statusMachine';
import type { WorkflowStatus } from '../domain/types';

describe('16 状态机：状态集合', () => {
  it('ALL_STATUSES 长度等于 16', () => {
    expect(ALL_STATUSES.length).toBe(16);
  });

  it('包含全部 16 个状态名', () => {
    const expected: WorkflowStatus[] = [
      '待识别', '识别中', '待确认票面', '待还原业务',
      '待回答问题', '待补充证据', '业务已还原', '待风险判断',
      '待财务复核', '待负责人审批', '待生成凭证', '凭证草稿已生成',
      '已完成', '已退回', '暂不能判断', '已作废或已红冲',
    ];
    expected.forEach((s) => expect(ALL_STATUSES).toContain(s));
  });
});

describe('状态机：合法流转', () => {
  it('待识别 -> 识别中 合法', () => {
    expect(canTransition('待识别', '识别中')).toBe(true);
  });

  it('识别中 -> 待确认票面 合法', () => {
    expect(canTransition('识别中', '待确认票面')).toBe(true);
  });

  it('待确认票面 -> 待还原业务 合法', () => {
    expect(canTransition('待确认票面', '待还原业务')).toBe(true);
  });

  it('待还原业务 -> 待回答问题 合法', () => {
    expect(canTransition('待还原业务', '待回答问题')).toBe(true);
  });

  it('待回答问题 -> 待补充证据 合法', () => {
    expect(canTransition('待回答问题', '待补充证据')).toBe(true);
  });

  it('待补充证据 -> 业务已还原 合法', () => {
    expect(canTransition('待补充证据', '业务已还原')).toBe(true);
  });

  it('业务已还原 -> 待风险判断 合法', () => {
    expect(canTransition('业务已还原', '待风险判断')).toBe(true);
  });

  it('待风险判断 -> 待财务复核 合法', () => {
    expect(canTransition('待风险判断', '待财务复核')).toBe(true);
  });

  it('待财务复核 -> 待负责人审批 合法', () => {
    expect(canTransition('待财务复核', '待负责人审批')).toBe(true);
  });

  it('待负责人审批 -> 待生成凭证 合法', () => {
    expect(canTransition('待负责人审批', '待生成凭证')).toBe(true);
  });

  it('待生成凭证 -> 凭证草稿已生成 合法', () => {
    expect(canTransition('待生成凭证', '凭证草稿已生成')).toBe(true);
  });

  it('凭证草稿已生成 -> 已完成 合法', () => {
    expect(canTransition('凭证草稿已生成', '已完成')).toBe(true);
  });

  it('退回后可重新进入业务追问/证据补充', () => {
    expect(canTransition('已退回', '待回答问题')).toBe(true);
    expect(canTransition('已退回', '待补充证据')).toBe(true);
  });

  it('暂不能判断可重新进入业务追问/证据补充/票面确认', () => {
    expect(canTransition('暂不能判断', '待回答问题')).toBe(true);
    expect(canTransition('暂不能判断', '待补充证据')).toBe(true);
    expect(canTransition('暂不能判断', '待确认票面')).toBe(true);
  });
});

describe('状态机：非法流转必须拒绝', () => {
  it('待识别 -> 待生成凭证 非法（跳过必要状态）', () => {
    expect(canTransition('待识别', '待生成凭证')).toBe(false);
  });

  it('待确认票面 -> 待生成凭证 非法（跳过业务/证据/风险判断）', () => {
    expect(canTransition('待确认票面', '待生成凭证')).toBe(false);
  });

  it('待回答问题 -> 凭证草稿已生成 非法（跳过证据与风险判断）', () => {
    expect(canTransition('待回答问题', '凭证草稿已生成')).toBe(false);
  });

  it('待风险判断 -> 已完成 非法（必须先生成凭证草稿）', () => {
    expect(canTransition('待风险判断', '已完成')).toBe(false);
  });

  it('已完成 -> 任何状态 非法（终态）', () => {
    expect(canTransition('已完成', '待识别')).toBe(false);
    expect(canTransition('已完成', '待生成凭证')).toBe(false);
  });

  it('已作废或已红冲 -> 任何状态 非法（终态）', () => {
    expect(canTransition('已作废或已红冲', '待识别')).toBe(false);
    expect(canTransition('已作废或已红冲', '待回答问题')).toBe(false);
  });

  it('transitionStatus 非法流转抛错', () => {
    expect(() => transitionStatus('待识别', '待生成凭证')).toThrowError(/非法状态流转/);
  });

  it('transitionStatus 合法流转返回目标状态', () => {
    expect(transitionStatus('待识别', '识别中')).toBe('识别中');
  });
});

describe('状态机：终态判定', () => {
  it('已完成 是终态', () => {
    expect(isTerminalStatus('已完成')).toBe(true);
  });

  it('已作废或已红冲 是终态', () => {
    expect(isTerminalStatus('已作废或已红冲')).toBe(true);
  });

  it('待识别 不是终态', () => {
    expect(isTerminalStatus('待识别')).toBe(false);
  });

  it('待生成凭证 不是终态', () => {
    expect(isTerminalStatus('待生成凭证')).toBe(false);
  });
});

describe('状态机：允许下一状态列表', () => {
  it('待识别 只允许进入 识别中', () => {
    expect(nextAllowedStatuses('待识别')).toEqual(['识别中']);
  });

  it('已完成 无下一状态', () => {
    expect(nextAllowedStatuses('已完成')).toEqual([]);
  });

  it('已作废或已红冲 无下一状态', () => {
    expect(nextAllowedStatuses('已作废或已红冲')).toEqual([]);
  });

  it('待风险判断 至少可进入 待财务复核 / 待生成凭证 / 待补充证据 / 暂不能判断', () => {
    const allowed = nextAllowedStatuses('待风险判断');
    expect(allowed).toContain('待财务复核');
    expect(allowed).toContain('待生成凭证');
    expect(allowed).toContain('待补充证据');
    expect(allowed).toContain('暂不能判断');
  });
});

describe('状态机：日志格式', () => {
  it('formatTransitionLog 不带备注', () => {
    expect(formatTransitionLog('待识别', '识别中')).toBe('状态流转：待识别 → 识别中');
  });

  it('formatTransitionLog 带备注', () => {
    expect(formatTransitionLog('待识别', '识别中', '用户触发')).toBe('状态流转：待识别 → 识别中（用户触发）');
  });
});
