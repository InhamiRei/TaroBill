import { describe, expect, it } from 'vitest';
import type { BillRecord } from '../../shared/types';
import { summarizeRollingWeekExpenses } from './ExpenseChart';

// 测试记录只关心发生日期和金额，其余必填字段使用固定值保持数据结构完整。
const createRecord = (id: string, occurredAt: string, amountCents: number): BillRecord => ({
  id,
  typeId: 'ai-bills',
  icon: 'receipt-text',
  content: `账单 ${id}`,
  amountCents,
  occurredAt,
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-01T00:00:00.000Z',
});

describe('滚动周支出图表', () => {
  // 7 月 14 日应落在 7/11-7/17 中间柱，左右各保留两个连续自然区间。
  it('以前后三天组成中间周并正确跨月汇总', () => {
    const records = [
      createRecord('1', '2026-06-30T10:00', 100),
      createRecord('2', '2026-07-04T10:00', 200),
      createRecord('3', '2026-07-11T10:00', 300),
      createRecord('4', '2026-07-17T10:00', 400),
      createRecord('5', '2026-07-18T10:00', 500),
    ];
    const entries = summarizeRollingWeekExpenses(records, new Date(2026, 6, 14));

    expect(entries.map((entry) => entry.label)).toEqual(['6/27-7/3', '7/4-7/10', '7/11-7/17', '7/18-7/24', '7/25-7/31']);
    expect(entries.map((entry) => entry.value)).toEqual([100, 200, 700, 500, 0]);
    expect(entries.map((entry) => entry.current)).toEqual([false, false, true, false, false]);
  });
});
