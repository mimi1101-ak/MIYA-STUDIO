"use server"

// 월별 목표(한 줄 목표) 읽기·추가·고치기·지우기. 홈 화면에서 씁니다.
// 달을 넘겨 보는 화면이라, 바꾼 뒤에는 그 달 목록을 다시 돌려줘 화면이 바로 맞춰지게 합니다.

import { requireUser } from "@/lib/auth"
import type { Supabase } from "@/lib/schedule-db"
import { cleanText, isUuid, isValidDate, LIMITS } from "@/lib/validation"

export type MonthlyGoal = { id: string; title: string; done: boolean }

export type MonthlyGoalsResult = { ok: true; goals: MonthlyGoal[] } | { ok: false; error: string }

// 한 달에 적을 수 있는 목표 수
const MAX_PER_MONTH = 30
const BAD_REQUEST = { ok: false as const, error: "잘못된 요청이에요." }
const SAVE_ERROR = { ok: false as const, error: "저장하지 못했어요. 잠시 후 다시 시도해 주세요." }

// "YYYY-MM-01" 형식의 달
function isMonth(value: unknown): value is string {
  return typeof value === "string" && isValidDate(value) && value.endsWith("-01")
}

function checkTitle(raw: unknown): string | null {
  const title = cleanText(raw)
  return title && title.length <= LIMITS.goalTitle ? title : null
}

async function list(supabase: Supabase, month: string): Promise<MonthlyGoalsResult> {
  const { data, error } = await supabase
    .from("monthly_goals")
    .select("id, title, is_done")
    .eq("month", month)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true })
  if (error) return { ok: false, error: "월별 목표를 불러오지 못했어요." }
  return { ok: true, goals: data.map((g) => ({ id: g.id, title: g.title, done: g.is_done })) }
}

export async function listMonthlyGoals(month: string): Promise<MonthlyGoalsResult> {
  if (!isMonth(month)) return BAD_REQUEST
  const { supabase } = await requireUser()
  return list(supabase, month)
}

// 새 목표는 그 달 목록 맨 아래에 붙습니다.
export async function addMonthlyGoal(month: string, rawTitle: string): Promise<MonthlyGoalsResult> {
  const title = checkTitle(rawTitle)
  if (!isMonth(month)) return BAD_REQUEST
  if (!title) return { ok: false, error: "목표를 입력해 주세요." }
  const { supabase, userId } = await requireUser()

  const { data: existing, error: readError } = await supabase
    .from("monthly_goals")
    .select("sort_order")
    .eq("month", month)
  if (readError) return SAVE_ERROR
  if (existing.length >= MAX_PER_MONTH) return { ok: false, error: `한 달에 ${MAX_PER_MONTH}개까지 적을 수 있어요.` }

  const sortOrder = existing.reduce((max, g) => Math.max(max, g.sort_order + 1), 0)
  const { error } = await supabase
    .from("monthly_goals")
    .insert({ user_id: userId, month, title, sort_order: sortOrder })
  if (error) return SAVE_ERROR
  return list(supabase, month)
}

export async function updateMonthlyGoal(month: string, id: string, rawTitle: string): Promise<MonthlyGoalsResult> {
  const title = checkTitle(rawTitle)
  if (!isMonth(month) || !isUuid(id)) return BAD_REQUEST
  if (!title) return { ok: false, error: "목표를 입력해 주세요." }
  const { supabase, userId } = await requireUser()

  const { error } = await supabase.from("monthly_goals").update({ title }).eq("id", id).eq("user_id", userId)
  if (error) return SAVE_ERROR
  return list(supabase, month)
}

export async function setMonthlyGoalDone(month: string, id: string, done: boolean): Promise<MonthlyGoalsResult> {
  if (!isMonth(month) || !isUuid(id) || typeof done !== "boolean") return BAD_REQUEST
  const { supabase, userId } = await requireUser()

  const { error } = await supabase.from("monthly_goals").update({ is_done: done }).eq("id", id).eq("user_id", userId)
  if (error) return SAVE_ERROR
  return list(supabase, month)
}

export async function deleteMonthlyGoal(month: string, id: string): Promise<MonthlyGoalsResult> {
  if (!isMonth(month) || !isUuid(id)) return BAD_REQUEST
  const { supabase, userId } = await requireUser()

  const { error } = await supabase.from("monthly_goals").delete().eq("id", id).eq("user_id", userId)
  if (error) return { ok: false, error: "삭제하지 못했어요. 잠시 후 다시 시도해 주세요." }
  return list(supabase, month)
}
