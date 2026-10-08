// 날짜 계산은 모두 한국 시간(Asia/Seoul) 기준입니다.
// 날짜는 "YYYY-MM-DD" 글자로 주고받습니다(DB의 date 형식과 같음).

const TIME_ZONE = "Asia/Seoul"
const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"]

export type Period = "today" | "week" | "month"

export function todayKST(now: Date = new Date()): string {
  // en-CA 형식은 YYYY-MM-DD로 나옵니다.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now)
}

function toUtcDate(ymd: string): Date {
  return new Date(`${ymd}T00:00:00Z`)
}

function addDays(ymd: string, days: number): string {
  const d = toUtcDate(ymd)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

// 이번 주 월요일
export function weekStartKST(now: Date = new Date()): string {
  const today = todayKST(now)
  const dayOfWeek = toUtcDate(today).getUTCDay() // 0=일요일
  const sinceMonday = (dayOfWeek + 6) % 7
  return addDays(today, -sinceMonday)
}

// 이번 달 1일
export function monthStartKST(now: Date = new Date()): string {
  return `${todayKST(now).slice(0, 8)}01`
}

// 할 일 묶음별 기준 날짜: 오늘=오늘 날짜, 주간=이번 주 월요일, 월간=이번 달 1일
export function targetDateFor(period: Period, now: Date = new Date()): string {
  if (period === "week") return weekStartKST(now)
  if (period === "month") return monthStartKST(now)
  return todayKST(now)
}

function monthDay(ymd: string): string {
  const d = toUtcDate(ymd)
  return `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일`
}

// 예: "10월 8일 (목)"
export function formatDayLabel(ymd: string): string {
  return `${monthDay(ymd)} (${WEEKDAYS[toUtcDate(ymd).getUTCDay()]})`
}

// 예: "2026년 10월 8일 목요일"
export function formatFullDayLabel(ymd: string): string {
  const d = toUtcDate(ymd)
  return `${d.getUTCFullYear()}년 ${monthDay(ymd)} ${WEEKDAYS[d.getUTCDay()]}요일`
}

// 예: "10월 5일 ~ 10월 11일"
export function formatWeekLabel(weekStart: string): string {
  return `${monthDay(weekStart)} ~ ${monthDay(addDays(weekStart, 6))}`
}

// 예: "2026년 10월"
export function formatMonthLabel(monthStart: string): string {
  const d = toUtcDate(monthStart)
  return `${d.getUTCFullYear()}년 ${d.getUTCMonth() + 1}월`
}

// DB의 날짜시간(timestamptz)을 한국 날짜로. 예: "2026. 10. 8."
export function formatDateKST(iso: string): string {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).format(new Date(iso))
}
