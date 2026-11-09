import "server-only"

import { loadGoalProgress } from "@/lib/agenda"
import { percent } from "@/lib/agenda-types"
import {
  addDays,
  formatClock,
  formatDayLabel,
  formatDuration,
  formatFullDayLabel,
  kstToMs,
  msToKst,
  parseClock,
  WEEKDAYS,
  weekdayOf,
  weekStartOf,
} from "@/lib/date"
import { AiError, createAiClient, DEFAULT_MODEL, type ChatMessage } from "@/lib/goal-ai"
import type { WorkHours } from "@/lib/schedule"
import { loadWorkHours, type Supabase } from "@/lib/schedule-db"
import { createAppender, dayIso, TASK_ORDER, ymdOf } from "@/lib/task-order"
import { isDuration, isValidDate, isWeekdayList, LIMITS } from "@/lib/validation"

// MOMO 호출: 어느 화면에서든 MOMO를 불러 말하면, MOMO가 할 일·일정·루틴·월별 목표·목표·Dream을 보고
// 바로 추가·수정·삭제한 뒤 설명합니다.
// - AI는 "무엇을 어떻게 바꿀지"만 정하고, 실제 저장은 아래 규칙 코드가 검사한 뒤 합니다.
// - 할 일은 시각 없이 날짜 + 그날 순서만 가집니다(lib/task-order.ts).
// - 바꾸거나 지우기 전의 행 전체를 되돌리기 정보로 돌려줘, 답마다 '되돌리기'로 원래대로 돌릴 수 있게 합니다.
// - 대화는 저장하지 않습니다.

// 앞으로 며칠치 할 일·일정을 MOMO에게 보여 줄지
const LOOK_AHEAD_DAYS = 14
// 얼마나 먼 날까지 옮기거나 넣을 수 있는지
const MAX_AHEAD_DAYS = 120
// MOMO에게 보여 주는 개수 상한(비용 절약)
const MAX_CONTEXT_TASKS = 150
// 14일 뒤부터 다음 달 말일까지의 할 일(목표 화면 '다음 달 할 일'을 MOMO도 다루게)
const MAX_LATER_TASKS = 80
const MAX_UNSCHEDULED = 40
const MAX_EVENTS = 80
// 한 번에 반영할 변경 수 상한
const MAX_ACTIONS = 40
const DEFAULT_MINUTES = 30
const MONTHLY_MAX = 30
const MINUTE_MS = 60_000

type CtxTask = {
  ref: string
  id: string
  title: string
  ymd: string | null
  minutes: number
  goalId: string | null
  carry: number
  done: boolean
}
type CtxEvent = { ref: string; id: string; title: string; start: number; end: number }
type CtxRoutine = { ref: string; id: string; title: string; weekdays: number[]; start: number; minutes: number }
type CtxMonthly = { ref: string; id: string; title: string; month: string; done: boolean }
type CtxDream = { ref: string; id: string; title: string; done: boolean }
type CtxGoal = {
  ref: string
  id: string
  title: string
  deadline: string | null
  status: string
  done: number
  total: number
}

export type AssistantContext = {
  now: number
  today: string
  work: WorkHours
  tasks: CtxTask[]
  events: CtxEvent[]
  routines: CtxRoutine[]
  monthly: CtxMonthly[]
  goals: CtxGoal[]
  dreams: CtxDream[]
}

// 되돌리기: 새로 만든 행은 지우고(remove), 바꾸거나 지운 행은 바꾸기 전 모습 그대로 다시 넣습니다(restore).
export const UNDO_TABLES = ["goals", "tasks", "events", "routines", "routine_checks", "monthly_goals", "dreams"] as const
export type UndoTable = (typeof UNDO_TABLES)[number]
export type UndoOp =
  | { table: UndoTable; kind: "remove"; id: string }
  | { table: UndoTable; kind: "restore"; row: Record<string, unknown> }
export type UndoPlan = UndoOp[]

// AI가 돌려주는 변경 하나. 쓰지 않는 칸은 null.
export type AssistantAction = {
  type: string
  target: string | null
  title: string | null
  date: string | null
  start: string | null
  minutes: number | null
  goal: string | null
  weekdays: number[] | null
  tasks: string[] | null
  month: string | null
  done: boolean | null
  status: string | null
}

const ACTION_TYPES = [
  "task_add",
  "task_edit",
  "task_move",
  "task_order",
  "task_done",
  "task_delete",
  "event_add",
  "event_edit",
  "event_delete",
  "routine_add",
  "routine_edit",
  "routine_delete",
  "monthly_add",
  "monthly_edit",
  "monthly_delete",
  "goal_edit",
  "goal_delete",
  "dream_add",
  "dream_edit",
  "dream_delete",
] as const

