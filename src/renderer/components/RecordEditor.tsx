import { useState } from 'react';
import { CircleDollarSign, FileText, X } from 'lucide-react';
import { formatAmountForInput, formatLocalDateTime, parseAmountToCents } from '../../shared/billUtils';
import type { BillRecord, BillRecordIcon, BillRecordInput } from '../../shared/types';
import { getDefaultBillRecordIcon, isBillRecordIcon } from '../../shared/types';
import { DateTimePicker } from './DateTimePicker';
import { IconPickerField } from './IconPickerField';
import { useEscapeClose } from './useEscapeClose';

type RecordEditorProps = {
  typeId: string;
  typeName: string;
  record: BillRecord | null;
  onClose: () => void;
  onSave: (recordId: string | null, input: BillRecordInput) => Promise<boolean>;
};

// 新建和编辑共用一个受控弹窗，保存失败时保留输入内容便于修正或重试。
export function RecordEditor({ typeId, typeName, record, onClose, onSave }: RecordEditorProps) {
  const [content, setContent] = useState(record?.content ?? '');
  const [amount, setAmount] = useState(record ? formatAmountForInput(record.amountCents) : '');
  const [occurredAt, setOccurredAt] = useState(record?.occurredAt ?? formatLocalDateTime(new Date()));
  const [icon, setIcon] = useState<BillRecordIcon>(isBillRecordIcon(record?.icon) ? record.icon : getDefaultBillRecordIcon(typeId));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  useEscapeClose(onClose);

  // 提交前提供即时表单反馈，主进程仍会再次执行相同的安全校验。
  const handleSubmit = async () => {
    const normalizedContent = content.trim();
    const amountCents = parseAmountToCents(amount);
    if (!normalizedContent) {
      setError('请输入账单标题。');
      return;
    }
    if (amountCents === null) {
      setError('金额必须大于 0，且最多保留两位小数。');
      return;
    }
    if (!occurredAt) {
      setError('请选择具体时间。');
      return;
    }

    setSaving(true);
    setError('');
    const saved = await onSave(record?.id ?? null, { typeId, icon, content: normalizedContent, amountCents, occurredAt });
    setSaving(false);
    if (saved) onClose();
  };

  return (
    <div className="dialog-backdrop no-drag" role="presentation">
      <section className="dialog record-dialog" role="dialog" aria-modal="true" aria-labelledby="record-dialog-title">
        <header className="dialog-header">
          <div>
            <span className="eyebrow">{typeName}</span>
            <h2 id="record-dialog-title">{record ? '编辑账单' : '新增账单'}</h2>
          </div>
          <button className="icon-button" title="关闭" onClick={onClose}>
            <X size={18} />
          </button>
        </header>
        <div className="dialog-body form-stack">
          <IconPickerField icon={icon} onChange={setIcon} />
          <label className="field-row">
            <FileText size={18} />
            <span>
              <em>标题</em>
              <input autoFocus value={content} placeholder="例如：会员订阅" onChange={(event) => setContent(event.target.value)} />
            </span>
          </label>
          <label className="field-row">
            <CircleDollarSign size={18} />
            <span>
              <em>金额（人民币）</em>
              <input inputMode="decimal" value={amount} placeholder="0.00" onChange={(event) => setAmount(event.target.value)} />
            </span>
          </label>
          <DateTimePicker value={occurredAt} onChange={setOccurredAt} />
          {error && <p className="form-error">{error}</p>}
        </div>
        <footer className="dialog-actions">
          <button className="secondary-button" onClick={onClose}>
            取消
          </button>
          <button className="primary-button" disabled={saving} onClick={() => void handleSubmit()}>
            {saving ? '保存中…' : '保存账单'}
          </button>
        </footer>
      </section>
    </div>
  );
}
