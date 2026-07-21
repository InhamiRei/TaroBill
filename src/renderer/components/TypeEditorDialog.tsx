import { useState } from 'react';
import { Tags, X } from 'lucide-react';
import { useEscapeClose } from './useEscapeClose';

type TypeEditorDialogProps = {
  initialName?: string;
  onClose: () => void;
  onSave: (name: string) => Promise<boolean>;
};

// 类型新增和重命名共用小型弹窗，错误由主进程返回后保留当前名称。
export function TypeEditorDialog({ initialName = '', onClose, onSave }: TypeEditorDialogProps) {
  const [name, setName] = useState(initialName);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  useEscapeClose(onClose);

  // Enter 与保存按钮共用提交方法，避免两种入口校验不一致。
  const handleSave = async () => {
    if (!name.trim()) {
      setError('请输入账单类型名称。');
      return;
    }
    setSaving(true);
    setError('');
    const saved = await onSave(name.trim());
    setSaving(false);
    if (saved) onClose();
  };

  return (
    <div className="dialog-backdrop no-drag" role="presentation">
      <section className="dialog small-dialog type-dialog" role="dialog" aria-modal="true" aria-labelledby="type-dialog-title">
        <header className="dialog-header type-dialog-header">
          <h2 id="type-dialog-title">{initialName ? '重命名账单分类' : '新增账单分类'}</h2>
          <button className="icon-button" title="关闭" onClick={onClose}>
            <X size={18} />
          </button>
        </header>
        <div className="dialog-body form-stack">
          <label className="field-row">
            <Tags size={18} />
            <span>
              <em>类型名称</em>
              <input
                autoFocus
                value={name}
                placeholder="例如：工具订阅"
                onChange={(event) => setName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') void handleSave();
                }}
              />
            </span>
          </label>
          {error && <p className="form-error">{error}</p>}
        </div>
        <footer className="dialog-actions">
          <button className="secondary-button" onClick={onClose}>
            取消
          </button>
          <button className="primary-button" disabled={saving} onClick={() => void handleSave()}>
            {saving ? '保存中…' : '保存'}
          </button>
        </footer>
      </section>
    </div>
  );
}
