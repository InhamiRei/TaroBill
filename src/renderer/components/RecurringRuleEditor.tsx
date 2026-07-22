import { useMemo, useState } from 'react';
import { Bot, CalendarClock, CalendarDays, CircleDollarSign, Clock3, FileText, Tag, X } from 'lucide-react';
import { formatAmountForInput, parseAmountToCents } from '../../shared/billUtils';
import { isValidTimeOfDay } from '../../shared/recurringUtils';
import type { BillRecordIcon, BillType, RecurringFrequency, RecurringRule, RecurringRuleInput } from '../../shared/types';
import { getDefaultBillRecordIcon, isBillRecordIcon } from '../../shared/types';
import { FieldSelect } from './FieldSelect';
import { IconPickerField } from './IconPickerField';
import { useEscapeClose } from './useEscapeClose';

const WEEKDAY_OPTIONS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
const MONTH_DAY_OPTIONS = Array.from({ length: 31 }, (_, index) => index + 1);

type RecurringRuleEditorProps = {
  billTypes: BillType[];
  rule: RecurringRule | null;
  onClose: () => void;
  onSave: (ruleId: string | null, input: RecurringRuleInput) => Promise<boolean>;
};

// 新建和编辑共用一个受控弹窗；启用状态由任务卡片的开关维护，表单里只负责透传。
export function RecurringRuleEditor({ billTypes, rule, onClose, onSave }: RecurringRuleEditorProps) {
  const today = useMemo(() => new Date(), []);
  const [name, setName] = useState(rule?.name ?? '');
  const [typeId, setTypeId] = useState(rule?.typeId ?? billTypes[0]?.id ?? '');
  const [content, setContent] = useState(rule?.content ?? '');
  const [amount, setAmount] = useState(rule ? formatAmountForInput(rule.amountCents) : '');
  const [frequency, setFrequency] = useState<RecurringFrequency>(rule?.frequency ?? 'daily');
  const [weekday, setWeekday] = useState(rule?.weekday ?? today.getDay());
  const [monthDay, setMonthDay] = useState(rule?.monthDay ?? today.getDate());
  const [timeOfDay, setTimeOfDay] = useState(rule?.timeOfDay ?? '08:00');
  const [icon, setIcon] = useState<BillRecordIcon>(isBillRecordIcon(rule?.icon) ? rule.icon : getDefaultBillRecordIcon(typeId));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  useEscapeClose(onClose);

  // 提交前提供即时表单反馈，主进程仍会再次执行相同的安全校验。
  const handleSubmit = async () => {
    const normalizedName = name.trim();
    const normalizedContent = content.trim();
    const amountCents = parseAmountToCents(amount);
    if (!normalizedName) {
      setError('请输入任务名称。');
      return;
    }
    if (!normalizedContent) {
      setError('请输入账单标题。');
      return;
    }
    if (amountCents === null) {
      setError('金额必须大于 0，且最多保留两位小数。');
      return;
    }
    if (!typeId) {
      setError('请选择账单类型。');
      return;
    }
    if (!isValidTimeOfDay(timeOfDay)) {
      setError('请选择有效的执行时间。');
      return;
    }

    setSaving(true);
    setError('');
    const saved = await onSave(rule?.id ?? null, {
      name: normalizedName,
      typeId,
      icon,
      content: normalizedContent,
      amountCents,
      frequency,
      timeOfDay,
      weekday,
      monthDay,
      enabled: rule?.enabled ?? true,
    });
    setSaving(false);
    if (saved) onClose();
  };

  return (
    <div className="dialog-backdrop no-drag" role="presentation">
      <section className="dialog record-dialog" role="dialog" aria-modal="true" aria-labelledby="rule-dialog-title">
        <header className="dialog-header">
          <div>
            <span className="eyebrow">自动记账</span>
            <h2 id="rule-dialog-title">{rule ? '编辑周期任务' : '新增周期任务'}</h2>
          </div>
          <button className="icon-button" title="关闭" onClick={onClose}>
            <X size={18} />
          </button>
        </header>
        <div className="dialog-body form-stack">
          <label className="field-row">
            <Bot size={18} />
            <span>
              <em>任务名称</em>
              <input autoFocus value={name} placeholder="例如：每日公交" onChange={(event) => setName(event.target.value)} />
            </span>
          </label>
          <FieldSelect
            icon={<Tag size={18} />}
            label="账单类型"
            value={typeId}
            options={billTypes.map((billType) => ({ value: billType.id, label: billType.name }))}
            onSelect={setTypeId}
          />
          <IconPickerField icon={icon} onChange={setIcon} />
          <label className="field-row">
            <FileText size={18} />
            <span>
              <em>账单标题</em>
              <input value={content} placeholder="例如：公交地铁" onChange={(event) => setContent(event.target.value)} />
            </span>
          </label>
          <label className="field-row">
            <CircleDollarSign size={18} />
            <span>
              <em>金额（人民币）</em>
              <input inputMode="decimal" value={amount} placeholder="0.00" onChange={(event) => setAmount(event.target.value)} />
            </span>
          </label>
          <div className="field-row frequency-field">
            <CalendarClock size={18} />
            <span>
              <em>周期频率</em>
              <div className="record-icon-tabs frequency-tabs" role="group" aria-label="周期频率">
                <button type="button" className={frequency === 'daily' ? 'active' : ''} onClick={() => setFrequency('daily')}>
                  每天
                </button>
                <button type="button" className={frequency === 'weekly' ? 'active' : ''} onClick={() => setFrequency('weekly')}>
                  每周
                </button>
                <button type="button" className={frequency === 'monthly' ? 'active' : ''} onClick={() => setFrequency('monthly')}>
                  每月
                </button>
              </div>
            </span>
          </div>
          {frequency === 'weekly' && (
            <FieldSelect
              icon={<CalendarDays size={18} />}
              label="星期"
              value={String(weekday)}
              options={WEEKDAY_OPTIONS.map((weekdayLabel, index) => ({ value: String(index), label: `每${weekdayLabel}` }))}
              onSelect={(value) => setWeekday(Number(value))}
            />
          )}
          {frequency === 'monthly' && (
            <FieldSelect
              icon={<CalendarDays size={18} />}
              label="日期"
              value={String(monthDay)}
              options={MONTH_DAY_OPTIONS.map((day) => ({ value: String(day), label: `每月 ${day} 日` }))}
              onSelect={(value) => setMonthDay(Number(value))}
            />
          )}
          <label className="field-row">
            <Clock3 size={18} />
            <span>
              <em>执行时间</em>
              <input type="time" value={timeOfDay} onChange={(event) => setTimeOfDay(event.target.value)} />
            </span>
          </label>
          {error && <p className="form-error">{error}</p>}
        </div>
        <footer className="dialog-actions">
          <button className="secondary-button" onClick={onClose}>
            取消
          </button>
          <button className="primary-button" disabled={saving} onClick={() => void handleSubmit()}>
            {saving ? '保存中…' : '保存任务'}
          </button>
        </footer>
      </section>
    </div>
  );
}
