import { applyRecurringRulesToData, getLocalDateKey, isValidTimeOfDay } from '../shared/recurringUtils';
import type { AppData, AppSettings, BillRecordInput, RecurringRuleInput, TaroBillApi } from '../shared/types';
import { createDefaultAppData } from '../shared/types';

const previewKey = 'tarobill-preview-data-v1';

// Electron 环境优先使用 preload；普通浏览器只在开发态启用 localStorage 预览 API。
export const getTaroBillApi = (): TaroBillApi => {
  if (window.taroBill) return window.taroBill;
  if (!import.meta.env.DEV) throw new Error('TaroBill preload API 不可用。');
  return createPreviewApi();
};

// 预览数据损坏时直接回到默认状态，避免视觉开发被 localStorage 卡住。
const readData = (): AppData => {
  const raw = window.localStorage.getItem(previewKey);
  if (!raw) return createDefaultAppData();
  try {
    return JSON.parse(raw) as AppData;
  } catch {
    return createDefaultAppData();
  }
};

// 预览环境统一从这里持久化并返回独立对象，模拟真实 IPC 往返。
const writeData = (data: AppData): AppData => {
  window.localStorage.setItem(previewKey, JSON.stringify(data));
  return structuredClone(data);
};

// 预览环境也执行基本名称校验，让浏览器调试行为尽量接近主进程。
const validateTypeName = (data: AppData, name: string, excludedId?: string): string => {
  const normalized = name.trim();
  if (!normalized) throw new Error('账单类型名称不能为空。');
  if (data.billTypes.some((item) => item.id !== excludedId && item.name === normalized)) throw new Error('已经存在同名账单类型。');
  return normalized;
};

// 任务校验复刻主进程的关键约束，浏览器调试时尽早暴露同样的错误文案。
const validateRuleInput = (data: AppData, input: RecurringRuleInput): RecurringRuleInput => {
  const name = input.name.trim();
  if (!name) throw new Error('任务名称不能为空。');
  const content = input.content.trim();
  if (!content) throw new Error('账单标题不能为空。');
  if (!Number.isSafeInteger(input.amountCents) || input.amountCents <= 0) throw new Error('账单金额无效。');
  if (!data.billTypes.some((item) => item.id === input.typeId)) throw new Error('账单类型不存在。');
  if (!isValidTimeOfDay(input.timeOfDay)) throw new Error('执行时间无效。');
  if (input.frequency === 'weekly' && (input.weekday === undefined || input.weekday < 0 || input.weekday > 6))
    throw new Error('每周任务需要选择星期。');
  if (input.frequency === 'monthly' && (input.monthDay === undefined || input.monthDay < 1 || input.monthDay > 31))
    throw new Error('每月任务需要选择日期。');
  return {
    ...input,
    name,
    content,
    weekday: input.frequency === 'weekly' ? input.weekday : undefined,
    monthDay: input.frequency === 'monthly' ? input.monthDay : undefined,
  };
};

// 预览环境复用共享补账逻辑：读取时顺带补账，每分钟再检查一次并通知订阅者。
const dataChangedListeners = new Set<(data: AppData) => void>();

const runPreviewRules = (): AppData => {
  // 只解析一次 localStorage：无到期账单直接返回，有生成才写回并通知订阅者。
  const data = readData();
  const next = applyRecurringRulesToData(data, new Date());
  if (!next) return data;
  const written = writeData(next);
  for (const listener of dataChangedListeners) listener(written);
  return written;
};

let previewSchedulerStarted = false;

const ensurePreviewScheduler = () => {
  if (previewSchedulerStarted) return;
  previewSchedulerStarted = true;
  window.setInterval(runPreviewRules, 60_000);
};

