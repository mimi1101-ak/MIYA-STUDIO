import "server-only"

import { addDays, formatClock, formatDayLabel, formatDuration, formatFullDayLabel, msToKst, WEEKDAYS, weekdayOf, weekStartOf } from "@/lib/date"
import { loadGoalProgress } from "@/lib/agenda"
import { percent } from "@/lib/agenda-types"
import { AiError, createAiClient, DEFAULT_MODEL, type ChatMessage } from "@/lib/goal-ai"
import type { WorkHours } from "@/lib/schedule"
import { loadWorkHours, type Supabase } from "@/lib/schedule-db"
import { createAppender, dayIso, TASK_ORDER, ymdOf } from "@/lib/task-order"
import { isValidDate, LIMITS } from "@/lib/validation"

// MOMO 호출: 어느 화면에서든 MOMO를 불러 말하면, MOMO가 할 일·목표를 보고 바로 반영한 뒤 설명합니다.
// - AI는 "무엇을 어떻게 바꿀지"(옮기기·순서·추가·완료)만 정하고, 실제 저장은 아래 규칙 코드가 합니다.
// - 할 일은 시각 없이 날짜 + 그날 순서만 가집니다(lib/task-order.ts).
// - 바꾸기 전 값을 되돌리기 정보로 함께 돌려줘, 답마다 '되돌리기'를 누를 수 있게 합니다.
// - 대화는 저장하지 않습니다.

// 앞으로 며칠치 할 일을 MOMO에게 보여 줄지
const LOOK_AHEAD_DAYS = 14
// 얼마나 먼 날까지 옮길 수 있는지
const MAX_AHEAD_DAYS = 120
// MOMO에게 보여 주는 할 일 수 상한(비용 절약)
const MAX_CONTEXT_TASKS = 150
const MAX_UNSCHEDULED = 40
// 한 번에 반영할 변경 수 상한
const MAX_ACTIONS = 40
const DEFAULT_MINUTES = 30

type CtxTask = {
  ref: string
  id: string
  title: string
  ymd: string | null
  minutes: number
  goalId: string | null
  carry: number
  scheduledAt: string | null
  sortOrder: number
}
type CtxGoal = { ref: string; id: string; title: string; deadline: string | null; done: number; total: number }

export type AssistantContext = {
  now: number
  today: string
  work: WorkHours
  tasks: CtxTask[]
  goals: CtxGoal[]
  doneToday: string[]
}

// 되돌리기: 바꾸기 전 값(restore)과 새로 만든 할 일(remove)
export type UndoRow = {
  id: string
  scheduled_at: string | null
  sort_order: number
  carry_count: number
  is_done: boolean
  done_at: string | null
}
export type UndoPlan = { restore: UndoRow[]; remove: string[] }

export type AssistantAction =
  | { type: "move"; task: string; date: string | null }
  | { type: "order"; date: string; tasks: string[] }
  | { type: "add"; title: string; date: string | null; minutes: number; goal: string | null }
  | { type: "done"; task: string }

