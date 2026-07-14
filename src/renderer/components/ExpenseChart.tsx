import { formatCompactCny, getDateKey } from '../../shared/billUtils'
import type { BillRecord } from '../../shared/types'

type ExpenseChartProps = {
  values: number[]
}

const width = 560
const height = 180
const chartTop = 22
const chartBottom = 138
const chartLeft = 14
const chartRight = 546
const chartWidth = chartRight - chartLeft

type ChartPoint = {
  x: number
  y: number
  value: number
}

// 折线使用受边界约束的三次贝塞尔曲线，让趋势更柔和且不会越出绘图区。
const createSmoothLinePath = (points: ChartPoint[]): string => {
  if (!points.length) return ''
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`
  const clampY = (value: number) => Math.min(chartBottom, Math.max(chartTop, value))
  let path = `M ${points[0].x} ${points[0].y}`
  for (let index = 0; index < points.length - 1; index += 1) {
    const previous = points[Math.max(0, index - 1)]
    const current = points[index]
    const next = points[index + 1]
    const following = points[Math.min(points.length - 1, index + 2)]
    const firstControlX = current.x + (next.x - previous.x) / 6
    const firstControlY = clampY(current.y + (next.y - previous.y) / 6)
    const secondControlX = next.x - (following.x - current.x) / 6
    const secondControlY = clampY(next.y - (following.y - current.y) / 6)
    path += ` C ${firstControlX} ${firstControlY}, ${secondControlX} ${secondControlY}, ${next.x} ${next.y}`
  }
  return path
}

// 横轴保留固定节奏，并用峰值日期替换附近刻度，让最高点与其日期文字严格垂直对齐。
const getTickDays = (values: number[]): number[] => {
  const lastDay = values.length
  const peakDay = values.indexOf(Math.max(...values, 0)) + 1
  const ticks = [1, 8, 15, 22, lastDay].filter((day) => day <= lastDay)
  if (peakDay > 1 && peakDay < lastDay && !ticks.includes(peakDay)) {
    const replaceable = ticks
      .map((day, index) => ({ day, index }))
      .filter(({ day }) => day !== 1 && day !== lastDay)
      .sort((left, right) => Math.abs(left.day - peakDay) - Math.abs(right.day - peakDay))[0]
    if (replaceable && Math.abs(replaceable.day - peakDay) <= 3) ticks[replaceable.index] = peakDay
  }
  return [...new Set(ticks)].sort((left, right) => left - right)
}

// 每日折线图使用同一组绘图区坐标计算折线、基线和刻度，避免视觉上的横轴错位。
export function ExpenseChart({ values }: ExpenseChartProps) {
  const maxValue = Math.max(...values, 0)
  const hasData = maxValue > 0
  const horizontalStep = values.length > 1 ? chartWidth / (values.length - 1) : chartWidth
  const points = values.map((value, index) => ({
    x: chartLeft + index * horizontalStep,
    y: hasData ? chartBottom - (value / maxValue) * (chartBottom - chartTop) : chartBottom,
    value
  }))
  const linePath = createSmoothLinePath(points)
  const areaPath = points.length ? `${linePath} L ${chartRight} ${chartBottom} L ${chartLeft} ${chartBottom} Z` : ''
  const peakIndex = values.indexOf(maxValue)
  const guideRatios = [0.25, 0.5, 0.75]

  return (
    <section className="panel chart-panel">
      <div className="panel-heading">
        <h2>日支出</h2>
      </div>
      <div className="chart-wrap">
        <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="本月每日支出折线图">
          <defs>
            <linearGradient id="expense-area" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="currentColor" stopOpacity="0.23" />
              <stop offset="100%" stopColor="currentColor" stopOpacity="0.015" />
            </linearGradient>
          </defs>
          {guideRatios.map((ratio) => {
            const y = chartTop + (chartBottom - chartTop) * ratio
            return <line key={ratio} className="chart-grid-line" x1={chartLeft} x2={chartRight} y1={y} y2={y} />
          })}
          <line className="chart-axis" x1={chartLeft} x2={chartRight} y1={chartBottom} y2={chartBottom} />
          {hasData && <path className="chart-area" d={areaPath} />}
          {hasData && <path className="chart-line" d={linePath} />}
          {points.map((point, index) => (
            <g key={index} className="line-point">
              <title>{index + 1}日：{formatCompactCny(point.value)}</title>
              {point.value > 0 && <circle className={index === peakIndex ? 'peak' : ''} cx={point.x} cy={point.y} r={index === peakIndex ? 4 : 2.8} />}
            </g>
          ))}
          {getTickDays(values).map((day) => (
            <text key={day} x={chartLeft + (day - 1) * horizontalStep} y="168" textAnchor="middle">{day}日</text>
          ))}
        </svg>
        {!hasData && <div className="chart-empty">本月还没有支出</div>}
      </div>
    </section>
  )
}

type ExpenseWeeklyChartProps = {
  records: BillRecord[]
  year: number
  monthIndex: number
  selectedDate: string | null
}

type WeeklyExpenseEntry = {
  label: string
  value: number
  current: boolean
}

// 日期加减始终通过本地年月日构造，避免夏令时造成毫秒换算跨日。
const addLocalDays = (date: Date, offset: number): Date => {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + offset)
}

// 周区间统一显示完整的月/日，避免同月与跨月标签格式不一致。
const formatWeekRange = (startDate: Date, endDate: Date): string => {
  return `${startDate.getMonth() + 1}/${startDate.getDate()}-${endDate.getMonth() + 1}/${endDate.getDate()}`
}

// 以参考日的前三天至后三天为中间周，再向前、向后各生成两个连续周区间。
export const summarizeRollingWeekExpenses = (records: BillRecord[], referenceDate: Date): WeeklyExpenseEntry[] => {
  const centerStartDate = addLocalDays(referenceDate, -3)
  return Array.from({ length: 5 }, (_, index) => {
    const weekOffset = index - 2
    const startDate = addLocalDays(centerStartDate, weekOffset * 7)
    const endDate = addLocalDays(startDate, 6)
    const startKey = getDateKey(startDate.getFullYear(), startDate.getMonth(), startDate.getDate())
    const endKey = getDateKey(endDate.getFullYear(), endDate.getMonth(), endDate.getDate())
    const value = records.reduce((total, record) => {
      const recordDate = record.occurredAt.slice(0, 10)
      return recordDate >= startKey && recordDate <= endKey ? total + record.amountCents : total
    }, 0)
    return { label: formatWeekRange(startDate, endDate), value, current: weekOffset === 0 }
  })
}

// 未选日期时使用所选月份中与今天相同的日号，月底不足时自动落到当月最后一天。
const getWeeklyReferenceDate = (year: number, monthIndex: number, selectedDate: string | null): Date => {
  if (selectedDate) {
    return new Date(Number(selectedDate.slice(0, 4)), Number(selectedDate.slice(5, 7)) - 1, Number(selectedDate.slice(8, 10)))
  }
  const today = new Date()
  const lastDay = new Date(year, monthIndex + 1, 0).getDate()
  return new Date(year, monthIndex, Math.min(today.getDate(), lastDay))
}

// 周支出柱状图围绕参考日展示连续五周，长标题和大量账单都不会破坏布局。
export function ExpenseWeeklyChart({ records, year, monthIndex, selectedDate }: ExpenseWeeklyChartProps) {
  const entries = summarizeRollingWeekExpenses(records, getWeeklyReferenceDate(year, monthIndex, selectedDate))
  const maxValue = Math.max(...entries.map((entry) => entry.value), 0)
  const hasData = maxValue > 0

  return (
    <section className="panel chart-panel weekly-chart-panel">
      <div className="panel-heading">
        <h2>周支出</h2>
      </div>
      <div className="weekly-chart" role="img" aria-label="以参考日为中心的五周支出柱状图">
        {entries.map((entry) => {
          const heightRatio = maxValue ? entry.value / maxValue : 0
          return (
            <div className={entry.current ? 'weekly-column current' : 'weekly-column'} key={entry.label} title={`${entry.label}：${formatCompactCny(entry.value)}`}>
              <small>{entry.value ? formatCompactCny(entry.value) : '—'}</small>
              <div className="weekly-bar-track">
                {entry.value > 0 && <i style={{ height: `${Math.max(heightRatio * 100, 12)}%` }} />}
              </div>
              <strong>{entry.label}</strong>
            </div>
          )
        })}
        {!hasData && <div className="weekly-chart-empty">这五周还没有支出</div>}
      </div>
    </section>
  )
}
