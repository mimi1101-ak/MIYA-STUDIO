"use server"

import { refresh } from "next/cache"
import { redirect } from "next/navigation"

import { requireUser } from "@/lib/auth"
import type { TablesUpdate } from "@/lib/database.types"
import { kstToMs, msToKst } from "@/lib/date"
import {
  aiErrorMessage,
  askGoalAssistant,
  normalizePlan,
  planTasks,
  type ChatMessage,
} from "@/lib/goal-ai"
import { computePlacements, loadWorkHours } from "@/lib/schedule-db"
import { cleanText, isUuid, LIMITS, type ActionResult } from "@/lib/validation"

const BAD_REQUEST = { ok: false as const, error: "잘못된 요청이에요." }
const SAVE_ERROR = { ok: false as const, error: "저장하지 못했어요. 잠시 후 다시 시도해 주세요." }

function toChat(value: unknown): ChatMessage[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((m) =>
    m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string"
      ? [{ role: m.role, content: m.content }]
      : []
  )
}

// AI 비서에게 말하기. 목표가 아직 없으면(첫 메시지) 대화 중인 목표를 새로 만듭니다.
export async function sendGoalMessage(
  goalId: string | null,
  rawText: string
): Promise<{ ok: true; goalId: string } | { ok: false; error: string; goalId?: string }> {
  const text = cleanText(rawText)
  if (!text) return { ok: false, error: "메시지를 입력해 주세요." }
  if (text.length > LIMITS.chatMessage) return { ok: false, error: `${LIMITS.chatMessage}자 이내로 써 주세요.` }
  if (goalId !== null && !isUuid(goalId)) return BAD_REQUEST
  const { supabase, userId } = await requireUser()

  let id = goalId
  let chat: ChatMessage[] = []
  let currentPlan: unknown = null
  if (id) {
    const { data } = await supabase.from("goals").select("chat, plan").eq("id", id).maybeSingle()
    if (!data) return BAD_REQUEST
    chat = toChat(data.chat)
    currentPlan = data.plan
  } else {
    const { data, error } = await supabase
      .from("goals")
      .insert({ user_id: userId, title: "새 목표", status: "draft" })
      .select("id")
      .single()
    if (error || !data) return SAVE_ERROR
    id = data.id
  }

  const history: ChatMessage[] = [...chat, { role: "user", content: text }]
  const { ymd: today } = msToKst(Date.now())

  let turn
  try {
    const work = await loadWorkHours(supabase, userId)
    turn = await askGoalAssistant(history, today, work, normalizePlan(currentPlan, null))
  } catch (error) {
    // 보낸 말은 남겨 두고, 다시 보내면 이어서 답하게 합니다.
    await supabase.from("goals").update({ chat: history }).eq("id", id)
    refresh()
    return { ok: false, error: aiErrorMessage(error), goalId: id }
  }

  const update: TablesUpdate<"goals"> = { chat: [...history, { role: "assistant", content: turn.reply }] }
  if (turn.plan) update.plan = turn.plan
  if (turn.goal) {
    update.title = turn.goal.title
    update.description = turn.goal.description
    update.deadline = turn.goal.deadline
    update.weekly_minutes = turn.goal.weekly_minutes
  }
  const { error } = await supabase.from("goals").update(update).eq("id", id)
  if (error) return { ...SAVE_ERROR, goalId: id }

  refresh()
  return { ok: true, goalId: id }
}

// 계획안 승인: 할 일을 빈 시간에 배치해 저장하고 목표를 '진행 중'으로.
// 이미 승인한 목표를 다시 승인하면, 아직 안 끝낸 AI 할 일을 새 계획으로 바꿉니다.
export async function approvePlan(goalId: string): Promise<ActionResult> {
  if (!isUuid(goalId)) return BAD_REQUEST
  const { supabase, userId } = await requireUser()

  const { data: goal } = await supabase.from("goals").select("plan").eq("id", goalId).maybeSingle()
  const now = Date.now()
  const plan = normalizePlan(goal?.plan, msToKst(now).ymd)
  if (!plan) return { ok: false, error: "승인할 계획안이 없어요. 먼저 AI 비서와 계획을 만들어 주세요." }

  const { error: clearError } = await supabase
    .from("tasks")
    .delete()
    .eq("goal_id", goalId)
    .eq("source", "ai")
    .eq("is_done", false)
  if (clearError) return SAVE_ERROR

  const tasks = planTasks(plan).sort((a, b) => a.date.localeCompare(b.date))
  let placements
  try {
    placements = await computePlacements(
      supabase,
      userId,
      tasks.map((t, i) => ({ id: `p${i}`, minutes: t.minutes, notBefore: Math.max(now, kstToMs(t.date)) }))
    )
  } catch {
    return SAVE_ERROR
  }

  const rows = tasks.map((t, i) => {
    const start = placements.get(`p${i}`) ?? null
    return {
      user_id: userId,
      goal_id: goalId,
      title: t.title,
      estimated_minutes: t.minutes,
      scheduled_at: start === null ? null : new Date(start).toISOString(),
      source: "ai",
      sort_order: i,
    }
  })
  const { error } = await supabase.from("tasks").insert(rows)
  if (error) return SAVE_ERROR
  await supabase.from("goals").update({ status: "active" }).eq("id", goalId)

  const unplaced = rows.filter((r) => r.scheduled_at === null).length
  refresh()
  return {
    ok: true,
    message:
      `할 일 ${rows.length}개를 일정에 넣었어요.` +
      (unplaced ? ` ${unplaced}개는 빈 시간이 없어 '시간 미정'에 두었어요.` : ""),
  }
}

export async function setGoalStatus(goalId: string, status: "active" | "done"): Promise<ActionResult> {
  if (!isUuid(goalId) || (status !== "active" && status !== "done")) return BAD_REQUEST
  const { supabase, userId } = await requireUser()
  const { error } = await supabase.from("goals").update({ status }).eq("id", goalId).eq("user_id", userId)
  if (error) return SAVE_ERROR
  refresh()
  return { ok: true }
}

// 목표 삭제: 아직 안 끝낸 할 일은 함께 지우고, 끝낸 할 일은 기록으로 남깁니다.
export async function deleteGoal(goalId: string): Promise<ActionResult> {
  if (!isUuid(goalId)) return BAD_REQUEST
  const { supabase, userId } = await requireUser()
  const tasks = await supabase.from("tasks").delete().eq("goal_id", goalId).eq("is_done", false)
  if (tasks.error) return { ok: false, error: "삭제하지 못했어요. 잠시 후 다시 시도해 주세요." }
  const { error } = await supabase.from("goals").delete().eq("id", goalId).eq("user_id", userId)
  if (error) return { ok: false, error: "삭제하지 못했어요. 잠시 후 다시 시도해 주세요." }
  redirect("/goals")
}
