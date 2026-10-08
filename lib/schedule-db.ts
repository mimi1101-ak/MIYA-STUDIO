import "server-only"

import { addDays, kstToMs, msToKst, parseClock, todayKST } from "@/lib/date"
import {
  DEFAULT_WORK_HOURS,
  expandRoutines,
  HORIZON_DAYS,
  overlaps,
  placeAll,
  type Interval,
  type PlaceRequest,
  type RoutineTime,
  type WorkHours,
} from "@/lib/schedule"
import type { createClient } from "@/lib/supabase/server"

// 배치 규칙(lib/schedule.ts)에 DB 데이터를 넣고 결과를 저장하는 부분입니다.

export type Supabase = Awaited<ReturnType<typeof createClient>>

const MINUTE_MS = 60_000
const DAY_MS = 24 * 60 * MINUTE_MS
// "나중에"를 누르면 최소 이만큼 뒤로 미룹니다.
const POSTPONE_MIN_MS = 30 * MINUTE_MS

export async function loadWorkHours(supabase: Supabase, userId: string): Promise<WorkHours> {
  const { data } = await supabase
    .from("profiles")
    .select("work_days, work_start, work_end")
    .eq("id", userId)
    .maybeSingle()
  if (!data) return DEFAULT_WORK_HOURS
  return {
    days: data.work_days,
    start: parseClock(data.work_start) ?? DEFAULT_WORK_HOURS.start,
    end: parseClock(data.work_end) ?? DEFAULT_WORK_HOURS.end,
  }
}

export function toRoutineTime(row: {
  weekdays: number[]
  start_time: string
  duration_minutes: number
}): RoutineTime {
  return { weekdays: row.weekdays, start: parseClock(row.start_time) ?? 0, minutes: row.duration_minutes }
}

// from~to 사이의 바쁜 시간: 일정, 루틴, 이미 배치된 할 일(excludeTaskIds는 빼고)
async function loadBusy(
  supabase: Supabase,
  from: number,
  to: number,
  excludeTaskIds: Set<string>
): Promise<Interval[]> {
  const fromIso = new Date(from).toISOString()
  const toIso = new Date(to).toISOString()
  // 할 일은 최대 12시간이라, 시작이 그보다 이전이면 범위에 걸칠 수 없습니다.
  const taskFromIso = new Date(from - 12 * 60 * MINUTE_MS).toISOString()

  const [events, routines, tasks] = await Promise.all([
    supabase.from("events").select("starts_at, ends_at").lt("starts_at", toIso).gt("ends_at", fromIso),
    supabase.from("routines").select("weekdays, start_time, duration_minutes"),
    supabase
      .from("tasks")
      .select("id, scheduled_at, estimated_minutes")
      .not("scheduled_at", "is", null)
      .gte("scheduled_at", taskFromIso)
      .lt("scheduled_at", toIso),
  ])
  if (events.error || routines.error || tasks.error) throw new Error("바쁜 시간을 불러오지 못했어요")

  const busy: Interval[] = events.data.map((e) => ({
    start: Date.parse(e.starts_at),
    end: Date.parse(e.ends_at),
  }))
  busy.push(
    ...expandRoutines(routines.data.map(toRoutineTime), msToKst(from).ymd, msToKst(to).ymd)
  )
  for (const t of tasks.data) {
    if (excludeTaskIds.has(t.id) || !t.scheduled_at) continue
    const start = Date.parse(t.scheduled_at)
    busy.push({ start, end: start + t.estimated_minutes * MINUTE_MS })
  }
  return busy
}

// 할 일들을 빈 시간에 배치해 시작 시각을 계산합니다(저장은 하지 않음).
// 옮길 할 일 자신의 원래 자리는 바쁜 시간에서 뺍니다.
export async function computePlacements(
  supabase: Supabase,
  userId: string,
  requests: PlaceRequest[]
): Promise<Map<string, number | null>> {
  if (requests.length === 0) return new Map()
  const work = await loadWorkHours(supabase, userId)
  const from = Math.min(...requests.map((r) => r.notBefore))
  const to = Math.max(...requests.map((r) => r.notBefore)) + HORIZON_DAYS * DAY_MS
  const busy = await loadBusy(supabase, from, to, new Set(requests.map((r) => r.id)))
  return placeAll(requests, work, busy)
}

function isoOrNull(ms: number | null): string | null {
  return ms === null ? null : new Date(ms).toISOString()
}

type MovableTask = { id: string; estimated_minutes: number; scheduled_at: string | null; carry_count: number }

