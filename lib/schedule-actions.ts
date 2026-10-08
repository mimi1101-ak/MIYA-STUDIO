"use server"

// 할 일·일정·루틴 저장 기능(서버 액션). "오늘"과 캘린더 화면이 함께 씁니다.

import { refresh } from "next/cache"

import { requireUser } from "@/lib/auth"
import { formatClock, formatDayLabel, kstToIso, kstToMs, msToKst } from "@/lib/date"
import { aiErrorMessage, splitTaskWithAi } from "@/lib/goal-ai"
import { planQuickInput } from "@/lib/quick-parse"
import {
  computePlacements,
  placeUnscheduled,
  postponeTask,
  reflowConflicts,
  type Supabase,
} from "@/lib/schedule-db"
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

function checkTitle(raw: unknown): string | null {
  const title = cleanText(raw)
  return title && title.length <= LIMITS.taskTitle ? title : null
}

// ── 할 일 ────────────────────────────────────────────────

export type TaskInput = {
  title: string
  minutes: number
  goalId: string | null
  // 날짜·시각을 모두 주면 그 시각에 고정, 날짜만 주면 그날 이후 빈 시간, 둘 다 없으면 지금 이후 빈 시간
  date: string | null
  start: number | null
}

function checkTaskInput(input: TaskInput): TaskInput | null {
  const title = checkTitle(input?.title)
  if (!title || !isDuration(input.minutes)) return null
  if (input.goalId !== null && !isUuid(input.goalId)) return null
  if (input.date !== null && !isValidDate(input.date)) return null
  if (input.start !== null && (!isMinuteOfDay(input.start) || input.date === null)) return null
  return { ...input, title }
}

// 할 일을 놓을 시각을 정합니다. 빈 자리가 없으면 null(시간 미정)
async function decideTaskTime(
  supabase: Supabase,
  userId: string,
  input: TaskInput,
  taskId: string
): Promise<string | null> {
  if (input.date !== null && input.start !== null) return kstToIso(input.date, input.start)
  const now = Date.now()
  const notBefore = input.date ? Math.max(now, kstToMs(input.date)) : now
  const placements = await computePlacements(supabase, userId, [
    { id: taskId, minutes: input.minutes, notBefore },
  ])
  const start = placements.get(taskId) ?? null
  return start === null ? null : new Date(start).toISOString()
}

function placedMessage(scheduledAt: string | null, moved = false): string {
  if (!scheduledAt) return `빈 시간을 찾지 못해 '시간 미정'${moved ? "으로 옮겼어요" : "에 넣었어요"}.`
  const { ymd, minutes } = msToKst(Date.parse(scheduledAt))
  return `${formatDayLabel(ymd)} ${formatClock(minutes)}${moved ? "로 옮겼어요" : "에 넣었어요"}.`
}

export async function addTask(input: TaskInput): Promise<ActionResult> {
  const checked = checkTaskInput(input)
  if (!checked) return BAD_REQUEST
  const { supabase, userId } = await requireUser()

  let scheduledAt: string | null
  try {
    scheduledAt = await decideTaskTime(supabase, userId, checked, "new")
  } catch {
    return SAVE_ERROR
  }
  const { error } = await supabase.from("tasks").insert({
    user_id: userId,
    title: checked.title,
    estimated_minutes: checked.minutes,
    goal_id: checked.goalId,
    scheduled_at: scheduledAt,
    source: "manual",
  })
  if (error) return SAVE_ERROR

  refresh()
  return { ok: true, message: placedMessage(scheduledAt) }
}

