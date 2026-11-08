"use server"

// 할 일·일정·루틴 저장 기능(서버 액션). "오늘"과 캘린더 화면이 함께 씁니다.
// 할 일은 시각 없이 날짜·순서만 가집니다(lib/task-order.ts).

import { refresh } from "next/cache"

import { requireUser } from "@/lib/auth"
import { addDays, formatClock, formatDayLabel, kstToMs, todayKST } from "@/lib/date"
import { aiErrorMessage, splitTaskWithAi } from "@/lib/goal-ai"
import { markIdeaInProgress } from "@/lib/idea-links"
import { createAppender, dayIso, loadDayOrder, ymdOf } from "@/lib/task-order"
import {
  cleanText,
  isDuration,
  isMinuteOfDay,
  isUuid,
  isValidDate,
  isWeekdayList,
  LIMITS,
  type ActionResult,
} from "@/lib/validation"

const BAD_REQUEST: ActionResult = { ok: false, error: "잘못된 요청이에요." }
const SAVE_ERROR: ActionResult = { ok: false, error: "저장하지 못했어요. 잠시 후 다시 시도해 주세요." }
const DELETE_ERROR: ActionResult = { ok: false, error: "삭제하지 못했어요. 잠시 후 다시 시도해 주세요." }
const MINUTE_MS = 60_000
const DEFAULT_TASK_MINUTES = 30
// 한 번에 순서를 바꿀 수 있는 할 일 수
const MAX_REORDER = 300

function checkTitle(raw: unknown): string | null {
  const title = cleanText(raw)
  return title && title.length <= LIMITS.taskTitle ? title : null
}

// 예: "오늘 할 일", "내일 할 일", "11월 12일 (목) 할 일", 날짜가 없으면 "날짜 미정 할 일"
function dayName(ymd: string | null): string {
  if (!ymd) return "날짜 미정 할 일"
  const today = todayKST()
  if (ymd === today) return "오늘 할 일"
  if (ymd === addDays(today, 1)) return "내일 할 일"
  return `${formatDayLabel(ymd)} 할 일`
}

// ── 할 일 ────────────────────────────────────────────────

export type TaskInput = {
  title: string
  // 예상 시간(분): 목표 진척도 계산에 씁니다.
  minutes: number
  goalId: string | null
  // 할 날짜. 비우면 '날짜 미정'
  date: string | null
  // 아이디어에서 보내는 할 일이면 그 아이디어 (새로 만들 때만 씀, 고칠 때는 연결을 그대로 둠)
  ideaId?: string | null
}

function checkTaskInput(input: TaskInput): TaskInput | null {
  const title = checkTitle(input?.title)
  if (!title || !isDuration(input.minutes)) return null
  if (input.goalId !== null && !isUuid(input.goalId)) return null
  if (input.ideaId != null && !isUuid(input.ideaId)) return null
  if (input.date !== null && !isValidDate(input.date)) return null
  return { ...input, title }
}

// 새 할 일은 그날 목록 맨 아래에 붙습니다.
export async function addTask(input: TaskInput): Promise<ActionResult> {
  const checked = checkTaskInput(input)
  if (!checked) return BAD_REQUEST
  const { supabase, userId } = await requireUser()

  let sortOrder = 0
  if (checked.date) {
    try {
      sortOrder = (await createAppender(supabase, [checked.date]))(checked.date)
    } catch {
      return SAVE_ERROR
    }
  }
  const { error } = await supabase.from("tasks").insert({
    user_id: userId,
    title: checked.title,
    estimated_minutes: checked.minutes,
    goal_id: checked.goalId,
    idea_id: checked.ideaId ?? null,
    scheduled_at: checked.date ? dayIso(checked.date) : null,
    sort_order: sortOrder,
    source: "manual",
  })
  if (error) return SAVE_ERROR
  if (checked.ideaId) await markIdeaInProgress(supabase, userId, checked.ideaId)

  refresh()
  return { ok: true, message: `${dayName(checked.date)}에 넣었어요.` }
}