// 开发预览 API 复刻业务动作，但不触碰文件系统和原生窗口。
const createPreviewApi = (): TaroBillApi => ({
  getState: async () => {
    ensurePreviewScheduler();
    return runPreviewRules();
  },
  createBillType: async (name) => {
    const data = readData();
    const normalized = validateTypeName(data, name);
    return writeData({
      ...data,
      billTypes: [
        ...data.billTypes,
        { id: crypto.randomUUID(), name: normalized, sortOrder: data.billTypes.length, createdAt: new Date().toISOString() },
      ],
    });
  },
  renameBillType: async (typeId, name) => {
    const data = readData();
    const normalized = validateTypeName(data, name, typeId);
    return writeData({
      ...data,
      billTypes: data.billTypes.map((item) => (item.id === typeId ? { ...item, name: normalized } : item)),
    });
  },
  deleteBillType: async (typeId) => {
    const data = readData();
    if (data.billTypes.length <= 1) throw new Error('至少需要保留一个账单类型。');
    return writeData({
      ...data,
      billTypes: data.billTypes.filter((item) => item.id !== typeId).map((item, index) => ({ ...item, sortOrder: index })),
      records: data.records.filter((record) => record.typeId !== typeId),
      recurringRules: data.recurringRules.filter((rule) => rule.typeId !== typeId),
    });
  },
  createBillRecord: async (input: BillRecordInput) => {
    const data = readData();
    const timestamp = new Date().toISOString();
    return writeData({
      ...data,
      records: [...data.records, { id: crypto.randomUUID(), ...input, content: input.content.trim(), createdAt: timestamp, updatedAt: timestamp }],
    });
  },
  updateBillRecord: async (recordId, input) => {
    const data = readData();
    return writeData({
      ...data,
      records: data.records.map((record) =>
        record.id === recordId ? { ...record, ...input, content: input.content.trim(), updatedAt: new Date().toISOString() } : record,
      ),
    });
  },
  deleteBillRecord: async (recordId) => {
    const data = readData();
    return writeData({ ...data, records: data.records.filter((record) => record.id !== recordId) });
  },
  createRecurringRule: async (input) => {
    const data = readData();
    const validated = validateRuleInput(data, input);
    const timestamp = new Date().toISOString();
    return writeData({
      ...data,
      recurringRules: [
        ...data.recurringRules,
        { id: crypto.randomUUID(), ...validated, lastGeneratedDate: '', createdAt: timestamp, updatedAt: timestamp },
      ],
    });
  },
  updateRecurringRule: async (ruleId, input) => {
    const data = readData();
    const previous = data.recurringRules.find((rule) => rule.id === ruleId);
    if (!previous) throw new Error('周期任务不存在。');
    const validated = validateRuleInput(data, input);
    // 与主进程一致：停用时推进生成进度到当天，重新启用不补停用期间的账单。
    const lastGeneratedDate = previous.enabled && !validated.enabled ? getLocalDateKey(new Date()) : previous.lastGeneratedDate;
    return writeData({
      ...data,
      recurringRules: data.recurringRules.map((rule) =>
        rule.id === ruleId ? { ...rule, ...validated, lastGeneratedDate, updatedAt: new Date().toISOString() } : rule,
      ),
    });
  },
  deleteRecurringRule: async (ruleId) => {
    const data = readData();
    if (!data.recurringRules.some((rule) => rule.id === ruleId)) throw new Error('周期任务不存在。');
    return writeData({ ...data, recurringRules: data.recurringRules.filter((rule) => rule.id !== ruleId) });
  },
  onDataChanged: (callback) => {
    dataChangedListeners.add(callback);
    return () => dataChangedListeners.delete(callback);
  },
  updateSettings: async (settings: Pick<AppSettings, 'theme'>) => {
    const data = readData();
    return writeData({ ...data, settings: { ...data.settings, theme: settings.theme } });
  },
  exportData: async () => ({ canceled: true, message: '浏览器预览不导出文件。' }),
  importData: async () => ({ result: { canceled: true, message: '浏览器预览不导入文件。' } }),
  closeWindow: async () => undefined,
  minimizeWindow: async () => undefined,
  toggleMaximize: async () => undefined,
  getPlatform: async () => 'darwin',
  startResize: async () => undefined,
  resize: async () => undefined,
  endResize: async () => undefined,
  isMaximized: async () => false,
  onWindowState: () => () => undefined,
});
