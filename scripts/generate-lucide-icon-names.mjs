import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import dynamicIconImports from 'lucide-react/dynamicIconImports.js'

const outputPath = resolve('src/shared/lucideIconNames.ts')

// 从当前安装的 Lucide 版本生成稳定名称索引，应用运行时不再加载其 ESM 动态导入文件。
const generateLucideIconNames = () => {
  const iconNames = Object.keys(dynamicIconImports).sort()
  const source = `// 此文件由 scripts/generate-lucide-icon-names.mjs 自动生成，请勿手工编辑。\n` +
    `export const LUCIDE_ICON_NAMES = ${JSON.stringify(iconNames, null, 2)} as const\n\n` +
    `// 共享集合为主进程导入、IPC 和渲染层提供同一份严格名称校验。\n` +
    `export const LUCIDE_ICON_NAME_SET: ReadonlySet<string> = new Set(LUCIDE_ICON_NAMES)\n`
  writeFileSync(outputPath, source, 'utf8')
  console.info(`已生成 ${iconNames.length} 个 Lucide 图标名称：${outputPath}`)
}

generateLucideIconNames()
