import { app, BrowserWindow } from 'electron'
import { writeFile } from 'node:fs/promises'

const [, , url, outputPath, widthText = '1360', heightText = '840', theme = 'light', view = 'month'] = process.argv
const width = Number(widthText)
const height = Number(heightText)

// 视觉 QA 使用只存在于预览 localStorage 的样例，不会进入产品默认数据或用户目录。
const createPreviewData = () => ({
  schemaVersion: 1,
  billTypes: [
    { id: 'ai-bills', name: 'AI账单', sortOrder: 0, createdAt: '2026-01-01T00:00:00.000Z' },
    { id: 'medicine-bills', name: '药屋账单', sortOrder: 1, createdAt: '2026-01-01T00:00:00.000Z' }
  ],
  records: [
    { id: '1', typeId: 'ai-bills', icon: 'sparkles', content: '会员订阅', amountCents: 14000, occurredAt: '2026-07-14T10:25', createdAt: '2026-07-14T02:25:00.000Z', updatedAt: '2026-07-14T02:25:00.000Z' },
    { id: '2', typeId: 'ai-bills', icon: 'smartphone', content: '接口充值', amountCents: 50000, occurredAt: '2026-07-10T16:40', createdAt: '2026-07-10T08:40:00.000Z', updatedAt: '2026-07-10T08:40:00.000Z' },
    { id: '3', typeId: 'ai-bills', icon: 'receipt-text', content: '模型订阅', amountCents: 14350, occurredAt: '2026-07-03T09:10', createdAt: '2026-07-03T01:10:00.000Z', updatedAt: '2026-07-03T01:10:00.000Z' },
    { id: '4', typeId: 'ai-bills', icon: 'gift', content: '创作工具', amountCents: 14400, occurredAt: '2026-06-18T11:20', createdAt: '2026-06-18T03:20:00.000Z', updatedAt: '2026-06-18T03:20:00.000Z' },
    { id: '5', typeId: 'ai-bills', icon: 'graduation-cap', content: '模型服务年度充值', amountCents: 120000, occurredAt: '2026-02-08T14:00', createdAt: '2026-02-08T06:00:00.000Z', updatedAt: '2026-02-08T06:00:00.000Z' },
    { id: '6', typeId: 'medicine-bills', icon: 'pill', content: '家庭常备药', amountCents: 8600, occurredAt: '2026-07-12T18:30', createdAt: '2026-07-12T10:30:00.000Z', updatedAt: '2026-07-12T10:30:00.000Z' }
  ],
  settings: { theme, window: { width, height } }
})

