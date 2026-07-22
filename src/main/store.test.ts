import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { getLocalDateKey } from '../shared/recurringUtils';
import { normalizeData, TaroBillStore } from './store';
import { createDefaultAppData } from '../shared/types';
import type { BillRecordIcon } from '../shared/types';

const temporaryDirectories: string[] = [];

// 每个测试使用独立目录，模拟真实 data.json 且互不污染。
const createStore = (): TaroBillStore => {
  const directory = mkdtempSync(path.join(tmpdir(), 'tarobill-test-'));
  temporaryDirectories.push(directory);
  return new TaroBillStore(path.join(directory, 'data.json'));
};

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe('TaroBillStore', () => {
  it('首次启动创建两个默认类型且没有演示账单', () => {
    const store = createStore();
    const data = store.get();
    expect(data.billTypes.map((item) => item.name)).toEqual(['AI账单', '药屋账单']);
    expect(data.records).toEqual([]);
  });

  it('新建、编辑和删除账单会原子写回 JSON', () => {
    const store = createStore();
    const typeId = store.get().billTypes[0].id;
    let data = store.createBillRecord({ typeId, icon: 'sparkles', content: ' 会员订阅 ', amountCents: 14000, occurredAt: '2026-07-14T10:25' });
    expect(data.records[0].content).toBe('会员订阅');

    data = store.updateBillRecord(data.records[0].id, {
      typeId,
      icon: 'smartphone',
      content: '接口充值',
      amountCents: 25000,
      occurredAt: '2026-07-15T09:30',
    });
    expect(data.records[0].amountCents).toBe(25000);
    expect(data.records[0].icon).toBe('smartphone');
    const onDisk = JSON.parse(readFileSync(path.join(temporaryDirectories[0], 'data.json'), 'utf8')) as typeof data;
    expect(onDisk.records[0].content).toBe('接口充值');

    data = store.deleteBillRecord(data.records[0].id);
    expect(data.records).toHaveLength(0);
  });

  it('删除类型会级联删除记录，并禁止删除最后一个类型', () => {
    const store = createStore();
    const firstTypeId = store.get().billTypes[0].id;
    store.createBillRecord({ typeId: firstTypeId, icon: 'sparkles', content: '模型订阅', amountCents: 9900, occurredAt: '2026-07-14T10:25' });

    let data = store.deleteBillType(firstTypeId);
    expect(data.records).toHaveLength(0);
    expect(data.billTypes).toHaveLength(1);
    expect(() => store.deleteBillType(data.billTypes[0].id)).toThrow('至少需要保留一个账单类型');
  });

  it('拒绝同名类型和无效发生时间', () => {
    const store = createStore();
    expect(() => store.createBillType('AI账单')).toThrow('已经存在同名账单类型');
    const typeId = store.get().billTypes[0].id;
    expect(() =>
      store.createBillRecord({ typeId, icon: 'receipt-text', content: '错误日期', amountCents: 100, occurredAt: '2026-02-30T10:00' }),
    ).toThrow('账单时间无效');
  });

  it('接受完整 Lucide 图标并拒绝不存在的图标名称', () => {
    const store = createStore();
    const typeId = store.get().billTypes[0].id;
    const data = store.createBillRecord({ typeId, icon: 'brain-circuit', content: '模型服务', amountCents: 100, occurredAt: '2026-07-14T10:00' });
    expect(data.records[0].icon).toBe('brain-circuit');
    expect(() =>
      store.createBillRecord({
        typeId,
        icon: 'not-a-real-lucide-icon' as BillRecordIcon,
        content: '无效图标',
        amountCents: 100,
        occurredAt: '2026-07-14T10:00',
      }),
    ).toThrow('账单图标无效');
  });

  it('旧账单缺少图标时会按分类补充默认图标', () => {
    const legacyData = createDefaultAppData() as unknown as Record<string, unknown>;
    legacyData.records = [
      {
        id: 'legacy-record',
        typeId: 'ai-bills',
        content: '旧账单',
        amountCents: 100,
        occurredAt: '2026-07-14T10:00',
        createdAt: '2026-07-14T02:00:00.000Z',
        updatedAt: '2026-07-14T02:00:00.000Z',
      },
    ];
    expect(normalizeData(legacyData).records[0].icon).toBe('sparkles');
  });

  it('导入时会修复重复名称、无效排序和窗口数值', () => {
    const input = createDefaultAppData() as unknown as Record<string, unknown>;
    input.billTypes = [
      { id: '1', name: '订阅', sortOrder: 0, createdAt: '2026-01-01T00:00:00.000Z' },
      { id: '2', name: '订阅 2', sortOrder: Number.NaN, createdAt: '2026-01-01T00:00:00.000Z' },
      { id: '3', name: '订阅', sortOrder: 2, createdAt: '2026-01-01T00:00:00.000Z' },
    ];
    input.settings = { theme: 'light', window: { x: 10.6, y: Number.POSITIVE_INFINITY, width: Number.POSITIVE_INFINITY, height: 900 } };

    const normalized = normalizeData(input);
    expect(normalized.billTypes.map((item) => item.name)).toEqual(['订阅', '订阅 2', '订阅 3']);
    expect(normalized.settings.window).toEqual({ x: 11, y: undefined, width: 1360, height: 900 });
  });
});

