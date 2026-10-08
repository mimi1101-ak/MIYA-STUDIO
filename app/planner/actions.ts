"use server"

import { refresh } from "next/cache"

import { requireUser } from "@/lib/auth"
import { targetDateFor, type Period } from "@/lib/date"
import { cleanText, isUuid, LIMITS, type ActionResult } from "@/lib/validation"

const PERIODS: Period[] = ["today", "week", "month"]
const SAVE_ERROR = "저장하지 못했어요. 잠시 후 다시 시도해 주세요."

function checkTitle(raw: unknown): { title: string } | { error: string } {
  const title = cleanText(raw)
  if (!title) return { error: "내용을 입력해 주세요." }
  if (title.length > LIMITS.taskTitle) return { error: `${LIMITS.taskTitle}자 이내로 입력해 주세요.` }
  return { title }
}

export async function addTask(period: Period, rawTitle: string): Promise<ActionResult> {
  if (!PERIODS.includes(period)) return { ok: false, error: "잘못된 요청이에요." }
  const checked = checkTitle(rawTitle)
  if ("error" in checked) return { ok: false, error: checked.error }

  const { supabase, userId } = await requireUser()
  // 기준 날짜는 브라우저가 아닌 서버에서 한국 시간으로 계산합니다.
  const targetDate = targetDateFor(period)

  // 새 항목은 맨 아래에 붙입니다.
  const { data: last } = await supabase
    .from("tasks")
    .select("sort_order")
    .eq("period", period)
    .eq("target_date", targetDate)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle()

  const { error } = await supabase.from("tasks").insert({
    user_id: userId,
    period,
    title: checked.title,
    target_date: targetDate,
    sort_order: (last?.sort_order ?? -1) + 1,
  })
  if (error) return { ok: false, error: SAVE_ERROR }

  refresh()
  return { ok: true }
}

export async function setTaskDone(id: string, isDone: boolean): Promise<ActionResult> {
  if (!isUuid(id) || typeof isDone !== "boolean") return { ok: false, error: "잘못된 요청이에요." }
  const { supabase, userId } = await requireUser()

  const { error } = await supabase
    .from("tasks")
    .update({ is_done: isDone })
    .eq("id", id)
    .eq("user_id", userId)
  if (error) return { ok: false, error: SAVE_ERROR }

  refresh()
  return { ok: true }
}

export async function updateTaskTitle(id: string, rawTitle: string): Promise<ActionResult> {
  if (!isUuid(id)) return { ok: false, error: "잘못된 요청이에요." }
  const checked = checkTitle(rawTitle)
  if ("error" in checked) return { ok: false, error: checked.error }
  const { supabase, userId } = await requireUser()

  const { error } = await supabase
    .from("tasks")
    .update({ title: checked.title })
    .eq("id", id)
    .eq("user_id", userId)
  if (error) return { ok: false, error: SAVE_ERROR }

  refresh()
  return { ok: true }
}

export async function deleteTask(id: string): Promise<ActionResult> {
  if (!isUuid(id)) return { ok: false, error: "잘못된 요청이에요." }
  const { supabase, userId } = await requireUser()

  const { error } = await supabase.from("tasks").delete().eq("id", id).eq("user_id", userId)
  if (error) return { ok: false, error: "삭제하지 못했어요. 잠시 후 다시 시도해 주세요." }

  refresh()
  return { ok: true }
}
