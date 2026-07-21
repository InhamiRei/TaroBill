import { useEffect, useMemo, useState } from 'react';
import { Check, ChevronDown, CircleDollarSign, FileText, Search, X } from 'lucide-react';
import { formatLocalDateTime, parseAmountToCents } from '../../shared/billUtils';
import type { BillRecord, BillRecordIcon, BillRecordInput } from '../../shared/types';
import { getDefaultBillRecordIcon, isBillRecordIcon } from '../../shared/types';
import { DateTimePicker } from './DateTimePicker';
import { getRecordIconLabel, loadRecordIconOptions, recommendedRecordIconOptions, RecordIcon } from './RecordIcon';
import type { RecordIconOption } from './RecordIcon';
import { useEscapeClose } from './useEscapeClose';

const ICON_PAGE_SIZE = 64;
type IconLibrary = 'recommended' | 'all';

type RecordEditorProps = {
  typeId: string;
  typeName: string;
  record: BillRecord | null;
  onClose: () => void;
  onSave: (recordId: string | null, input: BillRecordInput) => Promise<boolean>;
};

// 编辑时把整数分还原成不带多余零的输入文本，新建时保持空金额。
const getInitialAmount = (record: BillRecord | null): string => {
  if (!record) return '';
  return (record.amountCents / 100)
    .toFixed(2)
    .replace(/\.00$/, '')
    .replace(/(\.\d)0$/, '$1');
};

// 新建和编辑共用一个受控弹窗，保存失败时保留输入内容便于修正或重试。
export function RecordEditor({ typeId, typeName, record, onClose, onSave }: RecordEditorProps) {
  const [content, setContent] = useState(record?.content ?? '');
  const [amount, setAmount] = useState(getInitialAmount(record));
  const [occurredAt, setOccurredAt] = useState(record?.occurredAt ?? formatLocalDateTime(new Date()));
  const [icon, setIcon] = useState<BillRecordIcon>(isBillRecordIcon(record?.icon) ? record.icon : getDefaultBillRecordIcon(typeId));
  const [iconPickerOpen, setIconPickerOpen] = useState(false);
  const [iconOptions, setIconOptions] = useState<RecordIconOption[]>([]);
  const [iconLibrary, setIconLibrary] = useState<IconLibrary>('recommended');
  const [iconQuery, setIconQuery] = useState('');
  const [visibleIconCount, setVisibleIconCount] = useState(ICON_PAGE_SIZE);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const selectedIconLabel = getRecordIconLabel(icon);

  // ESC 逐层退出：图标选择面板打开时先关面板，避免误丢已填写的表单内容。
  useEscapeClose(() => {
    if (iconPickerOpen) {
      setIconPickerOpen(false);
      return;
    }
    onClose();
  });
  const currentIconOptions = iconLibrary === 'recommended' ? recommendedRecordIconOptions : iconOptions;
  const filteredIconOptions = useMemo(() => {
    const query = iconQuery.trim().toLocaleLowerCase();
    if (!query) return currentIconOptions;
    return currentIconOptions.filter((option) => `${option.label} ${option.name}`.toLocaleLowerCase().includes(query));
  }, [currentIconOptions, iconQuery]);
  const visibleIconOptions = filteredIconOptions.slice(0, visibleIconCount);

  // 只有切换到“全部图标”时才读取完整 Lucide 索引，常用中文图标保持轻量且即时可用。
  useEffect(() => {
    if (!iconPickerOpen || iconLibrary !== 'all' || iconOptions.length) return;
    let active = true;
    void loadRecordIconOptions().then((options) => {
      if (active) setIconOptions(options);
    });
    return () => {
      active = false;
    };
  }, [iconLibrary, iconOptions.length, iconPickerOpen]);

  // 搜索条件改变时回到首批结果，防止上一次“显示更多”造成无意义的大量渲染。
  const updateIconQuery = (value: string) => {
    setIconQuery(value);
    setVisibleIconCount(ICON_PAGE_SIZE);
  };

  // 切换图标库时清空旧搜索，确保中文常用区和英文官方区不会混在同一结果列表中。
  const selectIconLibrary = (library: IconLibrary) => {
    setIconLibrary(library);
    setIconQuery('');
    setVisibleIconCount(ICON_PAGE_SIZE);
  };

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
          <div className={iconPickerOpen ? 'record-icon-field open' : 'record-icon-field'}>
            <button
              type="button"
              className="field-row record-icon-select"
              aria-expanded={iconPickerOpen}
              onClick={() => setIconPickerOpen((current) => !current)}
            >
              <RecordIcon name={icon} size={18} />
              <span>
                <em>账单图标</em>
                <strong>{selectedIconLabel}</strong>
              </span>
              <ChevronDown className="record-icon-chevron" size={17} />
            </button>
            {iconPickerOpen && (
              <div className="record-icon-picker" aria-label="选择账单图标">
                <div className="record-icon-toolbar">
                  <div className="record-icon-tabs" role="group" aria-label="图标库">
                    <button type="button" className={iconLibrary === 'recommended' ? 'active' : ''} onClick={() => selectIconLibrary('recommended')}>
                      常用图标
                    </button>
                    <button type="button" className={iconLibrary === 'all' ? 'active' : ''} onClick={() => selectIconLibrary('all')}>
                      全部图标
                    </button>
                  </div>
                  <span>
                    {iconLibrary === 'recommended'
                      ? `${recommendedRecordIconOptions.length} 个中文常用图标`
                      : `${iconOptions.length || '…'} 个 Lucide 图标`}
                  </span>
                </div>
                <label className="record-icon-search">
                  <Search size={15} />
                  <input
                    autoFocus
                    value={iconQuery}
                    placeholder={
                      iconLibrary === 'recommended' ? '搜索中文名称' : iconOptions.length ? '搜索 Lucide 官方英文名称' : '正在加载 Lucide 图标…'
                    }
                    onChange={(event) => updateIconQuery(event.target.value)}
                  />
                  <span>{iconLibrary === 'all' && !iconOptions.length ? '加载中' : `${filteredIconOptions.length} 个`}</span>
                </label>
                <div className="record-icon-grid">
                  {visibleIconOptions.map((option) => (
                    <button
                      type="button"
                      key={option.name}
                      className={option.name === icon ? 'selected' : ''}
                      title={`${option.label} · ${option.name}`}
                      onClick={() => {
                        setIcon(option.name);
                        setIconPickerOpen(false);
                      }}
                    >
                      <RecordIcon name={option.name} size={18} />
                      <span>{option.label}</span>
                      {option.name === icon && <Check size={11} />}
                    </button>
                  ))}
                  {!visibleIconOptions.length && (
                    <p className="record-icon-empty">{iconLibrary === 'all' && !iconOptions.length ? '正在准备完整图标库…' : '没有匹配的图标'}</p>
                  )}
                </div>
                <div className="record-icon-footer">
                  <span>
                    已显示 {visibleIconOptions.length} / {filteredIconOptions.length}
                  </span>
                  {visibleIconOptions.length < filteredIconOptions.length && (
                    <button type="button" onClick={() => setVisibleIconCount((count) => count + ICON_PAGE_SIZE)}>
                      显示更多
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
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