describe('周期任务', () => {
  // 任务输入工厂给出合法的每周一 08:00 默认值，各场景只覆盖差异字段。
  const createRuleInput = (typeId: string) => ({
    name: '每日公交',
    typeId,
    icon: 'sparkles' as const,
    content: '公交地铁',
    amountCents: 200,
    frequency: 'weekly' as const,
    timeOfDay: '08:00',
    weekday: 1,
    enabled: true,
  });

  it('新建、编辑和删除任务会写回 JSON，无关字段按频率清空', () => {
    const store = createStore();
    const typeId = store.get().billTypes[0].id;
    let data = store.createRecurringRule({ ...createRuleInput(typeId), monthDay: 15 });
    expect(data.recurringRules).toHaveLength(1);
    expect(data.recurringRules[0].weekday).toBe(1);
    expect(data.recurringRules[0].monthDay).toBeUndefined();
    expect(data.recurringRules[0].lastGeneratedDate).toBe('');

    const ruleId = data.recurringRules[0].id;
    data = store.updateRecurringRule(ruleId, { ...createRuleInput(typeId), name: ' 每日打车 ', content: '打车' });
    expect(data.recurringRules[0].name).toBe('每日打车');
    expect(data.recurringRules[0].content).toBe('打车');

    const onDisk = JSON.parse(readFileSync(path.join(temporaryDirectories[0], 'data.json'), 'utf8')) as typeof data;
    expect(onDisk.recurringRules[0].name).toBe('每日打车');

    data = store.deleteRecurringRule(ruleId);
    expect(data.recurringRules).toHaveLength(0);
    expect(() => store.deleteRecurringRule(ruleId)).toThrow('周期任务不存在');
  });

  it('拒绝空任务名称、非法频率、缺失的星期日期和不存在的类型', () => {
    const store = createStore();
    const typeId = store.get().billTypes[0].id;
    expect(() => store.createRecurringRule({ ...createRuleInput(typeId), name: '   ' })).toThrow('任务名称不能为空');
    expect(() => store.createRecurringRule({ ...createRuleInput(typeId), weekday: undefined })).toThrow('每周任务需要选择星期');
    expect(() => store.createRecurringRule({ ...createRuleInput(typeId), frequency: 'monthly', monthDay: 32 })).toThrow('每月任务需要选择日期');
    expect(() => store.createRecurringRule({ ...createRuleInput(typeId), typeId: 'missing-type' })).toThrow('账单类型不存在');
    expect(() => store.createRecurringRule({ ...createRuleInput(typeId), timeOfDay: '25:00' })).toThrow('执行时间无效');
  });

  it('停用任务会把生成进度推进到当天，重新启用也不补停用期间的账单', () => {
    const store = createStore();
    const typeId = store.get().billTypes[0].id;
    let data = store.createRecurringRule({ ...createRuleInput(typeId), frequency: 'daily', weekday: undefined });
    const ruleId = data.recurringRules[0].id;
    const todayKey = getLocalDateKey(new Date());

    data = store.updateRecurringRule(ruleId, { ...createRuleInput(typeId), frequency: 'daily', enabled: false });
    expect(data.recurringRules[0].enabled).toBe(false);
    expect(data.recurringRules[0].lastGeneratedDate).toBe(todayKey);

    // 重新启用后进度保持，不会把停用期间错过的周期补成账单。
    data = store.updateRecurringRule(ruleId, { ...createRuleInput(typeId), frequency: 'daily', enabled: true });
    expect(data.recurringRules[0].lastGeneratedDate).toBe(todayKey);
    expect(store.applyRecurringRules(new Date())).toBeNull();
    expect(store.get().records).toHaveLength(0);
  });

  it('删除类型会级联删除其周期任务', () => {
    const store = createStore();
    const firstTypeId = store.get().billTypes[0].id;
    store.createRecurringRule(createRuleInput(firstTypeId));

    const data = store.deleteBillType(firstTypeId);
    expect(data.recurringRules).toHaveLength(0);
  });

  it('补账生成带任务标识的账单，重复执行不再生成', () => {
    const store = createStore();
    const typeId = store.get().billTypes[0].id;
    store.createRecurringRule({ ...createRuleInput(typeId), frequency: 'daily', weekday: undefined });

    const data = store.applyRecurringRules(new Date());
    expect(data).not.toBeNull();
    expect(data?.records).toHaveLength(1);
    expect(data?.records[0].ruleId).toBe(data?.recurringRules[0].id);
    expect(data?.records[0].occurredAt.endsWith('T08:00')).toBe(true);
    expect(data?.recurringRules[0].lastGeneratedDate).toBe(data?.records[0].occurredAt.slice(0, 10));

    expect(store.applyRecurringRules(new Date())).toBeNull();
    expect(store.get().records).toHaveLength(1);
  });

  it('旧备份缺少任务字段时按空列表处理，账单保留自动记账标识', () => {
    const legacyData = createDefaultAppData() as unknown as Record<string, unknown>;
    delete legacyData.recurringRules;
    legacyData.records = [
      {
        id: 'auto-record',
        typeId: 'ai-bills',
        icon: 'sparkles',
        content: '公交地铁',
        amountCents: 200,
        occurredAt: '2026-07-14T08:00',
        ruleId: 'some-rule',
        createdAt: '2026-07-14T00:00:00.000Z',
        updatedAt: '2026-07-14T00:00:00.000Z',
      },
    ];

    const normalized = normalizeData(legacyData);
    expect(normalized.recurringRules).toEqual([]);
    expect(normalized.records[0].ruleId).toBe('some-rule');
  });

  it('导入时丢弃归属缺失类型或缺少星期日期的任务', () => {
    const input = createDefaultAppData() as unknown as Record<string, unknown>;
    input.recurringRules = [
      { id: 'ok', typeId: 'ai-bills', icon: 'sparkles', content: '公交', amountCents: 200, frequency: 'daily', timeOfDay: '08:00', enabled: true },
      {
        id: 'bad-type',
        typeId: 'missing',
        icon: 'sparkles',
        content: '公交',
        amountCents: 200,
        frequency: 'daily',
        timeOfDay: '08:00',
        enabled: true,
      },
      {
        id: 'bad-week',
        typeId: 'ai-bills',
        icon: 'sparkles',
        content: '周报',
        amountCents: 100,
        frequency: 'weekly',
        timeOfDay: '08:00',
        enabled: true,
      },
      {
        id: 'bad-time',
        typeId: 'ai-bills',
        icon: 'sparkles',
        content: '月租',
        amountCents: 100,
        frequency: 'monthly',
        monthDay: 1,
        timeOfDay: '8点',
        enabled: true,
      },
    ];

    const normalized = normalizeData(input);
    expect(normalized.recurringRules.map((rule) => rule.id)).toEqual(['ok']);
    // 早期数据没有任务名称字段，回退用账单标题作为展示名。
    expect(normalized.recurringRules[0].name).toBe('公交');
    expect(normalized.recurringRules[0].lastGeneratedDate).toBe('');
    expect(normalized.recurringRules[0].enabled).toBe(true);
  });
});