// 隐藏窗口加载真实 Vite 页面、注入预览数据并用 Electron capturePage 输出 PNG。
const capture = async () => {
  const previewWindow = new BrowserWindow({ width, height, show: false, backgroundColor: theme === 'dark' ? '#202020' : '#f7f7f7' })
  await previewWindow.loadURL(url)
  await previewWindow.webContents.executeJavaScript(
    `localStorage.setItem('tarobill-preview-data-v1', ${JSON.stringify(JSON.stringify(createPreviewData()))}); location.reload()`
  ).catch(() => undefined)
  await new Promise((resolve) => setTimeout(resolve, 900))
  // Hover 场景移动真实指针到首条记录，验证操作按钮只替换金额区域而不会覆盖正文。
  if (view === 'hover') {
    const point = await previewWindow.webContents.executeJavaScript(`(() => {
      const rect = document.querySelector('.record-side')?.getBoundingClientRect()
      return rect ? { x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + rect.height / 2) } : null
    })()`)
    if (point) previewWindow.webContents.sendInputEvent({ type: 'mouseMove', x: point.x, y: point.y })
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  // 分类新增按钮场景使用真实指针触发 hover，检查背景与图标中心完全重合。
  if (view === 'sidebar') {
    const point = await previewWindow.webContents.executeJavaScript(`(() => {
      const rect = document.querySelector('.sidebar-heading button')?.getBoundingClientRect()
      return rect ? { x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + rect.height / 2) } : null
    })()`)
    if (point) previewWindow.webContents.sendInputEvent({ type: 'mouseMove', x: point.x, y: point.y })
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  // 分类操作场景悬停首行，验证删除按钮与新增按钮的右侧基准一致。
  if (view === 'type-hover') {
    const point = await previewWindow.webContents.executeJavaScript(`(() => {
      const rect = document.querySelector('.type-row')?.getBoundingClientRect()
      return rect ? { x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + rect.height / 2) } : null
    })()`)
    if (point) previewWindow.webContents.sendInputEvent({ type: 'mouseMove', x: point.x, y: point.y })
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  // 编辑器场景通过真实新增按钮打开弹窗，检查输入焦点和日期控件的最终样式。
  if (view === 'editor') {
    await previewWindow.webContents.executeJavaScript("document.querySelector('.records-add')?.click()")
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  // 遮罩防误触场景模拟点击弹窗外区域，弹窗必须继续保留。
  if (view === 'backdrop') {
    await previewWindow.webContents.executeJavaScript("document.querySelector('.records-add')?.click()")
    await new Promise((resolve) => setTimeout(resolve, 150))
    await previewWindow.webContents.executeJavaScript("document.querySelector('.dialog-backdrop')?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))")
    await new Promise((resolve) => setTimeout(resolve, 150))
  }
  // 图标场景展开 Lucide 图标面板，检查新增账单时的选择入口。
  if (view === 'icons' || view === 'icons-all') {
    await previewWindow.webContents.executeJavaScript("document.querySelector('.records-add')?.click()")
    await new Promise((resolve) => setTimeout(resolve, 150))
    await previewWindow.webContents.executeJavaScript("document.querySelector('.record-icon-select')?.click()")
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  // 完整图标场景切换到 Lucide 官方库并等待受控并发加载完成，验证不再统一回退成账单图标。
  if (view === 'icons-all') {
    await previewWindow.webContents.executeJavaScript("document.querySelector('.record-icon-tabs button:last-child')?.click()")
    await new Promise((resolve) => setTimeout(resolve, 1600))
  }
  // 时间场景展开自定义日期面板，检查其不会再触发系统原生日期弹层。
  if (view === 'datetime') {
    await previewWindow.webContents.executeJavaScript("document.querySelector('.records-add')?.click()")
    await new Promise((resolve) => setTimeout(resolve, 150))
    await previewWindow.webContents.executeJavaScript("document.querySelector('.datetime-trigger')?.click()")
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  // 设置场景检查中文文案、主题卡片和备份操作的留白。
  if (view === 'settings') {
    await previewWindow.webContents.executeJavaScript("document.querySelector('.sidebar-settings')?.click()")
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  // 重命名场景直接打开首个分类的编辑弹窗，验证标题居中布局。
  if (view === 'type') {
    await previewWindow.webContents.executeJavaScript("document.querySelector('.type-row .type-actions button')?.click()")
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  // 同步输出关键容器的尺寸，避免截图看似正常但实际仍存在隐藏溢出。
  const layoutMetrics = await previewWindow.webContents.executeJavaScript(`
    ['.analytics-pane', '.dashboard', '.records-scroll'].reduce((result, selector) => {
      const element = document.querySelector(selector)
      result[selector] = element
        ? { clientHeight: element.clientHeight, scrollHeight: element.scrollHeight, clientWidth: element.clientWidth, scrollWidth: element.scrollWidth }
        : null
      return result
    }, {})
  `)
  const analyticsChildren = await previewWindow.webContents.executeJavaScript(`(() => {
    const pane = document.querySelector('.analytics-pane')
    if (!pane) return []
    const paneRect = pane.getBoundingClientRect()
    return [...pane.children].map((element) => {
      const rect = element.getBoundingClientRect()
      return { className: element.className, height: rect.height, top: rect.top - paneRect.top, bottom: rect.bottom - paneRect.top }
    })
  })()`)
  const interactionMetrics = await previewWindow.webContents.executeJavaScript(`(() => {
    const amount = document.querySelector('.record-amount')
    const actions = document.querySelector('.record-actions')
    const focusedField = document.querySelector('.field-row:focus-within')
    const addButton = document.querySelector('.sidebar-heading button')?.getBoundingClientRect()
    const firstCount = document.querySelector('.type-select em')?.getBoundingClientRect()
    const lastTypeAction = document.querySelector('.type-actions button:last-child')?.getBoundingClientRect()
    const timeList = document.querySelector('.datetime-time-list')
    const selectedTime = timeList?.querySelector('.selected')
    const iconSvgs = [...document.querySelectorAll('.record-icon-grid button svg')]
    const recordBody = document.querySelector('.record-dialog .dialog-body')
    return {
      amountOpacity: amount ? getComputedStyle(amount).opacity : null,
      actionsOpacity: actions ? getComputedStyle(actions).opacity : null,
      focusedFieldBorder: focusedField ? getComputedStyle(focusedField).borderColor : null,
      focusedFieldShadow: focusedField ? getComputedStyle(focusedField).boxShadow : null,
      sidebarAddCenter: addButton ? addButton.left + addButton.width / 2 : null,
      sidebarCountCenter: firstCount ? firstCount.left + firstCount.width / 2 : null,
      sidebarLastActionCenter: lastTypeAction ? lastTypeAction.left + lastTypeAction.width / 2 : null,
      iconButtonCount: iconSvgs.length,
      iconUniqueSvgCount: new Set(iconSvgs.map((svg) => svg.innerHTML)).size,
      dialogPresent: Boolean(document.querySelector('.dialog')),
      recordBodyScrollbarWidth: recordBody ? getComputedStyle(recordBody).scrollbarWidth : null,
      timeList: timeList && selectedTime ? {
        scrollTop: timeList.scrollTop,
        listOffsetTop: timeList.offsetTop,
        selectedOffsetTop: selectedTime.offsetTop,
        selectedRectTop: selectedTime.getBoundingClientRect().top - timeList.getBoundingClientRect().top,
        clientHeight: timeList.clientHeight
      } : null
    }
  })()`)
  console.info(JSON.stringify({ width, height, theme, view, layoutMetrics, analyticsChildren, interactionMetrics }))
  const image = await previewWindow.webContents.capturePage()
  await writeFile(outputPath, image.toPNG())
  previewWindow.destroy()
  app.quit()
}

app.whenReady().then(() => void capture())
