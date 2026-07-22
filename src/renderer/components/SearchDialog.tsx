import { Bot, Search, SearchX, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { formatCny, formatOccurredAt, searchRecordsByKeyword } from '../../shared/billUtils';
import type { BillRecord } from '../../shared/types';
import { RecordIcon } from './RecordIcon';
import { useEscapeClose } from './useEscapeClose';

type SearchDialogProps = {
  typeName: string;
  records: BillRecord[];
  suspended: boolean;
  onClose: () => void;
  onSelect: (record: BillRecord) => void;
};

// 标题关键词搜索只读当前类型的全部记录并实时过滤；点击结果后弹窗保持打开，编辑弹窗叠在上层。
export function SearchDialog({ typeName, records, suspended, onClose, onSelect }: SearchDialogProps) {
  const [keyword, setKeyword] = useState('');
  const [autoOnly, setAutoOnly] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const trimmedKeyword = keyword.trim();
  const results = useMemo(() => searchRecordsByKeyword(records, keyword, autoOnly), [records, keyword, autoOnly]);
  useEscapeClose(onClose);

  // 上层编辑弹窗关闭后焦点回到搜索框，可以继续输入或直接点下一条结果。
  useEffect(() => {
    if (!suspended) inputRef.current?.focus();
  }, [suspended]);

  return (
    <div className="dialog-backdrop no-drag" role="presentation">
      <section className="dialog search-dialog" role="dialog" aria-modal="true" aria-labelledby="search-dialog-title">
        <header className="dialog-header">
          <h2 id="search-dialog-title">搜索“{typeName}”</h2>
          <button className="icon-button" title="关闭" onClick={onClose}>
            <X size={18} />
          </button>
        </header>
        <div className="dialog-body form-stack">
          <label className="field-row">
            <Search size={18} />
            <span>
              <em>标题关键词</em>
              <input
                ref={inputRef}
                autoFocus
                value={keyword}
                placeholder="输入账单标题中的文字"
                onChange={(event) => setKeyword(event.target.value)}
                onKeyDown={(event) => {
                  // 中文输入法组词期间的 Enter 交给输入法处理，避免误触发选中；ESC 由全局弹窗栈统一处理。
                  if (event.nativeEvent.isComposing) return;
                  // Enter 直达第一条结果，和输入框的实时过滤形成完整键盘流。
                  if (event.key === 'Enter' && results.length) onSelect(results[0]);
                }}
              />
            </span>
          </label>
          <div className="search-filters">
            <button
              type="button"
              className={autoOnly ? 'search-filter-chip active' : 'search-filter-chip'}
              aria-pressed={autoOnly}
              onClick={() => setAutoOnly((current) => !current)}
            >
              <Bot size={13} />
              只看自动记账
            </button>
          </div>
          <div className="search-results">
            {results.map((record) => (
              <button className="record-card search-result" key={record.id} title="编辑这笔账单" onClick={() => onSelect(record)}>
                <div className="record-icon">
                  <RecordIcon name={record.icon} typeId={record.typeId} />
                </div>
                <div className="record-main">
                  <div className="record-title-row">
                    <strong>{record.content}</strong>
                    {record.ruleId && (
                      <span className="record-auto-badge" title="由周期任务自动记账">
                        <Bot size={10} />
                        自动
                      </span>
                    )}
                  </div>
                  <time dateTime={record.occurredAt}>{formatOccurredAt(record.occurredAt)}</time>
                </div>
                <div className="record-side">
                  <span className="record-amount">-{formatCny(record.amountCents)}</span>
                </div>
              </button>
            ))}
            {(trimmedKeyword || autoOnly) && !results.length && (
              <div className="search-empty">
                <SearchX size={20} />
                <span>
                  {autoOnly && !trimmedKeyword
                    ? '该类型下还没有自动记账的账单'
                    : `没有找到标题包含“${trimmedKeyword}”的${autoOnly ? '自动' : ''}账单`}
                </span>
              </div>
            )}
            {!trimmedKeyword && !autoOnly && <div className="search-empty">输入关键词，实时搜索该类型下的全部账单。</div>}
          </div>
        </div>
      </section>
    </div>
  );
}
