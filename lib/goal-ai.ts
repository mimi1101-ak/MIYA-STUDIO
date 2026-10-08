import "server-only"

import Anthropic from "@anthropic-ai/sdk"

import { MissingAiKeyError } from "@/lib/daily-message"
import { formatClock, formatFullDayLabel, WEEKDAYS } from "@/lib/date"
import type { WorkHours } from "@/lib/schedule"
import { isValidDate } from "@/lib/validation"

// MOMO와 목표 세우기 (Claude API). 대화로 목표를 구체화하고, 월 → 주 → 일 단위 할 일 계획안을 만듭니다.
// 시간 배치는 AI가 하지 않고 배치 규칙(lib/schedule.ts)이 합니다. AI는 날짜와 예상 시간만 정합니다.

export const DEFAULT_MODEL = "claude-opus-5-5"
const MAX_PLAN_TASKS = 150

export type ChatMessage = { role: "user" | "assistant"; content: string }

export type PlanTask = { title: string; date: string; minutes: number }
export type PlanWeek = { label: string; focus: string; tasks: PlanTask[] }
export type PlanMonth = { label: string; focus: string; weeks: PlanWeek[] }
export type GoalPlan = { summary: string; months: PlanMonth[] }

export type GoalDraft = {
  title: string
  description: string
  deadline: string | null
  weekly_minutes: number | null
}

export type AssistantTurn = { reply: string; goal: GoalDraft | null; plan: GoalPlan | null }

const SYSTEM_PROMPT = `당신은 MIYA STUDIO의 마스코트 캐릭터 MOMO입니다. 사용자의 목표를 함께 세우는 역할을 합니다. 사용자는 이 앱을 혼자 쓰는 개인이고, "목표만 정하면 AI가 할 일을 쪼개서 일정에 넣어 주고, 나는 확인하고 실행만 한다"를 원합니다.

진행 방식
1. 사용자가 목표를 대충 말하면, 계획에 꼭 필요한 정보만 짧게 묻습니다. 한 번에 1~3개, 번호를 붙여 묻습니다.
   - 필요한 정보: 마감일, 하루 또는 주당 쓸 수 있는 시간, 현재 진행 상태(이미 한 것), 결과물의 기준(예: 분량)
   - 사용자가 이미 말한 것은 다시 묻지 않습니다. 말하지 않았어도 합리적으로 정할 수 있으면 가정하고, 답변에 그 가정을 밝힙니다.
2. 정보가 충분해지면 계획안을 만듭니다. 계획은 월 → 주 → 일 단위로 쪼갭니다.
   - 할 일 하나는 한 번 앉아서 끝낼 수 있는 구체적인 행동입니다(예: "1권 3장 초고 쓰기"). 15~240분 사이로 잡습니다.
   - 각 할 일의 date는 그 할 일을 할 날짜(YYYY-MM-DD)입니다. 오늘 이후, 마감일 이전, 사용자가 일하는 요일에만 둡니다.
   - 주당 쓸 시간을 넘기지 않게 나눕니다. 하루에 몰지 말고 고르게 펼칩니다. 마감 직전에는 여유를 둡니다.
   - 할 일은 최대 ${MAX_PLAN_TASKS}개입니다. 기간이 길면 할 일을 더 크게 묶습니다.
   - 실제 시각 배치는 앱이 일정·루틴을 피해서 자동으로 하므로, 시각은 정하지 않습니다.
3. 사용자가 계획을 고쳐 달라고 하면, 고친 전체 계획안을 다시 만듭니다.

답변 형식
- reply: 사용자에게 하는 말. 한국어 존댓말, 짧고 차분하게, 이모지 없이. 계획안을 만들었으면 핵심 요약과 "괜찮으면 '승인하고 일정에 넣기'를 눌러 주세요"를 덧붙입니다.
- goal: 지금까지 파악한 목표 정보. 제목은 결과물이 드러나게 짧게(예: "12월까지 전자책 5권"). 아직 모르면 null.
- plan: 계획안을 만들거나 고친 경우에만 채웁니다. 질문만 하는 차례에는 null.`

const PLAN_TASK_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" },
    date: { type: "string", format: "date" },
    minutes: { type: "integer" },
  },
  required: ["title", "date", "minutes"],
  additionalProperties: false,
}

const OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    reply: { type: "string" },
    goal: {
      anyOf: [
        {
          type: "object",
          properties: {
            title: { type: "string" },
            description: { type: "string" },
            deadline: { anyOf: [{ type: "string", format: "date" }, { type: "null" }] },
            weekly_minutes: { anyOf: [{ type: "integer" }, { type: "null" }] },
          },
          required: ["title", "description", "deadline", "weekly_minutes"],
          additionalProperties: false,
        },
        { type: "null" },
      ],
    },
    plan: {
      anyOf: [
        {
          type: "object",
          properties: {
            summary: { type: "string" },
            months: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  label: { type: "string" },
                  focus: { type: "string" },
                  weeks: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        label: { type: "string" },
                        focus: { type: "string" },
                        tasks: { type: "array", items: PLAN_TASK_SCHEMA },
                      },
                      required: ["label", "focus", "tasks"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["label", "focus", "weeks"],
                additionalProperties: false,
              },
            },
          },
          required: ["summary", "months"],
          additionalProperties: false,
        },
        { type: "null" },
      ],
    },
  },
  required: ["reply", "goal", "plan"],
  additionalProperties: false,
}

export class AiError extends Error {}

// 실패 이유를 사용자에게 보여 줄 쉬운 말로 바꿉니다. 자세한 내용은 서버 기록에 남깁니다.
export function aiErrorMessage(error: unknown): string {
  if (error instanceof MissingAiKeyError) return "AI 키(ANTHROPIC_API_KEY)가 아직 설정되지 않았어요."
  if (error instanceof AiError) return error.message
  console.error("[goal-ai] 실패:", error instanceof Error ? error.message : error)
  if (error instanceof Anthropic.RateLimitError) return "AI 요청이 많아 잠시 막혔어요. 1분 뒤 다시 시도해 주세요."
  if (error instanceof Anthropic.APIConnectionError) {
    return "AI 서비스에 연결하지 못했어요. 인터넷 연결을 확인하고 다시 시도해 주세요."
  }
  return "MOMO가 답하지 못했어요. 잠시 후 다시 시도해 주세요."
}

// AI 기능들이 함께 쓰는 Claude 연결 (키는 서버에서만 읽음)
export function createAiClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new MissingAiKeyError()
  // 계획안은 길어질 수 있어 넉넉히 기다립니다.
  return new Anthropic({ apiKey, timeout: 240_000, maxRetries: 1 })
}

function workHoursText(work: WorkHours): string {
  const days = [1, 2, 3, 4, 5, 6, 0].filter((d) => work.days.includes(d)).map((d) => WEEKDAYS[d])
  return `${days.join("·")}요일 ${formatClock(work.start)}~${formatClock(work.end)}`
}

// 매번 바뀌는 참고 정보(오늘 날짜, 현재 계획안)는 마지막 사용자 메시지 뒤에만 붙여
// 앞쪽 대화가 그대로 유지되게 합니다(캐시 절약).
function contextBlock(today: string, work: WorkHours, currentPlan: GoalPlan | null): string {
  const lines = [
    "[앱이 붙인 참고 정보 — 사용자가 쓴 글이 아닙니다]",
    `오늘: ${formatFullDayLabel(today)} (${today})`,
    `사용자가 일할 수 있는 시간: ${workHoursText(work)}`,
  ]
  if (currentPlan) lines.push(`현재 계획안(JSON): ${JSON.stringify(currentPlan)}`)
  return lines.join("\n")
}

export async function askGoalAssistant(
  history: ChatMessage[],
  today: string,
  work: WorkHours,
  currentPlan: GoalPlan | null
): Promise<AssistantTurn> {
  const client = createAiClient()
  const messages: Anthropic.Beta.BetaMessageParam[] = history.map((m, i) =>
    i === history.length - 1 && m.role === "user"
      ? { role: "user", content: `${m.content}\n\n${contextBlock(today, work, currentPlan)}` }
      : { role: m.role, content: m.content }
  )

  const stream = client.beta.messages.stream({
    model: process.env.CLAUDE_MODEL || DEFAULT_MODEL,
    max_tokens: 32000,
    // 계획 짜기는 생각이 필요해 effort(생각하는 정도)를 medium으로 둡니다.
    output_config: { effort: "medium", format: { type: "json_schema", schema: OUTPUT_SCHEMA } },
    // 안전 필터가 요청을 거절하면 Anthropic이 고른 다른 모델로 자동으로 다시 시도합니다.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    cache_control: { type: "ephemeral" },
    system: SYSTEM_PROMPT,
    messages,
  })
  const response = await stream.finalMessage()

  if (response.stop_reason === "refusal") throw new AiError("AI가 이 요청에 답하지 않았어요.")
  if (response.stop_reason === "max_tokens") {
    throw new AiError("계획이 너무 길어져 끊겼어요. 기간을 나누거나 할 일을 더 크게 묶어 달라고 해 주세요.")
  }

  const text = response.content
    .flatMap((block) => (block.type === "text" ? [block.text] : []))
    .join("")
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new AiError("AI 답변을 읽지 못했어요.")
  }
  return normalizeTurn(parsed, today)
}

// ── AI 답변 확인: 형식이 틀리거나 범위를 벗어난 값은 고치거나 버립니다 ──

function str(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : ""
}