// 이미 있는 할 일을 다시 배치해 저장합니다. carry가 true면 이월 횟수를 1 올립니다.
// 저장에 실패하면 null, 성공하면 할 일 id → 새 시작 시각(ms, 자리가 없으면 null)
async function moveTasks(
  supabase: Supabase,
  userId: string,
  tasks: MovableTask[],
  notBefore: (task: MovableTask) => number,
  carry: boolean
): Promise<Map<string, number | null> | null> {
  const placements = await computePlacements(
    supabase,
    userId,
    tasks.map((t) => ({ id: t.id, minutes: t.estimated_minutes, notBefore: notBefore(t) }))
  )
  const results = await Promise.all(
    tasks.map((t) => {
      let query = supabase
        .from("tasks")
        .update({
          scheduled_at: isoOrNull(placements.get(t.id) ?? null),
          carry_count: carry ? t.carry_count + 1 : t.carry_count,
        })
        .eq("id", t.id)
        .eq("is_done", false)
      // 같은 요청이 동시에 두 번 들어와도 한 번만 옮겨지게, 원래 시각이 그대로일 때만 바꿉니다.
      query = t.scheduled_at ? query.eq("scheduled_at", t.scheduled_at) : query.is("scheduled_at", null)
      return query
    })
  )
  return results.every((r) => !r.error) ? placements : null
}

const MOVABLE_COLUMNS = "id, estimated_minutes, scheduled_at, carry_count"

// 어제 이전에 배치됐는데 못 끝낸 할 일 → 지금 이후의 빈 시간으로 옮기고 이월 횟수 +1.
// 오늘 안에서 시간만 지난 할 일은 옮기지 않고 '밀린 일'로 보여 줍니다.
export async function carryOverPastTasks(supabase: Supabase, userId: string, now: number) {
  const todayStart = kstToMs(todayKST(new Date(now)))
  const { data } = await supabase
    .from("tasks")
    .select(MOVABLE_COLUMNS)
    .eq("is_done", false)
    .not("scheduled_at", "is", null)
    .lt("scheduled_at", new Date(todayStart).toISOString())
    .order("scheduled_at", { ascending: true })
  if (!data || data.length === 0) return
  await moveTasks(supabase, userId, data, () => now, true)
}

// "나중에": 이 할 일을 다음 빈 시간으로 옮기고 이월 횟수 +1.
// 실패하면 false, 성공하면 새 시작 시각(ms, 자리가 없으면 null)
export async function postponeTask(
  supabase: Supabase,
  userId: string,
  taskId: string,
  now: number
): Promise<number | null | false> {
  const { data } = await supabase
    .from("tasks")
    .select(MOVABLE_COLUMNS)
    .eq("id", taskId)
    .eq("is_done", false)
    .maybeSingle()
  if (!data) return false
  const end = data.scheduled_at
    ? Date.parse(data.scheduled_at) + data.estimated_minutes * MINUTE_MS
    : now
  const moved = await moveTasks(supabase, userId, [data], () => Math.max(end, now + POSTPONE_MIN_MS), true)
  return moved ? (moved.get(data.id) ?? null) : false
}

// 시간 미정 할 일들을 지금 이후의 빈 시간에 넣기
export async function placeUnscheduled(supabase: Supabase, userId: string, now: number) {
  const { data } = await supabase
    .from("tasks")
    .select(MOVABLE_COLUMNS)
    .eq("is_done", false)
    .is("scheduled_at", null)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true })
  if (!data || data.length === 0) return true
  return (await moveTasks(supabase, userId, data, () => now, false)) !== null
}

// 일정·루틴이 바뀐 뒤: 앞으로 남은 할 일 중 일정·루틴과 겹치는 것을 다음 빈 시간으로 밀어냅니다.
// (사용자가 일부러 할 일끼리 겹쳐 둔 것은 건드리지 않습니다.)
export async function reflowConflicts(supabase: Supabase, userId: string, now: number) {
  const until = now + HORIZON_DAYS * DAY_MS
  const nowIso = new Date(now).toISOString()
  const untilIso = new Date(until).toISOString()

  const [tasks, events, routines] = await Promise.all([
    supabase
      .from("tasks")
      .select(MOVABLE_COLUMNS)
      .eq("is_done", false)
      .gte("scheduled_at", nowIso)
      .lt("scheduled_at", untilIso)
      .order("scheduled_at", { ascending: true }),
    supabase.from("events").select("starts_at, ends_at").gt("ends_at", nowIso).lt("starts_at", untilIso),
    supabase.from("routines").select("weekdays, start_time, duration_minutes"),
  ])
  if (!tasks.data || !events.data || !routines.data || tasks.data.length === 0) return

  const fixed: Interval[] = [
    ...events.data.map((e) => ({ start: Date.parse(e.starts_at), end: Date.parse(e.ends_at) })),
    ...expandRoutines(
      routines.data.map(toRoutineTime),
      msToKst(now).ymd,
      addDays(msToKst(until).ymd, 1)
    ),
  ]
  const conflicting = tasks.data.filter((t) => {
    const start = Date.parse(t.scheduled_at!)
    const slot = { start, end: start + t.estimated_minutes * MINUTE_MS }
    return fixed.some((f) => overlaps(slot, f))
  })
  if (conflicting.length === 0) return

  // 원래 자리보다 앞당기지는 않습니다.
  await moveTasks(supabase, userId, conflicting, (t) => Math.max(now, Date.parse(t.scheduled_at!)), false)
}