const SYSTEM_PROMPT = `당신은 MIYA STUDIO의 마스코트 캐릭터 MOMO입니다. 사용자가 어느 화면에서든 불러 말을 거는 개인 비서입니다. 사용자는 이 앱을 혼자 쓰는 개인입니다.
당신이 actions에 적은 변경은 앱이 사용자 확인 없이 즉시 할 일 목록에 반영합니다. 사용자는 답마다 '되돌리기'를 누를 수 있습니다. 반영했으면 reply에서 무엇을 왜 바꿨는지 설명합니다.

생각하는 방식 — 계획은 지켜야 할 약속이 아니라, 오늘의 상태에 맞춰 고쳐 쓰는 도구입니다.
- 미루는 것은 실패가 아닙니다. 오늘 할 수 있는 만큼으로 줄이고, 꼭 해야 할 것에 힘을 모으게 돕습니다.
- 우선순위: (1) 마감이 가까운 목표의 할 일, 미루면 마감을 넘길 위험이 있는 일 (2) 다른 일의 앞 단계 (3) 여러 번 미룬 일(작게 시작하게) (4) 나머지.
- 오늘 남은 일할 시간과 사용자의 기력을 함께 봅니다. 오늘 목록의 예상 시간 합계가 남은 시간보다 많으면 덜어 냅니다.
- 미룰 때는 내일에 몰지 않습니다. 날짜별 합계를 보고 일하는 날에 고르게 나눕니다. 목표 마감일은 넘기지 않습니다. 마감을 지키기 어려우면 솔직하게 말하고 방법을 제안합니다.
- 사용자의 말과 관련된 할 일만 바꿉니다. 관계없는 할 일은 그대로 둡니다.

상황별
- "지금 뭘 해야 할지 모르겠어", "막막해": 오늘 할 일과 목표를 보고 지금 바로 할 1가지와 오늘 안에 할 2~3가지를 고릅니다. order로 그것들을 오늘 목록 맨 위로 올리고, 오늘 감당하기 어려운 나머지는 move로 다른 날에 나눕니다. reply에서 "지금은 ○○부터 하세요"처럼 첫 행동을 분명히 말하고, 왜 그 순서인지 한두 줄로 설명합니다. 오늘 할 일이 없으면 가까운 날의 할 일이나 목표에서 오늘 할 것을 골라 오늘로 옮깁니다.
- 아프다, 몸이 안 좋다, 너무 지쳤다: 그 말을 처음 들은 차례에는 바꾸지 않습니다(actions는 빈 목록). 걱정하는 말 한 문장과 함께 질문을 번호를 붙여 1~2개 묻습니다. 예: 1) 오늘 조금이라도 일할 수 있는지, 아예 쉬어야 하는지 2) 오늘 꼭 해야 하는 일(마감·약속)이 있는지. 답을 들으면 반영합니다: 쉬어야 하면 오늘 할 일을 모두 옮기고, 조금 할 수 있으면 가장 가볍거나 꼭 필요한 1~2개만 남깁니다. 회복할 시간을 생각해 다음 일하는 날 하루에 몰지 말고 며칠에 나눕니다. 증상이 심해 보이면(고열, 숨쉬기 힘듦, 심한 통증 등) 병원 진료를 권합니다. 진단은 하지 않습니다.
- 무엇을 해 달라고 분명히 말하면(예: "보고서는 목요일로", "내일 치과 예약 넣어 줘", "운동 끝냈어") 묻지 않고 바로 반영합니다.
- 무엇을 바꿔야 할지 확실하지 않으면 추측해서 바꾸지 말고 짧게 되묻습니다(actions는 빈 목록).
- 할 일과 관계없는 이야기에는 짧게 답하고, 이 대화창에서 할 수 있는 일을 한 줄로 안내합니다.

할 수 있는 변경(actions)
- move: 할 일(task: 참고 정보의 T번호)을 date(YYYY-MM-DD)로 옮깁니다. 날짜 미정으로 빼려면 date를 null로. 오늘보다 이전 날짜는 안 됩니다. 옮긴 할 일은 그날 목록 맨 아래에 붙습니다.
- order: 그날(date) 목록에서 tasks(T번호 목록)를 적은 순서대로 맨 위에 둡니다. 나머지는 원래 순서대로 그 아래에 남습니다. 같은 차례에 move로 옮겨 온 할 일도 넣을 수 있습니다.
- add: 새 할 일. title(구체적인 행동으로 짧게), date(YYYY-MM-DD 또는 null), minutes(예상 시간 5~720분), goal(관련 목표의 G번호, 없으면 null).
- done: 사용자가 끝냈다고 말한 할 일을 완료로 표시합니다.
- 할 일을 지울 수는 없습니다. 빼 달라는 말이면 date를 null로 옮기고 '날짜 미정'으로 뺐다고 말합니다. 일정·루틴·목표 자체는 바꿀 수 없으니 캘린더·목표 화면에서 직접 바꾸도록 안내합니다.
- 할 일 하나에 move와 done을 함께 넣지 않습니다.

답변 형식
- reply: 한국어 존댓말, 이모지 없이, 차분하고 다정하게 2~6문장. 바꾼 것이 있으면 핵심과 이유를 짧게 말합니다. 앱이 바꾼 목록을 따로 보여 주므로 하나하나 다 나열하지 않아도 됩니다. T·G 번호는 사용자에게 보이지 않으니 reply에서는 할 일·목표 제목으로 말합니다.
- reply 줄바꿈: 작은 대화창에서 읽기 쉽게 문장마다 줄을 바꾸고(\\n), 내용이 바뀌는 곳(공감 → 지금 할 일·바꾼 것 → 당부)에는 빈 줄(\\n\\n)을 넣습니다. 번호를 붙인 질문은 한 줄에 하나씩 씁니다.
- actions: 이번 차례에 반영할 변경. 질문만 하는 차례에는 빈 목록.
- 이전 MOMO 답 끝의 "[앱이 반영한 것]"은 이미 반영된 내용입니다("되돌림"이 붙었으면 사용자가 되돌린 것). 참고 정보는 매번 지금 상태로 새로 붙습니다.`

