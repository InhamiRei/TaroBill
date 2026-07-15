import type { BillRecord } from './types';

export type CalendarCell = {
  dateKey: string;
  day: number;
  inCurrentMonth: boolean;
  isToday: boolean;
};

export type MonthSummary = {
  totalCents: number;
  dailyTotals: number[];
};

export type YearSummary = {
  totalCents: number;
};

// 货币和紧凑数字格式器跨渲染复用，避免账单列表刷新时重复创建 Intl 实例。
const cnyFormatter = new Intl.NumberFormat('zh-CN', {
  style: 'currency',
  currency: 'CNY',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const compactNumberFormatter = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 });

// 用本地年月日和分钟拼接存储值，避免 UTC 转换导致账单跨日。
export const formatLocalDateTime = (date: Date): string => {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

// 严格校验本地分钟字符串，并通过日期回读排除 2 月 30 日一类无效日期。
export const isValidLocalDateTime = (value: string): boolean => {
  const matched = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!matched) return false;

  const [, yearText, monthText, dayText, hourText, minuteText] = matched;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const parsed = new Date(year, month - 1, day, hour, minute);

  return (
    parsed.getFullYear() === year &&
    parsed.getMonth() === month - 1 &&
    parsed.getDate() === day &&
    parsed.getHours() === hour &&
    parsed.getMinutes() === minute
  );
};

// 金额从用户输入文本精确转换为整数分，不经过浮点乘法。
export const parseAmountToCents = (value: string): number | null => {
  const normalized = value.trim();
  const matched = /^(\d+)(?:\.(\d{1,2}))?$/.exec(normalized);
  if (!matched) return null;

  const yuan = Number(matched[1]);
  const fraction = (matched[2] ?? '').padEnd(2, '0');
  const cents = yuan * 100 + Number(fraction);
  return Number.isSafeInteger(cents) && cents > 0 ? cents : null;
};

// 人民币显示统一走 Intl，自动处理千分位与两位小数。
export const formatCny = (amountCents: number): string => {
  return cnyFormatter.format(amountCents / 100);
};

// 图表和日历空间有限，紧凑金额保留必要小数并用“万”缩写大额数字。
export const formatCompactCny = (amountCents: number): string => {
  const yuan = amountCents / 100;
  if (yuan >= 10_000) {
    return `¥${(yuan / 10_000).toFixed(yuan >= 100_000 ? 0 : 1)}万`;
  }
  return `¥${compactNumberFormatter.format(yuan)}`;
};

// 统一生成 YYYY-MM 键，供月度筛选和统计复用。
export const getMonthKey = (year: number, monthIndex: number): string => {
  return `${year}-${String(monthIndex + 1).padStart(2, '0')}`;
};

// 生成 YYYY-MM-DD 键，月度日历点击后直接与账单时间前缀比较。
export const getDateKey = (year: number, monthIndex: number, day: number): string => {
  return `${getMonthKey(year, monthIndex)}-${String(day).padStart(2, '0')}`;
};

// 月历固定生成 6×7 个格子，并以周日为每周第一天，与参考图保持一致。
export const createCalendarCells = (year: number, monthIndex: number, today = new Date()): CalendarCell[] => {
  const firstWeekday = new Date(year, monthIndex, 1).getDay();
  const startDate = new Date(year, monthIndex, 1 - firstWeekday);

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate() + index);
    return {
      dateKey: getDateKey(date.getFullYear(), date.getMonth(), date.getDate()),
      day: date.getDate(),
      inCurrentMonth: date.getFullYear() === year && date.getMonth() === monthIndex,
      isToday: date.getFullYear() === today.getFullYear() && date.getMonth() === today.getMonth() && date.getDate() === today.getDate(),
    };
  });
};

// 月度统计一次遍历同时得到总额和每天序列，供卡片、日历与图表共同使用。
export const summarizeMonth = (records: BillRecord[], year: number, monthIndex: number): MonthSummary => {
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const dailyTotals = Array.from({ length: daysInMonth }, () => 0);
  const monthPrefix = `${getMonthKey(year, monthIndex)}-`;
  let totalCents = 0;

  for (const record of records) {
    if (!record.occurredAt.startsWith(monthPrefix)) continue;
    const day = Number(record.occurredAt.slice(8, 10));
    if (day < 1 || day > daysInMonth) continue;
    dailyTotals[day - 1] += record.amountCents;
    totalCents += record.amountCents;
  }

  return { totalCents, dailyTotals };
};

// 年度统计只保留统计卡需要的总额；年度报告移除后不再维护未使用的数组和笔数。
export const summarizeYear = (records: BillRecord[], year: number): YearSummary => {
  const yearPrefix = `${year}-`;
  let totalCents = 0;

  for (const record of records) {
    if (!record.occurredAt.startsWith(yearPrefix)) continue;
    totalCents += record.amountCents;
  }

  return { totalCents };
};

// 全部记录金额合计不限周期，供统计卡切换到「总支出」口径复用。
export const summarizeAllTime = (records: BillRecord[]): number => {
  let totalCents = 0;
  for (const record of records) totalCents += record.amountCents;
  return totalCents;
};

// 账单范围筛选集中处理日和月两种前缀，并统一返回稳定的时间倒序结果。
export const filterRecordsByPeriod = (records: BillRecord[], year: number, monthIndex: number, selectedDate: string | null): BillRecord[] => {
  const prefix = selectedDate ?? `${getMonthKey(year, monthIndex)}-`;
  return sortRecordsNewestFirst(records.filter((record) => record.occurredAt.startsWith(prefix)));
};

// 可见记录统一按发生时间倒序，时间相同时再用创建时间保证顺序稳定。
export const sortRecordsNewestFirst = (records: BillRecord[]): BillRecord[] => {
  return [...records].sort((left, right) => {
    const timeCompare = right.occurredAt.localeCompare(left.occurredAt);
    return timeCompare || right.createdAt.localeCompare(left.createdAt);
  });
};
