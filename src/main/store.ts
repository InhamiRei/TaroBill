import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { isValidLocalDateTime } from '../shared/billUtils';
import { applyRecurringRulesToData, getLocalDateKey, isValidDateKey, isValidTimeOfDay } from '../shared/recurringUtils';
import type {
  AppData,
  AppSettings,
  BillRecord,
  BillRecordInput,
  BillType,
  RecurringFrequency,
  RecurringRule,
  RecurringRuleInput,
  WindowBounds,
} from '../shared/types';
import {
  DEFAULT_SETTINGS,
  WINDOW_MIN_HEIGHT,
  WINDOW_MIN_WIDTH,
  createDefaultAppData,
  getDefaultBillRecordIcon,
  isBillRecordIcon,
} from '../shared/types';

type UnknownRecord = Record<string, unknown>;

// 普通对象保护集中处理，避免数组和 null 进入字段规范化逻辑。
const isRecord = (value: unknown): value is UnknownRecord => {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
};

// 字符串字段统一走类型保护，便于后续去空格和回退默认值。
const isString = (value: unknown): value is string => typeof value === 'string';

// ISO 时间只用于内部创建和更新时间，账单发生时间使用无时区本地分钟字符串。
const nowIso = (): string => new Date().toISOString();

// 窗口坐标只接受有限数值并取整，避免导入的小数或无穷值传给 Electron。
const normalizeCoordinate = (value: unknown): number | undefined => {
  return typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : undefined;
};

// 设置规范化会保留合法窗口坐标，并强制最小尺寸，防止导入数据后窗口无法操作。
const normalizeSettings = (value: unknown): AppSettings => {
  const settingsValue = isRecord(value) ? value : {};
  const windowValue = isRecord(settingsValue.window) ? settingsValue.window : {};
  const theme = settingsValue.theme === 'dark' ? 'dark' : 'light';

  return {
    theme,
    window: {
      x: normalizeCoordinate(windowValue.x),
      y: normalizeCoordinate(windowValue.y),
      width:
        typeof windowValue.width === 'number' && Number.isFinite(windowValue.width) && windowValue.width >= WINDOW_MIN_WIDTH
          ? Math.round(windowValue.width)
          : DEFAULT_SETTINGS.window.width,
      height:
        typeof windowValue.height === 'number' && Number.isFinite(windowValue.height) && windowValue.height >= WINDOW_MIN_HEIGHT
          ? Math.round(windowValue.height)
          : DEFAULT_SETTINGS.window.height,
    },
  };
};

// 类型列表会修复缺失 ID、去重名称和排序，同时确保至少保留一个类型。
const normalizeBillTypes = (value: unknown): BillType[] => {
  if (!Array.isArray(value)) {
    return createDefaultAppData().billTypes;
  }

  const ids = new Set<string>();
  const names = new Set<string>();
  const types: BillType[] = [];

  for (const [index, rawType] of value.entries()) {
    if (!isRecord(rawType)) continue;

    let id = isString(rawType.id) && rawType.id.trim() ? rawType.id.trim() : randomUUID();
    if (ids.has(id)) id = randomUUID();

    const fallbackName = `账单类型 ${index + 1}`;
    const baseName = isString(rawType.name) && rawType.name.trim() ? rawType.name.trim() : fallbackName;
    let name = baseName;
    let suffix = 2;
    // 持续递增后缀直到唯一，覆盖“类型、类型 3、类型”这类非连续冲突顺序。
    while (names.has(name.toLocaleLowerCase('zh-CN'))) {
      name = `${baseName} ${suffix}`;
      suffix += 1;
    }

    ids.add(id);
    names.add(name.toLocaleLowerCase('zh-CN'));
    types.push({
      id,
      name,
      sortOrder: typeof rawType.sortOrder === 'number' && Number.isFinite(rawType.sortOrder) ? rawType.sortOrder : index,
      createdAt: isString(rawType.createdAt) ? rawType.createdAt : nowIso(),
    });
  }

  return (types.length ? types : createDefaultAppData().billTypes).sort((left, right) => left.sortOrder - right.sortOrder);
};

