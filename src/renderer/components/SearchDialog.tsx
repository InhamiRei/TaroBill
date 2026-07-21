import { Search, SearchX, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { formatCny, formatOccurredAt, searchRecordsByKeyword } from '../../shared/billUtils';
import type { BillRecord } from '../../shared/types';
import { RecordIcon } from './RecordIcon';

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
  const inputRef = useRef<HTMLInputElement>(null);
  const trimmedKeyword = keyword.trim();
  const results = useMemo(() => searchRecordsByKeyword(records, keyword), [records, keyword]);

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
                  // 中文输入法组词期间的 Enter/Esc 交给输入法处理，避免误触发选中或关闭。
                  if (event.nativeEvent.isComposing) return;
                  if (event.key === 'Escape') onClose();
                  // Enter 直达第一条结果，和输入框的实时过滤形成完整键盘流。
                  if (event.key === 'Enter' && results.length) onSelect(results[0]);
                }}
              />
            </span>
          </label>
          <div className="search-results">
            {results.map((record) => (
              <button className="record-card search-result" key={record.id} title="编辑这笔账单" onClick={() => onSelect(record)}>
                <div className="record-icon">
                  <RecordIcon name={record.icon} typeId={record.typeId} />
                </div>
                <div className="record-main">
                  <strong>{record.content}</strong>
                  <time dateTime={record.occurredAt}>{formatOccurredAt(record.occurredAt)}</time>
                </div>
                <div className="record-side">
                  <span className="record-amount">-{formatCny(record.amountCents)}</span>
                </div>
              </button>
            ))}
            {trimmedKeyword && !results.length && (
              <div className="search-empty">
                <SearchX size={20} />
                <span>没有找到标题包含“{trimmedKeyword}”的账单</span>
              </div>
            )}
            {!trimmedKeyword && <div className="search-empty">输入关键词，实时搜索该类型下的全部账单。</div>}
          </div>
        </div>
      </section>
    </div>
  );
}
