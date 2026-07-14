import { useEffect, useMemo, useRef, useState } from 'react'
import { CalendarClock, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react'
import { createCalendarCells, formatLocalDateTime } from '../../shared/billUtils'

type DateTimePickerProps = {
  value: string
  onChange: (value: string) => void
}

const weekdays = ['日', '一', '二', '三', '四', '五', '六']
const hours = Array.from({ length: 24 }, (_, index) => index)
const minutes = Array.from({ length: 60 }, (_, index) => index)

// 时间字段始终补足两位，确保拼接后的值符合本地分钟格式。
const padTimePart = (value: number): string => String(value).padStart(2, '0')

// 将受控值拆成日期与时间；异常值仅在显示层回退到当前时间。
const parseDateTime = (value: string) => {
  const matched = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value)
  if (!matched) return parseDateTime(formatLocalDateTime(new Date()))
  return {
    year: Number(matched[1]),
    monthIndex: Number(matched[2]) - 1,
    day: Number(matched[3]),
    hour: Number(matched[4]),
    minute: Number(matched[5]),
    dateKey: value.slice(0, 10)
  }
}

// 输入框使用完整中文日期，避免原生日期控件混入不同平台的英文文案。
const formatDisplayValue = (value: string): string => {
  const parts = parseDateTime(value)
  return `${parts.year}年${padTimePart(parts.monthIndex + 1)}月${padTimePart(parts.day)}日 ${padTimePart(parts.hour)}:${padTimePart(parts.minute)}`
}

// 自定义时间选择器把日期和分钟选择留在应用内，避免系统原生弹层风格割裂。
export function DateTimePicker({ value, onChange }: DateTimePickerProps) {
  const parts = parseDateTime(value)
  const [open, setOpen] = useState(false)
  const [viewYear, setViewYear] = useState(parts.year)
  const [viewMonth, setViewMonth] = useState(parts.monthIndex)
  const hourListRef = useRef<HTMLDivElement>(null)
  const minuteListRef = useRef<HTMLDivElement>(null)
  const cells = useMemo(() => createCalendarCells(viewYear, viewMonth), [viewMonth, viewYear])

  // 展开或修改时间后把选中项保持在两列中央，避免每次都从零开始滚动。
  useEffect(() => {
    if (!open) return
    const centerSelectedItem = (container: HTMLDivElement | null) => {
      const selectedItem = container?.querySelector<HTMLButtonElement>('.selected')
      if (container && selectedItem) {
        const itemTop = selectedItem.offsetTop - container.offsetTop
        container.scrollTop = itemTop - container.clientHeight / 2 + selectedItem.clientHeight / 2
      }
    }
    centerSelectedItem(hourListRef.current)
    centerSelectedItem(minuteListRef.current)
  }, [open, parts.hour, parts.minute])

  // 前后切月借助 Date 自动处理跨年边界。
  const shiftMonth = (offset: number) => {
    const nextMonth = new Date(viewYear, viewMonth + offset, 1)
    setViewYear(nextMonth.getFullYear())
    setViewMonth(nextMonth.getMonth())
  }

  // 选择日期时保留已经选择的小时和分钟，并同步相邻月份视图。
  const selectDate = (dateKey: string) => {
    onChange(`${dateKey}T${padTimePart(parts.hour)}:${padTimePart(parts.minute)}`)
    setViewYear(Number(dateKey.slice(0, 4)))
    setViewMonth(Number(dateKey.slice(5, 7)) - 1)
  }

  // 单独修改小时或分钟时保留其余时间字段不变。
  const selectTime = (hour: number, minute: number) => {
    onChange(`${parts.dateKey}T${padTimePart(hour)}:${padTimePart(minute)}`)
  }

  // “现在”同时更新值和月历视图，便于快速回到当前时间。
  const selectNow = () => {
    const now = new Date()
    onChange(formatLocalDateTime(now))
    setViewYear(now.getFullYear())
    setViewMonth(now.getMonth())
  }

  return (
    <div className={open ? 'datetime-picker open' : 'datetime-picker'}>
      <button type="button" className="field-row datetime-trigger" onClick={() => setOpen((current) => !current)}>
        <CalendarClock size={18} />
        <span>
          <em>具体时间</em>
          <strong>{formatDisplayValue(value)}</strong>
        </span>
        <ChevronDown className="datetime-chevron" size={17} />
      </button>
      {open && (
        <section className="datetime-popover" aria-label="选择具体时间">
          <div className="datetime-calendar">
            <header className="datetime-calendar-header">
              <strong>{viewYear}年{viewMonth + 1}月</strong>
              <div>
                <button type="button" title="上个月" onClick={() => shiftMonth(-1)}><ChevronLeft size={16} /></button>
                <button type="button" title="下个月" onClick={() => shiftMonth(1)}><ChevronRight size={16} /></button>
              </div>
            </header>
            <div className="datetime-weekdays">
              {weekdays.map((weekday) => <span key={weekday}>{weekday}</span>)}
            </div>
            <div className="datetime-days">
              {cells.map((cell) => (
                <button
                  type="button"
                  key={cell.dateKey}
                  className={`${cell.inCurrentMonth ? '' : 'outside'} ${cell.isToday ? 'today' : ''} ${cell.dateKey === parts.dateKey ? 'selected' : ''}`}
                  onClick={() => selectDate(cell.dateKey)}
                >
                  {cell.day}
                </button>
              ))}
            </div>
          </div>
          <div className="datetime-time">
            <div className="datetime-time-heading">
              <strong>时间</strong>
              <span>{padTimePart(parts.hour)}:{padTimePart(parts.minute)}</span>
            </div>
            <div className="datetime-time-columns">
              <div className="datetime-time-column">
                <span>时</span>
                <div className="datetime-time-list" ref={hourListRef}>
                  {hours.map((hour) => (
                    <button type="button" key={hour} className={hour === parts.hour ? 'selected' : ''} onClick={() => selectTime(hour, parts.minute)}>
                      {padTimePart(hour)}
                    </button>
                  ))}
                </div>
              </div>
              <div className="datetime-time-column">
                <span>分</span>
                <div className="datetime-time-list" ref={minuteListRef}>
                  {minutes.map((minute) => (
                    <button type="button" key={minute} className={minute === parts.minute ? 'selected' : ''} onClick={() => selectTime(parts.hour, minute)}>
                      {padTimePart(minute)}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
          <footer className="datetime-footer">
            <button type="button" onClick={selectNow}>现在</button>
            <button type="button" className="datetime-done" onClick={() => setOpen(false)}>完成</button>
          </footer>
        </section>
      )}
    </div>
  )
}
