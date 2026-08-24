// 账户数据隔离单测：命名空间变换与登录态解析的纯函数行为
// vitest 为 node 环境（无 window），getStoredAuthUser 恒为 null → key 保持原样，
// 因此这里直接测 applyAccountNamespace / parseStoredAuth 两个纯函数覆盖全部分支。

import { describe, expect, it } from 'vitest';
import {
  applyAccountNamespace,
  AUTH_STORAGE_KEY,
  parseStoredAuth,
  type StoredAuthUser,
} from './authStorage';

const userA: StoredAuthUser = {
  userId: '11111111-2222-3333-4444-555555555555',
  username: '张三',
  token: 'token-a',
  expiresAt: 1893456000000,
};

const userB: StoredAuthUser = {
  userId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  username: '李四',
  token: 'token-b',
  expiresAt: 1893456000000,
};

describe('applyAccountNamespace', () => {
  it('未登录时数据 key 保持原样（兼容旧数据与 node 测试环境）', () => {
    expect(applyAccountNamespace('invoice_evidence_cases', null)).toBe('invoice_evidence_cases');
    expect(applyAccountNamespace('invoice_evidence_active_case_id', null)).toBe(
      'invoice_evidence_active_case_id',
    );
  });

  it('登录后数据 key 附加账户命名空间前缀', () => {
    expect(applyAccountNamespace('invoice_evidence_cases', userA)).toBe(
      `invoice_evidence_u${userA.userId}__cases`,
    );
    expect(applyAccountNamespace('invoice_evidence_rule_thresholds', userA)).toBe(
      `invoice_evidence_u${userA.userId}__rule_thresholds`,
    );
  });

  it('不同账户得到不同命名空间，数据互不可见', () => {
    const keyA = applyAccountNamespace('invoice_evidence_cases', userA);
    const keyB = applyAccountNamespace('invoice_evidence_cases', userB);
    expect(keyA).not.toBe(keyB);
  });

  it('登录态自举 key 不参与命名空间变换', () => {
    expect(applyAccountNamespace(AUTH_STORAGE_KEY, userA)).toBe(AUTH_STORAGE_KEY);
  });

  it('非 invoice_evidence_ 前缀的外部 key 原样返回', () => {
    expect(applyAccountNamespace('other_app_data', userA)).toBe('other_app_data');
  });

  it('缺少 userId 的异常登录态不隔离（防御）', () => {
    const broken = { ...userA, userId: '' };
    expect(applyAccountNamespace('invoice_evidence_cases', broken)).toBe('invoice_evidence_cases');
  });
});

describe('parseStoredAuth', () => {
  it('解析合法登录态', () => {
    const raw = JSON.stringify({ user: userA });
    expect(parseStoredAuth(raw)).toEqual(userA);
  });

  it('null / 空字符串返回 null', () => {
    expect(parseStoredAuth(null)).toBeNull();
    expect(parseStoredAuth('')).toBeNull();
  });

  it('坏 JSON 返回 null 不抛出', () => {
    expect(parseStoredAuth('{{{not json')).toBeNull();
  });

  it('结构不完整（缺 token）返回 null', () => {
    const broken = JSON.stringify({ user: { userId: 'u1', username: '张三' } });
    expect(parseStoredAuth(broken)).toBeNull();
  });

  it('user 为 null 的登出态返回 null', () => {
    expect(parseStoredAuth(JSON.stringify({ user: null }))).toBeNull();
  });
});
