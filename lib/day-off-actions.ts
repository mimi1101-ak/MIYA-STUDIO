"use server"

// 캘린더 옆 대화창의 서버 기능: 말 알아듣기(AI) + 미리보기, 그리고 확인 뒤 실제로 옮기기

import { refresh } from "next/cache"

import { requireUser } from "@/lib/auth"
import { formatDayLabel, msToKst } from "@/lib/date"
import {
  blockFor,
  computeShift,
  normalizeDates,
  normalizeLabel,
  readDayOffRequest,
  toPreview,
  type DayOffPreview,
} from "@/lib/day-off"
import { aiErrorMessage, type ChatMessage } from "@/lib/goal-ai"
import { cleanText, LIMITS, type ActionResult } from "@/lib/validation"

// AI에 보내는 최근 대화 수 (비용 절약)
const MAX_HISTORY = 8

export type DayOffAskResult =
  | { ok: true; reply: string; preview: DayOffPreview | null }
  | { ok: false; error: string }

function checkHistory(raw: unknown): ChatMessage[] | null {
  if (!Array.isArray(raw)) return null
  const history: ChatMessage[] = []
  for (const m of raw.slice(-MAX_HISTORY)) {
    const content = cleanText(m?.content)
    if ((m?.role !== "user" && m?.role !== "assistant") || !content || content.length > LIMITS.chatMessage) {
      return null
    }
    history.push({ role: m.role, content })
  }
  // AI 대화는 사용자의 말로 시작하고 끝나야 합니다.
  while (history.length && history[0].role !== "user") history.shift()
  return history.length && history[history.length - 1].role === "user" ? history : null
}

export async function askDayOff(rawHistory: ChatMessage[]): Promise<DayOffAskResult> {
  const history = checkHistory(rawHistory)
  if (!history) return { ok: false, error: "내용을 입력해 주세요." }
  const { supabase, userId } = await requireUser()

  const now = Date.now()
  const today = msToKst(now).ymd
  let turn
  try {
    turn = await readDayOffRequest(history, today)
  } catch (error) {
    return { ok: false, error: aiErrorMessage(error) }
  }
  if (turn.dates.length === 0) return { ok: true, reply: turn.reply, preview: null }

  try {
    const { shifts } = await computeShift(supabase, userId, turn.dates)
    return { ok: true, reply: turn.reply, preview: toPreview(turn.dates, turn.label, shifts) }
  } catch {
    return { ok: false, error: "옮길 할 일을 확인하지 못했어요. 잠시 후 다시 시도해 주세요." }
  }
}

const SAVE_ERROR = "저장하지 못했어요. 잠시 후 다시 시도해 주세요."

// 확인 버튼: 그날들에 일정을 넣어 비우고, 그날부터의 할 일을 하루씩 뒤로 밉니다.
export async function applyDayOff(rawDates: string[], rawLabel: string): Promise<ActionResult> {
  const now = Date.now()
  const dates = normalizeDates(rawDates, msToKst(now).ymd)
  if (dates.length === 0) return { ok: false, error: "옮길 날짜가 지났거나 올바르지 않아요." }
  const label = normalizeLabel(rawLabel)
  const { supabase, userId } = await requireUser()

  let plan
  try {
    plan = await computeShift(supabase, userId, dates)
  } catch {
    return { ok: false, error: "할 일을 불러오지 못했어요. 잠시 후 다시 시도해 주세요." }
  }

  // 같은 확인을 두 번 눌러도 일정이 겹쳐 생기지 않게, 똑같은 일정이 이미 있으면 넣지 않습니다.
  const rows = dates.map((d) => {
    const block = blockFor(d, plan.work)
    return {
      user_id: userId,
      title: label,
      starts_at: new Date(block.start).toISOString(),
      ends_at: new Date(block.end).toISOString(),
    }
  })
  const { data: existing, error: readError } = await supabase
    .from("events")
    .select("starts_at, ends_at")
    .eq("title", label)
    .in("starts_at", rows.map((r) => r.starts_at))
  if (readError) return { ok: false, error: SAVE_ERROR }
  const newRows = rows.filter(
    (r) =>
      !existing.some(
        (e) => Date.parse(e.starts_at) === Date.parse(r.starts_at) && Date.parse(e.ends_at) === Date.parse(r.ends_at)
      )
  )
  if (newRows.length) {
    const { error } = await supabase.from("events").insert(newRows)
    if (error) return { ok: false, error: SAVE_ERROR }
  }

  // 할 일 옮기기. 동시에 두 번 눌러도 두 번 밀리지 않게, 원래 시각이 그대로일 때만 바꿉니다.
  const results = await Promise.all(
    plan.shifts.map((s) =>
      supabase
        .from("tasks")
        .update({ scheduled_at: new Date(s.to).toISOString() })
        .eq("id", s.task.id)
        .eq("is_done", false)
        .eq("scheduled_at", s.task.scheduled_at)
    )
  )
  refresh()

  const dayText = dates.length === 1 ? formatDayLabel(dates[0]) : `${formatDayLabel(dates[0])} 등 ${dates.length}일`
  if (results.some((r) => r.error)) {
    return { ok: false, error: `${dayText}에 '${label}' 일정은 넣었지만, 할 일 일부를 옮기지 못했어요. 캘린더를 확인해 주세요.` }
  }
  const { moves, laterCount } = toPreview(dates, label, plan.shifts)
  const movedText = moves.length ? `그날 할 일 ${moves.length}개를 뒤로 옮겼어요` : "그날 할 일은 없었어요"
  const laterText = laterCount ? `. 그 뒤 할 일 ${laterCount}개도 하루씩 밀었어요.` : "."
  return { ok: true, message: `${dayText}을 '${label}'(으)로 비우고, ${movedText}${laterText}` }
}
