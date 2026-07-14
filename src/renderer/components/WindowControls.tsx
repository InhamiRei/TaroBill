import { Copy, Minus, Square, X } from 'lucide-react'
import { getTaroBillApi } from '../previewApi'

const api = getTaroBillApi()

type WindowControlsProps = {
  maximized: boolean
}

// Windows 无原生标题栏，使用与工具栏一致的三个轻量窗控按钮。
export function WindowControls({ maximized }: WindowControlsProps) {
  return (
    <div className="window-controls">
      <button className="icon-button" title="最小化" onClick={() => void api.minimizeWindow()}>
        <Minus size={16} />
      </button>
      <button className="icon-button" title={maximized ? '还原' : '最大化'} onClick={() => void api.toggleMaximize()}>
        {maximized ? <Copy size={14} /> : <Square size={14} />}
      </button>
      <button className="icon-button close-button" title="关闭" onClick={() => void api.closeWindow()}>
        <X size={16} />
      </button>
    </div>
  )
}