// 账单记录只保留能够归属现有类型、金额和时间均合法的项目。
const normalizeBillRecords = (value: unknown, billTypes: BillType[]): BillRecord[] => {
  if (!Array.isArray(value)) return [];

  const typeIds = new Set(billTypes.map((billType) => billType.id));
  const ids = new Set<string>();
  const records: BillRecord[] = [];

  for (const rawRecord of value) {
    if (!isRecord(rawRecord)) continue;
    if (!isString(rawRecord.typeId) || !typeIds.has(rawRecord.typeId)) continue;
    if (!isString(rawRecord.content) || !rawRecord.content.trim()) continue;
    if (!Number.isSafeInteger(rawRecord.amountCents) || Number(rawRecord.amountCents) <= 0) continue;
    if (!isString(rawRecord.occurredAt) || !isValidLocalDateTime(rawRecord.occurredAt)) continue;

    let id = isString(rawRecord.id) && rawRecord.id.trim() ? rawRecord.id.trim() : randomUUID();
    if (ids.has(id)) id = randomUUID();
    ids.add(id);
    const createdAt = isString(rawRecord.createdAt) ? rawRecord.createdAt : nowIso();

    records.push({
      id,
      typeId: rawRecord.typeId,
      icon: isBillRecordIcon(rawRecord.icon) ? rawRecord.icon : getDefaultBillRecordIcon(rawRecord.typeId),
      content: rawRecord.content.trim(),
      amountCents: Number(rawRecord.amountCents),
      occurredAt: rawRecord.occurredAt,
      // 自动记账标识是可选字段，旧备份和手动账单没有它，只放行非空字符串。
      ...(isString(rawRecord.ruleId) && rawRecord.ruleId.trim() ? { ruleId: rawRecord.ruleId } : {}),
      createdAt,
      updatedAt: isString(rawRecord.updatedAt) ? rawRecord.updatedAt : createdAt,
    });
  }

  return records;
};

const RECURRING_FREQUENCIES = new Set<RecurringFrequency>(['daily', 'weekly', 'monthly']);

// 周期任务只保留归属现有类型、频率和时间均合法的项目；频率要求的星期或日期缺失时整条丢弃。
const normalizeRecurringRules = (value: unknown, billTypes: BillType[]): RecurringRule[] => {
  if (!Array.isArray(value)) return [];

  const typeIds = new Set(billTypes.map((billType) => billType.id));
  const ids = new Set<string>();
  const rules: RecurringRule[] = [];

  for (const rawRule of value) {
    if (!isRecord(rawRule)) continue;
    if (!isString(rawRule.typeId) || !typeIds.has(rawRule.typeId)) continue;
    if (!isString(rawRule.content) || !rawRule.content.trim()) continue;
    if (!Number.isSafeInteger(rawRule.amountCents) || Number(rawRule.amountCents) <= 0) continue;
    if (!isString(rawRule.frequency) || !RECURRING_FREQUENCIES.has(rawRule.frequency as RecurringFrequency)) continue;
    if (!isString(rawRule.timeOfDay) || !isValidTimeOfDay(rawRule.timeOfDay)) continue;

    const frequency = rawRule.frequency as RecurringFrequency;
    const weekday =
      typeof rawRule.weekday === 'number' && Number.isInteger(rawRule.weekday) && rawRule.weekday >= 0 && rawRule.weekday <= 6
        ? rawRule.weekday
        : undefined;
    const monthDay =
      typeof rawRule.monthDay === 'number' && Number.isInteger(rawRule.monthDay) && rawRule.monthDay >= 1 && rawRule.monthDay <= 31
        ? rawRule.monthDay
        : undefined;
    if (frequency === 'weekly' && weekday === undefined) continue;
    if (frequency === 'monthly' && monthDay === undefined) continue;

    let id = isString(rawRule.id) && rawRule.id.trim() ? rawRule.id.trim() : randomUUID();
    if (ids.has(id)) id = randomUUID();
    ids.add(id);
    const createdAt = isString(rawRule.createdAt) ? rawRule.createdAt : nowIso();
    const content = rawRule.content.trim();

    rules.push({
      id,
      // 早期数据没有任务名称，回退用账单标题充当场外展示名。
      name: isString(rawRule.name) && rawRule.name.trim() ? rawRule.name.trim() : content,
      typeId: rawRule.typeId,
      icon: isBillRecordIcon(rawRule.icon) ? rawRule.icon : getDefaultBillRecordIcon(rawRule.typeId),
      content,
      amountCents: Number(rawRule.amountCents),
      frequency,
      timeOfDay: rawRule.timeOfDay,
      weekday: frequency === 'weekly' ? weekday : undefined,
      monthDay: frequency === 'monthly' ? monthDay : undefined,
      enabled: rawRule.enabled !== false,
      lastGeneratedDate: isString(rawRule.lastGeneratedDate) && isValidDateKey(rawRule.lastGeneratedDate) ? rawRule.lastGeneratedDate : '',
      createdAt,
      updatedAt: isString(rawRule.updatedAt) ? rawRule.updatedAt : createdAt,
    });
  }

  return rules;
};

