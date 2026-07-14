import { contextBridge, ipcRenderer } from 'electron'
import type { TaroBillApi, WindowState } from '../shared/types'

// preload 只负责把命名清晰的 IPC 白名单桥接给渲染进程。
const api: TaroBillApi = {
  getState: () => ipcRenderer.invoke('data:get'),
  createBillType: (name) => ipcRenderer.invoke('types:create', name),
  renameBillType: (typeId, name) => ipcRenderer.invoke('types:rename', typeId, name),
  deleteBillType: (typeId) => ipcRenderer.invoke('types:delete', typeId),
  createBillRecord: (input) => ipcRenderer.invoke('records:create', input),
  updateBillRecord: (recordId, input) => ipcRenderer.invoke('records:update', recordId, input),
  deleteBillRecord: (recordId) => ipcRenderer.invoke('records:delete', recordId),
  updateSettings: (settings) => ipcRenderer.invoke('settings:update', settings),
  exportData: () => ipcRenderer.invoke('dialog:export'),
  importData: () => ipcRenderer.invoke('dialog:import'),
  closeWindow: () => ipcRenderer.invoke('window:close'),
  minimizeWindow: () => ipcRenderer.invoke('window:minimize'),
  toggleMaximize: () => ipcRenderer.invoke('window:toggle-maximize'),
  getPlatform: () => ipcRenderer.invoke('system:get-platform'),
  startResize: (edges, pointerX, pointerY) => ipcRenderer.invoke('window:resize-start', edges, pointerX, pointerY),
  resize: (pointerX, pointerY) => ipcRenderer.invoke('window:resize', pointerX, pointerY),
  endResize: () => ipcRenderer.invoke('window:resize-end'),
  isMaximized: () => ipcRenderer.invoke('window:is-maximized'),
  onWindowState: (callback) => {
    const listener = (_event: unknown, state: WindowState) => callback(state)
    ipcRenderer.on('window:state', listener)
    return () => ipcRenderer.removeListener('window:state', listener)
  }
}

contextBridge.exposeInMainWorld('taroBill', api)

