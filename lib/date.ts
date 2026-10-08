// 날짜 계산은 모두 한국 시간(Asia/Seoul) 기준입니다.
// 날짜는 "YYYY-MM-DD" 글자로 주고받습니다(DB의 date 형식과 같음).

const TIME_ZONE = "Asia/Seoul"
export const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"]
// 한국은 서머타임이 없어 항상 UTC+9입니다.
const KST_OFFSET_MS = 9 * 60 * 60 * 1000
const MINUTE_MS = 60_000

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

export function addDays(ymd: string, days: number): string {
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

// 그 날짜가 속한 주의 월요일
export function weekStartOf(ymd: string): string {
  return addDays(ymd, -((weekdayOf(ymd) + 6) % 7))
}

// 그 달의 날 수
export function daysInMonth(ymd: string): number {
  const d = toUtcDate(`${ymd.slice(0, 8)}01`)
  d.setUTCMonth(d.getUTCMonth() + 1, 0)
  return d.getUTCDate()
}

// 요일 숫자: 0=일, 1=월 … 6=토
export function weekdayOf(ymd: string): number {
  return toUtcDate(ymd).getUTCDay()
}

// ── 시각 계산 ──────────────────────────────────────────────
// 화면과 배치 규칙에서는 "한국 날짜(YYYY-MM-DD) + 그날 0시부터 지난 분"으로 다루고,
// DB에는 실제 시각(timestamptz)으로 저장합니다. ms는 1970년부터 지난 밀리초입니다.

export function kstToMs(ymd: string, minutes = 0): number {
  return Date.parse(`${ymd}T00:00:00Z`) - KST_OFFSET_MS + minutes * MINUTE_MS
}

export function msToKst(ms: number): { ymd: string; minutes: number } {
  const shifted = new Date(ms + KST_OFFSET_MS)
  return {
    ymd: shifted.toISOString().slice(0, 10),
    minutes: shifted.getUTCHours() * 60 + shifted.getUTCMinutes(),
  }
}

export function kstToIso(ymd: string, minutes = 0): string {
  return new Date(kstToMs(ymd, minutes)).toISOString()
}

// 540 → "09:00"
export function formatClock(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`
}

// "09:00" 또는 DB의 "09:00:00" → 540. 형식이 틀리면 null
export function parseClock(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(value)
  if (!match) return null
  const h = Number(match[1])
  const m = Number(match[2])
  if (h > 24 || m > 59 || (h === 24 && m > 0)) return null
  return h * 60 + m
}

// 90 → "1시간 30분"
export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h && m) return `${h}시간 ${m}분`
  return h ? `${h}시간` : `${m}분`
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
