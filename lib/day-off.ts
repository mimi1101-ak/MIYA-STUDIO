import "server-only"

import { addDays, formatFullDayLabel, kstToMs, msToKst, WEEKDAYS, weekdayOf, weekStartOf } from "@/lib/date"
import { AiError, createAiClient, DEFAULT_MODEL, type ChatMessage } from "@/lib/goal-ai"
import { HORIZON_DAYS, type Interval, type WorkHours } from "@/lib/schedule"
import { loadWorkHours, type Supabase } from "@/lib/schedule-db"
import { isValidDate } from "@/lib/validation"

// 캘린더 옆 대화창: "금요일에 외근 있어"처럼 말하면 그날을 비우고 할 일을 하루씩 뒤로 밉니다.
// AI는 날짜만 알아듣고, 옮길 자리는 아래 규칙 코드가 정합니다.
// 하루씩 밀기: 비운 날부터 뒤의 할 일을 "일하는 날" 순서대로 한 칸씩 밉니다(시각은 그대로).
//   예) 월요일을 비우면 월 → 화, 화 → 수 … 계획 순서가 그대로 유지됩니다.
// 그날에는 일할 시간을 덮는 일정을 넣어, 캘린더에서 그날이 비었다는 것이 보이게 합니다.

const MINUTE_MS = 60_000
const DAY_MS = 24 * 60 * MINUTE_MS
// 한 번에 비울 수 있는 날 수와, 얼마나 먼 날까지 받을지
const MAX_DAYS = 14
const MAX_AHEAD_DAYS = 120
export const DEFAULT_DAY_OFF_LABEL = "다른 일정"

export type DayOffTurn = { reply: string; dates: string[]; label: string }

export type DayOffMove = { id: string; title: string; from: string; to: string }
// moves: 비운 날의 할 일, laterCount: 그 뒤에 함께 하루씩 밀리는 할 일 수
export type DayOffPreview = { dates: string[]; label: string; moves: DayOffMove[]; laterCount: number }

const SYSTEM_PROMPT = `당신은 MIYA STUDIO의 마스코트 캐릭터 MOMO입니다. 캘린더 옆 작은 대화창에서, 사용자가 다른 일정(외근, 출장, 휴가, 병원 등) 때문에 할 일을 못 하는 날을 알아듣는 역할만 합니다.
앱은 당신이 고른 날짜를 '다른 일정'으로 비우고, 그날부터의 할 일을 하루씩 뒤로 미는 미리보기를 사용자에게 보여 줍니다. 사용자가 확인 버튼을 눌러야 실제로 옮겨집니다.

답변 형식
- dates: 할 일을 못 하는 날짜(YYYY-MM-DD) 목록. 오늘 이후만, 최대 ${MAX_DAYS}일. "수요일부터 금요일까지"처럼 기간이면 하루씩 모두 넣습니다. 날짜를 확실히 알 수 없으면 빈 목록으로 두고 reply에서 짧게 되묻습니다.
- label: 그날 넣을 일정 이름. 사용자가 말한 이유를 2~10자로(예: "외근", "부산 출장"). 이유를 말하지 않았으면 "${DEFAULT_DAY_OFF_LABEL}".
- reply: 사용자에게 하는 말. 한국어 존댓말 1~2문장, 이모지 없이 차분하게. 날짜를 골랐으면 어느 날인지 말하고 "아래에서 옮길 할 일을 확인해 주세요"처럼 미리보기를 가리킵니다.
- 일정을 미루는 이야기가 아니면 dates는 빈 목록으로 두고, 이 대화창은 일이 생긴 날을 알려 주면 그날 할 일을 옮겨 준다고 짧게 안내합니다.
- 대화 중 이전에 고른 날을 고쳐 달라고 하면, 고친 전체 날짜 목록을 다시 줍니다.`

const OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    reply: { type: "string" },
    dates: { type: "array", items: { type: "string", format: "date" } },
    label: { type: "string" },
  },
  required: ["reply", "dates", "label"],
  additionalProperties: false,
}

// "다음 주 수요일" 같은 말을 정확히 날짜로 바꾸도록 이번 주부터 3주치 날짜표를 붙입니다.
function contextBlock(today: string): string {
  const monday = weekStartOf(today)
  const weeks = [0, 1, 2].map((w) => {
    const days = Array.from({ length: 7 }, (_, i) => {
      const ymd = addDays(monday, w * 7 + i)
      return `${WEEKDAYS[weekdayOf(ymd)]} ${ymd}`
    })
    return `${["이번 주", "다음 주", "다다음 주"][w]}: ${days.join(", ")}`
  })
  return ["[앱이 붙인 참고 정보 — 사용자가 쓴 글이 아닙니다]", `오늘: ${formatFullDayLabel(today)} (${today})`, ...weeks].join("\n")
}