const NULLABLE_DATE = { anyOf: [{ type: "string", format: "date" }, { type: "null" }] }

const OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    reply: { type: "string" },
    actions: {
      type: "array",
      items: {
        anyOf: [
          {
            type: "object",
            properties: { type: { type: "string", enum: ["move"] }, task: { type: "string" }, date: NULLABLE_DATE },
            required: ["type", "task", "date"],
            additionalProperties: false,
          },
          {
            type: "object",
            properties: {
              type: { type: "string", enum: ["order"] },
              date: { type: "string", format: "date" },
              tasks: { type: "array", items: { type: "string" } },
            },
            required: ["type", "date", "tasks"],
            additionalProperties: false,
          },
          {
            type: "object",
            properties: {
              type: { type: "string", enum: ["add"] },
              title: { type: "string" },
              date: NULLABLE_DATE,
              minutes: { type: "integer" },
              goal: { anyOf: [{ type: "string" }, { type: "null" }] },
            },
            required: ["type", "title", "date", "minutes", "goal"],
            additionalProperties: false,
          },
          {
            type: "object",
            properties: { type: { type: "string", enum: ["done"] }, task: { type: "string" } },
            required: ["type", "task"],
            additionalProperties: false,
          },
        ],
      },
    },
  },
  required: ["reply", "actions"],
  additionalProperties: false,
}

// ── 지금 상태 읽기 ─────────────────────────────────────────

// 오늘부터 14일 동안의 안 끝낸 할 일 + 날짜 미정 + 진행 중인 목표 + 오늘 끝낸 일 + 일하는 시간
export async function loadAssistantContext(supabase: Supabase, userId: string, now: number): Promise<AssistantContext> {
  const today = msToKst(now).ymd
  const columns = "id, title, scheduled_at, sort_order, estimated_minutes, goal_id, carry_count"

  let upcomingQuery = supabase
    .from("tasks")
    .select(columns)
    .eq("is_done", false)
    .gte("scheduled_at", dayIso(today))
    .lt("scheduled_at", dayIso(addDays(today, LOOK_AHEAD_DAYS)))
  for (const o of TASK_ORDER) upcomingQuery = upcomingQuery.order(o.column, { ascending: o.ascending })

  const [upcoming, unscheduled, doneToday, goals, work] = await Promise.all([
    upcomingQuery.limit(MAX_CONTEXT_TASKS),
    supabase
      .from("tasks")
      .select(columns)
      .eq("is_done", false)
      .is("scheduled_at", null)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true })
      .limit(MAX_UNSCHEDULED),
    supabase
      .from("tasks")
      .select("title")
      .eq("is_done", true)
      .gte("scheduled_at", dayIso(today))
      .lt("scheduled_at", dayIso(addDays(today, 1)))
      .limit(30),
    loadGoalProgress(supabase, weekStartOf(today)),
    loadWorkHours(supabase, userId),
  ])
  if (upcoming.error || unscheduled.error || doneToday.error || !goals) throw new Error("할 일을 불러오지 못했어요")

  // DB 정렬은 같은 날 안에서만 맞으니 날짜 순으로 한 번 더(같은 날은 순서 유지)
  const dated = upcoming.data
    .map((t, index) => ({ t, ymd: ymdOf(t.scheduled_at!), index }))
    .sort((a, b) => a.ymd.localeCompare(b.ymd) || a.index - b.index)
  const rows = [...dated.map((d) => d.t), ...unscheduled.data]
  const tasks = rows.map(
    (t, i): CtxTask => ({
      ref: `T${i + 1}`,
      id: t.id,
      title: t.title,
      ymd: t.scheduled_at ? ymdOf(t.scheduled_at) : null,
      minutes: t.estimated_minutes,
      goalId: t.goal_id,
      carry: t.carry_count,
      scheduledAt: t.scheduled_at,
      sortOrder: t.sort_order,
    })
  )
  return {
    now,
    today,
    work,
    tasks,
    goals: goals.map((g, i) => ({ ref: `G${i + 1}`, id: g.id, title: g.title, deadline: g.deadline, done: g.done, total: g.total })),
    doneToday: doneToday.data.map((t) => t.title),
  }
}

