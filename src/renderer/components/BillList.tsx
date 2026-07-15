import { Pencil, Plus, ReceiptText, Trash2 } from 'lucide-react';
import { formatCny } from '../../shared/billUtils';
import type { BillRecord } from '../../shared/types';
import { RecordIcon } from './RecordIcon';

type BillListProps = {
  records: BillRecord[];
  onAdd: () => void;
  onEdit: (record: BillRecord) => void;
  onDelete: (record: BillRecord) => void;
};

// 本地分钟字符串只替换分隔符展示，不经过 Date 解析，避免时区偏移。
const formatOccurredAt = (value: string): string => value.replace('T', ' ');

// 右侧账单列表只负责展示和派发操作，实际写入由 App 调用 preload 完成。
export function BillList({ records, onAdd, onEdit, onDelete }: BillListProps) {
  return (
    <section className="records-panel">
      <header className="records-header">
        <h2>账单明细</h2>
        <button className="icon-button records-add" title="新增账单" onClick={onAdd}>
          <Plus size={19} />
        </button>
      </header>
      <div className="records-scroll">
        {records.map((record) => (
          <article className="record-card" key={record.id}>
            <div className="record-icon">
              <RecordIcon name={record.icon} typeId={record.typeId} />
            </div>
            <div className="record-main">
              <strong>{record.content}</strong>
              <time dateTime={record.occurredAt}>{formatOccurredAt(record.occurredAt)}</time>
            </div>
            <div className="record-side">
              <span className="record-amount">-{formatCny(record.amountCents)}</span>
              <div className="record-actions">
                <button title="编辑账单" onClick={() => onEdit(record)}>
                  <Pencil size={15} />
                </button>
                <button title="删除账单" onClick={() => onDelete(record)}>
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          </article>
        ))}
        {!records.length && (
          <div className="records-empty">
            <span>
              <ReceiptText size={24} />
            </span>
            <strong>这段时间还没有账单</strong>
            <p>点击右上角的 + 记录第一笔支出，统计和趋势会自动更新。</p>
          </div>
        )}
      </div>
      <footer className="records-footer">共 {records.length} 笔</footer>
    </section>
  );
}
