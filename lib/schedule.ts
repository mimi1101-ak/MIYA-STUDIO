// 할 일 자동 배치 규칙 (DB를 모르는 순수 계산). 서버에서만 쓰지만 시험하기 쉽게 따로 둡니다.
// 원칙: 일할 수 있는 시간 안에서, 일정·루틴·다른 할 일과 겹치지 않는 가장 이른 빈 자리에 넣습니다.
// 시간이 모자라면 하루에 몰아넣지 않고 다음 날로 넘깁니다. 할 일 하나는 쪼개지 않고 한 덩어리로 넣습니다.

import { addDays, kstToMs, msToKst, weekdayOf } from "@/lib/date"

// 시작·끝 시각(ms) 구간
export type Interval = { start: number; end: number }

// 일할 수 있는 시간: 요일(0=일 … 6=토)과 하루 시작·끝(0시부터 지난 분)
export type WorkHours = { days: number[]; start: number; end: number }

export type RoutineTime = { weekdays: number[]; start: number; minutes: number }

export type PlaceRequest = { id: string; minutes: number; notBefore: number }

const MINUTE_MS = 60_000
// 배치 시각은 5분 단위로 맞춥니다.
const STEP_MS = 5 * MINUTE_MS
// 앞으로 이 기간 안에서만 빈 자리를 찾습니다.
export const HORIZON_DAYS = 120

export const DEFAULT_WORK_HOURS: WorkHours = { days: [1, 2, 3, 4, 5], start: 9 * 60, end: 18 * 60 }

function roundUp(ms: number): number {
  return Math.ceil(ms / STEP_MS) * STEP_MS
}

// 루틴을 날짜 범위(from~to, 둘 다 포함) 안의 실제 시각 구간으로 펼칩니다.
export function expandRoutines(routines: RoutineTime[], fromYmd: string, toYmd: string): Interval[] {
  const result: Interval[] = []
  for (let ymd = fromYmd; ymd <= toYmd; ymd = addDays(ymd, 1)) {
    const weekday = weekdayOf(ymd)
    for (const r of routines) {
      if (!r.weekdays.includes(weekday)) continue
      const start = kstToMs(ymd, r.start)
      result.push({ start, end: start + r.minutes * MINUTE_MS })
    }
  }
  return result
}

// notBefore 이후, 일할 수 있는 시간 안에서 minutes만큼 비어 있는 첫 시작 시각. 없으면 null
export function findSlot(
  minutes: number,
  notBefore: number,
  work: WorkHours,
  busy: Interval[],
  horizonDays = HORIZON_DAYS
): number | null {
  const need = minutes * MINUTE_MS
  const sorted = [...busy].sort((a, b) => a.start - b.start)
  let ymd = msToKst(notBefore).ymd

  for (let i = 0; i < horizonDays; i++, ymd = addDays(ymd, 1)) {
    if (!work.days.includes(weekdayOf(ymd))) continue
    const dayEnd = kstToMs(ymd, work.end)
    let cursor = roundUp(Math.max(kstToMs(ymd, work.start), notBefore))

    for (const block of sorted) {
      if (block.end <= cursor) continue
      if (block.start >= dayEnd) break
      if (block.start - cursor >= need) return cursor
      cursor = roundUp(Math.max(cursor, block.end))
    }
    if (dayEnd - cursor >= need) return cursor
  }
  return null
}

// 여러 할 일을 순서대로 배치합니다. 앞에서 넣은 할 일 자리도 바쁜 시간으로 칩니다.
// 결과: 할 일 id → 시작 시각(ms). 빈 자리를 못 찾으면 null(시간 미정)
export function placeAll(
  requests: PlaceRequest[],
  work: WorkHours,
  busy: Interval[]
): Map<string, number | null> {
  const taken = [...busy]
  const result = new Map<string, number | null>()
  for (const request of requests) {
    const start = findSlot(request.minutes, request.notBefore, work, taken)
    if (start !== null) taken.push({ start, end: start + request.minutes * MINUTE_MS })
    result.set(request.id, start)
  }
  return result
}

export function overlaps(a: Interval, b: Interval): boolean {
  return a.start < b.end && b.start < a.end
}
