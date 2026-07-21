import { describe, expect, it } from 'vitest';
import {
  createCalendarCells,
  filterRecordsByPeriod,
  formatLocalDateTime,
  isValidLocalDateTime,
  parseAmountToCents,
  searchRecordsByKeyword,
  summarizeAllTime,
  summarizeMonth,
  summarizeYear,
} from './billUtils';
import type { BillRecord } from './types';

// 测试记录工厂只覆盖统计所需字段，让各场景输入保持清晰。
const createRecord = (occurredAt: string, amountCents: number, id: string): BillRecord => ({
  id,
  typeId: 'ai-bills',
  icon: 'sparkles',
  content: `记录 ${id}`,
  amountCents,
  occurredAt,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
});

describe('金额转换', () => {
  it('把人民币文本精确转换为整数分', () => {
    expect(parseAmountToCents('35')).toBe(3500);
    expect(parseAmountToCents('54.9')).toBe(5490);
    expect(parseAmountToCents('0.01')).toBe(1);
  });

  it('拒绝零、负数和超过两位小数', () => {
    expect(parseAmountToCents('0')).toBeNull();
    expect(parseAmountToCents('-2')).toBeNull();
    expect(parseAmountToCents('1.234')).toBeNull();
    expect(parseAmountToCents('abc')).toBeNull();
  });
});

describe('本地时间', () => {
  it('保留本地分钟而不转换为 UTC', () => {
    expect(formatLocalDateTime(new Date(2026, 6, 14, 10, 25))).toBe('2026-07-14T10:25');
    expect(isValidLocalDateTime('2026-07-14T10:25')).toBe(true);
    expect(isValidLocalDateTime('2026-02-30T10:25')).toBe(false);
  });
});

describe('日历边界', () => {
  it('闰年二月固定生成六周并包含 29 日', () => {
    const cells = createCalendarCells(2024, 1, new Date(2024, 1, 29));
    expect(cells).toHaveLength(42);
    expect(cells[0].dateKey).toBe('2024-01-28');
    expect(cells.some((cell) => cell.dateKey === '2024-02-29' && cell.inCurrentMonth && cell.isToday)).toBe(true);
  });
});

describe('支出聚合', () => {
  const records = [
    createRecord('2026-07-01T10:25', 3500, 'a'),
    createRecord('2026-07-01T12:00', 4990, 'b'),
    createRecord('2026-07-31T23:59', 100, 'c'),
    createRecord('2026-08-01T00:00', 900, 'd'),
    createRecord('2025-07-01T10:00', 777, 'e'),
  ];

  it('月度统计不会把相邻月份或年份混入', () => {
    const summary = summarizeMonth(records, 2026, 6);
    expect(summary.totalCents).toBe(8590);
    expect(summary.dailyTotals[0]).toBe(8490);
    expect(summary.dailyTotals[30]).toBe(100);
  });

  it('年度统计汇总全年支出', () => {
    const summary = summarizeYear(records, 2026);
    expect(summary.totalCents).toBe(9490);
  });

  it('全部记录金额合计不限周期', () => {
    expect(summarizeAllTime(records)).toBe(10267);
  });

  it('按日期和月份筛选并保持发生时间倒序', () => {
    expect(filterRecordsByPeriod(records, 2026, 6, '2026-07-01').map((record) => record.id)).toEqual(['b', 'a']);
    expect(filterRecordsByPeriod(records, 2026, 6, null).map((record) => record.id)).toEqual(['c', 'b', 'a']);
  });
});

describe('标题搜索', () => {
  const records = [
    { ...createRecord('2026-07-01T10:25', 3500, 'a'), content: 'ChatGPT 订阅' },
    { ...createRecord('2026-07-02T12:00', 4990, 'b'), content: 'Claude 订阅' },
    { ...createRecord('2026-08-01T09:00', 2000, 'c'), content: 'chatgpt 充值' },
  ];

  it('忽略大小写和首尾空白匹配标题，结果保持时间倒序', () => {
    expect(searchRecordsByKeyword(records, '  CHATGPT ').map((record) => record.id)).toEqual(['c', 'a']);
    expect(searchRecordsByKeyword(records, '订阅').map((record) => record.id)).toEqual(['b', 'a']);
  });

  it('空白关键词不返回结果，也不匹配金额等其他字段', () => {
    expect(searchRecordsByKeyword(records, '')).toEqual([]);
    expect(searchRecordsByKeyword(records, '   ')).toEqual([]);
    expect(searchRecordsByKeyword(records, '35')).toEqual([]);
  });
});
