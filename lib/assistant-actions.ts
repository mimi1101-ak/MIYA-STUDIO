"use server"

// MOMO 호출의 서버 기능: 말하기(AI가 정한 변경을 바로 반영) · 되돌리기

import { refresh } from "next/cache"

import { applyAssistantActions, askAssistant, loadAssistantContext, type UndoPlan, type UndoRow } from "@/lib/assistant"
import { requireUser } from "@/lib/auth"
import { aiErrorMessage, type ChatMessage } from "@/lib/goal-ai"
import { carryOverPastTasks } from "@/lib/task-order"
import { cleanText, isUuid, LIMITS, type ActionResult } from "@/lib/validation"

// AI에 보내는 최근 대화 수 (비용 절약)
const MAX_HISTORY = 12
// 되돌리기 한 번에 다룰 수 있는 할 일 수
const MAX_UNDO = 400

export type AssistantResult =
  | { ok: true; reply: string; changes: string[]; skipped: number; undo: UndoPlan | null }
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

export async function callMomo(rawHistory: ChatMessage[]): Promise<AssistantResult> {
  const history = checkHistory(rawHistory)
  if (!history) return { ok: false, error: "내용을 입력해 주세요." }
  const { supabase, userId } = await requireUser()

  const now = Date.now()
  let ctx
  try {
    // 어제 이전에 못 끝낸 할 일을 먼저 오늘로 옮겨, 지금 상태를 정확히 봅니다(오늘 화면과 같은 규칙).
    await carryOverPastTasks(supabase, now)
    ctx = await loadAssistantContext(supabase, userId, now)
  } catch {
    return { ok: false, error: "할 일을 불러오지 못했어요. 잠시 후 다시 시도해 주세요." }
  }

  let turn
  try {
    turn = await askAssistant(history, ctx)
  } catch (error) {
    return { ok: false, error: aiErrorMessage(error) }
  }
  if (turn.actions.length === 0) return { ok: true, reply: turn.reply, changes: [], skipped: 0, undo: null }

  let applied
  try {
    applied = await applyAssistantActions(supabase, userId, ctx, turn.actions)
  } catch {
    return { ok: false, error: "할 일을 바꾸지 못했어요. 잠시 후 다시 시도해 주세요." }
  }
  const { changes, skipped, undo } = applied
  if (changes.length) refresh()
  const hasUndo = undo.restore.length + undo.remove.length > 0
  return { ok: true, reply: turn.reply, changes, skipped, undo: hasUndo ? undo : null }
}

function isIsoOrNull(value: unknown): value is string | null {
  return value === null || (typeof value === "string" && value.length <= 40 && !Number.isNaN(Date.parse(value)))
}

function isUndoRow(row: unknown): row is UndoRow {
  const r = row as UndoRow
  return (
    !!r &&
    isUuid(r.id) &&
    isIsoOrNull(r.scheduled_at) &&
    Number.isInteger(r.sort_order) &&
    Number.isInteger(r.carry_count) &&
    r.carry_count >= 0 &&
    typeof r.is_done === "boolean" &&
    isIsoOrNull(r.done_at)
  )
}

// 되돌리기: 그 답에서 바꾼 할 일을 원래 값으로, 새로 만든 할 일은 지웁니다(내 할 일만 — RLS + user_id 조건).
export async function undoMomo(plan: UndoPlan): Promise<ActionResult> {
  const restore = Array.isArray(plan?.restore) ? plan.restore : null
  const remove = Array.isArray(plan?.remove) ? plan.remove : null
  if (!restore || !remove || restore.length + remove.length === 0 || restore.length + remove.length > MAX_UNDO) {
    return { ok: false, error: "잘못된 요청이에요." }
  }
  if (!restore.every(isUndoRow) || !remove.every(isUuid)) return { ok: false, error: "잘못된 요청이에요." }
  const { supabase, userId } = await requireUser()

  const results = await Promise.all([
    ...(remove.length ? [supabase.from("tasks").delete().in("id", remove).eq("user_id", userId)] : []),
    ...restore.map((r) =>
      supabase
        .from("tasks")
        .update({
          scheduled_at: r.scheduled_at,
          sort_order: r.sort_order,
          carry_count: r.carry_count,
          is_done: r.is_done,
          done_at: r.done_at,
        })
        .eq("id", r.id)
        .eq("user_id", userId)
    ),
  ])
  refresh()
  if (results.some((r) => r.error)) return { ok: false, error: "일부를 되돌리지 못했어요. 할 일 목록을 확인해 주세요." }
  return { ok: true, message: "원래대로 되돌렸어요." }
}