const SYSTEM_PROMPT = `당신은 MIYA STUDIO의 마스코트 캐릭터 MOMO입니다. 사용자가 어느 화면에서든 불러 말을 거는 개인 비서입니다. 사용자는 이 앱을 혼자 쓰는 개인입니다.
사용자는 당신에게 할 일·일정·루틴·월별 목표·목표·Dream을 추가하고, 고치고, 지울 권한을 모두 맡겼습니다.
Dream은 사용자가 기한 없이 오래 품는 큰 목표(삶의 방향)입니다. 월별 목표는 그 달의 목표, 목표(G)는 MOMO와 계획을 세워 할 일로 쪼갠 목표입니다. 당신이 actions에 적은 변경은 앱이 사용자 확인 없이 즉시 반영합니다. 사용자는 답마다 '되돌리기'를 누를 수 있습니다. 반영했으면 reply에서 무엇을 왜 바꿨는지 설명합니다.

생각하는 방식 — 계획은 지켜야 할 약속이 아니라, 오늘의 상태에 맞춰 고쳐 쓰는 도구입니다.
- 미루는 것은 실패가 아닙니다. 오늘 할 수 있는 만큼으로 줄이고, 꼭 해야 할 것에 힘을 모으게 돕습니다.
- 우선순위: (1) 마감이 가까운 목표의 할 일, 미루면 마감을 넘길 위험이 있는 일 (2) 다른 일의 앞 단계 (3) 이번 달 목표·Dream에 가까워지는 일 (4) 여러 번 미룬 일(작게 시작하게) (5) 나머지. 고를 때 그 일이 어떤 Dream·이번 달 목표와 이어지는지 한 줄로 말해 주면 동기가 됩니다.
- 오늘 남은 일할 시간과 사용자의 기력, 그날의 일정을 함께 봅니다. 오늘 목록의 예상 시간 합계가 남은 시간보다 많으면 덜어 냅니다.
- 미룰 때는 내일에 몰지 않습니다. 날짜별 합계와 일정을 보고 일하는 날에 고르게 나눕니다. 목표 마감일은 넘기지 않습니다. 마감을 지키기 어려우면 솔직하게 말하고 방법을 제안합니다.
- 사용자의 말과 관련된 것만 바꿉니다. 관계없는 것은 그대로 둡니다.

상황별
- "지금 뭘 해야 할지 모르겠어", "막막해": 오늘 할 일과 목표를 보고 지금 바로 할 1가지와 오늘 안에 할 2~3가지를 고릅니다. task_order로 그것들을 오늘 목록 맨 위로 올리고, 오늘 감당하기 어려운 나머지는 task_move로 다른 날에 나눕니다. reply에서 "지금은 ○○부터 하세요"처럼 첫 행동을 분명히 말하고, 왜 그 순서인지 한두 줄로 설명합니다. 오늘 할 일이 없으면 가까운 날의 할 일이나 목표에서 오늘 할 것을 골라 오늘로 옮깁니다.
- 아프다, 몸이 안 좋다, 너무 지쳤다: 그 말을 처음 들은 차례에는 바꾸지 않습니다(actions는 빈 목록). 걱정하는 말 한 문장과 함께 질문을 번호를 붙여 1~2개 묻습니다. 예: 1) 오늘 조금이라도 일할 수 있는지, 아예 쉬어야 하는지 2) 오늘 꼭 해야 하는 일(마감·약속)이 있는지. 답을 들으면 반영합니다: 쉬어야 하면 오늘 할 일을 모두 옮기고, 조금 할 수 있으면 가장 가볍거나 꼭 필요한 1~2개만 남깁니다. 회복할 시간을 생각해 다음 일하는 날 하루에 몰지 말고 며칠에 나눕니다. 증상이 심해 보이면(고열, 숨쉬기 힘듦, 심한 통증 등) 병원 진료를 권합니다. 진단은 하지 않습니다.
- 무엇을 해 달라고 분명히 말하면(예: "보고서는 목요일로", "목요일 3시에 치과 넣어 줘", "아침 운동 루틴 빼 줘", "운동 끝냈어") 묻지 않고 바로 반영합니다.
- 무엇을 바꿔야 할지 확실하지 않으면 추측해서 바꾸지 말고 짧게 되묻습니다(actions는 빈 목록).
- 할 일과 관계없는 이야기에는 짧게 답하고, 이 대화창에서 할 수 있는 일을 한 줄로 안내합니다.

지우기 규칙 (되돌리기가 있어도 신중하게)
- 사용자가 지워 달라고 분명히 말한 것만 지웁니다. "정리해 줘", "줄여 줘"처럼 무엇을 지울지 정하지 않은 말이면 지우지 말고, 지울 후보를 제목으로 말한 뒤 지워도 되는지 묻습니다(actions는 빈 목록).
- 한 번에 5개 이상 지우거나 목표(goal_delete)를 지울 때는, 사용자가 그 대상을 이미 콕 집어 확인해 준 경우가 아니면 먼저 무엇을 지울지 말하고 확인을 받습니다. 목표를 지우면 그 목표의 안 끝낸 할 일도 함께 지워지고, 끝낸 할 일은 기록으로 남는다고 알려 줍니다.
- 미루면 되는 일은 지우지 말고 옮깁니다. 할 일을 '날짜 미정'으로 빼는 것은 task_move에 date "none"입니다.

할 수 있는 변경(actions) — 각 항목은 모든 칸을 갖고, 쓰지 않는 칸은 null로 둡니다. target·tasks·goal에는 참고 정보의 번호(T·E·R·M·G·D)를 씁니다.
- task_add: title(구체적인 행동으로 짧게), date(YYYY-MM-DD, 날짜 미정이면 "none"), minutes(예상 시간 5~720분, 모르면 30), goal(관련 목표 G번호 또는 null). 그날 목록 맨 아래에 들어갑니다.
- task_edit: target(T), 바꿀 것만 채움 — title, minutes, goal(G번호, 목표 연결을 끊으려면 "none"). 날짜는 task_move로 바꿉니다.
- task_move: target(T), date(YYYY-MM-DD 또는 날짜 미정 "none"). 오늘보다 이전 날짜는 안 됩니다. 옮긴 할 일은 그날 목록 맨 아래에 붙습니다.
- task_order: date, tasks(T번호 목록). 그날 목록에서 적은 순서대로 맨 위에 둡니다. 나머지는 원래 순서대로 그 아래. 같은 차례에 옮겨 온 할 일도 넣을 수 있습니다.
- task_done: target(T), done(true면 완료, false면 완료 취소).
- task_delete: target(T).
- event_add: 시각이 정해진 일정(약속·회의·병원 등). title, date, start("HH:MM" 24시간), minutes(5~720, 모르면 60).
- event_edit: target(E), 바꿀 것만 채움 — title, date, start, minutes.
- event_delete: target(E).
- routine_add: 매주 반복하는 습관. title, weekdays(0=일 1=월 … 6=토 목록), start("HH:MM"), minutes(5~720). start+minutes는 자정을 넘을 수 없습니다.
- routine_edit: target(R), 바꿀 것만 채움 — title, weekdays, start, minutes.
- routine_delete: target(R).
- monthly_add: 그 달의 한 줄 목표. month("YYYY-MM"), title.
- monthly_edit: target(M), 바꿀 것만 채움 — title, done(true면 달성, false면 달성 취소).
- monthly_delete: target(M).
- goal_edit: target(G), 바꿀 것만 채움 — title, date(새 마감일 YYYY-MM-DD, 마감을 없애려면 "none"), status("done"이면 완료, "active"면 다시 진행 중). 'MOMO와 대화 중'인 목표의 상태는 바꾸지 않습니다(계획 승인은 목표 화면에서).
- goal_delete: target(G).
- dream_add: title(오래 품을 큰 목표를 한 줄로).
- dream_edit: target(D), 바꿀 것만 채움 — title, done(true면 이룸, false면 이룸 취소).
- dream_delete: target(D). Dream은 사용자가 콕 집어 지워 달라고 할 때만 지웁니다.
- 할 일 하나에 서로 다른 변경을 겹쳐 넣지 않습니다(task_order는 예외). 지운 것을 같은 차례에 다시 고치지 않습니다.

답변 형식
- reply: 한국어 존댓말, 이모지 없이, 차분하고 다정하게 2~6문장. 바꾼 것이 있으면 핵심과 이유를 짧게 말합니다. 앱이 바꾼 목록을 따로 보여 주므로 하나하나 다 나열하지 않아도 됩니다. 번호(T·E·R·M·G·D)는 사용자에게 보이지 않으니 reply에서는 제목으로 말합니다.
- reply 줄바꿈: 작은 대화창에서 읽기 쉽게 문장마다 줄을 바꾸고(\\n), 내용이 바뀌는 곳(공감 → 지금 할 일·바꾼 것 → 당부)에는 빈 줄(\\n\\n)을 넣습니다. 번호를 붙인 질문은 한 줄에 하나씩 씁니다.
- actions: 이번 차례에 반영할 변경. 질문만 하는 차례에는 빈 목록.
- 이전 MOMO 답 끝의 "[앱이 반영한 것]"은 이미 반영된 내용입니다("되돌림"이 붙었으면 사용자가 되돌린 것). 참고 정보는 매번 지금 상태로 새로 붙습니다.`

