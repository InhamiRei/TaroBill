import { app, BrowserWindow, dialog, ipcMain, nativeImage } from 'electron';
import type { OpenDialogOptions, Rectangle, SaveDialogOptions } from 'electron';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WINDOW_MIN_HEIGHT, WINDOW_MIN_WIDTH } from '../shared/types';
import type { AppSettings, BillRecordInput, RecurringRuleInput, ResizeEdges } from '../shared/types';
import { getDataPath, TaroBillStore } from './store';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_NAME = 'TaroBill';
const APP_ID = 'com.taro.tarobill';
const APP_AUTHOR = 'Taro';
const isWindows = process.platform === 'win32';

// 包内 productName 决定 macOS Dock 名称；运行时名称和 Windows 应用模型 ID 保持一致。
app.setName(APP_NAME);
app.setAppUserModelId(APP_ID);

let mainWindow: BrowserWindow | undefined;
let store: TaroBillStore;
let boundsSaveTimer: NodeJS.Timeout | undefined;
let resizeSession: { edges: ResizeEdges; startX: number; startY: number; bounds: Rectangle } | null = null;

// 开发态、项目根目录和打包资源目录依次查找 PNG，供 Dock 与 BrowserWindow 共用。
const createAppIcon = () => {
  const iconPaths = [
    path.resolve(__dirname, '../../assets/app-icons/tarobill.png'),
    path.resolve(process.cwd(), 'assets/app-icons/tarobill.png'),
    path.join(process.resourcesPath, 'tarobill.png'),
  ];
  const iconPath = iconPaths.find((candidate) => existsSync(candidate));
  return iconPath ? nativeImage.createFromPath(iconPath) : nativeImage.createEmpty();
};

// 主题同步到 Windows 实色窗口底色，避免启动和切换主题时短暂闪白。
const applyRuntimeTheme = (theme: AppSettings['theme']) => {
  if (isWindows && mainWindow) {
    mainWindow.setBackgroundColor(theme === 'dark' ? '#202020' : '#f7f7f7');
  }
};

// 普通窗口尺寸使用 getNormalBounds 保存，最大化时不会把整屏尺寸污染到下次启动。
const saveWindowBounds = () => {
  if (!mainWindow || !store) return;
  if (boundsSaveTimer) clearTimeout(boundsSaveTimer);
  boundsSaveTimer = undefined;
  if (mainWindow.isDestroyed()) return;
  store.updateWindowBounds(mainWindow.getNormalBounds());
};

// 窗口移动和缩放使用防抖写入，避免拖动过程中频繁落盘。
const scheduleWindowBoundsSave = () => {
  if (!mainWindow || !store) return;
  if (boundsSaveTimer) clearTimeout(boundsSaveTimer);
  boundsSaveTimer = setTimeout(() => {
    saveWindowBounds();
  }, 300);
};

// Windows 自定义缩放始终基于按下时的 Bounds，避免连续移动产生累计误差。
const applyResize = (bounds: Rectangle, edges: ResizeEdges, dx: number, dy: number): Rectangle => {
  let { x, y, width, height } = bounds;
  if (edges.right) width = Math.max(WINDOW_MIN_WIDTH, bounds.width + dx);
  if (edges.bottom) height = Math.max(WINDOW_MIN_HEIGHT, bounds.height + dy);
  if (edges.left) {
    const nextWidth = Math.max(WINDOW_MIN_WIDTH, bounds.width - dx);
    x = bounds.x + bounds.width - nextWidth;
    width = nextWidth;
  }
  if (edges.top) {
    const nextHeight = Math.max(WINDOW_MIN_HEIGHT, bounds.height - dy);
    y = bounds.y + bounds.height - nextHeight;
    height = nextHeight;
  }
  return { x, y, width, height };
};

// 创建普通桌面窗口：保留 TaroNote 的无边框样式，但不置顶、不驻留托盘。
const createMainWindow = () => {
  const { settings } = store.get();
  mainWindow = new BrowserWindow({
    x: settings.window.x,
    y: settings.window.y,
    width: settings.window.width,
    height: settings.window.height,
    minWidth: WINDOW_MIN_WIDTH,
    minHeight: WINDOW_MIN_HEIGHT,
    frame: false,
    transparent: !isWindows,
    show: false,
    resizable: true,
    backgroundColor: isWindows ? (settings.theme === 'dark' ? '#202020' : '#f7f7f7') : '#00000000',
    hasShadow: true,
    title: APP_NAME,
    icon: createAppIcon(),
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show();
    mainWindow?.focus();
  });
  mainWindow.on('move', scheduleWindowBoundsSave);
  mainWindow.on('resize', scheduleWindowBoundsSave);
  // 关闭前立即刷新最后一次普通窗口尺寸，避免拖动后立刻退出时丢失状态。
  mainWindow.on('close', saveWindowBounds);
  mainWindow.on('closed', () => {
    mainWindow = undefined;
  });

  // 最大化状态推送给渲染层，用于切换图标以及取消透明窗口圆角留白。
  const sendWindowState = () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    mainWindow.webContents.send('window:state', { maximized: mainWindow.isMaximized() });
  };
  mainWindow.on('maximize', sendWindowState);
  mainWindow.on('unmaximize', sendWindowState);

  if (process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }
};