// 所有读取和导入入口都汇总到同一个规范化函数，避免运行时出现两套数据规则。
export const normalizeData = (value: unknown, strict = false): AppData => {
  if (!isRecord(value)) {
    if (strict) throw new Error('备份文件不是有效的对象。');
    return createDefaultAppData();
  }

  if (strict && (value.schemaVersion !== 1 || !Array.isArray(value.billTypes) || !Array.isArray(value.records))) {
    throw new Error('备份文件结构或版本不受支持。');
  }

  const billTypes = normalizeBillTypes(value.billTypes);
  return {
    schemaVersion: 1,
    billTypes,
    records: normalizeBillRecords(value.records, billTypes),
    // 旧备份没有周期任务字段，缺失时按空列表处理，保持向后兼容。
    recurringRules: normalizeRecurringRules(value.recurringRules, billTypes),
    settings: normalizeSettings(value.settings),
  };
};

export class TaroBillStore {
  private data: AppData;

  constructor(private readonly dataPath: string) {
    this.data = this.load();
  }

  // 启动时创建数据目录并读取 JSON；损坏文件会先改名备份，再恢复默认数据。
  private load(): AppData {
    mkdirSync(path.dirname(this.dataPath), { recursive: true });
    if (!existsSync(this.dataPath)) {
      const data = createDefaultAppData();
      this.write(data);
      return data;
    }

    try {
      const data = normalizeData(JSON.parse(readFileSync(this.dataPath, 'utf8')) as unknown);
      this.write(data);
      return data;
    } catch {
      renameSync(this.dataPath, `${this.dataPath}.corrupt-${Date.now()}`);
      const data = createDefaultAppData();
      this.write(data);
      return data;
    }
  }