// 날짜를 바꾸면 새 날짜 목록 맨 아래로 갑니다. 날짜가 같으면 순서는 그대로 둡니다.
export async function updateTask(id: string, input: TaskInput): Promise<ActionResult> {
  const checked = checkTaskInput(input)
  if (!isUuid(id) || !checked) return BAD_REQUEST
  const { supabase, userId } = await requireUser()

  const { data: current } = await supabase.from("tasks").select("scheduled_at").eq("id", id).maybeSingle()
  if (!current) return BAD_REQUEST
  const currentYmd = current.scheduled_at ? ymdOf(current.scheduled_at) : null

  const update: { title: string; estimated_minutes: number; goal_id: string | null; scheduled_at?: string | null; sort_order?: number } = {
    title: checked.title,
    estimated_minutes: checked.minutes,
    goal_id: checked.goalId,
  }
  if (checked.date !== currentYmd) {
    update.scheduled_at = checked.date ? dayIso(checked.date) : null
    if (checked.date) {
      try {
        update.sort_order = (await createAppender(supabase, [checked.date]))(checked.date)
      } catch {
        return SAVE_ERROR
      }
    }
  }
  const { error } = await supabase.from("tasks").update(update).eq("id", id).eq("user_id", userId)
  if (error) return SAVE_ERROR

  refresh()
  return { ok: true, message: checked.date !== currentYmd ? `${dayName(checked.date)}로 옮겼어요.` : "저장했어요." }
}

export async function setTaskDone(id: string, isDone: boolean): Promise<ActionResult> {
  if (!isUuid(id) || typeof isDone !== "boolean") return BAD_REQUEST
  const { supabase, userId } = await requireUser()

  const { error } = await supabase
    .from("tasks")
    .update({ is_done: isDone, done_at: isDone ? new Date().toISOString() : null })
    .eq("id", id)
    .eq("user_id", userId)
  if (error) return SAVE_ERROR

  refresh()
  return { ok: true }
}

export async function deleteTask(id: string): Promise<ActionResult> {
  if (!isUuid(id)) return BAD_REQUEST
  const { supabase, userId } = await requireUser()

  const { error } = await supabase.from("tasks").delete().eq("id", id).eq("user_id", userId)
  if (error) return DELETE_ERROR

  refresh()
  return { ok: true }
}

// 끌어서 바꾼 순서 저장: ids 순서대로 0, 1, 2 … 번호를 매깁니다(한 날짜의 목록).
export async function reorderTasks(ids: string[]): Promise<ActionResult> {
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > MAX_REORDER) return BAD_REQUEST
  if (!ids.every(isUuid) || new Set(ids).size !== ids.length) return BAD_REQUEST
  const { supabase, userId } = await requireUser()

  const results = await Promise.all(
    ids.map((id, index) => supabase.from("tasks").update({ sort_order: index }).eq("id", id).eq("user_id", userId))
  )
  if (results.some((r) => r.error)) return SAVE_ERROR

  refresh()
  return { ok: true }
}

// "내일로": 내일 목록 맨 아래로 옮기기 (이월 횟수 +1)
export async function postponeTaskAction(id: string): Promise<ActionResult> {
  if (!isUuid(id)) return BAD_REQUEST
  const { supabase, userId } = await requireUser()

  const { data: task } = await supabase
    .from("tasks")
    .select("title, carry_count")
    .eq("id", id)
    .eq("is_done", false)
    .maybeSingle()
  if (!task) return BAD_REQUEST
  const tomorrow = addDays(todayKST(), 1)
  let sortOrder: number
  try {
    sortOrder = (await createAppender(supabase, [tomorrow]))(tomorrow)
  } catch {
    return SAVE_ERROR
  }
  const { error } = await supabase
    .from("tasks")
    .update({ scheduled_at: dayIso(tomorrow), sort_order: sortOrder, carry_count: task.carry_count + 1 })
    .eq("id", id)
    .eq("user_id", userId)
  if (error) return SAVE_ERROR

  refresh()
  return { ok: true, message: `'${task.title}'을(를) 내일 할 일로 옮겼어요.` }
}

// 자주 미룬 할 일을 그대로 두기로 했을 때: 이월 횟수를 0으로
export async function keepTask(id: string): Promise<ActionResult> {
  if (!isUuid(id)) return BAD_REQUEST
  const { supabase, userId } = await requireUser()
  const { error } = await supabase.from("tasks").update({ carry_count: 0 }).eq("id", id).eq("user_id", userId)
  if (error) return SAVE_ERROR
  refresh()
  return { ok: true }
}