const NULL_STRING = { anyOf: [{ type: "string" }, { type: "null" }] }

const OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    reply: { type: "string" },
    actions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          type: { type: "string", enum: [...ACTION_TYPES] },
          target: NULL_STRING,
          title: NULL_STRING,
          date: NULL_STRING,
          start: NULL_STRING,
          minutes: { anyOf: [{ type: "integer" }, { type: "null" }] },
          goal: NULL_STRING,
          weekdays: { anyOf: [{ type: "array", items: { type: "integer" } }, { type: "null" }] },
          tasks: { anyOf: [{ type: "array", items: { type: "string" } }, { type: "null" }] },
          month: NULL_STRING,
          done: { anyOf: [{ type: "boolean" }, { type: "null" }] },
          status: NULL_STRING,
        },
        required: ["type", "target", "title", "date", "start", "minutes", "goal", "weekdays", "tasks", "month", "done", "status"],
        additionalProperties: false,
      },
    },
  },
  required: ["reply", "actions"],
  additionalProperties: false,
}

// ── 지금 상태 읽기 ─────────────────────────────────────────

function monthStart(ymd: string): string {
  return `${ymd.slice(0, 7)}-01`
}

function nextMonthStart(ymd: string): string {
  const [y, m] = ymd.split("-").map(Number)
  return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`
}

// 오늘부터 14일 동안의 할 일·일정 + 그 뒤 다음 달 말일까지의 할 일 + 날짜 미정 할 일 + 오늘 끝낸 할 일 + 루틴 + 이번 달·다음 달 월별 목표 + 목표 + 일하는 시간
export async function loadAssistantContext(supabase: Supabase, userId: string, now: number): Promise<AssistantContext> {
  const today = msToKst(now).ymd
  const columns = "id, title, scheduled_at, is_done, estimated_minutes, goal_id, carry_count"

  let upcomingQuery = supabase
    .from("tasks")
    .select(columns)
    .eq("is_done", false)
    .gte("scheduled_at", dayIso(today))
    .lt("scheduled_at", dayIso(addDays(today, LOOK_AHEAD_DAYS)))
  for (const o of TASK_ORDER) upcomingQuery = upcomingQuery.order(o.column, { ascending: o.ascending })

  let laterQuery = supabase
    .from("tasks")
    .select(columns)
    .eq("is_done", false)
    .gte("scheduled_at", dayIso(addDays(today, LOOK_AHEAD_DAYS)))
    .lt("scheduled_at", dayIso(nextMonthStart(nextMonthStart(today))))
  for (const o of TASK_ORDER) laterQuery = laterQuery.order(o.column, { ascending: o.ascending })

  const [upcoming, later, unscheduled, doneToday, events, routines, monthly, goals, progress, work, dreams] = await Promise.all([
    upcomingQuery.limit(MAX_CONTEXT_TASKS),
    laterQuery.limit(MAX_LATER_TASKS),
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
      .select(columns)
      .eq("is_done", true)
      .gte("scheduled_at", dayIso(today))
      .lt("scheduled_at", dayIso(addDays(today, 1)))
      .limit(30),
    supabase
      .from("events")
      .select("id, title, starts_at, ends_at")
      .lt("starts_at", dayIso(addDays(today, LOOK_AHEAD_DAYS)))
      .gt("ends_at", dayIso(today))
      .order("starts_at", { ascending: true })
      .limit(MAX_EVENTS),
    supabase.from("routines").select("id, title, weekdays, start_time, duration_minutes").order("start_time"),
    supabase
      .from("monthly_goals")
      .select("id, title, month, is_done")
      .in("month", [monthStart(today), nextMonthStart(today)])
      .order("month")
      .order("sort_order")
      .order("created_at"),
    supabase.from("goals").select("id, title, deadline, status").neq("status", "archived").order("created_at"),
    loadGoalProgress(supabase, weekStartOf(today)),
    loadWorkHours(supabase, userId),
    supabase.from("dreams").select("id, title, is_done").order("sort_order").order("created_at"),
  ])
  if (
    upcoming.error ||
    later.error ||
    unscheduled.error ||
    doneToday.error ||
    events.error ||
    routines.error ||
    monthly.error ||
    goals.error ||
    !progress
  ) {
    throw new Error("데이터를 불러오지 못했어요")
  }

  // DB 정렬은 같은 날 안에서만 맞으니 날짜 순으로 한 번 더(같은 날은 순서 유지)
  const dated = [...upcoming.data, ...later.data]
    .map((t, index) => ({ t, ymd: ymdOf(t.scheduled_at!), index }))
    .sort((a, b) => a.ymd.localeCompare(b.ymd) || a.index - b.index)
  const rows = [...dated.map((d) => d.t), ...unscheduled.data, ...doneToday.data]
  const progressById = new Map(progress.map((p) => [p.id, p]))

  return {
    now,
    today,
    work,
    tasks: rows.map((t, i) => ({
      ref: `T${i + 1}`,
      id: t.id,
      title: t.title,
      ymd: t.scheduled_at ? ymdOf(t.scheduled_at) : null,
      minutes: t.estimated_minutes,
      goalId: t.goal_id,
      carry: t.carry_count,
      done: t.is_done,
    })),
    events: events.data.map((e, i) => ({
      ref: `E${i + 1}`,
      id: e.id,
      title: e.title,
      start: Date.parse(e.starts_at),
      end: Date.parse(e.ends_at),
    })),
    routines: routines.data.map((r, i) => ({
      ref: `R${i + 1}`,
      id: r.id,
      title: r.title,
      weekdays: r.weekdays,
      start: parseClock(r.start_time) ?? 0,
      minutes: r.duration_minutes,
    })),
    monthly: monthly.data.map((m, i) => ({ ref: `M${i + 1}`, id: m.id, title: m.title, month: m.month, done: m.is_done })),
    goals: goals.data.map((g, i) => ({
      ref: `G${i + 1}`,
      id: g.id,
      title: g.title,
      deadline: g.deadline,
      status: g.status,
      done: progressById.get(g.id)?.done ?? 0,
      total: progressById.get(g.id)?.total ?? 0,
    })),
    // Dream 표를 아직 만들지 않았거나 못 읽어도 나머지는 그대로 씁니다.
    dreams: (dreams.data ?? []).map((d, i) => ({ ref: `D${i + 1}`, id: d.id, title: d.title, done: d.is_done })),
  }
}

function isWorkDay(work: WorkHours, ymd: string): boolean {
  return work.days.length === 0 || work.days.includes(weekdayOf(ymd))
}

function weekdaysText(days: number[]): string {
  return [1, 2, 3, 4, 5, 6, 0].filter((d) => days.includes(d)).map((d) => WEEKDAYS[d]).join("·")
}

const GOAL_STATUS: Record<string, string> = { draft: "MOMO와 대화 중", active: "진행 중", done: "완료" }

// 매번 바뀌는 지금 상태는 마지막 사용자 메시지 뒤에만 붙입니다(앞 대화는 그대로 → 캐시 절약).
function contextBlock(ctx: AssistantContext): string {
  const { today, work } = ctx
  const nowMinutes = msToKst(ctx.now).minutes
  const left = Math.max(0, work.end - Math.max(nowMinutes, work.start))
  const goalRef = new Map(ctx.goals.map((g) => [g.id, g.ref]))

  const lines = [
    "[앱이 붙인 참고 정보 — 사용자가 쓴 글이 아닙니다]",
    `지금: ${formatFullDayLabel(today)} (${today}) ${formatClock(nowMinutes)}`,
    `일하는 시간: ${weekdaysText(work.days)}요일 ${formatClock(work.start)}~${formatClock(work.end)}`,
    isWorkDay(work, today)
      ? `오늘 남은 일할 시간: ${left > 0 ? formatDuration(left) : "없음(일하는 시간이 지났어요)"}`
      : "오늘은 일하는 요일이 아닙니다.",
    "",
    "Dream(기한 없는 큰 목표):",
  ]
  if (ctx.dreams.length === 0) lines.push("- 없음")
  for (const d of ctx.dreams) lines.push(`- ${d.ref} "${d.title}"${d.done ? " · 이룸" : ""}`)

  lines.push("", "목표:")
  if (ctx.goals.length === 0) lines.push("- 없음")
  for (const g of ctx.goals) {
    const progress = g.status === "active" ? ` · 전체 진척 ${percent(g.done, g.total)}%` : ""
    lines.push(`- ${g.ref} "${g.title}" · ${GOAL_STATUS[g.status] ?? g.status} · 마감 ${g.deadline ?? "없음"}${progress}`)
  }

  lines.push("", "월별 목표:")
  if (ctx.monthly.length === 0) lines.push("- 없음")
  for (const m of ctx.monthly) {
    lines.push(`- ${m.ref} [${m.month.slice(0, 7)}] "${m.title}"${m.done ? " · 달성" : ""}`)
  }

  lines.push("", "루틴(매주 반복):")
  if (ctx.routines.length === 0) lines.push("- 없음")
  for (const r of ctx.routines) {
    lines.push(`- ${r.ref} "${r.title}" · ${weekdaysText(r.weekdays)} · ${formatClock(r.start)}부터 ${r.minutes}분`)
  }

  const taskLine = (t: CtxTask) => {
    const parts = [`- ${t.ref} "${t.title}" ${t.minutes}분`]
    if (t.goalId && goalRef.has(t.goalId)) parts.push(`목표 ${goalRef.get(t.goalId)}`)
    if (t.carry > 0) parts.push(`${t.carry}번 미룸`)
    return parts.join(" · ")
  }
  lines.push("", `날짜별 일정·할 일 (오늘부터 ${LOOK_AHEAD_DAYS}일, 할 일은 위에서부터 그날 순서):`)
  for (let i = 0; i < LOOK_AHEAD_DAYS; i++) {
    const ymd = addDays(today, i)
    const dayTasks = ctx.tasks.filter((t) => !t.done && t.ymd === ymd)
    const total = dayTasks.reduce((sum, t) => sum + t.minutes, 0)
    const tag = [i === 0 ? "오늘" : i === 1 ? "내일" : "", isWorkDay(work, ymd) ? "" : "쉬는 요일"].filter(Boolean).join(", ")
    lines.push(`${ymd} (${WEEKDAYS[weekdayOf(ymd)]})${tag ? ` [${tag}]` : ""} · ${dayTasks.length ? `할 일 합계 ${formatDuration(total)}` : "할 일 없음"}`)
    const dayStart = kstToMs(ymd)
    for (const e of ctx.events) {
      if (e.start >= dayStart + 24 * 60 * MINUTE_MS || e.end <= dayStart) continue
      // 여러 날에 걸친 일정은 시작한 날(또는 목록 첫날)에만 적습니다.
      if (e.start < dayStart && i > 0) continue
      const s = msToKst(e.start)
      const en = msToKst(e.end)
      const range = s.ymd === en.ymd ? `${formatClock(s.minutes)}~${formatClock(en.minutes)}` : `${s.ymd} ${formatClock(s.minutes)} ~ ${en.ymd} ${formatClock(en.minutes)}`
      lines.push(`- 일정 ${e.ref} "${e.title}" ${range}`)
    }
    for (const t of dayTasks) lines.push(taskLine(t))
  }

  const lookAheadEnd = addDays(today, LOOK_AHEAD_DAYS)
  const later = ctx.tasks.filter((t) => !t.done && t.ymd !== null && t.ymd >= lookAheadEnd)
  lines.push("", `그 뒤 다음 달 말일까지의 할 일 (${lookAheadEnd}부터, 날짜순·그날 순서):`)
  if (later.length === 0) lines.push("- 없음")
  for (const t of later) lines.push(`${taskLine(t)} · ${t.ymd} (${WEEKDAYS[weekdayOf(t.ymd!)]})`)

  const unscheduled = ctx.tasks.filter((t) => !t.done && t.ymd === null)
  lines.push("", "날짜 미정 할 일:")
  if (unscheduled.length === 0) lines.push("- 없음")
  for (const t of unscheduled) lines.push(taskLine(t))

  const done = ctx.tasks.filter((t) => t.done)
  lines.push("", "오늘 이미 끝낸 할 일:")
  if (done.length === 0) lines.push("- 없음")
  for (const t of done) lines.push(taskLine(t))
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
  const actions = Array.isArray(parsed.actions)
    ? (parsed.actions.filter((a) => a && typeof a === "object").slice(0, MAX_ACTIONS) as AssistantAction[])
    : []
  return { reply, actions }
}

// ── 반영하기 ──────────────────────────────────────────────

function dayText(ymd: string | null, today: string): string {
  if (!ymd) return "날짜 미정"
  if (ymd === today) return "오늘"
  if (ymd === addDays(today, 1)) return `내일 ${formatDayLabel(ymd)}`
  return formatDayLabel(ymd)
}

function str(value: unknown, max: number): string | null {
  const text = typeof value === "string" ? value.trim() : ""
  return text && text.length <= max ? text : null
}

// "2026-11" 또는 "2026-11-01" → "2026-11-01"
function toMonth(value: unknown): string | null {
  if (typeof value !== "string") return null
  const m = /^(\d{4})-(\d{2})(?:-\d{2})?$/.exec(value.trim())
  if (!m) return null
  const month = `${m[1]}-${m[2]}-01`
  return isValidDate(month) ? month : null
}

type Results = { changes: string[]; skipped: number; undo: UndoPlan }

// AI가 정한 변경을 하나씩 검사한 뒤 저장합니다. 이상한 변경(없는 번호, 지난 날짜, 잘못된 시각 등)은 건너뜁니다.
// 순서 바꾸기(task_order)는 옮기기·추가가 끝난 뒤 마지막에 합니다.
export async function applyAssistantActions(
  supabase: Supabase,
  userId: string,
  ctx: AssistantContext,
  actions: AssistantAction[]
): Promise<Results> {
  const { today } = ctx
  const lastDay = addDays(today, MAX_AHEAD_DAYS)
  const okDate = (d: unknown): d is string => typeof d === "string" && isValidDate(d) && d >= today && d <= lastDay
  // "none"이면 날짜 미정(null), 올바른 날짜면 그 날짜, 아니면 undefined(잘못됨)
  const taskDate = (d: unknown): string | null | undefined => (d === "none" ? null : okDate(d) ? d : undefined)

  const lookup = <T extends { ref: string }>(list: T[]) => {
    const map = new Map(list.map((x) => [x.ref.toUpperCase(), x]))
    return (ref: unknown) => (typeof ref === "string" ? map.get(ref.trim().toUpperCase()) : undefined)
  }
  const findTask = lookup(ctx.tasks)
  const findEvent = lookup(ctx.events)
  const findRoutine = lookup(ctx.routines)
  const findMonthly = lookup(ctx.monthly)
  const findGoal = lookup(ctx.goals)
  const findDream = lookup(ctx.dreams)

  const out: Results = { changes: [], skipped: 0, undo: [] }
  const seen = new Set<string>()
  const gone = new Set<string>()
  const skip = () => {
    out.skipped++
  }

  // 바꾸기 전 행 전체를 한 번만 기억해 둡니다(되돌리기용).
  const rememberRow = (table: UndoTable, row: Record<string, unknown>, key = `${table}:${row.id}`) => {
    if (seen.has(key)) return
    seen.add(key)
    out.undo.push({ table, kind: "restore", row })
  }
  const remember = async (table: Exclude<UndoTable, "routine_checks">, id: string): Promise<boolean> => {
    if (seen.has(`${table}:${id}`)) return true
    const { data, error } = await supabase
      .from(table as "tasks")
      .select("*")
      .eq("id", id)
      .maybeSingle()
    if (error || !data) return false
    rememberRow(table, data as Record<string, unknown>)
    return true
  }

  // 옮기기·추가할 날짜의 '맨 아래 자리'를 미리 계산
  const appendDates = actions
    .filter((a) => a.type === "task_move" || a.type === "task_add")
    .map((a) => a.date)
    .filter(okDate)
  const next = await createAppender(supabase, appendDates)

  for (const a of actions) {
    switch (a.type) {
      // ── 할 일 ──
      case "task_add": {
        const title = str(a.title, LIMITS.taskTitle)
        const date = taskDate(a.date)
        if (!title || date === undefined) {
          skip()
          break
        }
        const minutes = isDuration(a.minutes) ? a.minutes : DEFAULT_MINUTES
        const goal = findGoal(a.goal)
        const { data, error } = await supabase
          .from("tasks")
          .insert({
            user_id: userId,
            title,
            estimated_minutes: minutes,
            goal_id: goal?.id ?? null,
            scheduled_at: date ? dayIso(date) : null,
            sort_order: date ? next(date) : 0,
            source: "manual",
          })
          .select("id")
          .single()
        if (error) {
          skip()
          break
        }
        out.undo.push({ table: "tasks", kind: "remove", id: data.id })
        out.changes.push(`새 할 일 '${title}' → ${dayText(date, today)}`)
        break
      }
      case "task_edit": {
        const t = findTask(a.target)
        if (!t || gone.has(t.id)) {
          skip()
          break
        }
        const update: { title?: string; estimated_minutes?: number; goal_id?: string | null } = {}
        const notes: string[] = []
        const title = str(a.title, LIMITS.taskTitle)
        if (title && title !== t.title) {
          update.title = title
          notes.push(`제목 '${title}'`)
        }
        if (isDuration(a.minutes) && a.minutes !== t.minutes) {
          update.estimated_minutes = a.minutes
          notes.push(`예상 ${formatDuration(a.minutes)}`)
        }
        if (a.goal === "none" && t.goalId) {
          update.goal_id = null
          notes.push("목표 연결 끊음")
        } else if (findGoal(a.goal) && findGoal(a.goal)!.id !== t.goalId) {
          update.goal_id = findGoal(a.goal)!.id
          notes.push(`목표 '${findGoal(a.goal)!.title}'에 연결`)
        }
        if (notes.length === 0 || !(await remember("tasks", t.id))) {
          skip()
          break
        }
        const { error } = await supabase.from("tasks").update(update).eq("id", t.id).eq("user_id", userId)
        if (error) skip()
        else out.changes.push(`'${t.title}' 수정: ${notes.join(", ")}`)
        break
      }
      case "task_move": {
        const t = findTask(a.target)
        const date = taskDate(a.date)
        if (!t || t.done || gone.has(t.id) || date === undefined || date === t.ymd || !(await remember("tasks", t.id))) {
          skip()
          break
        }
        // 이월 횟수는 올리지 않습니다(사정에 맞춰 MOMO가 다시 짠 것이라서).
        const update: { scheduled_at: string | null; sort_order?: number } = { scheduled_at: date ? dayIso(date) : null }
        if (date) update.sort_order = next(date)
        const { error } = await supabase.from("tasks").update(update).eq("id", t.id).eq("user_id", userId)
        if (error) skip()
        else {
          t.ymd = date
          out.changes.push(`'${t.title}' → ${dayText(date, today)}`)
        }
        break
      }
      case "task_done": {
        const t = findTask(a.target)
        if (!t || gone.has(t.id) || typeof a.done !== "boolean" || a.done === t.done || !(await remember("tasks", t.id))) {
          skip()
          break
        }
        const { error } = await supabase
          .from("tasks")
          .update({ is_done: a.done, done_at: a.done ? new Date(ctx.now).toISOString() : null })
          .eq("id", t.id)
          .eq("user_id", userId)
        if (error) skip()
        else {
          t.done = a.done
          out.changes.push(a.done ? `'${t.title}' 완료` : `'${t.title}' 완료 취소`)
        }
        break
      }
      case "task_delete": {
        const t = findTask(a.target)
        if (!t || gone.has(t.id) || !(await remember("tasks", t.id))) {
          skip()
          break
        }
        const { error } = await supabase.from("tasks").delete().eq("id", t.id).eq("user_id", userId)
        if (error) skip()
        else {
          gone.add(t.id)
          out.changes.push(`할 일 '${t.title}' 삭제`)
        }
        break
      }
      case "task_order":
        break

      // ── 일정 ──
      case "event_add": {
        const title = str(a.title, LIMITS.taskTitle)
        const start = typeof a.start === "string" ? parseClock(a.start) : null
        const minutes = a.minutes === null ? 60 : a.minutes
        if (!title || !okDate(a.date) || start === null || start >= 24 * 60 || !isDuration(minutes)) {
          skip()
          break
        }
        const startMs = kstToMs(a.date, start)
        const { data, error } = await supabase
          .from("events")
          .insert({
            user_id: userId,
            title,
            starts_at: new Date(startMs).toISOString(),
            ends_at: new Date(startMs + minutes * MINUTE_MS).toISOString(),
          })
          .select("id")
          .single()
        if (error) {
          skip()
          break
        }
        out.undo.push({ table: "events", kind: "remove", id: data.id })
        out.changes.push(`새 일정 '${title}' → ${dayText(a.date, today)} ${formatClock(start)} (${formatDuration(minutes)})`)
        break
      }
      case "event_edit": {
        const e = findEvent(a.target)
        if (!e || gone.has(e.id)) {
          skip()
          break
        }
        const cur = msToKst(e.start)
        const curMinutes = Math.round((e.end - e.start) / MINUTE_MS)
        const title = str(a.title, LIMITS.taskTitle) ?? e.title
        const date = a.date === null ? cur.ymd : okDate(a.date) ? a.date : undefined
        const start = a.start === null ? cur.minutes : parseClock(a.start)
        const minutes = a.minutes === null ? curMinutes : a.minutes
        // 원래 길이가 12시간을 넘는 일정(휴가 등)은 길이를 바꾸지 않을 때 그대로 둡니다.
        const minutesOk = a.minutes === null || isDuration(minutes)
        if (date === undefined || start === null || start >= 24 * 60 || !minutesOk) {
          skip()
          break
        }
        const startMs = kstToMs(date, start)
        const endMs = startMs + minutes * MINUTE_MS
        if (title === e.title && startMs === e.start && endMs === e.end) {
          skip()
          break
        }
        if (!(await remember("events", e.id))) {
          skip()
          break
        }
        const { error } = await supabase
          .from("events")
          .update({ title, starts_at: new Date(startMs).toISOString(), ends_at: new Date(endMs).toISOString() })
          .eq("id", e.id)
          .eq("user_id", userId)
        if (error) skip()
        else out.changes.push(`일정 '${e.title}' 수정 → '${title}' ${dayText(date, today)} ${formatClock(start)} (${formatDuration(minutes)})`)
        break
      }
      case "event_delete": {
        const e = findEvent(a.target)
        if (!e || gone.has(e.id) || !(await remember("events", e.id))) {
          skip()
          break
        }
        const { error } = await supabase.from("events").delete().eq("id", e.id).eq("user_id", userId)
        if (error) skip()
        else {
          gone.add(e.id)
          out.changes.push(`일정 '${e.title}' 삭제`)
        }
        break
      }

      // ── 루틴 ──
      case "routine_add": {
        const title = str(a.title, LIMITS.taskTitle)
        const start = typeof a.start === "string" ? parseClock(a.start) : null
        const weekdays = isWeekdayList(a.weekdays) ? [...a.weekdays].sort() : null
        if (!title || !weekdays || start === null || !isDuration(a.minutes) || start + a.minutes > 24 * 60) {
          skip()
          break
        }
        const { data, error } = await supabase
          .from("routines")
          .insert({ user_id: userId, title, weekdays, start_time: formatClock(start), duration_minutes: a.minutes })
          .select("id")
          .single()
        if (error) {
          skip()
          break
        }
        out.undo.push({ table: "routines", kind: "remove", id: data.id })
        out.changes.push(`새 루틴 '${title}' → ${weekdaysText(weekdays)} ${formatClock(start)} (${formatDuration(a.minutes)})`)
        break
      }
      case "routine_edit": {
        const r = findRoutine(a.target)
        if (!r || gone.has(r.id)) {
          skip()
          break
        }
        const title = str(a.title, LIMITS.taskTitle) ?? r.title
        const weekdays = a.weekdays === null ? r.weekdays : isWeekdayList(a.weekdays) ? [...a.weekdays].sort() : null
        const start = a.start === null ? r.start : parseClock(a.start)
        const minutes = a.minutes === null ? r.minutes : a.minutes
        if (!weekdays || start === null || !isDuration(minutes) || start + minutes > 24 * 60) {
          skip()
          break
        }
        const same =
          title === r.title && start === r.start && minutes === r.minutes && weekdays.join() === [...r.weekdays].sort().join()
        if (same || !(await remember("routines", r.id))) {
          skip()
          break
        }
        const { error } = await supabase
          .from("routines")
          .update({ title, weekdays, start_time: formatClock(start), duration_minutes: minutes })
          .eq("id", r.id)
          .eq("user_id", userId)
        if (error) skip()
        else out.changes.push(`루틴 '${r.title}' 수정 → '${title}' ${weekdaysText(weekdays)} ${formatClock(start)} (${formatDuration(minutes)})`)
        break
      }
      case "routine_delete": {
        const r = findRoutine(a.target)
        if (!r || gone.has(r.id) || !(await remember("routines", r.id))) {
          skip()
          break
        }
        // 루틴을 지우면 체크 기록도 함께 지워지므로(DB 규칙), 되돌릴 수 있게 체크 기록도 기억해 둡니다.
        const checks = await supabase.from("routine_checks").select("*").eq("routine_id", r.id)
        if (checks.error) {
          skip()
          break
        }
        for (const c of checks.data) rememberRow("routine_checks", c, `routine_checks:${c.routine_id}:${c.check_date}`)
        const { error } = await supabase.from("routines").delete().eq("id", r.id).eq("user_id", userId)
        if (error) skip()
        else {
          gone.add(r.id)
          out.changes.push(`루틴 '${r.title}' 삭제`)
        }
        break
      }

      // ── 월별 목표 ──
      case "monthly_add": {
        const title = str(a.title, LIMITS.goalTitle)
        const month = toMonth(a.month)
        if (!title || !month || month < monthStart(today)) {
          skip()
          break
        }
        const { data: existing, error: readError } = await supabase
          .from("monthly_goals")
          .select("sort_order")
          .eq("month", month)
        if (readError || existing.length >= MONTHLY_MAX) {
          skip()
          break
        }
        const sortOrder = existing.reduce((max, g) => Math.max(max, g.sort_order + 1), 0)
        const { data, error } = await supabase
          .from("monthly_goals")
          .insert({ user_id: userId, month, title, sort_order: sortOrder })
          .select("id")
          .single()
        if (error) {
          skip()
          break
        }
        out.undo.push({ table: "monthly_goals", kind: "remove", id: data.id })
        out.changes.push(`새 월별 목표 '${title}' → ${Number(month.slice(5, 7))}월`)
        break
      }
      case "monthly_edit": {
        const m = findMonthly(a.target)
        if (!m || gone.has(m.id)) {
          skip()
          break
        }
        const update: { title?: string; is_done?: boolean } = {}
        const notes: string[] = []
        const title = str(a.title, LIMITS.goalTitle)
        if (title && title !== m.title) {
          update.title = title
          notes.push(`제목 '${title}'`)
        }
        if (typeof a.done === "boolean" && a.done !== m.done) {
          update.is_done = a.done
          notes.push(a.done ? "달성" : "달성 취소")
        }
        if (notes.length === 0 || !(await remember("monthly_goals", m.id))) {
          skip()
          break
        }
        const { error } = await supabase.from("monthly_goals").update(update).eq("id", m.id).eq("user_id", userId)
        if (error) skip()
        else out.changes.push(`월별 목표 '${m.title}': ${notes.join(", ")}`)
        break
      }
      case "monthly_delete": {
        const m = findMonthly(a.target)
        if (!m || gone.has(m.id) || !(await remember("monthly_goals", m.id))) {
          skip()
          break
        }
        const { error } = await supabase.from("monthly_goals").delete().eq("id", m.id).eq("user_id", userId)
        if (error) skip()
        else {
          gone.add(m.id)
          out.changes.push(`월별 목표 '${m.title}' 삭제`)
        }
        break
      }

      // ── 목표 ──
      case "goal_edit": {
        const g = findGoal(a.target)
        if (!g || gone.has(g.id)) {
          skip()
          break
        }
        const update: { title?: string; deadline?: string | null; status?: "active" | "done" } = {}
        const notes: string[] = []
        const title = str(a.title, LIMITS.goalTitle)
        if (title && title !== g.title) {
          update.title = title
          notes.push(`제목 '${title}'`)
        }
        if (a.date === "none" && g.deadline) {
          update.deadline = null
          notes.push("마감 없앰")
        } else if (typeof a.date === "string" && isValidDate(a.date) && a.date !== g.deadline) {
          update.deadline = a.date
          notes.push(`마감 ${formatDayLabel(a.date)}`)
        }
        // 'MOMO와 대화 중'(draft) 목표의 상태는 바꾸지 않습니다(승인은 목표 화면에서).
        if ((a.status === "active" || a.status === "done") && a.status !== g.status && g.status !== "draft") {
          update.status = a.status
          notes.push(a.status === "done" ? "완료로" : "다시 진행 중으로")
        }
        if (notes.length === 0 || !(await remember("goals", g.id))) {
          skip()
          break
        }
        const { error } = await supabase.from("goals").update(update).eq("id", g.id).eq("user_id", userId)
        if (error) skip()
        else out.changes.push(`목표 '${g.title}': ${notes.join(", ")}`)
        break
      }
      case "goal_delete": {
        const g = findGoal(a.target)
        if (!g || gone.has(g.id) || !(await remember("goals", g.id))) {
          skip()
          break
        }
        // 목표 화면의 삭제와 같은 규칙: 안 끝낸 할 일은 함께 지우고, 끝낸 할 일은 기록으로 남깁니다(목표 연결만 풀림).
        // 되돌릴 수 있게 이 목표의 할 일을 모두 기억해 둡니다.
        const linked = await supabase.from("tasks").select("*").eq("goal_id", g.id)
        if (linked.error) {
          skip()
          break
        }
        for (const t of linked.data) rememberRow("tasks", t)
        const tasks = await supabase.from("tasks").delete().eq("goal_id", g.id).eq("is_done", false).eq("user_id", userId)
        const { error } = tasks.error
          ? tasks
          : await supabase.from("goals").delete().eq("id", g.id).eq("user_id", userId)
        if (error) skip()
        else {
          gone.add(g.id)
          for (const t of linked.data) if (!t.is_done) gone.add(t.id)
          const removed = linked.data.filter((t) => !t.is_done).length
          out.changes.push(`목표 '${g.title}' 삭제${removed ? ` (안 끝낸 할 일 ${removed}개 함께 삭제)` : ""}`)
        }
        break
      }
      // ── Dream ──
      case "dream_add": {
        const title = str(a.title, LIMITS.goalTitle)
        if (!title) {
          skip()
          break
        }
        const { data: existing, error: readError } = await supabase.from("dreams").select("sort_order")
        if (readError) {
          skip()
          break
        }
        const sortOrder = existing.reduce((max, d) => Math.max(max, d.sort_order + 1), 0)
        const { data, error } = await supabase
          .from("dreams")
          .insert({ user_id: userId, title, sort_order: sortOrder })
          .select("id")
          .single()
        if (error) {
          skip()
          break
        }
        out.undo.push({ table: "dreams", kind: "remove", id: data.id })
        out.changes.push(`새 Dream '${title}'`)
        break
      }
      case "dream_edit": {
        const d = findDream(a.target)
        if (!d || gone.has(d.id)) {
          skip()
          break
        }
        const update: { title?: string; is_done?: boolean } = {}
        const notes: string[] = []
        const title = str(a.title, LIMITS.goalTitle)
        if (title && title !== d.title) {
          update.title = title
          notes.push(`제목 '${title}'`)
        }
        if (typeof a.done === "boolean" && a.done !== d.done) {
          update.is_done = a.done
          notes.push(a.done ? "이룸" : "이룸 취소")
        }
        if (notes.length === 0 || !(await remember("dreams", d.id))) {
          skip()
          break
        }
        const { error } = await supabase.from("dreams").update(update).eq("id", d.id).eq("user_id", userId)
        if (error) skip()
        else out.changes.push(`Dream '${d.title}': ${notes.join(", ")}`)
        break
      }
      case "dream_delete": {
        const d = findDream(a.target)
        if (!d || gone.has(d.id) || !(await remember("dreams", d.id))) {
          skip()
          break
        }
        const { error } = await supabase.from("dreams").delete().eq("id", d.id).eq("user_id", userId)
        if (error) skip()
        else {
          gone.add(d.id)
          out.changes.push(`Dream '${d.title}' 삭제`)
        }
        break
      }
      default:
        skip()
    }
  }

  // 순서 바꾸기: 고른 할 일을 적은 순서대로 그날 맨 위에, 나머지는 원래 순서대로
  for (const a of actions.filter((x) => x.type === "task_order")) {
    if (!okDate(a.date) || !Array.isArray(a.tasks)) {
      skip()
      continue
    }
    let dayQuery = supabase
      .from("tasks")
      .select("*")
      .gte("scheduled_at", dayIso(a.date))
      .lt("scheduled_at", dayIso(addDays(a.date, 1)))
    for (const o of TASK_ORDER) dayQuery = dayQuery.order(o.column, { ascending: o.ascending })
    const { data: day, error } = await dayQuery
    if (error) {
      skip()
      continue
    }
    const dayIds = new Set(day.map((d) => d.id))
    const picked = [...new Set(a.tasks.map((ref) => findTask(ref)?.id).filter((id): id is string => !!id && dayIds.has(id)))]
    if (picked.length === 0) {
      skip()
      continue
    }
    const pickedSet = new Set(picked)
    const ordered = [...picked.map((id) => day.find((d) => d.id === id)!), ...day.filter((d) => !pickedSet.has(d.id))]
    const results = await Promise.all(
      ordered.map((row, index) => {
        if (row.sort_order === index) return null
        rememberRow("tasks", row)
        return supabase.from("tasks").update({ sort_order: index }).eq("id", row.id).eq("user_id", userId)
      })
    )
    if (results.some((r) => r?.error)) skip()
    const titles = picked.map((id) => `'${day.find((d) => d.id === id)!.title}'`)
    out.changes.push(`${dayText(a.date, today)} 맨 위: ${titles.join(" → ")}`)
  }

  return out
}

// ── 되돌리기 ──────────────────────────────────────────────

// 다시 넣을 때 쓰는 칸(updated_at은 DB가 정함). user_id는 늘 로그인한 사용자로 덮어씁니다.
const RESTORE_COLUMNS: Record<UndoTable, string[]> = {
  goals: ["id", "title", "description", "deadline", "weekly_minutes", "status", "chat", "plan", "idea_id", "created_at"],
  tasks: [
    "id",
    "title",
    "is_done",
    "done_at",
    "scheduled_at",
    "estimated_minutes",
    "goal_id",
    "idea_id",
    "source",
    "carry_count",
    "sort_order",
    "created_at",
  ],
  events: ["id", "title", "starts_at", "ends_at", "created_at"],
  routines: ["id", "title", "weekdays", "start_time", "duration_minutes", "created_at"],
  routine_checks: ["routine_id", "check_date", "created_at"],
  monthly_goals: ["id", "month", "title", "is_done", "sort_order", "created_at"],
  dreams: ["id", "title", "is_done", "sort_order", "created_at"],
}

export function restoreRow(table: UndoTable, row: Record<string, unknown>, userId: string): Record<string, unknown> {
  const clean: Record<string, unknown> = { user_id: userId }
  for (const column of RESTORE_COLUMNS[table]) if (column in row) clean[column] = row[column]
  return clean
}

// 되돌리기 실행: 새로 만든 것을 지우고 → 목표 → 할 일 → 일정 → 루틴 → 루틴 체크 → 월별 목표 → Dream 순서로 원래 모습을 다시 넣습니다.
export async function runUndo(supabase: Supabase, userId: string, plan: UndoPlan): Promise<boolean> {
  let ok = true
  const removes = plan.filter((op) => op.kind === "remove")
  for (const table of UNDO_TABLES) {
    const ids = removes.filter((op) => op.table === table).map((op) => (op as { id: string }).id)
    if (ids.length === 0) continue
    const { error } = await supabase
      .from(table as "tasks")
      .delete()
      .in("id", ids)
      .eq("user_id", userId)
    if (error) ok = false
  }
  for (const table of UNDO_TABLES) {
    const rows = plan
      .filter((op): op is Extract<UndoOp, { kind: "restore" }> => op.kind === "restore" && op.table === table)
      .map((op) => restoreRow(table, op.row, userId))
    if (rows.length === 0) continue
    const { error } = await supabase
      .from(table as "tasks")
      .upsert(rows as never, table === "routine_checks" ? { onConflict: "routine_id,check_date" } : undefined)
    if (error) {
      console.error("[momo-undo] 되돌리기 실패:", table, error.message)
      ok = false
    }
  }
  return ok
}
