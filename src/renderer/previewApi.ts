import type { AppData, AppSettings, BillRecordInput, TaroBillApi } from '../shared/types'
import { createDefaultAppData } from '../shared/types'

const previewKey = 'tarobill-preview-data-v1'

// Electron 环境优先使用 preload；普通浏览器只在开发态启用 localStorage 预览 API。
export const getTaroBillApi = (): TaroBillApi => {
  if (window.taroBill) return window.taroBill
  if (!import.meta.env.DEV) throw new Error('TaroBill preload API 不可用。')
  return createPreviewApi()
}

// 预览数据损坏时直接回到默认状态，避免视觉开发被 localStorage 卡住。
const readData = (): AppData => {
  const raw = window.localStorage.getItem(previewKey)
  if (!raw) return createDefaultAppData()
  try {
    return JSON.parse(raw) as AppData
  } catch {
    return createDefaultAppData()
  }
}

// 预览环境统一从这里持久化并返回独立对象，模拟真实 IPC 往返。
const writeData = (data: AppData): AppData => {
  window.localStorage.setItem(previewKey, JSON.stringify(data))
  return structuredClone(data)
}

// 预览环境也执行基本名称校验，让浏览器调试行为尽量接近主进程。
const validateTypeName = (data: AppData, name: string, excludedId?: string): string => {
  const normalized = name.trim()
  if (!normalized) throw new Error('账单类型名称不能为空。')
  if (data.billTypes.some((item) => item.id !== excludedId && item.name === normalized)) throw new Error('已经存在同名账单类型。')
  return normalized
}

// 开发预览 API 复刻业务动作，但不触碰文件系统和原生窗口。
const createPreviewApi = (): TaroBillApi => ({
  getState: async () => writeData(readData()),
  createBillType: async (name) => {
    const data = readData()
    const normalized = validateTypeName(data, name)
    return writeData({
      ...data,
      billTypes: [
        ...data.billTypes,
        { id: crypto.randomUUID(), name: normalized, sortOrder: data.billTypes.length, createdAt: new Date().toISOString() }
      ]
    })
  },
  renameBillType: async (typeId, name) => {
    const data = readData()
    const normalized = validateTypeName(data, name, typeId)
    return writeData({
      ...data,
      billTypes: data.billTypes.map((item) => (item.id === typeId ? { ...item, name: normalized } : item))
    })
  },
  deleteBillType: async (typeId) => {
    const data = readData()
    if (data.billTypes.length <= 1) throw new Error('至少需要保留一个账单类型。')
    return writeData({
      ...data,
      billTypes: data.billTypes.filter((item) => item.id !== typeId).map((item, index) => ({ ...item, sortOrder: index })),
      records: data.records.filter((record) => record.typeId !== typeId)
    })
  },
  createBillRecord: async (input: BillRecordInput) => {
    const data = readData()
    const timestamp = new Date().toISOString()
    return writeData({
      ...data,
      records: [...data.records, { id: crypto.randomUUID(), ...input, content: input.content.trim(), createdAt: timestamp, updatedAt: timestamp }]
    })
  },
  updateBillRecord: async (recordId, input) => {
    const data = readData()
    return writeData({
      ...data,
      records: data.records.map((record) =>
        record.id === recordId ? { ...record, ...input, content: input.content.trim(), updatedAt: new Date().toISOString() } : record
      )
    })
  },
  deleteBillRecord: async (recordId) => {
    const data = readData()
    return writeData({ ...data, records: data.records.filter((record) => record.id !== recordId) })
  },
  updateSettings: async (settings: Pick<AppSettings, 'theme'>) => {
    const data = readData()
    return writeData({ ...data, settings: { ...data.settings, theme: settings.theme } })
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
  onWindowState: () => () => undefined
})