function isWorkDay(work: WorkHours, ymd: string): boolean {
  return work.days.length === 0 || work.days.includes(weekdayOf(ymd))
}

function workHoursText(work: WorkHours): string {
  const days = [1, 2, 3, 4, 5, 6, 0].filter((d) => work.days.includes(d)).map((d) => WEEKDAYS[d])
  return `${days.join("·")}요일 ${formatClock(work.start)}~${formatClock(work.end)}`
}

// 매번 바뀌는 지금 상태는 마지막 사용자 메시지 뒤에만 붙입니다(앞 대화는 그대로 → 캐시 절약).
function contextBlock(ctx: AssistantContext): string {
  const { today, work } = ctx
  const nowMinutes = msToKst(ctx.now).minutes
  const left = Math.max(0, work.end - Math.max(nowMinutes, work.start))
  const goalRef = new Map(ctx.goals.map((g) => [g.id, g.ref]))

  const lines = [
    "[앱이 붙인 참고 정보 — 사용자가 쓴 글이 아닙니다]",
    `지금: ${formatFullDayLabel(today)} (${today}) ${formatClock(nowMinutes)}`,
    `일하는 시간: ${workHoursText(work)}`,
    isWorkDay(work, today)
      ? `오늘 남은 일할 시간: ${left > 0 ? formatDuration(left) : "없음(일하는 시간이 지났어요)"}`
      : "오늘은 일하는 요일이 아닙니다.",
    "",
    "진행 중인 목표:",
  ]
  if (ctx.goals.length === 0) lines.push("- 없음")
  for (const g of ctx.goals) {
    lines.push(`- ${g.ref} "${g.title}" · 마감 ${g.deadline ?? "없음"} · 전체 진척 ${percent(g.done, g.total)}%`)
  }

  lines.push("", `할 일 (오늘부터 ${LOOK_AHEAD_DAYS}일, 날짜마다 위에서부터 그날 순서):`)
  const taskLine = (t: CtxTask) => {
    const parts = [`- ${t.ref} "${t.title}" ${t.minutes}분`]
    if (t.goalId && goalRef.has(t.goalId)) parts.push(`목표 ${goalRef.get(t.goalId)}`)
    if (t.carry > 0) parts.push(`${t.carry}번 미룸`)
    return parts.join(" · ")
  }
  for (let i = 0; i < LOOK_AHEAD_DAYS; i++) {
    const ymd = addDays(today, i)
    const dayTasks = ctx.tasks.filter((t) => t.ymd === ymd)
    const total = dayTasks.reduce((sum, t) => sum + t.minutes, 0)
    const tag = [i === 0 ? "오늘" : i === 1 ? "내일" : "", isWorkDay(work, ymd) ? "" : "쉬는 요일"].filter(Boolean).join(", ")
    lines.push(`${ymd} (${WEEKDAYS[weekdayOf(ymd)]})${tag ? ` [${tag}]` : ""} · ${dayTasks.length ? `합계 ${formatDuration(total)}` : "할 일 없음"}`)
    for (const t of dayTasks) lines.push(taskLine(t))
  }

  const unscheduled = ctx.tasks.filter((t) => t.ymd === null)
  lines.push("", "날짜 미정 할 일:")
  if (unscheduled.length === 0) lines.push("- 없음")
  for (const t of unscheduled) lines.push(taskLine(t))

  lines.push("", `오늘 이미 끝낸 할 일: ${ctx.doneToday.length ? ctx.doneToday.map((t) => `"${t}"`).join(", ") : "없음"}`)
  return lines.join("\n")
}

// ── MOMO에게 묻기 ─────────────────────────────────────────

