import "server-only"

import {
  sortItems,
  type AgendaItem,
  type GoalOption,
  type GoalProgress,
  type UnscheduledTask,
} from "@/lib/agenda-types"
import { addDays, daysInMonth, kstToIso, msToKst, parseClock, weekdayOf, weekStartOf } from "@/lib/date"
import { carryOverPastTasks, loadWorkHours, type Supabase } from "@/lib/schedule-db"

const MINUTE_MS = 60_000
const DAY_MINUTES = 24 * 60

function asSource(value: string): "manual" | "ai" {
  return value === "ai" ? "ai" : "manual"
}

// 기간(from~to, 둘 다 포함) 안의 할 일·일정·루틴을 한 목록으로 가져옵니다. 실패하면 null
export async function loadAgenda(
  supabase: Supabase,
  fromYmd: string,
  toYmd: string
): Promise<AgendaItem[] | null> {
  const fromIso = kstToIso(fromYmd)
  const toIso = kstToIso(addDays(toYmd, 1))

  const [tasks, events, routines, checks, goals] = await Promise.all([
    supabase
      .from("tasks")
      .select("id, title, is_done, scheduled_at, estimated_minutes, goal_id, source, carry_count")
      .gte("scheduled_at", fromIso)
      .lt("scheduled_at", toIso),
    supabase
      .from("events")
      .select("id, title, starts_at, ends_at")
      .lt("starts_at", toIso)
      .gt("ends_at", fromIso),
    supabase.from("routines").select("id, title, weekdays, start_time, duration_minutes"),
    supabase
      .from("routine_checks")
      .select("routine_id, check_date")
      .gte("check_date", fromYmd)
      .lte("check_date", toYmd),
    loadGoalOptions(supabase, true),
  ])
  if (tasks.error || events.error || routines.error || checks.error || !goals) return null

  const goalTitles = new Map(goals.map((g) => [g.id, g.title]))
  const items: AgendaItem[] = []

  for (const t of tasks.data) {
    const start = Date.parse(t.scheduled_at!)
    const { ymd, minutes } = msToKst(start)
    items.push({
      key: `task:${t.id}`,
      kind: "task",
      id: t.id,
      title: t.title,
      ymd,
      start: minutes,
      end: Math.min(minutes + t.estimated_minutes, DAY_MINUTES),
      done: t.is_done,
      goalId: t.goal_id,
      goalTitle: t.goal_id ? (goalTitles.get(t.goal_id) ?? null) : null,
      source: asSource(t.source),
      carryCount: t.carry_count,
    })
  }

  // 자정을 넘기는 일정은 날짜마다 나눠서 보여 줍니다.
  for (const e of events.data) {
    const startMs = Date.parse(e.starts_at)
    const endMs = Date.parse(e.ends_at)
    const first = msToKst(startMs)
    const last = msToKst(endMs - MINUTE_MS)
    for (let ymd = first.ymd; ymd <= last.ymd; ymd = addDays(ymd, 1)) {
      if (ymd < fromYmd || ymd > toYmd) continue
      items.push({
        key: `event:${e.id}:${ymd}`,
        kind: "event",
        id: e.id,
        title: e.title,
        ymd,
        start: ymd === first.ymd ? first.minutes : 0,
        end: ymd === last.ymd ? last.minutes + 1 : DAY_MINUTES,
        done: false,
        goalId: null,
        goalTitle: null,
        source: null,
        carryCount: 0,
      })
    }
  }

  const checked = new Set(checks.data.map((c) => `${c.routine_id}:${c.check_date}`))
  for (let ymd = fromYmd; ymd <= toYmd; ymd = addDays(ymd, 1)) {
    const weekday = weekdayOf(ymd)
    for (const r of routines.data) {
      if (!r.weekdays.includes(weekday)) continue
      const start = parseClock(r.start_time) ?? 0
      items.push({
        key: `routine:${r.id}:${ymd}`,
        kind: "routine",
        id: r.id,
        title: r.title,
        ymd,
        start,
        end: Math.min(start + r.duration_minutes, DAY_MINUTES),
        done: checked.has(`${r.id}:${ymd}`),
        goalId: null,
        goalTitle: null,
        source: null,
        carryCount: 0,
      })
    }
  }

  return items
}

// 할 일을 연결할 수 있는 목표 목록. includeAll이면 끝난 목표도 포함(제목 표시용)
export async function loadGoalOptions(
  supabase: Supabase,
  includeAll = false
): Promise<GoalOption[] | null> {
  let query = supabase.from("goals").select("id, title").order("created_at", { ascending: true })
  query = includeAll ? query.neq("status", "draft") : query.eq("status", "active")
  const { data, error } = await query
  return error ? null : data
}

