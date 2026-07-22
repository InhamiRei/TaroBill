import { Bot, Pencil, Plus, Trash2 } from 'lucide-react';
import { useEffect, useReducer } from 'react';
import { formatCny } from '../../shared/billUtils';
import { describeRule, formatNextOccurrence } from '../../shared/recurringUtils';
import type { BillType, RecurringRule } from '../../shared/types';
import { RecordIcon } from './RecordIcon';

type RecurringPanelProps = {
  rules: RecurringRule[];
  billTypes: BillType[];
  onAdd: () => void;
  onEdit: (rule: RecurringRule) => void;
  onDelete: (rule: RecurringRule) => void;
  onToggle: (rule: RecurringRule) => void;
};

// 周期任务面板只负责展示和派发操作，任务写入由 App 调用 preload 完成。
export function RecurringPanel({ rules, billTypes, onAdd, onEdit, onDelete, onToggle }: RecurringPanelProps) {
  const [, forceRefresh] = useReducer((value: number) => value + 1, 0);

  // 「下次触发」文案依赖当前时间，每分钟对齐主进程调度节奏刷新一次。
  useEffect(() => {
    const timer = window.setInterval(forceRefresh, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const now = new Date();
  const typeNames = new Map(billTypes.map((billType) => [billType.id, billType.name]));

  return (
    <section className="recurring-panel">
      <header className="topbar">
        <div className="page-title">
          <h1>自动记账</h1>
        </div>
        <div className="topbar-actions no-drag">
          <button className="primary-button recurring-add-button" onClick={onAdd}>
            <Plus size={15} />
            新增任务
          </button>
        </div>
      </header>
      <div className="recurring-scroll no-drag">
        {rules.map((rule) => {
          // 卡片固定两行：第一行任务名称，第二行合并频率、类型、金额和下次触发或停用状态。
          const metaText = `${describeRule(rule)} · ${typeNames.get(rule.typeId) ?? '未知类型'} · ${formatCny(rule.amountCents)}`;
          const statusText = rule.enabled ? formatNextOccurrence(rule, now) : '已停用';
          return (
            <article className={rule.enabled ? 'rule-card' : 'rule-card disabled'} key={rule.id}>
              <div className="record-icon rule-icon">
                <RecordIcon name={rule.icon} typeId={rule.typeId} />
              </div>
              <div className="rule-main">
                <strong>{rule.name}</strong>
                <span className="rule-meta" title={`${rule.enabled ? `${metaText} · ${statusText}` : `${statusText} · ${metaText}`}`}>
                  {!rule.enabled && <em className="rule-paused">已停用 · </em>}
                  {metaText}
                  {rule.enabled && <em className="rule-next"> · {statusText}</em>}
                </span>
              </div>
              <div className="rule-side">
                <button
                  className={rule.enabled ? 'rule-switch on' : 'rule-switch'}
                  title={rule.enabled ? '停用任务' : '启用任务'}
                  role="switch"
                  aria-checked={rule.enabled}
                  onClick={() => onToggle(rule)}
                >
                  <i />
                </button>
                <div className="rule-actions">
                  <button title="编辑任务" onClick={() => onEdit(rule)}>
                    <Pencil size={15} />
                  </button>
                  <button title="删除任务" onClick={() => onDelete(rule)}>
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            </article>
          );
        })}
        {!rules.length && (
          <div className="records-empty">
            <span>
              <Bot size={24} />
            </span>
            <strong>还没有周期任务</strong>
            <p>点击右上角「新增任务」，固定支出会按设定的时间自动记账。</p>
          </div>
        )}
      </div>
    </section>
  );
}