export async function askAssistant(
  history: ChatMessage[],
  ctx: AssistantContext
): Promise<{ reply: string; actions: AssistantAction[] }> {
  const client = createAiClient()
  const response = await client.beta.messages.create({
    model: process.env.CLAUDE_MODEL || DEFAULT_MODEL,
    max_tokens: 16000,
    // 할 일과 목표를 따져 보고 하루를 다시 짜야 해서 effort(생각하는 정도)는 medium
    output_config: { effort: "medium", format: { type: "json_schema", schema: OUTPUT_SCHEMA } },
    // 안전 필터가 요청을 거절하면 Anthropic이 고른 다른 모델로 자동으로 다시 시도합니다.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: SYSTEM_PROMPT,
    messages: history.map((m, i) =>
      i === history.length - 1 && m.role === "user"
        ? { role: "user", content: `${m.content}\n\n${contextBlock(ctx)}` }
        : { role: m.role, content: m.content }
    ),
  })
  if (response.stop_reason === "refusal") throw new AiError("AI가 이 요청에 답하지 않았어요.")

  const text = response.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("")
  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(text) ?? {}
  } catch {
    throw new AiError("AI 답변을 읽지 못했어요.")
  }
  const reply = typeof parsed.reply === "string" ? parsed.reply.trim().slice(0, 1500) : ""
  if (!reply) throw new AiError("AI 답변이 비어 있어요.")
  const actions = Array.isArray(parsed.actions) ? (parsed.actions.slice(0, MAX_ACTIONS) as AssistantAction[]) : []
  return { reply, actions }
}

// ── 반영하기 ──────────────────────────────────────────────

function dayText(ymd: string | null, today: string): string {
  if (!ymd) return "날짜 미정"
  if (ymd === today) return "오늘"
  if (ymd === addDays(today, 1)) return `내일 ${formatDayLabel(ymd)}`
  return formatDayLabel(ymd)
}

