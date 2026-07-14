import { app, BrowserWindow } from 'electron'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

const projectRoot = path.resolve(import.meta.dirname, '..')
const svgPath = path.join(projectRoot, 'assets/app-icons/tarobill.svg')
const pngPath = path.join(projectRoot, 'assets/app-icons/tarobill.png')

// 透明隐藏窗口由 Chromium 渲染 SVG，避免 Quick Look 导出时填充整块白色背景。
const renderIcon = async () => {
  const svg = await readFile(svgPath, 'utf8')
  const renderWindow = new BrowserWindow({
    width: 1024,
    height: 1024,
    useContentSize: true,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    webPreferences: { offscreen: true }
  })
  const page = `<style>html,body{width:100%;height:100%;margin:0;overflow:hidden;background:transparent}svg{display:block;width:100%;height:100%}</style>${svg}`
  await renderWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(page)}`)
  const image = await renderWindow.webContents.capturePage()
  // Retina 屏幕 capturePage 会得到 2x 位图，统一缩回与 TaroNote 相同的 1024px 源图。
  await writeFile(pngPath, image.resize({ width: 1024, height: 1024, quality: 'best' }).toPNG())
  renderWindow.destroy()
  app.quit()
}

app.whenReady().then(() => void renderIcon())
