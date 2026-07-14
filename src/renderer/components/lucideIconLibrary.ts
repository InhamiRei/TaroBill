import { icons as lucideIcons } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { BillRecordIcon } from '../../shared/types'

// Lucide 短横线名称统一转换为静态图标索引使用的 PascalCase，数字名称也能正确映射。
const getLucideExportName = (name: BillRecordIcon): keyof typeof lucideIcons => {
  return name.replace(/^([a-z])|[-_]+([a-z0-9])/g, (_, first: string | undefined, after: string | undefined) => {
    return (first ?? after ?? '').toUpperCase()
  }) as keyof typeof lucideIcons
}

// 完整图标库仅在选择非常用图标或打开“全部图标”时加载，避免阻塞应用首屏。
export const getLucideIconComponent = (name: BillRecordIcon): LucideIcon | undefined => {
  return lucideIcons[getLucideExportName(name)] as LucideIcon | undefined
}
