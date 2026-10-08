"use server"

import { refresh } from "next/cache"

import { requireUser } from "@/lib/auth"
import { cleanText, isUuid, LIMITS, type ActionResult } from "@/lib/validation"

export type InsightInput = { title: string; content: string }

function checkInput(input: InsightInput): { value: InsightInput } | { error: string } {
  const title = cleanText(input?.title)
  const content = cleanText(input?.content)
  if (!title) return { error: "인사이트 제목을 입력해 주세요." }
  if (title.length > LIMITS.insightTitle) return { error: `제목은 ${LIMITS.insightTitle}자 이내로 입력해 주세요.` }
  if (!content) return { error: "내용을 입력해 주세요." }
  if (content.length > LIMITS.insightContent) {
    return { error: `내용은 ${LIMITS.insightContent.toLocaleString()}자 이내로 입력해 주세요.` }
  }
  return { value: { title, content } }
}

const SAVE_ERROR = "저장하지 못했어요. 잠시 후 다시 시도해 주세요."

// articleId가 있으면 그 글에 대한 인사이트로, 없으면 글과 상관없는 인사이트로 저장합니다.
export async function createInsight(articleId: string | null, input: InsightInput): Promise<ActionResult> {
  if (articleId !== null && !isUuid(articleId)) return { ok: false, error: "잘못된 요청이에요." }
  const checked = checkInput(input)
  if ("error" in checked) return { ok: false, error: checked.error }
  const { supabase, userId } = await requireUser()

  const { error } = await supabase
    .from("insights")
    .insert({ ...checked.value, article_id: articleId, user_id: userId })
  if (error) return { ok: false, error: SAVE_ERROR }

  refresh()
  return { ok: true }
}

export async function updateInsight(id: string, input: InsightInput): Promise<ActionResult> {
  if (!isUuid(id)) return { ok: false, error: "잘못된 요청이에요." }
  const checked = checkInput(input)
  if ("error" in checked) return { ok: false, error: checked.error }
  const { supabase, userId } = await requireUser()

  const { error } = await supabase
    .from("insights")
    .update(checked.value)
    .eq("id", id)
    .eq("user_id", userId)
  if (error) return { ok: false, error: SAVE_ERROR }

  refresh()
  return { ok: true }
}

export async function deleteInsight(id: string): Promise<ActionResult> {
  if (!isUuid(id)) return { ok: false, error: "잘못된 요청이에요." }
  const { supabase, userId } = await requireUser()

  const { error } = await supabase.from("insights").delete().eq("id", id).eq("user_id", userId)
  if (error) return { ok: false, error: "삭제하지 못했어요. 잠시 후 다시 시도해 주세요." }

  refresh()
  return { ok: true }
}
