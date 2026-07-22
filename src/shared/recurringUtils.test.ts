import { describe, expect, it } from 'vitest';
import {
  MAX_CATCH_UP_PER_RULE,
  applyRecurringRulesToData,
  computeDueOccurrences,
  describeRule,
  findNextOccurrence,
  formatNextOccurrence,
  isValidTimeOfDay,
  toRuleInput,
} from './recurringUtils';
import { createDefaultAppData } from './types';
import type { RecurringRule } from './types';

// createdAt 用本地零点构造再转 ISO，保证任何时区下规则的创建本地日期都是 2026-07-01。
const createRule = (overrides: Partial<RecurringRule> = {}): RecurringRule => ({
  id: 'rule-1',
  name: '每日公交',
  typeId: 'ai-bills',
  icon: 'sparkles',
  content: '公交地铁',
  amountCents: 200,
  frequency: 'daily',
  timeOfDay: '08:00',
  enabled: true,
  lastGeneratedDate: '',
  createdAt: new Date(2026, 6, 1).toISOString(),
  updatedAt: new Date(2026, 6, 1).toISOString(),
  ...overrides,
});

describe('触发时间校验', () => {
  it('接受合法 HH:mm 并拒绝越界和畸形输入', () => {
    expect(isValidTimeOfDay('08:00')).toBe(true);
    expect(isValidTimeOfDay('23:59')).toBe(true);
    expect(isValidTimeOfDay('24:00')).toBe(false);
    expect(isValidTimeOfDay('8:00')).toBe(false);
    expect(isValidTimeOfDay('08:60')).toBe(false);
    expect(isValidTimeOfDay('')).toBe(false);
  });
});

describe('到期计算', () => {
  it('每天任务从创建日开始补齐全部到期账单', () => {
    const occurrences = computeDueOccurrences(createRule(), new Date(2026, 6, 3, 9, 0));
    expect(occurrences).toEqual(['2026-07-01T08:00', '2026-07-02T08:00', '2026-07-03T08:00']);
  });

  it('触发分钟未到时当天不生成', () => {
    const occurrences = computeDueOccurrences(createRule(), new Date(2026, 6, 3, 7, 59));
    expect(occurrences).toEqual(['2026-07-01T08:00', '2026-07-02T08:00']);
  });

  it('补账从上次生成日期的次日继续，不重复历史周期', () => {
    const rule = createRule({ lastGeneratedDate: '2026-07-02' });
    const occurrences = computeDueOccurrences(rule, new Date(2026, 6, 4, 9, 0));
    expect(occurrences).toEqual(['2026-07-03T08:00', '2026-07-04T08:00']);
  });

  it('每周任务只在选定星期触发', () => {
    // 2026-07-01 是周三；每周一的任务首个触发日是 07-06。
    const rule = createRule({ frequency: 'weekly', weekday: 1 });
    const occurrences = computeDueOccurrences(rule, new Date(2026, 6, 14, 9, 0));
    expect(occurrences).toEqual(['2026-07-06T08:00', '2026-07-13T08:00']);
  });

  it('每月任务在小月落到月末最后一天', () => {
    const rule = createRule({ frequency: 'monthly', monthDay: 31 });
    const occurrences = computeDueOccurrences(rule, new Date(2026, 7, 1, 9, 0));
    expect(occurrences).toEqual(['2026-07-31T08:00']);
    const februaryRule = createRule({ frequency: 'monthly', monthDay: 31, createdAt: new Date(2026, 1, 1).toISOString() });
    expect(computeDueOccurrences(februaryRule, new Date(2026, 2, 1, 9, 0))).toEqual(['2026-02-28T08:00']);
  });

  it('创建日更早的长期未开应用补账不超过安全上限', () => {
    const rule = createRule({ createdAt: new Date(2024, 0, 1).toISOString() });
    const occurrences = computeDueOccurrences(rule, new Date(2026, 6, 3, 9, 0));
    expect(occurrences).toHaveLength(MAX_CATCH_UP_PER_RULE);
  });
});

describe('下次触发', () => {
  it('今天未到点显示今天，已过点顺延到下一个周期', () => {
    expect(findNextOccurrence(createRule(), new Date(2026, 6, 3, 7, 0))).toBe('2026-07-03T08:00');
    expect(findNextOccurrence(createRule(), new Date(2026, 6, 3, 8, 0))).toBe('2026-07-04T08:00');
  });

  it('格式化今天和明天，其余日期显示月日', () => {
    expect(formatNextOccurrence(createRule(), new Date(2026, 6, 3, 7, 0))).toBe('下次：今天 08:00');
    expect(formatNextOccurrence(createRule(), new Date(2026, 6, 3, 9, 0))).toBe('下次：明天 08:00');
    const monthly = createRule({ frequency: 'monthly', monthDay: 15 });
    expect(formatNextOccurrence(monthly, new Date(2026, 6, 3, 9, 0))).toBe('下次：7月15日 08:00');
  });
});

describe('规则描述与输入载荷', () => {
  it('按频率生成可读描述', () => {
    expect(describeRule(createRule())).toBe('每天 08:00');
    expect(describeRule(createRule({ frequency: 'weekly', weekday: 1 }))).toBe('每周一 08:00');
    expect(describeRule(createRule({ frequency: 'monthly', monthDay: 15 }))).toBe('每月 15 日 08:00');
  });

  it('裁剪掉主进程维护的进度和时间戳字段', () => {
    const input = toRuleInput(createRule({ frequency: 'weekly', weekday: 3 }));
    expect(input).toEqual({
      name: '每日公交',
      typeId: 'ai-bills',
      icon: 'sparkles',
      content: '公交地铁',
      amountCents: 200,
      frequency: 'weekly',
      timeOfDay: '08:00',
      weekday: 3,
      monthDay: undefined,
      enabled: true,
    });
  });
});

describe('补账生成', () => {
  it('生成带任务标识的账单并推进生成进度', () => {
    const data = createDefaultAppData();
    data.recurringRules = [createRule()];
    const next = applyRecurringRulesToData(data, new Date(2026, 6, 3, 9, 0));

    expect(next).not.toBeNull();
    expect(next?.records.map((record) => record.occurredAt)).toEqual(['2026-07-01T08:00', '2026-07-02T08:00', '2026-07-03T08:00']);
    expect(next?.records.every((record) => record.ruleId === 'rule-1')).toBe(true);
    expect(next?.records.every((record) => record.amountCents === 200)).toBe(true);
    expect(next?.recurringRules[0].lastGeneratedDate).toBe('2026-07-03');
  });

  it('同一时刻重复执行不再生成，没有到期账单时返回 null', () => {
    const data = createDefaultAppData();
    data.recurringRules = [createRule()];
    const first = applyRecurringRulesToData(data, new Date(2026, 6, 3, 9, 0));
    expect(applyRecurringRulesToData(first ?? data, new Date(2026, 6, 3, 10, 0))).toBeNull();
  });

  it('停用规则不生成账单', () => {
    const data = createDefaultAppData();
    data.recurringRules = [createRule({ enabled: false })];
    expect(applyRecurringRulesToData(data, new Date(2026, 6, 3, 9, 0))).toBeNull();
  });
});