export async function loadUnscheduled(supabase: Supabase): Promise<UnscheduledTask[] | null> {
  const [tasks, goals] = await Promise.all([
    supabase
      .from("tasks")
      .select("id, title, estimated_minutes, goal_id, source")
      .eq("is_done", false)
      .is("scheduled_at", null)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true }),
    loadGoalOptions(supabase, true),
  ])
  if (tasks.error || !goals) return null
  const goalTitles = new Map(goals.map((g) => [g.id, g.title]))
  return tasks.data.map((t) => ({
    id: t.id,
    title: t.title,
    minutes: t.estimated_minutes,
    goalTitle: t.goal_id ? (goalTitles.get(t.goal_id) ?? null) : null,
    source: asSource(t.source),
  }))
}

// 진행 중인 목표별 진척도: 이번 주(weekStart~+6일)와 전체. 예상 소요시간 합계 기준
export async function loadGoalProgress(
  supabase: Supabase,
  weekStart: string
): Promise<GoalProgress[] | null> {
  const goals = await supabase
    .from("goals")
    .select("id, title, deadline")
    .eq("status", "active")
    .order("created_at", { ascending: true })
  if (goals.error) return null
  if (goals.data.length === 0) return []

  const tasks = await supabase
    .from("tasks")
    .select("goal_id, estimated_minutes, is_done, scheduled_at")
    .in(
      "goal_id",
      goals.data.map((g) => g.id)
    )
  if (tasks.error) return null

  const weekFrom = Date.parse(kstToIso(weekStart))
  const weekTo = Date.parse(kstToIso(addDays(weekStart, 7)))

  return goals.data.map((g) => {
    const progress: GoalProgress = { ...g, weekDone: 0, weekTotal: 0, done: 0, total: 0 }
    for (const t of tasks.data) {
      if (t.goal_id !== g.id) continue
      progress.total += t.estimated_minutes
      if (t.is_done) progress.done += t.estimated_minutes
      const at = t.scheduled_at ? Date.parse(t.scheduled_at) : NaN
      if (at >= weekFrom && at < weekTo) {
        progress.weekTotal += t.estimated_minutes
        if (t.is_done) progress.weekDone += t.estimated_minutes
      }
    }
    return progress
  })
}

// 3번 이상 미룬, 아직 못 끝낸 할 일
export async function loadOftenCarried(supabase: Supabase) {
  const { data } = await supabase
    .from("tasks")
    .select("id, title, carry_count, estimated_minutes")
    .eq("is_done", false)
    .gte("carry_count", 3)
    .order("carry_count", { ascending: false })
    .limit(3)
  return data ?? []
}

// "오늘" 화면에 필요한 것을 한 번에: 지난 할 일 이월 → 오늘 항목·목표·시간 미정·자주 미룬 할 일
export async function loadToday(supabase: Supabase, userId: string) {
  const now = Date.now()
  const { ymd: today, minutes } = msToKst(now)

  try {
    await carryOverPastTasks(supabase, userId, now)
  } catch (error) {
    console.error("[today] 이월 실패:", error instanceof Error ? error.message : error)
  }

  const [items, goals, unscheduled, oftenCarried] = await Promise.all([
    loadAgenda(supabase, today, today),
    loadGoalOptions(supabase),
    loadUnscheduled(supabase),
    loadOftenCarried(supabase),
  ])
  if (!items || !goals || !unscheduled) return null
  return { today, minutes, items: sortItems(items), goals, unscheduled, oftenCarried }
}

export type CalendarView = "week" | "month"

export type RoutineRow = { id: string; title: string; weekdays: number[]; start: number; minutes: number }

// 캘린더 화면: 보이는 기간(주간 7일 / 월간 6주 칸)의 항목 + 목표·루틴 목록 + 일할 시간
export async function loadCalendar(
  supabase: Supabase,
  userId: string,
  view: CalendarView,
  dateParam: string | null
) {
  const now = Date.now()
  const { ymd: today, minutes: nowMinutes } = msToKst(now)
  const date = dateParam ?? today

  const first = view === "month" ? weekStartOf(`${date.slice(0, 8)}01`) : weekStartOf(date)
  const monthLast = `${date.slice(0, 8)}${String(daysInMonth(date)).padStart(2, "0")}`
  const last = view === "month" ? addDays(weekStartOf(monthLast), 6) : addDays(first, 6)

  try {
    await carryOverPastTasks(supabase, userId, now)
  } catch (error) {
    console.error("[calendar] 이월 실패:", error instanceof Error ? error.message : error)
  }

  const [items, goals, allGoals, routines, work] = await Promise.all([
    loadAgenda(supabase, first, last),
    loadGoalOptions(supabase),
    loadGoalOptions(supabase, true),
    supabase
      .from("routines")
      .select("id, title, weekdays, start_time, duration_minutes")
      .order("start_time", { ascending: true }),
    loadWorkHours(supabase, userId),
  ])
  if (!items || !goals || !allGoals || routines.error) return null

  return {
    today,
    nowMinutes,
    date,
    first,
    last,
    items: sortItems(items),
    goals,
    allGoals,
    routines: routines.data.map(
      (r): RoutineRow => ({
        id: r.id,
        title: r.title,
        weekdays: r.weekdays,
        start: parseClock(r.start_time) ?? 0,
        minutes: r.duration_minutes,
      })
    ),
    work,
  }
}
