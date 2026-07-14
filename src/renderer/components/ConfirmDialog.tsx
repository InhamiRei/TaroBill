import { AlertTriangle, X } from 'lucide-react'

export type ConfirmDialogState = {
  title: string
  message: string
  confirmLabel: string
  danger?: boolean
  onConfirm: () => Promise<void> | void
}

type ConfirmDialogProps = ConfirmDialogState & {
  onClose: () => void
}

// 所有破坏性动作使用统一确认弹窗，清晰展示具体影响后再执行。
export function ConfirmDialog({ title, message, confirmLabel, danger, onConfirm, onClose }: ConfirmDialogProps) {
  // 先关闭弹窗再执行动作，失败提示由上层 Toast 负责，避免弹窗叠加。
  const handleConfirm = () => {
    onClose()
    void onConfirm()
  }

  return (
    <div className="dialog-backdrop no-drag" role="presentation">
      <section className="dialog confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title">
        <header className="dialog-header">
          <div className={danger ? 'confirm-icon danger' : 'confirm-icon'}><AlertTriangle size={20} /></div>
          <button className="icon-button" onClick={onClose}><X size={18} /></button>
        </header>
        <div className="confirm-copy">
          <h2 id="confirm-title">{title}</h2>
          <p>{message}</p>
        </div>
        <footer className="dialog-actions">
          <button className="secondary-button" onClick={onClose}>取消</button>
          <button className={danger ? 'danger-button' : 'primary-button'} onClick={handleConfirm}>{confirmLabel}</button>
        </footer>
      </section>
    </div>
  )
}

