import { useEffect, useMemo, useState } from 'react';
import { Check, ChevronDown, Search } from 'lucide-react';
import type { BillRecordIcon } from '../../shared/types';
import { getRecordIconLabel, loadRecordIconOptions, recommendedRecordIconOptions, RecordIcon } from './RecordIcon';
import type { RecordIconOption } from './RecordIcon';
import { useEscapeCloseLayer } from './useEscapeClose';

const ICON_PAGE_SIZE = 64;
type IconLibrary = 'recommended' | 'all';

type IconPickerFieldProps = {
  icon: BillRecordIcon;
  onChange: (icon: BillRecordIcon) => void;
};

// 账单图标选择字段供账单编辑器和周期任务编辑器共用。
// 展开时才压入 ESC 栈顶，保证先关图标面板再轮到底层弹窗。
export function IconPickerField({ icon, onChange }: IconPickerFieldProps) {
  const [open, setOpen] = useState(false);
  const [iconOptions, setIconOptions] = useState<RecordIconOption[]>([]);
  const [iconLibrary, setIconLibrary] = useState<IconLibrary>('recommended');
  const [iconQuery, setIconQuery] = useState('');
  const [visibleIconCount, setVisibleIconCount] = useState(ICON_PAGE_SIZE);
  const selectedIconLabel = getRecordIconLabel(icon);
  useEscapeCloseLayer(open, () => setOpen(false));

  const currentIconOptions = iconLibrary === 'recommended' ? recommendedRecordIconOptions : iconOptions;
  const filteredIconOptions = useMemo(() => {
    const query = iconQuery.trim().toLocaleLowerCase();
    if (!query) return currentIconOptions;
    return currentIconOptions.filter((option) => `${option.label} ${option.name}`.toLocaleLowerCase().includes(query));
  }, [currentIconOptions, iconQuery]);
  const visibleIconOptions = filteredIconOptions.slice(0, visibleIconCount);

  // 只有切换到“全部图标”时才读取完整 Lucide 索引，常用中文图标保持轻量且即时可用。
  useEffect(() => {
    if (!open || iconLibrary !== 'all' || iconOptions.length) return;
    let active = true;
    void loadRecordIconOptions().then((options) => {
      if (active) setIconOptions(options);
    });
    return () => {
      active = false;
    };
  }, [iconLibrary, iconOptions.length, open]);

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

  return (
    <div className={open ? 'record-icon-field open' : 'record-icon-field'}>
      <button type="button" className="field-row record-icon-select" aria-expanded={open} onClick={() => setOpen((current) => !current)}>
        <RecordIcon name={icon} size={18} />
        <span>
          <em>账单图标</em>
          <strong>{selectedIconLabel}</strong>
        </span>
        <ChevronDown className="record-icon-chevron" size={17} />
      </button>
      {open && (
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
              placeholder={iconLibrary === 'recommended' ? '搜索中文名称' : iconOptions.length ? '搜索 Lucide 官方英文名称' : '正在加载 Lucide 图标…'}
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
                  onChange(option.name);
                  setOpen(false);
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
  );
}
