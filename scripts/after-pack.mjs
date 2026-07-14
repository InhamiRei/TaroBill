import { execFile } from 'node:child_process'
import path from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

// macOS 没有分发证书时使用普通 ad-hoc 完整性签名，避免 Hardened Runtime 校验不同组件的 Team ID 而阻止 Electron 启动。
export default async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return

  const appPath = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`)
  await execFileAsync('codesign', ['--force', '--deep', '--sign', '-', '--timestamp=none', appPath])
}
