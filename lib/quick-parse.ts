// 빠른 입력 한 줄 해석 (AI 없이 규칙으로, 비용 없음). 브라우저 미리보기와 서버 저장에서 같이 씁니다.
// 예: "금요일 3시 치과" → 일정, 이번 금요일 15:00~16:00, 제목 "치과"
//     "보고서 초안 2시간" → 할 일, 예상 2시간, 빈 시간에 자동 배치
// 규칙: 시각이 있으면 일정(기본 1시간), 없으면 할 일(기본 30분).
//       "3시"처럼 오전/오후가 없고 1~6시면 오후로 봅니다.

import { addDays, daysInMonth, weekdayOf, weekStartOf } from "@/lib/date"

export type QuickParse = {
  title: string
  kind: "task" | "event"
  date: string | null
  start: number | null
  minutes: number
}

const DEFAULT_EVENT_MINUTES = 60
const DEFAULT_TASK_MINUTES = 30
const MAX_MINUTES = 720
const RELATIVE_DAYS: Record<string, number> = { 오늘: 0, 내일: 1, 모레: 2, 글피: 3 }
const WEEKDAY_CHARS = "일월화수목금토"

const START = String.raw`(?<=^|\s)`
const END = String.raw`(?=\s|$)`
const PARTICLE = "(?:에|은|는|부터|까지)?"
// 시각 하나: [오전/오후…] 3시 [30분|반] 또는 15:30 (그룹 5개)
const TIME = String.raw`(오전|오후|아침|점심|저녁|밤|새벽)?\s?(\d{1,2})(?:시(?!간)\s?(?:(\d{1,2})분|(반))?|:(\d{2}))`

const RE_RELATIVE = new RegExp(`${START}(오늘|내일|모레|글피)${PARTICLE}${END}`)
const RE_WEEKDAY = new RegExp(
  String.raw`${START}(?:(이번\s?주|다음\s?주|담주|다다음\s?주)\s?)?([일월화수목금토])요일${PARTICLE}${END}`
)
const RE_MONTH_DAY = new RegExp(String.raw`${START}(\d{1,2})월\s?(\d{1,2})일${PARTICLE}${END}`)
const RE_SLASH_DATE = new RegExp(String.raw`${START}(\d{1,2})/(\d{1,2})${PARTICLE}${END}`)
const RE_TIME_RANGE = new RegExp(`${START}${TIME}\\s?(?:~|-|부터)\\s?${TIME}${PARTICLE}${END}`)
const RE_TIME = new RegExp(`${START}${TIME}${PARTICLE}${END}`)
const RE_HOURS = new RegExp(
  String.raw`${START}(\d{1,2}(?:\.\d)?)\s?시간(?:\s?(반|(\d{1,2})\s?분))?(?:\s?동안)?${END}`
)
const RE_MINUTES = new RegExp(String.raw`${START}(\d{1,3})\s?분(?:\s?동안)?${END}`)

// 정규식 결과의 시각 그룹 5개 → 0시부터 지난 분. 말이 안 되면 null
function toMinutes(groups: (string | undefined)[]): number | null {
  const [period, hourText, minuteText, half, colonMinute] = groups
  let hour = Number(hourText)
  const minute = half ? 30 : Number(minuteText ?? colonMinute ?? 0)
  if (minute > 59 || hour > 24) return null

  if (period === "오후" || period === "저녁" || period === "밤") {
    if (hour < 12) hour += 12
  } else if (period === "점심") {
    if (hour < 5) hour += 12
  } else if (period === "오전" || period === "아침" || period === "새벽") {
    if (hour === 12) hour = 0
  } else if (hour >= 1 && hour <= 6 && !hourText?.startsWith("0")) {
    // 오전/오후 없이 1~6시면 업무 시간인 오후로 봅니다.
    hour += 12
  }
  const total = hour * 60 + minute
  return total < 24 * 60 ? total : null
}

