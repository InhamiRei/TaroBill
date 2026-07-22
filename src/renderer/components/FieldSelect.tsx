import { Check, ChevronDown } from 'lucide-react';
import { useState } from 'react';
import type { ReactNode } from 'react';
import { useEscapeCloseLayer } from './useEscapeClose';

export type FieldSelectOption = {
  value: string;
  label: string;
};

type FieldSelectProps = {
  icon: ReactNode;
  label: string;
  value: string;
  options: FieldSelectOption[];
  onSelect: (value: string) => void;
};

// 自定义下拉与图标选择器共用同一套视觉语言：field-row 触发按钮 + 圆角弹层，替代风格不统一的原生 select。
export function FieldSelect({ icon, label, value, options, onSelect }: FieldSelectProps) {
  const [open, setOpen] = useState(false);
  const selectedLabel = options.find((option) => option.value === value)?.label ?? value;

  // 展开时才压入 ESC 栈顶，先关下拉再轮到底层弹窗，与图标选择器行为一致。
  useEscapeCloseLayer(open, () => setOpen(false));

  return (
    <div className={open ? 'field-select open' : 'field-select'}>
      <button type="button" className="field-row field-select-trigger" aria-expanded={open} onClick={() => setOpen((current) => !current)}>
        {icon}
        <span>
          <em>{label}</em>
          <strong>{selectedLabel}</strong>
        </span>
        <ChevronDown className="record-icon-chevron" size={17} />
      </button>
      {open && (
        <div className="field-select-popup" role="listbox" aria-label={label}>
          {options.map((option) => (
            <button
              type="button"
              key={option.value}
              role="option"
              aria-selected={option.value === value}
              className={option.value === value ? 'field-select-option selected' : 'field-select-option'}
              onClick={() => {
                onSelect(option.value);
                setOpen(false);
              }}
            >
              <span>{option.label}</span>
              {option.value === value && <Check size={13} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
