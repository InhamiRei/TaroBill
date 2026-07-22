import { formatLocalDateTime } from './billUtils';
import type { AppData, BillRecord, RecurringRule, RecurringRuleInput } from './types';

// 单条规则单次补账上限，防止导入异常数据（如创建时间在数年前）一次刷出海量账单。
export const MAX_CATCH_UP_PER_RULE = 366;

const WEEKDAY_LABELS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// 触发时间只接受 "HH:mm" 并回读范围，排除 24:00 或单位数小时等非法输入。
export const isValidTimeOfDay = (value: string): boolean => {
  const matched = /^(\d{2}):(\d{2})$/.exec(value);
  if (!matched) return false;
  const hour = Number(matched[1]);
  const minute = Number(matched[2]);
  return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59;
};

export const isValidDateKey = (value: string): boolean => DATE_KEY_PATTERN.test(value);

// 本地日期键不经过 UTC 转换，与账单的本地分钟字符串保持同一套日期口径。
export const getLocalDateKey = (date: Date): string => {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

// 日期键统一解析为本地零点，逐天推进时不携带时分秒。
const parseDateKey = (key: string): Date => {
  const year = Number(key.slice(0, 4));
  const month = Number(key.slice(5, 7));
  const day = Number(key.slice(8, 10));
  return new Date(year, month - 1, day);
};

// 每月任务在小月落到月末最后一天，例如 31 号的任务在 2 月于 28 号触发。
const occursOnDate = (rule: RecurringRule, date: Date): boolean => {
  if (rule.frequency === 'daily') return true;
  if (rule.frequency === 'weekly') return date.getDay() === (rule.weekday ?? 0);
  const daysInMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  return date.getDate() === Math.min(rule.monthDay ?? 1, daysInMonth);
};

// 补账起点：已生成到的日期的次日；从未生成过则从规则创建的本地日期开始。
const getCatchUpStart = (rule: RecurringRule): Date => {
  if (rule.lastGeneratedDate && isValidDateKey(rule.lastGeneratedDate)) {
    const start = parseDateKey(rule.lastGeneratedDate);
    start.setDate(start.getDate() + 1);
    return start;
  }
  return parseDateKey(getLocalDateKey(new Date(rule.createdAt)));
};

const createOccurrence = (rule: RecurringRule, date: Date): Date => {
  const hour = Number(rule.timeOfDay.slice(0, 2));
  const minute = Number(rule.timeOfDay.slice(3, 5));
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), hour, minute);
};

// 计算从补账起点到 now 之间全部到期的账单时间；分钟一到即视为到期，生成过的周期不再重复。
export const computeDueOccurrences = (rule: RecurringRule, now: Date): string[] => {
  const occurrences: string[] = [];
  const cursor = getCatchUpStart(rule);
  const today = parseDateKey(getLocalDateKey(now));

  while (cursor.getTime() <= today.getTime() && occurrences.length < MAX_CATCH_UP_PER_RULE) {
    if (occursOnDate(rule, cursor)) {
      const occurrence = createOccurrence(rule, cursor);
      if (occurrence.getTime() <= now.getTime()) occurrences.push(formatLocalDateTime(occurrence));
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return occurrences;
};

// 面板展示的下次触发时间，最多向后看一年，任何合法规则都必然命中。
export const findNextOccurrence = (rule: RecurringRule, now: Date): string | null => {
  const cursor = parseDateKey(getLocalDateKey(now));
  for (let day = 0; day < 370; day += 1) {
    if (occursOnDate(rule, cursor)) {
      const occurrence = createOccurrence(rule, cursor);
      if (occurrence.getTime() > now.getTime()) return formatLocalDateTime(occurrence);
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return null;
};

// 频率描述用于任务卡片和删除确认，时间部分直接拼接 "HH:mm" 原文。
export const describeRule = (rule: RecurringRule): string => {
  if (rule.frequency === 'daily') return `每天 ${rule.timeOfDay}`;
  if (rule.frequency === 'weekly') return `每${WEEKDAY_LABELS[rule.weekday ?? 0]} ${rule.timeOfDay}`;
  return `每月 ${rule.monthDay ?? 1} 日 ${rule.timeOfDay}`;
};

// 下次触发时间贴合口语习惯：今天、明天，其余显示「M月D日」。
export const formatNextOccurrence = (rule: RecurringRule, now: Date): string => {
  const next = findNextOccurrence(rule, now);
  if (!next) return '';
  const nextDateKey = next.slice(0, 10);
  const tomorrow = parseDateKey(getLocalDateKey(now));
  tomorrow.setDate(tomorrow.getDate() + 1);
  const label =
    nextDateKey === getLocalDateKey(now)
      ? '今天'
      : nextDateKey === getLocalDateKey(tomorrow)
        ? '明天'
        : `${Number(next.slice(5, 7))}月${Number(next.slice(8, 10))}日`;
  return `下次：${label} ${next.slice(11)}`;
};

// 编辑弹窗提交前把完整规则裁剪回输入载荷，去掉主进程维护的进度和时间戳字段。
export const toRuleInput = (rule: RecurringRule): RecurringRuleInput => ({
  name: rule.name,
  typeId: rule.typeId,
  icon: rule.icon,
  content: rule.content,
  amountCents: rule.amountCents,
  frequency: rule.frequency,
  timeOfDay: rule.timeOfDay,
  weekday: rule.weekday,
  monthDay: rule.monthDay,
  enabled: rule.enabled,
});

// 纯函数版本供主进程 store 和浏览器预览共用：对每条启用规则补齐到期账单并推进生成进度。
// 有实际生成时返回包含新账单的新数据，没有任何到期账单时返回 null，调用方避免无谓写盘。
export const applyRecurringRulesToData = (data: AppData, now: Date): AppData | null => {
  const timestamp = now.toISOString();
  const generated: BillRecord[] = [];
  let changed = false;

  const recurringRules = data.recurringRules.map((rule) => {
    if (!rule.enabled) return rule;
    const occurrences = computeDueOccurrences(rule, now);
    if (!occurrences.length) return rule;
    changed = true;
    for (const occurredAt of occurrences) {
      generated.push({
        id: crypto.randomUUID(),
        typeId: rule.typeId,
        icon: rule.icon,
        content: rule.content,
        amountCents: rule.amountCents,
        occurredAt,
        ruleId: rule.id,
        createdAt: timestamp,
        updatedAt: timestamp,
      });
    }
    return { ...rule, lastGeneratedDate: occurrences[occurrences.length - 1].slice(0, 10), updatedAt: timestamp };
  });

  if (!changed) return null;
  return { ...data, records: [...data.records, ...generated], recurringRules };
};