  // 先写临时文件再原子替换，减少进程中断导致 JSON 半写入的风险。
  private write(data: AppData): void {
    mkdirSync(path.dirname(this.dataPath), { recursive: true });
    const temporaryPath = `${this.dataPath}.tmp`;
    writeFileSync(temporaryPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
    renameSync(temporaryPath, this.dataPath);
  }

  // 每次提交都规范化并深拷贝返回，阻止调用方修改主进程内存状态。
  private commit(data: AppData): AppData {
    this.data = normalizeData(data);
    this.write(this.data);
    return this.get();
  }

  // 名称比较忽略大小写和首尾空格，避免创建肉眼相同的类型。
  private ensureUniqueTypeName(name: string, excludedTypeId?: string): string {
    const normalized = name.trim();
    if (!normalized) throw new Error('账单类型名称不能为空。');
    const duplicated = this.data.billTypes.some(
      (billType) => billType.id !== excludedTypeId && billType.name.toLocaleLowerCase('zh-CN') === normalized.toLocaleLowerCase('zh-CN'),
    );
    if (duplicated) throw new Error('已经存在同名账单类型。');
    return normalized;
  }

  // 记录输入校验集中在主进程，渲染层校验仅用于即时反馈，不能作为数据安全边界。
  private validateRecordInput(input: BillRecordInput): BillRecordInput {
    const content = input.content.trim();
    if (!content) throw new Error('账单标题不能为空。');
    if (!Number.isSafeInteger(input.amountCents) || input.amountCents <= 0) throw new Error('账单金额无效。');
    if (!isValidLocalDateTime(input.occurredAt)) throw new Error('账单时间无效。');
    if (!isBillRecordIcon(input.icon)) throw new Error('账单图标无效。');
    if (!this.data.billTypes.some((billType) => billType.id === input.typeId)) throw new Error('账单类型不存在。');
    return { ...input, content };
  }

  // 周期任务校验与账单同样严格；与频率无关的星期或日期字段统一清空，避免遗留矛盾数据。
  private validateRuleInput(input: RecurringRuleInput): RecurringRuleInput {
    const name = input.name.trim();
    if (!name) throw new Error('任务名称不能为空。');
    const content = input.content.trim();
    if (!content) throw new Error('账单标题不能为空。');
    if (!Number.isSafeInteger(input.amountCents) || input.amountCents <= 0) throw new Error('账单金额无效。');
    if (!isBillRecordIcon(input.icon)) throw new Error('账单图标无效。');
    if (!this.data.billTypes.some((billType) => billType.id === input.typeId)) throw new Error('账单类型不存在。');
    if (!RECURRING_FREQUENCIES.has(input.frequency)) throw new Error('周期频率无效。');
    if (!isValidTimeOfDay(input.timeOfDay)) throw new Error('执行时间无效。');
    if (input.frequency === 'weekly' && (input.weekday === undefined || !Number.isInteger(input.weekday) || input.weekday < 0 || input.weekday > 6))
      throw new Error('每周任务需要选择星期。');
    if (
      input.frequency === 'monthly' &&
      (input.monthDay === undefined || !Number.isInteger(input.monthDay) || input.monthDay < 1 || input.monthDay > 31)
    )
      throw new Error('每月任务需要选择日期。');
    return {
      ...input,
      name,
      content,
      weekday: input.frequency === 'weekly' ? input.weekday : undefined,
      monthDay: input.frequency === 'monthly' ? input.monthDay : undefined,
    };
  }

  // 返回深拷贝，避免 preload 返回值间接污染缓存。
  get(): AppData {
    return structuredClone(this.data);
  }

  // 新建类型由主进程生成 UUID，并追加在当前排序末尾。
  createBillType(name: string): AppData {
    const normalizedName = this.ensureUniqueTypeName(name);
    return this.commit({
      ...this.data,
      billTypes: [
        ...this.data.billTypes,
        {
          id: randomUUID(),
          name: normalizedName,
          sortOrder: this.data.billTypes.length,
          createdAt: nowIso(),
        },
      ],
    });
  }

  // 重命名只修改名称，不改变类型 ID 和历史账单归属。
  renameBillType(typeId: string, name: string): AppData {
    if (!this.data.billTypes.some((billType) => billType.id === typeId)) throw new Error('账单类型不存在。');
    const normalizedName = this.ensureUniqueTypeName(name, typeId);
    return this.commit({
      ...this.data,
      billTypes: this.data.billTypes.map((billType) => (billType.id === typeId ? { ...billType, name: normalizedName } : billType)),
    });
  }

  // 删除类型会级联删除其账单和周期任务；最后一个类型不可删除，保证新建账单始终有归属。
  deleteBillType(typeId: string): AppData {
    if (this.data.billTypes.length <= 1) throw new Error('至少需要保留一个账单类型。');
    if (!this.data.billTypes.some((billType) => billType.id === typeId)) throw new Error('账单类型不存在。');
    return this.commit({
      ...this.data,
      billTypes: this.data.billTypes.filter((billType) => billType.id !== typeId).map((billType, index) => ({ ...billType, sortOrder: index })),
      records: this.data.records.filter((record) => record.typeId !== typeId),
      recurringRules: this.data.recurringRules.filter((rule) => rule.typeId !== typeId),
    });
  }

  // 新建账单使用本地发生时间，并记录独立的 UTC 创建时间用于稳定排序。
  createBillRecord(input: BillRecordInput): AppData {
    const validated = this.validateRecordInput(input);
    const timestamp = nowIso();
    return this.commit({
      ...this.data,
      records: [
        ...this.data.records,
        {
          id: randomUUID(),
          ...validated,
          createdAt: timestamp,
          updatedAt: timestamp,
        },
      ],
    });
  }

  // 编辑账单保留创建时间，只刷新业务字段和更新时间。
  updateBillRecord(recordId: string, input: BillRecordInput): AppData {
    if (!this.data.records.some((record) => record.id === recordId)) throw new Error('账单记录不存在。');
    const validated = this.validateRecordInput(input);
    return this.commit({
      ...this.data,
      records: this.data.records.map((record) => (record.id === recordId ? { ...record, ...validated, updatedAt: nowIso() } : record)),
    });
  }

  // 删除不存在的记录会明确报错，避免界面误以为操作成功。
  deleteBillRecord(recordId: string): AppData {
    if (!this.data.records.some((record) => record.id === recordId)) throw new Error('账单记录不存在。');
    return this.commit({ ...this.data, records: this.data.records.filter((record) => record.id !== recordId) });
  }

  // 新建任务从创建日开始计算补账，进度字段由主进程维护，不接受外部传入。
  createRecurringRule(input: RecurringRuleInput): AppData {
    const validated = this.validateRuleInput(input);
    const timestamp = nowIso();
    return this.commit({
      ...this.data,
      recurringRules: [
        ...this.data.recurringRules,
        {
          id: randomUUID(),
          ...validated,
          lastGeneratedDate: '',
          createdAt: timestamp,
          updatedAt: timestamp,
        },
      ],
    });
  }

  // 编辑任务保留生成进度，已生成过的周期不会因为修改时间或频率而重复记账。
  // 停用时把进度推进到当天：停用期间（含当天剩余触发）一律不记账，重新启用也不会补这段账单。
  updateRecurringRule(ruleId: string, input: RecurringRuleInput): AppData {
    const previous = this.data.recurringRules.find((rule) => rule.id === ruleId);
    if (!previous) throw new Error('周期任务不存在。');
    const validated = this.validateRuleInput(input);
    const pausedNow = previous.enabled && !validated.enabled;
    const lastGeneratedDate = pausedNow ? getLocalDateKey(new Date()) : previous.lastGeneratedDate;
    return this.commit({
      ...this.data,
      recurringRules: this.data.recurringRules.map((rule) =>
        rule.id === ruleId ? { ...rule, ...validated, lastGeneratedDate, updatedAt: nowIso() } : rule,
      ),
    });
  }

  // 删除任务不影响已生成的账单，它们继续保留自动记账标识。
  deleteRecurringRule(ruleId: string): AppData {
    if (!this.data.recurringRules.some((rule) => rule.id === ruleId)) throw new Error('周期任务不存在。');
    return this.commit({ ...this.data, recurringRules: this.data.recurringRules.filter((rule) => rule.id !== ruleId) });
  }

  // 启动和定时检查共用的补账入口：有实际生成时提交写盘并返回新数据，否则返回 null 避免无谓 IO。
  applyRecurringRules(now: Date): AppData | null {
    const next = applyRecurringRulesToData(this.data, now);
    return next ? this.commit(next) : null;
  }

  // 设置页只修改主题，窗口位置由主进程独立保存，避免旧界面状态覆盖最新 Bounds。
  updateTheme(theme: AppSettings['theme']): AppData {
    return this.commit({
      ...this.data,
      settings: { ...this.data.settings, theme: theme === 'dark' ? 'dark' : 'light' },
    });
  }

  // 窗口 Bounds 来自主进程可信值，只规范化设置并在确有变化时写盘，避免重复扫描全部账单。
  updateWindowBounds(bounds: WindowBounds): void {
    const nextWindow = normalizeSettings({ window: bounds, theme: this.data.settings.theme }).window;
    const currentWindow = this.data.settings.window;
    if (
      currentWindow.x === nextWindow.x &&
      currentWindow.y === nextWindow.y &&
      currentWindow.width === nextWindow.width &&
      currentWindow.height === nextWindow.height
    )
      return;

    this.data = {
      ...this.data,
      settings: { ...this.data.settings, window: nextWindow },
    };
    this.write(this.data);
  }

  // 导出直接使用当前缓存，保证文件内容与界面已确认的状态一致。
  exportTo(filePath: string): void {
    writeFileSync(filePath, `${JSON.stringify(this.data, null, 2)}\n`, 'utf8');
  }

  // 导入使用严格结构检查，成功后才替换当前数据文件。
  importFrom(filePath: string): AppData {
    const imported = normalizeData(JSON.parse(readFileSync(filePath, 'utf8')) as unknown, true);
    return this.commit(imported);
  }
}

// 数据固定放在 Electron userData 目录，应用升级和安装路径变化不会影响账单。
export const getDataPath = (userDataPath: string): string => path.join(userDataPath, 'data.json');