// 날짜 미정 할 일을 모두 오늘 목록 맨 아래로
export async function bringUnscheduledToToday(): Promise<ActionResult> {
  const { supabase, userId } = await requireUser()
  const { data, error } = await supabase
    .from("tasks")
    .select("id")
    .eq("is_done", false)
    .is("scheduled_at", null)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true })
  if (error) return SAVE_ERROR
  if (data.length === 0) return { ok: true }

  const today = todayKST()
  let next: (ymd: string) => number
  try {
    next = await createAppender(supabase, [today])
  } catch {
    return SAVE_ERROR
  }
  const results = await Promise.all(
    data.map((t) =>
      supabase
        .from("tasks")
        .update({ scheduled_at: dayIso(today), sort_order: next(today) })
        .eq("id", t.id)
        .eq("user_id", userId)
        .is("scheduled_at", null)
    )
  )
  if (results.some((r) => r.error)) return SAVE_ERROR

  refresh()
  return { ok: true, message: `날짜 미정 할 일 ${data.length}개를 오늘 할 일로 가져왔어요.` }
}

// ── 일정 ────────────────────────────────────────────────

export type EventInput = { title: string; date: string; start: number; minutes: number }

function checkEventInput(input: EventInput): EventInput | null {
  const title = checkTitle(input?.title)
  if (!title || !isValidDate(input.date) || !isMinuteOfDay(input.start)) return null
  if (!Number.isInteger(input.minutes) || input.minutes < 5 || input.minutes > 7 * 24 * 60) return null
  return { ...input, title }
}

function eventTimes(input: EventInput) {
  const start = kstToMs(input.date, input.start)
  return {
    starts_at: new Date(start).toISOString(),
    ends_at: new Date(start + input.minutes * MINUTE_MS).toISOString(),
  }
}

export async function addEvent(input: EventInput): Promise<ActionResult> {
  const checked = checkEventInput(input)
  if (!checked) return BAD_REQUEST
  const { supabase, userId } = await requireUser()

  const { error } = await supabase
    .from("events")
    .insert({ user_id: userId, title: checked.title, ...eventTimes(checked) })
  if (error) return SAVE_ERROR

  refresh()
  return { ok: true, message: `${formatDayLabel(checked.date)} ${formatClock(checked.start)} 일정으로 넣었어요.` }
}

export async function updateEvent(id: string, input: EventInput): Promise<ActionResult> {
  const checked = checkEventInput(input)
  if (!isUuid(id) || !checked) return BAD_REQUEST
  const { supabase, userId } = await requireUser()

  const { error } = await supabase
    .from("events")
    .update({ title: checked.title, ...eventTimes(checked) })
    .eq("id", id)
    .eq("user_id", userId)
  if (error) return SAVE_ERROR

  refresh()
  return { ok: true }
}

export async function deleteEvent(id: string): Promise<ActionResult> {
  if (!isUuid(id)) return BAD_REQUEST
  const { supabase, userId } = await requireUser()
  const { error } = await supabase.from("events").delete().eq("id", id).eq("user_id", userId)
  if (error) return DELETE_ERROR
  refresh()
  return { ok: true }
}

// ── 루틴 ────────────────────────────────────────────────

export type RoutineInput = { title: string; weekdays: number[]; start: number; minutes: number }

function checkRoutineInput(input: RoutineInput): RoutineInput | null {
  const title = checkTitle(input?.title)
  if (!title || !isWeekdayList(input.weekdays) || !isMinuteOfDay(input.start)) return null
  if (!isDuration(input.minutes) || input.start + input.minutes > 24 * 60) return null
  return { ...input, title }
}

function routineRow(input: RoutineInput) {
  return {
    title: input.title,
    weekdays: [...input.weekdays].sort(),
    start_time: formatClock(input.start),
    duration_minutes: input.minutes,
  }
}

export async function addRoutine(input: RoutineInput): Promise<ActionResult> {
  const checked = checkRoutineInput(input)
  if (!checked) return BAD_REQUEST
  const { supabase, userId } = await requireUser()

  const { error } = await supabase.from("routines").insert({ user_id: userId, ...routineRow(checked) })
  if (error) return SAVE_ERROR

  refresh()
  return { ok: true }
}

export async function updateRoutine(id: string, input: RoutineInput): Promise<ActionResult> {
  const checked = checkRoutineInput(input)
  if (!isUuid(id) || !checked) return BAD_REQUEST
  const { supabase, userId } = await requireUser()

  const { error } = await supabase.from("routines").update(routineRow(checked)).eq("id", id).eq("user_id", userId)
  if (error) return SAVE_ERROR

  refresh()
  return { ok: true }
}