export async function readDayOffRequest(history: ChatMessage[], today: string): Promise<DayOffTurn> {
  const client = createAiClient()
  const response = await client.beta.messages.create({
    model: process.env.CLAUDE_MODEL || DEFAULT_MODEL,
    max_tokens: 8000,
    // 날짜를 알아듣는 짧은 일이라 effort(생각하는 정도)는 low
    output_config: { effort: "low", format: { type: "json_schema", schema: OUTPUT_SCHEMA } },
    // 안전 필터가 요청을 거절하면 Anthropic이 고른 다른 모델로 자동으로 다시 시도합니다.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: SYSTEM_PROMPT,
    messages: history.map((m, i) =>
      i === history.length - 1 && m.role === "user"
        ? { role: "user", content: `${m.content}\n\n${contextBlock(today)}` }
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
  const reply = typeof parsed.reply === "string" ? parsed.reply.trim().slice(0, 1000) : ""
  if (!reply) throw new AiError("AI 답변이 비어 있어요.")
  return {
    reply,
    dates: normalizeDates(parsed.dates, today),
    label: normalizeLabel(parsed.label),
  }
}

// 오늘~120일 뒤 사이의 올바른 날짜만, 겹치지 않게, 순서대로, 최대 14일
export function normalizeDates(raw: unknown, today: string): string[] {
  if (!Array.isArray(raw)) return []
  const last = addDays(today, MAX_AHEAD_DAYS)
  const dates = raw.filter(
    (d): d is string => typeof d === "string" && isValidDate(d) && d >= today && d <= last
  )
  return [...new Set(dates)].sort().slice(0, MAX_DAYS)
}

export function normalizeLabel(raw: unknown): string {
  const label = typeof raw === "string" ? raw.trim().slice(0, 30) : ""
  return label || DEFAULT_DAY_OFF_LABEL
}

export type ShiftTask = { id: string; title: string; scheduled_at: string; estimated_minutes: number; ymd: string }
export type Shift = { task: ShiftTask; to: number }

// 비운 첫날부터 앞으로 남은(안 끝낸) 할 일 전부
export async function loadTasksFrom(supabase: Supabase, firstDate: string): Promise<ShiftTask[]> {
  const from = kstToMs(firstDate)
  const { data, error } = await supabase
    .from("tasks")
    .select("id, title, scheduled_at, estimated_minutes")
    .eq("is_done", false)
    .gte("scheduled_at", new Date(from).toISOString())
    .lt("scheduled_at", new Date(from + HORIZON_DAYS * DAY_MS).toISOString())
    .order("scheduled_at", { ascending: true })
  if (error) throw new Error("할 일을 불러오지 못했어요")
  return data.map((t) => ({ ...t, scheduled_at: t.scheduled_at!, ymd: msToKst(Date.parse(t.scheduled_at!)).ymd }))
}

// 하루씩 밀기 계산(저장하지 않음).
// 원래 날 목록 W = 첫 비운 날부터의 일하는 날(+비운 날), 새 날 목록 A = 일하는 날 중 비운 날을 뺀 것.
// W의 i번째 날에 있던 할 일 → A의 i번째 날(그날 순서 그대로). 일하지 않는 날(주말 등)에 직접 넣은 할 일은 그대로 둡니다.
export function planShift(dates: string[], work: WorkHours, tasks: ShiftTask[]): Shift[] {
  if (tasks.length === 0) return []
  const blocked = new Set(dates)
  // 일하는 요일을 하나도 정하지 않았으면 모든 요일을 일하는 날로 봅니다.
  const isWorkDay = (ymd: string) => work.days.length === 0 || work.days.includes(weekdayOf(ymd))
  const lastDay = tasks[tasks.length - 1].ymd

  const original = new Map<string, number>()
  for (let ymd = dates[0]; ymd <= lastDay; ymd = addDays(ymd, 1)) {
    if (isWorkDay(ymd) || blocked.has(ymd)) original.set(ymd, original.size)
  }
  const available: string[] = []
  for (let ymd = dates[0]; available.length < original.size; ymd = addDays(ymd, 1)) {
    if (isWorkDay(ymd) && !blocked.has(ymd)) available.push(ymd)
  }

  const shifts: Shift[] = []
  for (const task of tasks) {
    const index = original.get(task.ymd)
    if (index === undefined || available[index] === task.ymd) continue
    const { minutes } = msToKst(Date.parse(task.scheduled_at))
    shifts.push({ task, to: kstToMs(available[index], minutes) })
  }
  return shifts
}

// 그날 막아 둘 시간: 일할 시간 전체
export function blockFor(ymd: string, work: WorkHours): Interval {
  return { start: kstToMs(ymd, work.start), end: kstToMs(ymd, work.end) }
}

export async function computeShift(supabase: Supabase, userId: string, dates: string[]) {
  const [work, tasks] = await Promise.all([loadWorkHours(supabase, userId), loadTasksFrom(supabase, dates[0])])
  return { work, shifts: planShift(dates, work, tasks) }
}

export function toPreview(dates: string[], label: string, shifts: Shift[]): DayOffPreview {
  const blocked = new Set(dates)
  const moves = shifts
    .filter((s) => blocked.has(s.task.ymd))
    .map((s) => ({ id: s.task.id, title: s.task.title, from: s.task.scheduled_at, to: new Date(s.to).toISOString() }))
  return { dates, label, moves, laterCount: shifts.length - moves.length }
}
