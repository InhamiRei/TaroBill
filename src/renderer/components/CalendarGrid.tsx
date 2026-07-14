import { useMemo } from 'react'
import { createCalendarCells, formatCompactCny } from '../../shared/billUtils'
import type { MonthSummary } from '../../shared/billUtils'

type CalendarGridProps = {
  year: number
  monthIndex: number
  summary: MonthSummary
  selectedDate: string | null
  onSelectDate: (dateKey: string, inCurrentMonth: boolean) => void
}

const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

// 月历格子将日期、每日金额与笔数组合，点击相邻月份日期也能完成导航。
export function CalendarGrid({ year, monthIndex, summary, selectedDate, onSelectDate }: CalendarGridProps) {
  const cells = useMemo(() => createCalendarCells(year, monthIndex), [monthIndex, year])

  return (
    <section className="panel calendar-panel">
      <div className="panel-heading">
        <h2>日历</h2>
      </div>
      <div className="calendar-weekdays">
        {weekdays.map((weekday) => <span key={weekday}>{weekday}</span>)}
      </div>
      <div className="calendar-grid">
        {cells.map((cell) => {
          const dayIndex = cell.day - 1
          const amount = cell.inCurrentMonth ? summary.dailyTotals[dayIndex] ?? 0 : 0
          const selected = selectedDate === cell.dateKey
          return (
            <button
              key={cell.dateKey}
              className={`calendar-cell ${cell.inCurrentMonth ? '' : 'outside'} ${cell.isToday ? 'today' : ''} ${selected ? 'selected' : ''}`}
              onClick={() => onSelectDate(cell.dateKey, cell.inCurrentMonth)}
            >
              <strong>{cell.day}</strong>
              <span className={amount ? 'day-amount has-value' : 'day-amount'}>{amount ? `-${formatCompactCny(amount)}` : ''}</span>
            </button>
          )
        })}
      </div>
    </section>
  )
}