// IPC 是唯一写数据和调用系统能力的边界，每个业务动作都对应独立通道。
const registerIpcHandlers = () => {
  ipcMain.handle('data:get', () => store.get());
  ipcMain.handle('types:create', (_event, name: string) => store.createBillType(name));
  ipcMain.handle('types:rename', (_event, typeId: string, name: string) => store.renameBillType(typeId, name));
  ipcMain.handle('types:delete', (_event, typeId: string) => store.deleteBillType(typeId));
  ipcMain.handle('records:create', (_event, input: BillRecordInput) => store.createBillRecord(input));
  ipcMain.handle('records:update', (_event, recordId: string, input: BillRecordInput) => store.updateBillRecord(recordId, input));
  ipcMain.handle('records:delete', (_event, recordId: string) => store.deleteBillRecord(recordId));
  ipcMain.handle('recurring:create', (_event, input: RecurringRuleInput) => store.createRecurringRule(input));
  ipcMain.handle('recurring:update', (_event, ruleId: string, input: RecurringRuleInput) => store.updateRecurringRule(ruleId, input));
  ipcMain.handle('recurring:delete', (_event, ruleId: string) => store.deleteRecurringRule(ruleId));
  ipcMain.handle('settings:update', (_event, settings: Pick<AppSettings, 'theme'>) => {
    const data = store.updateTheme(settings.theme);
    applyRuntimeTheme(data.settings.theme);
    return data;
  });

  ipcMain.handle('dialog:export', async () => {
    const options: SaveDialogOptions = {
      title: '导出账单备份',
      defaultPath: '账单备份.json',
      filters: [{ name: '备份文件', extensions: ['json'] }],
    };
    const result = mainWindow ? await dialog.showSaveDialog(mainWindow, options) : await dialog.showSaveDialog(options);
    if (result.canceled || !result.filePath) return { canceled: true };
    store.exportTo(result.filePath);
    return { canceled: false, filePath: result.filePath };
  });

  ipcMain.handle('dialog:import', async () => {
    const options: OpenDialogOptions = {
      title: '导入账单备份',
      properties: ['openFile'],
      filters: [{ name: '备份文件', extensions: ['json'] }],
    };
    const result = mainWindow ? await dialog.showOpenDialog(mainWindow, options) : await dialog.showOpenDialog(options);
    if (result.canceled || !result.filePaths[0]) return { result: { canceled: true } };
    try {
      const data = store.importFrom(result.filePaths[0]);
      applyRuntimeTheme(data.settings.theme);
      // 导入的备份可能带有周期任务，立即补账而不是等待下一分钟的定时检查。
      const withGenerated = store.applyRecurringRules(new Date()) ?? data;
      return { data: withGenerated, result: { canceled: false, filePath: result.filePaths[0] } };
    } catch (error) {
      return {
        result: {
          canceled: false,
          filePath: result.filePaths[0],
          message: error instanceof Error ? error.message : '导入失败，请检查备份文件。',
        },
      };
    }
  });

  ipcMain.handle('window:close', () => mainWindow?.close());
  ipcMain.handle('window:minimize', () => mainWindow?.minimize());
  ipcMain.handle('window:toggle-maximize', () => {
    if (!mainWindow) return;
    mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize();
  });
  ipcMain.handle('system:get-platform', () => process.platform);
  ipcMain.handle('window:is-maximized', () => mainWindow?.isMaximized() ?? false);

  // Windows 无边框窗口通过渲染层的八条透明边驱动主进程修改 Bounds。
  ipcMain.handle('window:resize-start', (_event, edges: ResizeEdges, pointerX: number, pointerY: number) => {
    if (!mainWindow || !isWindows) return;
    resizeSession = { edges, startX: pointerX, startY: pointerY, bounds: mainWindow.getBounds() };
  });
  ipcMain.handle('window:resize', (_event, pointerX: number, pointerY: number) => {
    if (!mainWindow || !resizeSession || !isWindows) return;
    const { bounds, edges, startX, startY } = resizeSession;
    mainWindow.setBounds(applyResize(bounds, edges, pointerX - startX, pointerY - startY));
  });
  ipcMain.handle('window:resize-end', () => {
    resizeSession = null;
  });
};

// 周期任务由主进程统一调度：启动时先把关闭期间错过的账单补齐，之后对齐每分钟整点检查一次。
// 递归 setTimeout 对齐到整分钟后 0.5 秒，保证设定分钟一到就生成，而不是像 setInterval 那样随机相位最多晚一分钟。
// 窗口未聚焦甚至最小化时也能按时记账；实际生成后推送完整数据让渲染层实时刷新。
const runRecurringRules = () => {
  if (!store) return;
  const next = store.applyRecurringRules(new Date());
  if (next && mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('data:changed', next);
};

const startRecurringScheduler = () => {
  runRecurringRules();
  const scheduleNext = () => {
    const delay = 60_000 - (Date.now() % 60_000) + 500;
    setTimeout(() => {
      runRecurringRules();
      scheduleNext();
    }, delay);
  };
  scheduleNext();
};

app.whenReady().then(() => {
  app.setAboutPanelOptions({
    applicationName: APP_NAME,
    applicationVersion: app.getVersion(),
    authors: [APP_AUTHOR],
    copyright: `Copyright © 2026 ${APP_AUTHOR}`,
  });
  if (process.platform === 'darwin') app.dock.setIcon(createAppIcon());
  store = new TaroBillStore(getDataPath(app.getPath('userData')));
  registerIpcHandlers();
  createMainWindow();
  startRecurringScheduler();
});

// 普通桌面应用关闭最后一个窗口即退出，macOS 也不保留后台进程。
app.on('window-all-closed', () => app.quit());
