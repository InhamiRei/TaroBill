import { LUCIDE_ICON_NAMES, LUCIDE_ICON_NAME_SET } from './lucideIconNames'

export type ThemeMode = 'light' | 'dark'

export type BillRecordIcon = (typeof LUCIDE_ICON_NAMES)[number]

// 共享层直接使用生成的真实 Lucide 索引校验，主进程和渲染层不会接受不存在的名称。
export const isBillRecordIcon = (value: unknown): value is BillRecordIcon => {
  return typeof value === 'string' && LUCIDE_ICON_NAME_SET.has(value)
}

// 旧账单没有图标字段时继续沿用两个默认分类的语义图标。
export const getDefaultBillRecordIcon = (typeId: string): BillRecordIcon => {
  if (typeId === 'ai-bills') return 'sparkles'
  if (typeId === 'medicine-bills') return 'pill'
  return 'receipt-text'
}

export type BillType = {
  id: string
  name: string
  sortOrder: number
  createdAt: string
}

export type BillRecord = {
  id: string
  typeId: string
  icon: BillRecordIcon
  content: string
  amountCents: number
  occurredAt: string
  createdAt: string
  updatedAt: string
}

export type WindowBounds = {
  x?: number
  y?: number
  width: number
  height: number
}

export type AppSettings = {
  theme: ThemeMode
  window: WindowBounds
}

export type AppData = {
  schemaVersion: 1
  billTypes: BillType[]
  records: BillRecord[]
  settings: AppSettings
}

// 窗口最小尺寸集中定义，保证原生窗口限制和持久化尺寸校验始终使用同一组值。
export const WINDOW_MIN_WIDTH = 1100
export const WINDOW_MIN_HEIGHT = 768

export type BillRecordInput = Pick<BillRecord, 'content' | 'amountCents' | 'occurredAt' | 'typeId' | 'icon'>

export type DialogResult = {
  canceled: boolean
  filePath?: string
  message?: string
}

// 缩放方向用四条边组合，既能表达单边，也能表达四个窗口角。
export type ResizeEdges = {
  left?: boolean
  right?: boolean
  top?: boolean
  bottom?: boolean
}

export type WindowState = {
  maximized: boolean
}

export type ImportResult = {
  data?: AppData
  result: DialogResult
}

// preload 仅暴露业务所需的白名单方法，渲染层不能直接访问 Node 或文件系统。
export type TaroBillApi = {
  getState: () => Promise<AppData>
  createBillType: (name: string) => Promise<AppData>
  renameBillType: (typeId: string, name: string) => Promise<AppData>
  deleteBillType: (typeId: string) => Promise<AppData>
  createBillRecord: (input: BillRecordInput) => Promise<AppData>
  updateBillRecord: (recordId: string, input: BillRecordInput) => Promise<AppData>
  deleteBillRecord: (recordId: string) => Promise<AppData>
  updateSettings: (settings: Pick<AppSettings, 'theme'>) => Promise<AppData>
  exportData: () => Promise<DialogResult>
  importData: () => Promise<ImportResult>
  closeWindow: () => Promise<void>
  minimizeWindow: () => Promise<void>
  toggleMaximize: () => Promise<void>
  getPlatform: () => Promise<string>
  startResize: (edges: ResizeEdges, pointerX: number, pointerY: number) => Promise<void>
  resize: (pointerX: number, pointerY: number) => Promise<void>
  endResize: () => Promise<void>
  isMaximized: () => Promise<boolean>
  onWindowState: (callback: (state: WindowState) => void) => () => void
}

export const DEFAULT_BILL_TYPES: BillType[] = [
  {
    id: 'ai-bills',
    name: 'AI账单',
    sortOrder: 0,
    createdAt: '2026-01-01T00:00:00.000Z'
  },
  {
    id: 'medicine-bills',
    name: '药屋账单',
    sortOrder: 1,
    createdAt: '2026-01-01T00:00:00.000Z'
  }
]

export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'light',
  window: {
    width: 1360,
    height: 900
  }
}

// 默认数据每次都创建新对象，避免测试或预览环境共享可变数组。
export const createDefaultAppData = (): AppData => ({
  schemaVersion: 1,
  billTypes: DEFAULT_BILL_TYPES.map((billType) => ({ ...billType })),
  records: [],
  settings: {
    ...DEFAULT_SETTINGS,
    window: { ...DEFAULT_SETTINGS.window }
  }
})