export async function updateTask(id: string, input: TaskInput): Promise<ActionResult> {
  const checked = checkTaskInput(input)
  if (!isUuid(id) || !checked) return BAD_REQUEST
  const { supabase, userId } = await requireUser()

  let scheduledAt: string | null
  try {
    scheduledAt = await decideTaskTime(supabase, userId, checked, id)
  } catch {
    return SAVE_ERROR
  }
  const { error } = await supabase
    .from("tasks")
    .update({
      title: checked.title,
      estimated_minutes: checked.minutes,
      goal_id: checked.goalId,
      scheduled_at: scheduledAt,
    })
    .eq("id", id)
    .eq("user_id", userId)
  if (error) return SAVE_ERROR

  refresh()
  return { ok: true, message: placedMessage(scheduledAt) }
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

// "나중에": 다음 빈 시간으로 옮기기 (이월 횟수 +1)
export async function postponeTaskAction(id: string): Promise<ActionResult> {
  if (!isUuid(id)) return BAD_REQUEST
  const { supabase, userId } = await requireUser()
  let start: number | null | false
  try {
    start = await postponeTask(supabase, userId, id, Date.now())
  } catch {
    return SAVE_ERROR
  }
  if (start === false) return SAVE_ERROR
  refresh()
  return {
    ok: true,
    message: placedMessage(start === null ? null : new Date(start).toISOString(), true),
  }
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

// 시간 미정 할 일을 빈 시간에 넣기
export async function placeUnscheduledAction(): Promise<ActionResult> {
  const { supabase, userId } = await requireUser()
  try {
    if (!(await placeUnscheduled(supabase, userId, Date.now()))) return SAVE_ERROR
  } catch {
    return SAVE_ERROR
  }
  refresh()
  return { ok: true }
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

// 일정·루틴이 바뀌면 겹치게 된 할 일을 다음 빈 시간으로 밀어냅니다. 실패해도 저장은 된 상태라 그냥 둡니다.
async function reflow(supabase: Supabase, userId: string) {
  try {
    await reflowConflicts(supabase, userId, Date.now())
  } catch (error) {
    console.error("[schedule] 할 일 다시 배치 실패:", error instanceof Error ? error.message : error)
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
  await reflow(supabase, userId)

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
  await reflow(supabase, userId)

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
  await reflow(supabase, userId)

  refresh()
  return { ok: true }
}

export async function updateRoutine(id: string, input: RoutineInput): Promise<ActionResult> {
  const checked = checkRoutineInput(input)
  if (!isUuid(id) || !checked) return BAD_REQUEST
  const { supabase, userId } = await requireUser()

  const { error } = await supabase.from("routines").update(routineRow(checked)).eq("id", id).eq("user_id", userId)
  if (error) return SAVE_ERROR
  await reflow(supabase, userId)

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

// ── 캘린더에서 끌어서 옮기기 ───────────────────────────────

export async function moveItem(
  kind: "task" | "event",
  id: string,
  date: string,
  start: number,
  minutes: number
): Promise<ActionResult> {
  if (!isUuid(id) || !isValidDate(date) || !isMinuteOfDay(start)) return BAD_REQUEST
  if (!Number.isInteger(minutes) || minutes < 5) return BAD_REQUEST
  const { supabase, userId } = await requireUser()
  const startMs = kstToMs(date, start)

  if (kind === "task") {
    if (!isDuration(minutes)) return BAD_REQUEST
    const { error } = await supabase
      .from("tasks")
      .update({ scheduled_at: new Date(startMs).toISOString(), estimated_minutes: minutes })
      .eq("id", id)
      .eq("user_id", userId)
    if (error) return SAVE_ERROR
  } else if (kind === "event") {
    if (minutes > 7 * 24 * 60) return BAD_REQUEST
    const { error } = await supabase
      .from("events")
      .update({
        starts_at: new Date(startMs).toISOString(),
        ends_at: new Date(startMs + minutes * MINUTE_MS).toISOString(),
      })
      .eq("id", id)
      .eq("user_id", userId)
    if (error) return SAVE_ERROR
    await reflow(supabase, userId)
  } else {
    return BAD_REQUEST
  }

  refresh()
  return { ok: true }
}

// ── 빠른 입력 ────────────────────────────────────────────

// 한 줄 입력을 해석해 일정 또는 할 일로 저장합니다. kind를 주면 그 종류로 저장합니다.
export async function quickAdd(text: string, kind: "task" | "event" | null): Promise<ActionResult> {
  const raw = cleanText(text)
  if (!raw || raw.length > LIMITS.taskTitle) return { ok: false, error: "내용을 입력해 주세요." }
  if (kind !== null && kind !== "task" && kind !== "event") return BAD_REQUEST

  const now = msToKst(Date.now())
  const plan = planQuickInput(raw, now.ymd, now.minutes, kind)
  if (!plan) return { ok: false, error: "무엇을 할지 제목도 함께 적어 주세요. 예: 금요일 3시 치과" }

  if (plan.kind === "event") {
    return addEvent({ title: plan.title, date: plan.date!, start: plan.start!, minutes: plan.minutes })
  }
  return addTask({ title: plan.title, minutes: plan.minutes, goalId: null, date: plan.date, start: plan.start })
}

// ── 자주 미룬 할 일 쪼개기 (AI) ──────────────────────────────

// 3번 이상 미룬 할 일을 AI가 2~4개의 작은 할 일로 쪼개고, 빈 시간에 다시 넣습니다. 원래 할 일은 지웁니다.
export async function splitTask(id: string): Promise<ActionResult> {
  if (!isUuid(id)) return BAD_REQUEST
  const { supabase, userId } = await requireUser()

  const { data: task } = await supabase
    .from("tasks")
    .select("id, title, estimated_minutes, goal_id, is_done")
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

  let placements: Map<string, number | null>
  try {
    const now = Date.now()
    placements = await computePlacements(
      supabase,
      userId,
      parts.map((p, i) => ({ id: `s${i}`, minutes: p.minutes, notBefore: now }))
    )
  } catch {
    return SAVE_ERROR
  }

  const { error } = await supabase.from("tasks").insert(
    parts.map((p, i) => {
      const start = placements.get(`s${i}`) ?? null
      return {
        user_id: userId,
        goal_id: task.goal_id,
        title: p.title,
        estimated_minutes: p.minutes,
        scheduled_at: start === null ? null : new Date(start).toISOString(),
        source: "ai",
      }
    })
  )
  if (error) return SAVE_ERROR
  await supabase.from("tasks").delete().eq("id", id).eq("user_id", userId)

  refresh()
  return { ok: true, message: `'${task.title}'을(를) ${parts.length}개로 나눠 빈 시간에 넣었어요.` }
}
