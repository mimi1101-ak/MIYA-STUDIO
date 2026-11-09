"use server"

// Dream(총체적인 목표) 읽기·추가·고치기·이룸 표시·지우기. 목표 화면 맨 위에서 씁니다.
// 바꾼 뒤에는 전체 목록을 다시 돌려줘 화면이 바로 맞춰지게 합니다.

import { requireUser } from "@/lib/auth"
import type { Supabase } from "@/lib/schedule-db"
import { cleanText, isUuid, LIMITS } from "@/lib/validation"

export type Dream = { id: string; title: string; done: boolean }

export type DreamsResult = { ok: true; dreams: Dream[] } | { ok: false; error: string }

// 적을 수 있는 Dream 수
const MAX_DREAMS = 50
const BAD_REQUEST = { ok: false as const, error: "잘못된 요청이에요." }
const SAVE_ERROR = { ok: false as const, error: "저장하지 못했어요. 잠시 후 다시 시도해 주세요." }

function checkTitle(raw: unknown): string | null {
  const title = cleanText(raw)
  return title && title.length <= LIMITS.goalTitle ? title : null
}

async function loadDreams(supabase: Supabase): Promise<DreamsResult> {
  const { data, error } = await supabase
    .from("dreams")
    .select("id, title, is_done")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true })
  if (error) return { ok: false, error: "Dream을 불러오지 못했어요." }
  return { ok: true, dreams: data.map((d) => ({ id: d.id, title: d.title, done: d.is_done })) }
}

export async function listDreams(): Promise<DreamsResult> {
  const { supabase } = await requireUser()
  return loadDreams(supabase)
}

// 새 Dream은 목록 맨 아래에 붙습니다.
export async function addDream(rawTitle: string): Promise<DreamsResult> {
  const title = checkTitle(rawTitle)
  if (!title) return { ok: false, error: "Dream을 입력해 주세요." }
  const { supabase, userId } = await requireUser()

  const { data: existing, error: readError } = await supabase.from("dreams").select("sort_order")
  if (readError) return SAVE_ERROR
  if (existing.length >= MAX_DREAMS) return { ok: false, error: `Dream은 ${MAX_DREAMS}개까지 적을 수 있어요.` }

  const sortOrder = existing.reduce((max, d) => Math.max(max, d.sort_order + 1), 0)
  const { error } = await supabase.from("dreams").insert({ user_id: userId, title, sort_order: sortOrder })
  if (error) return SAVE_ERROR
  return loadDreams(supabase)
}

export async function updateDream(id: string, rawTitle: string): Promise<DreamsResult> {
  const title = checkTitle(rawTitle)
  if (!isUuid(id)) return BAD_REQUEST
  if (!title) return { ok: false, error: "Dream을 입력해 주세요." }
  const { supabase, userId } = await requireUser()

  const { error } = await supabase.from("dreams").update({ title }).eq("id", id).eq("user_id", userId)
  if (error) return SAVE_ERROR
  return loadDreams(supabase)
}

export async function setDreamDone(id: string, done: boolean): Promise<DreamsResult> {
  if (!isUuid(id) || typeof done !== "boolean") return BAD_REQUEST
  const { supabase, userId } = await requireUser()

  const { error } = await supabase.from("dreams").update({ is_done: done }).eq("id", id).eq("user_id", userId)
  if (error) return SAVE_ERROR
  return loadDreams(supabase)
}

export async function deleteDream(id: string): Promise<DreamsResult> {
  if (!isUuid(id)) return BAD_REQUEST
  const { supabase, userId } = await requireUser()

  const { error } = await supabase.from("dreams").delete().eq("id", id).eq("user_id", userId)
  if (error) return { ok: false, error: "삭제하지 못했어요. 잠시 후 다시 시도해 주세요." }
  return loadDreams(supabase)
}
