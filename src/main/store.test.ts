import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { normalizeData, TaroBillStore } from './store'
import { createDefaultAppData } from '../shared/types'
import type { BillRecordIcon } from '../shared/types'

const temporaryDirectories: string[] = []

// 每个测试使用独立目录，模拟真实 data.json 且互不污染。
const createStore = (): TaroBillStore => {
  const directory = mkdtempSync(path.join(tmpdir(), 'tarobill-test-'))
  temporaryDirectories.push(directory)
  return new TaroBillStore(path.join(directory, 'data.json'))
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

describe('TaroBillStore', () => {
  it('首次启动创建两个默认类型且没有演示账单', () => {
    const store = createStore()
    const data = store.get()
    expect(data.billTypes.map((item) => item.name)).toEqual(['AI账单', '药屋账单'])
    expect(data.records).toEqual([])
  })

  it('新建、编辑和删除账单会原子写回 JSON', () => {
    const store = createStore()
    const typeId = store.get().billTypes[0].id
    let data = store.createBillRecord({ typeId, icon: 'sparkles', content: ' 会员订阅 ', amountCents: 14000, occurredAt: '2026-07-14T10:25' })
    expect(data.records[0].content).toBe('会员订阅')

    data = store.updateBillRecord(data.records[0].id, { typeId, icon: 'smartphone', content: '接口充值', amountCents: 25000, occurredAt: '2026-07-15T09:30' })
    expect(data.records[0].amountCents).toBe(25000)
    expect(data.records[0].icon).toBe('smartphone')
    const onDisk = JSON.parse(readFileSync(path.join(temporaryDirectories[0], 'data.json'), 'utf8')) as typeof data
    expect(onDisk.records[0].content).toBe('接口充值')

    data = store.deleteBillRecord(data.records[0].id)
    expect(data.records).toHaveLength(0)
  })

  it('删除类型会级联删除记录，并禁止删除最后一个类型', () => {
    const store = createStore()
    const firstTypeId = store.get().billTypes[0].id
    store.createBillRecord({ typeId: firstTypeId, icon: 'sparkles', content: '模型订阅', amountCents: 9900, occurredAt: '2026-07-14T10:25' })

    let data = store.deleteBillType(firstTypeId)
    expect(data.records).toHaveLength(0)
    expect(data.billTypes).toHaveLength(1)
    expect(() => store.deleteBillType(data.billTypes[0].id)).toThrow('至少需要保留一个账单类型')
  })

  it('拒绝同名类型和无效发生时间', () => {
    const store = createStore()
    expect(() => store.createBillType('AI账单')).toThrow('已经存在同名账单类型')
    const typeId = store.get().billTypes[0].id
    expect(() => store.createBillRecord({ typeId, icon: 'receipt-text', content: '错误日期', amountCents: 100, occurredAt: '2026-02-30T10:00' })).toThrow('账单时间无效')
  })

  it('接受完整 Lucide 图标并拒绝不存在的图标名称', () => {
    const store = createStore()
    const typeId = store.get().billTypes[0].id
    const data = store.createBillRecord({ typeId, icon: 'brain-circuit', content: '模型服务', amountCents: 100, occurredAt: '2026-07-14T10:00' })
    expect(data.records[0].icon).toBe('brain-circuit')
    expect(() => store.createBillRecord({
      typeId,
      icon: 'not-a-real-lucide-icon' as BillRecordIcon,
      content: '无效图标',
      amountCents: 100,
      occurredAt: '2026-07-14T10:00'
    })).toThrow('账单图标无效')
  })

  it('旧账单缺少图标时会按分类补充默认图标', () => {
    const legacyData = createDefaultAppData() as unknown as Record<string, unknown>
    legacyData.records = [
      {
        id: 'legacy-record',
        typeId: 'ai-bills',
        content: '旧账单',
        amountCents: 100,
        occurredAt: '2026-07-14T10:00',
        createdAt: '2026-07-14T02:00:00.000Z',
        updatedAt: '2026-07-14T02:00:00.000Z'
      }
    ]
    expect(normalizeData(legacyData).records[0].icon).toBe('sparkles')
  })

  it('导入时会修复重复名称、无效排序和窗口数值', () => {
    const input = createDefaultAppData() as unknown as Record<string, unknown>
    input.billTypes = [
      { id: '1', name: '订阅', sortOrder: 0, createdAt: '2026-01-01T00:00:00.000Z' },
      { id: '2', name: '订阅 2', sortOrder: Number.NaN, createdAt: '2026-01-01T00:00:00.000Z' },
      { id: '3', name: '订阅', sortOrder: 2, createdAt: '2026-01-01T00:00:00.000Z' }
    ]
    input.settings = { theme: 'light', window: { x: 10.6, y: Number.POSITIVE_INFINITY, width: Number.POSITIVE_INFINITY, height: 900 } }

    const normalized = normalizeData(input)
    expect(normalized.billTypes.map((item) => item.name)).toEqual(['订阅', '订阅 2', '订阅 3'])
    expect(normalized.settings.window).toEqual({ x: 11, y: undefined, width: 1360, height: 900 })
  })
})