function normalizeTurn(raw: unknown, today: string): AssistantTurn {
  const data = (raw ?? {}) as Record<string, unknown>
  const reply = str(data.reply, 4000)
  if (!reply) throw new AiError("AI 답변이 비어 있어요.")
  return { reply, goal: normalizeGoal(data.goal), plan: normalizePlan(data.plan, today) }
}

function normalizeGoal(raw: unknown): GoalDraft | null {
  if (!raw || typeof raw !== "object") return null
  const g = raw as Record<string, unknown>
  const title = str(g.title, 200)
  if (!title) return null
  const deadline = typeof g.deadline === "string" && isValidDate(g.deadline) ? g.deadline : null
  const weekly =
    typeof g.weekly_minutes === "number" && Number.isInteger(g.weekly_minutes)
      ? Math.min(Math.max(g.weekly_minutes, 0), 10080)
      : null
  return { title, description: str(g.description, 2000), deadline, weekly_minutes: weekly }
}

// today를 주면 지난 날짜를 오늘로 당깁니다. null이면 날짜를 그대로 둡니다(저장된 계획 읽기용).
export function normalizePlan(raw: unknown, today: string | null): GoalPlan | null {
  if (!raw || typeof raw !== "object") return null
  const p = raw as Record<string, unknown>
  if (!Array.isArray(p.months)) return null
  let count = 0
  const months: PlanMonth[] = []
  for (const m of p.months as Record<string, unknown>[]) {
    const weeks: PlanWeek[] = []
    for (const w of Array.isArray(m?.weeks) ? (m.weeks as Record<string, unknown>[]) : []) {
      const tasks: PlanTask[] = []
      for (const t of Array.isArray(w?.tasks) ? (w.tasks as Record<string, unknown>[]) : []) {
        const title = str(t?.title, 200)
        if (!title || count >= MAX_PLAN_TASKS) continue
        const valid = typeof t.date === "string" && isValidDate(t.date)
        const date = valid && (today === null || (t.date as string) >= today) ? (t.date as string) : (today ?? "")
        if (!date) continue
        const minutes = typeof t.minutes === "number" ? Math.round(t.minutes / 5) * 5 : 30
        tasks.push({ title, date, minutes: Math.min(Math.max(minutes, 10), 480) })
        count++
      }
      if (tasks.length) weeks.push({ label: str(w.label, 60), focus: str(w.focus, 300), tasks })
    }
    if (weeks.length) months.push({ label: str(m.label, 60), focus: str(m.focus, 300), weeks })
  }
  return count > 0 ? { summary: str(p.summary, 1000), months } : null
}

export function planTasks(plan: GoalPlan): PlanTask[] {
  return plan.months.flatMap((m) => m.weeks.flatMap((w) => w.tasks))
}

// ── 3번 이상 미룬 할 일 쪼개기 ─────────────────────────────

const SPLIT_SCHEMA = {
  type: "object",
  properties: {
    tasks: {
      type: "array",
      items: {
        type: "object",
        properties: { title: { type: "string" }, minutes: { type: "integer" } },
        required: ["title", "minutes"],
        additionalProperties: false,
      },
    },
  },
  required: ["tasks"],
  additionalProperties: false,
}

export async function splitTaskWithAi(
  title: string,
  minutes: number,
  goalTitle: string | null
): Promise<{ title: string; minutes: number }[]> {
  const client = createAiClient()
  const response = await client.beta.messages.create({
    model: process.env.CLAUDE_MODEL || DEFAULT_MODEL,
    max_tokens: 4096,
    output_config: { effort: "low", format: { type: "json_schema", schema: SPLIT_SCHEMA } },
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system:
      "사용자가 여러 번 미룬 할 일을, 부담 없이 바로 시작할 수 있는 더 작은 할 일 2~4개로 쪼갭니다. 각 할 일은 구체적인 행동으로, 한국어로 짧게 씁니다. minutes는 10~90 사이 5분 단위입니다.",
    messages: [
      {
        role: "user",
        content: `할 일: ${title}\n예상 시간: ${minutes}분${goalTitle ? `\n연결된 목표: ${goalTitle}` : ""}`,
      },
    ],
  })
  if (response.stop_reason === "refusal") throw new AiError("AI가 이 요청에 답하지 않았어요.")
  const text = response.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("")
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new AiError("AI 답변을 읽지 못했어요.")
  }
  const tasks = Array.isArray((parsed as { tasks?: unknown })?.tasks)
    ? ((parsed as { tasks: Record<string, unknown>[] }).tasks)
    : []
  const result = tasks
    .map((t) => ({
      title: str(t?.title, 200),
      minutes: Math.min(Math.max(Math.round((Number(t?.minutes) || 30) / 5) * 5, 10), 240),
    }))
    .filter((t) => t.title)
    .slice(0, 4)
  if (result.length < 2) throw new AiError("쪼갠 할 일을 만들지 못했어요.")
  return result
}