export async function deleteRoutine(id: string): Promise<ActionResult> {
  if (!isUuid(id)) return BAD_REQUEST
  const { supabase, userId } = await requireUser()
  const { error } = await supabase.from("routines").delete().eq("id", id).eq("user_id", userId)
  if (error) return DELETE_ERROR
  refresh()
  return { ok: true }
}

export async function setRoutineDone(id: string, date: string, isDone: boolean): Promise<ActionResult> {
  if (!isUuid(id) || !isValidDate(date) || typeof isDone !== "boolean") return BAD_REQUEST
  const { supabase, userId } = await requireUser()

  const { error } = isDone
    ? await supabase
        .from("routine_checks")
        .upsert(
          { routine_id: id, user_id: userId, check_date: date },
          { onConflict: "routine_id,check_date", ignoreDuplicates: true }
        )
    : await supabase.from("routine_checks").delete().eq("routine_id", id).eq("check_date", date)
  if (error) return SAVE_ERROR

  refresh()
  return { ok: true }
}

// ── 빠른 입력 ────────────────────────────────────────────

// 한 줄을 그대로 할 일 제목으로 해서 오늘 또는 내일 목록 맨 아래에 넣습니다.
// ideaId를 주면 그 아이디어에서 보낸 할 일로 연결합니다(아이디어 문서의 "할 일로 넣기").
export async function quickAdd(
  text: string,
  day: "today" | "tomorrow",
  ideaId: string | null = null
): Promise<ActionResult> {
  const title = cleanText(text)
  if (!title || title.length > LIMITS.taskTitle) return { ok: false, error: "할 일을 입력해 주세요." }
  if (day !== "today" && day !== "tomorrow") return BAD_REQUEST
  if (ideaId !== null && !isUuid(ideaId)) return BAD_REQUEST

  const today = todayKST()
  return addTask({
    title,
    minutes: DEFAULT_TASK_MINUTES,
    goalId: null,
    date: day === "today" ? today : addDays(today, 1),
    ideaId,
  })
}

// ── 자주 미룬 할 일 쪼개기 (AI) ──────────────────────────────

// 3번 이상 미룬 할 일을 AI가 2~4개의 작은 할 일로 쪼개, 원래 할 일 자리에 순서대로 넣습니다. 원래 할 일은 지웁니다.
export async function splitTask(id: string): Promise<ActionResult> {
  if (!isUuid(id)) return BAD_REQUEST
  const { supabase, userId } = await requireUser()

  const { data: task } = await supabase
    .from("tasks")
    .select("id, title, estimated_minutes, goal_id, idea_id, is_done, scheduled_at")
    .eq("id", id)
    .maybeSingle()
  if (!task || task.is_done) return BAD_REQUEST
  const { data: goal } = task.goal_id
    ? await supabase.from("goals").select("title").eq("id", task.goal_id).maybeSingle()
    : { data: null }

  let parts: { title: string; minutes: number }[]
  try {
    parts = await splitTaskWithAi(task.title, task.estimated_minutes, goal?.title ?? null)
  } catch (error) {
    return { ok: false, error: aiErrorMessage(error) }
  }

  // 날짜가 없거나 지난 할 일이면 오늘에 넣습니다.
  const today = todayKST()
  const ymd = task.scheduled_at && ymdOf(task.scheduled_at) > today ? ymdOf(task.scheduled_at) : today
  let order: string[]
  try {
    order = await loadDayOrder(supabase, ymd)
  } catch {
    return SAVE_ERROR
  }
  const found = order.indexOf(task.id)
  const at = found === -1 ? order.length : found
  const others = order.filter((taskId) => taskId !== task.id)

  const { error } = await supabase.from("tasks").insert(
    parts.map((p, i) => ({
      user_id: userId,
      goal_id: task.goal_id,
      idea_id: task.idea_id,
      title: p.title,
      estimated_minutes: p.minutes,
      scheduled_at: dayIso(ymd),
      sort_order: at + i,
      source: "ai",
    }))
  )
  if (error) return SAVE_ERROR
  await supabase.from("tasks").delete().eq("id", id).eq("user_id", userId)
  // 원래 자리 뒤에 있던 할 일은 조각 수만큼 뒤로 번호를 바꿉니다.
  await Promise.all(
    others.map((taskId, index) =>
      supabase
        .from("tasks")
        .update({ sort_order: index < at ? index : index + parts.length })
        .eq("id", taskId)
        .eq("user_id", userId)
    )
  )

  refresh()
  return { ok: true, message: `'${task.title}'을(를) ${parts.length}개로 나눠 ${dayName(ymd)}에 넣었어요.` }
}