// AI가 정한 변경을 검사한 뒤 저장합니다. 이상한 변경(없는 할 일, 지난 날짜 등)은 건너뜁니다.
// 순서: 완료 → 옮기기 → 추가 → 순서 바꾸기 (옮겨 온 할 일까지 순서를 정할 수 있게)
export async function applyAssistantActions(
  supabase: Supabase,
  userId: string,
  ctx: AssistantContext,
  actions: AssistantAction[]
): Promise<{ changes: string[]; skipped: number; undo: UndoPlan }> {
  const { today } = ctx
  const lastDay = addDays(today, MAX_AHEAD_DAYS)
  const okDate = (d: unknown): d is string => typeof d === "string" && isValidDate(d) && d >= today && d <= lastDay
  const byRef = new Map(ctx.tasks.map((t) => [t.ref.toUpperCase(), t]))
  const findTask = (ref: unknown) => (typeof ref === "string" ? byRef.get(ref.trim().toUpperCase()) : undefined)
  const goalByRef = new Map(ctx.goals.map((g) => [g.ref.toUpperCase(), g.id]))

  const changes: string[] = []
  const undo: UndoPlan = { restore: [], remove: [] }
  const saved = new Set<string>()
  // 바꾸기 전 값을 한 번만 기억해 둡니다.
  const remember = (row: UndoRow) => {
    if (saved.has(row.id)) return
    saved.add(row.id)
    undo.restore.push(row)
  }
  const rememberTask = (t: CtxTask) =>
    remember({ id: t.id, scheduled_at: t.scheduledAt, sort_order: t.sortOrder, carry_count: t.carry, is_done: false, done_at: null })
  let skipped = 0
  const handled = new Set<string>()

  const dones = actions.filter((a) => a?.type === "done") as Extract<AssistantAction, { type: "done" }>[]
  const moves = actions.filter((a) => a?.type === "move") as Extract<AssistantAction, { type: "move" }>[]
  const adds = actions.filter((a) => a?.type === "add") as Extract<AssistantAction, { type: "add" }>[]
  const orders = actions.filter((a) => a?.type === "order") as Extract<AssistantAction, { type: "order" }>[]
  skipped += actions.length - dones.length - moves.length - adds.length - orders.length

  // 완료
  for (const a of dones) {
    const t = findTask(a.task)
    if (!t || handled.has(t.id)) {
      skipped++
      continue
    }
    handled.add(t.id)
    rememberTask(t)
    const { error } = await supabase
      .from("tasks")
      .update({ is_done: true, done_at: new Date(ctx.now).toISOString() })
      .eq("id", t.id)
      .eq("user_id", userId)
    if (error) skipped++
    else changes.push(`'${t.title}' 완료`)
  }

  // 옮기기: 새 날짜 목록 맨 아래로. 이월 횟수는 올리지 않습니다(사정에 맞춰 MOMO가 다시 짠 것이라서).
  const validMoves = moves.flatMap((a) => {
    const t = findTask(a.task)
    const date = a.date === null ? null : okDate(a.date) ? a.date : undefined
    if (!t || date === undefined || handled.has(t.id) || t.ymd === date) {
      skipped++
      return []
    }
    handled.add(t.id)
    return [{ t, date }]
  })
  const addDates = adds.map((a) => a?.date).filter(okDate)
  const next = await createAppender(supabase, [...validMoves.flatMap((m) => (m.date ? [m.date] : [])), ...addDates])
  for (const { t, date } of validMoves) {
    rememberTask(t)
    const { error } = await supabase
      .from("tasks")
      .update({ scheduled_at: date ? dayIso(date) : null, sort_order: date ? next(date) : t.sortOrder })
      .eq("id", t.id)
      .eq("user_id", userId)
      .eq("is_done", false)
    if (error) skipped++
    else {
      t.ymd = date
      changes.push(`'${t.title}' → ${dayText(date, today)}`)
    }
  }

  // 추가
  for (const a of adds) {
    const title = typeof a?.title === "string" ? a.title.trim().slice(0, LIMITS.taskTitle) : ""
    const date = a?.date === null ? null : okDate(a?.date) ? a.date : undefined
    if (!title || date === undefined) {
      skipped++
      continue
    }
    const minutes = Number.isInteger(a.minutes)
      ? Math.min(LIMITS.taskMaxMinutes, Math.max(LIMITS.taskMinMinutes, a.minutes))
      : DEFAULT_MINUTES
    const goalId = typeof a.goal === "string" ? (goalByRef.get(a.goal.trim().toUpperCase()) ?? null) : null
    const { data, error } = await supabase
      .from("tasks")
      .insert({
        user_id: userId,
        title,
        estimated_minutes: minutes,
        goal_id: goalId,
        scheduled_at: date ? dayIso(date) : null,
        sort_order: date ? next(date) : 0,
        source: "manual",
      })
      .select("id")
      .single()
    if (error) skipped++
    else {
      undo.remove.push(data.id)
      changes.push(`새 할 일 '${title}' → ${dayText(date, today)}`)
    }
  }

  // 순서 바꾸기: 고른 할 일을 적은 순서대로 그날 맨 위에, 나머지는 원래 순서대로
  for (const a of orders) {
    if (!okDate(a?.date) || !Array.isArray(a.tasks)) {
      skipped++
      continue
    }
    let dayQuery = supabase
      .from("tasks")
      .select("id, title, scheduled_at, sort_order, carry_count, is_done, done_at")
      .gte("scheduled_at", dayIso(a.date))
      .lt("scheduled_at", dayIso(addDays(a.date, 1)))
    for (const o of TASK_ORDER) dayQuery = dayQuery.order(o.column, { ascending: o.ascending })
    const { data: day, error } = await dayQuery
    if (error) {
      skipped++
      continue
    }
    const dayIds = new Set(day.map((d) => d.id))
    const picked = [...new Set(a.tasks.map((ref) => findTask(ref)?.id).filter((id): id is string => !!id && dayIds.has(id)))]
    if (picked.length === 0) {
      skipped++
      continue
    }
    const pickedSet = new Set(picked)
    const ordered = [...picked.map((id) => day.find((d) => d.id === id)!), ...day.filter((d) => !pickedSet.has(d.id))]
    const results = await Promise.all(
      ordered.map((row, index) => {
        if (row.sort_order === index) return null
        remember({
          id: row.id,
          scheduled_at: row.scheduled_at,
          sort_order: row.sort_order,
          carry_count: row.carry_count,
          is_done: row.is_done,
          done_at: row.done_at,
        })
        return supabase.from("tasks").update({ sort_order: index }).eq("id", row.id).eq("user_id", userId)
      })
    )
    if (results.some((r) => r?.error)) skipped++
    const titles = picked.map((id) => `'${day.find((d) => d.id === id)!.title}'`)
    changes.push(`${dayText(a.date, today)} 맨 위: ${titles.join(" → ")}`)
  }

  return { changes, skipped, undo }
}