function dateFromMonthDay(month: number, day: number, today: string): string | null {
  if (month < 1 || month > 12 || day < 1) return null
  let year = Number(today.slice(0, 4))
  const make = (y: number) => `${y}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
  if (day > daysInMonth(make(year).slice(0, 8) + "01")) return null
  // 이미 지난 날짜면 내년으로 봅니다.
  if (make(year) < today) year += 1
  return make(year)
}

function dateFromWeekday(prefix: string | undefined, dayChar: string, today: string): string {
  const target = WEEKDAY_CHARS.indexOf(dayChar)
  if (!prefix) return addDays(today, (target - weekdayOf(today) + 7) % 7)
  const compact = prefix.replace(/\s/g, "")
  const weeks = compact === "이번주" ? 0 : compact === "다다음주" ? 2 : 1
  return addDays(weekStartOf(today), weeks * 7 + ((target + 6) % 7))
}

export function parseQuickInput(raw: string, today: string): QuickParse | null {
  let text = raw.replace(/\s+/g, " ").trim()

  // 규칙에 맞는 부분을 찾아 값으로 바꾸고, 쓸 수 있는 값이면 제목에서 지웁니다.
  function take<T>(re: RegExp, read: (m: RegExpExecArray) => T | null): T | null {
    const match = re.exec(text)
    if (!match) return null
    const value = read(match)
    if (value !== null) {
      text = `${text.slice(0, match.index)} ${text.slice(match.index + match[0].length)}`.trim()
    }
    return value
  }

  const date =
    take(RE_RELATIVE, (m) => addDays(today, RELATIVE_DAYS[m[1]])) ??
    take(RE_WEEKDAY, (m) => dateFromWeekday(m[1], m[2], today)) ??
    take(RE_MONTH_DAY, (m) => dateFromMonthDay(Number(m[1]), Number(m[2]), today)) ??
    take(RE_SLASH_DATE, (m) => dateFromMonthDay(Number(m[1]), Number(m[2]), today))

  const range = take(RE_TIME_RANGE, (m) => {
    const from = toMinutes(m.slice(1, 6))
    let to = toMinutes(m.slice(6, 11))
    if (from === null || to === null) return null
    if (to <= from && to + 12 * 60 < 24 * 60) to += 12 * 60
    return to > from ? { start: from, end: to } : null
  })
  const start = range?.start ?? take(RE_TIME, (m) => toMinutes(m.slice(1, 6)))

  const duration =
    take(RE_HOURS, (m) => {
      const minutes = Math.round(Number(m[1]) * 60) + (m[2] === "반" ? 30 : Number(m[3] ?? 0))
      return minutes > 0 ? minutes : null
    }) ?? take(RE_MINUTES, (m) => Number(m[1]) || null)

  const title = text.replace(/\s+/g, " ").replace(/^(에|부터|까지)\s/, "").trim()
  if (!title) return null

  const kind = start !== null ? "event" : "task"
  let minutes = range
    ? range.end - range.start
    : (duration ?? (kind === "event" ? DEFAULT_EVENT_MINUTES : DEFAULT_TASK_MINUTES))
  minutes = Math.min(Math.max(minutes, 5), MAX_MINUTES)
  // 일정이 자정을 넘기지 않게 맞춥니다.
  if (start !== null) minutes = Math.min(minutes, 24 * 60 - start)

  return { title, kind, date, start, minutes }
}

// 실제로 저장할 모양. 미리보기와 저장이 같은 결과를 내도록 둘 다 이 함수를 씁니다.
export type QuickPlan = {
  kind: "task" | "event"
  title: string
  date: string | null
  start: number | null
  minutes: number
}

export function planQuickInput(
  raw: string,
  today: string,
  nowMinutes: number,
  kind: "task" | "event" | null
): QuickPlan | null {
  const parsed = parseQuickInput(raw, today)
  if (!parsed) return null
  const finalKind = kind ?? parsed.kind
  // 날짜 없이 이미 지난 시각만 적었으면 내일로 봅니다.
  const date =
    parsed.date ?? (parsed.start !== null && parsed.start <= nowMinutes ? addDays(today, 1) : null)

  if (finalKind === "event") {
    // 시각 없이 일정으로 바꾸면 지금 이후 가장 가까운 30분 단위로 둡니다.
    const start = parsed.start ?? Math.min(Math.ceil((nowMinutes + 1) / 30) * 30, 23 * 60 + 30)
    return {
      kind: "event",
      title: parsed.title,
      date: date ?? today,
      start,
      minutes: Math.min(parsed.minutes, 24 * 60 - start),
    }
  }
  return {
    kind: "task",
    title: parsed.title,
    date: parsed.start !== null ? (date ?? today) : date,
    start: parsed.start,
    minutes: parsed.minutes,
  }
}
