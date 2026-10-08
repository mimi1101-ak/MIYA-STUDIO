"use server"

import { refresh } from "next/cache"

import { summarizeText } from "@/lib/article-ai"
import { ArticleReadError, readArticle, type ArticlePage } from "@/lib/article-reader"
import { requireUser } from "@/lib/auth"
import { aiErrorMessage } from "@/lib/goal-ai"
import { canAutoRead, SOURCE_LABELS, sourceFromUrl, type ArticleSource } from "@/lib/sources"
import { createAdminClient } from "@/lib/supabase/admin"
import { cleanText, isUuid, isValidDate, LIMITS, type ActionResult } from "@/lib/validation"

export type ArticleInput = {
  url: string
  title: string // 비우면 글에서 자동으로 가져옴 (Long Black은 직접 적어야 함)
  category: string
  publishedDate: string // "YYYY-MM-DD" 또는 빈 값
  pastedText: string // 사용자가 붙여 넣은 글 내용. 요약에만 쓰고 저장하지 않음
}

const MISSING_KEY_ERROR =
  "서버 키(SUPABASE_SERVICE_ROLE_KEY)가 설정되지 않아 글을 저장·삭제할 수 없어요."
const WRONG_LINK_ERROR = "EO planet 또는 Long Black 글 링크를 붙여 넣어 주세요."
const MIN_SUMMARY_TEXT = 200

function readError(error: unknown): string {
  return error instanceof ArticleReadError ? error.message : "글을 불러오지 못했어요. 잠시 후 다시 시도해 주세요."
}

// 붙여 넣은 글 내용 확인. 비어 있으면 "" (요약 없이 저장)
function checkPasted(raw: unknown): string | { error: string } {
  const text = cleanText(raw)
  if (text.length > LIMITS.pastedText) {
    return { error: `붙여 넣은 내용이 너무 길어요(${LIMITS.pastedText.toLocaleString()}자까지).` }
  }
  if (text && text.length < MIN_SUMMARY_TEXT) return { error: "요약하려면 글 내용을 조금 더 붙여 넣어 주세요." }
  return text
}

// 링크를 붙여 넣으면 저장 전에 제목을 미리 가져옵니다.
export async function previewArticle(
  rawUrl: string
): Promise<{ ok: true; title: string; source: ArticleSource } | { ok: false; error: string }> {
  const url = cleanText(rawUrl)
  const source = sourceFromUrl(url)
  if (!source) return { ok: false, error: WRONG_LINK_ERROR }
  if (!canAutoRead(source)) {
    return { ok: false, error: `${SOURCE_LABELS[source]}은(는) 제목을 자동으로 가져올 수 없어요. 직접 적어 주세요.` }
  }
  await requireUser()
  try {
    const page = await readArticle(url)
    return { ok: true, title: page.title, source: page.source }
  } catch (error) {
    return { ok: false, error: readError(error) }
  }
}

// 글 목록(articles)은 "서버만 쓰기" 규칙이라, 로그인 확인 후 서버 전용 키로 저장합니다.
// 외부 사이트 본문은 저장하지 않고 제목·링크·분류·날짜와 AI 요약만 저장합니다.
export async function addArticle(input: ArticleInput): Promise<ActionResult> {
  const url = cleanText(input?.url)
  const category = cleanText(input?.category)
  const publishedDate = cleanText(input?.publishedDate)
  let title = cleanText(input?.title)

  const source = sourceFromUrl(url)
  if (!source) return { ok: false, error: WRONG_LINK_ERROR }
  if (title.length > LIMITS.articleTitle) {
    return { ok: false, error: `제목은 ${LIMITS.articleTitle}자 이내로 입력해 주세요.` }
  }
  if (category.length > LIMITS.articleCategory) {
    return { ok: false, error: `분류는 ${LIMITS.articleCategory}자 이내로 입력해 주세요.` }
  }
  if (publishedDate && !isValidDate(publishedDate)) return { ok: false, error: "날짜 형식이 올바르지 않아요." }
  const pasted = checkPasted(input?.pastedText)
  if (typeof pasted !== "string") return { ok: false, error: pasted.error }
  if (!canAutoRead(source) && !title) return { ok: false, error: "글 제목을 적어 주세요." }

  await requireUser()
  const admin = createAdminClient()
  if (!admin) return { ok: false, error: MISSING_KEY_ERROR }

  // 붙여 넣은 내용과 제목이 다 있으면 사이트를 다시 읽지 않습니다.
  let page: ArticlePage | null = null
  if (canAutoRead(source) && (!pasted || !title)) {
    try {
      page = await readArticle(url)
    } catch (error) {
      if (!title) return { ok: false, error: `${readError(error)} 제목을 직접 적으면 링크만 저장할 수 있어요.` }
    }
  }
  title = (title || page?.title || "").slice(0, LIMITS.articleTitle)
  if (!title) return { ok: false, error: "글 제목을 찾지 못했어요. 제목을 직접 적어 주세요." }

  const { data, error } = await admin
    .from("articles")
    .insert({
      source,
      title,
      url,
      category,
      published_at: publishedDate ? `${publishedDate}T00:00:00+09:00` : (page?.publishedAt ?? null),
    })
    .select("id")
    .single()
  if (error || !data) {
    if (error?.code === "23505") return { ok: false, error: "이미 저장한 글이에요." }
    return { ok: false, error: "저장하지 못했어요. 잠시 후 다시 시도해 주세요." }
  }

  // 저장은 끝났으니, 요약이 실패해도 글은 남기고 안내만 합니다.
  const text = pasted || page?.text || ""
  let message = "저장하고 요약했어요."
  if (!text) {
    message = "링크를 저장했어요. 요약하려면 저장한 글 카드에서 글 내용을 붙여 넣어 주세요."
  } else {
    try {
      const summary = await summarizeText(title, text)
      await admin
        .from("articles")
        .update({ summary, summarized_at: new Date().toISOString() })
        .eq("id", data.id)
    } catch (error) {
      message = `저장했어요. 다만 요약하지 못했어요: ${aiErrorMessage(error)}`
    }
  }

  refresh()
  return { ok: true, message }
}

// 요약 만들기 / 다시 만들기. pastedText를 주면 그 내용으로 요약합니다(저장하지 않음).
export async function summarizeArticle(id: string, pastedText = ""): Promise<ActionResult> {
  if (!isUuid(id)) return { ok: false, error: "잘못된 요청이에요." }
  const pasted = checkPasted(pastedText)
  if (typeof pasted !== "string") return { ok: false, error: pasted.error }
  await requireUser()
  const admin = createAdminClient()
  if (!admin) return { ok: false, error: MISSING_KEY_ERROR }

  const { data: article } = await admin.from("articles").select("title, url").eq("id", id).maybeSingle()
  if (!article || !sourceFromUrl(article.url)) return { ok: false, error: "요약할 수 없는 글이에요." }

  let summary: string
  try {
    const text = pasted || (await readArticle(article.url)).text
    summary = await summarizeText(article.title, text)
  } catch (error) {
    return { ok: false, error: error instanceof ArticleReadError ? error.message : aiErrorMessage(error) }
  }

  const { error } = await admin
    .from("articles")
    .update({ summary, summarized_at: new Date().toISOString() })
    .eq("id", id)
  if (error) return { ok: false, error: "요약을 저장하지 못했어요. 잠시 후 다시 시도해 주세요." }

  refresh()
  return { ok: true }
}

export async function deleteArticle(id: string): Promise<ActionResult> {
  if (!isUuid(id)) return { ok: false, error: "잘못된 요청이에요." }

  await requireUser()
  const admin = createAdminClient()
  if (!admin) return { ok: false, error: MISSING_KEY_ERROR }

  // 이 글에 쓴 인사이트 메모는 지워지지 않고 "글 없이 쓴 인사이트"로 남습니다(DB: on delete set null).
  const { error } = await admin.from("articles").delete().eq("id", id)
  if (error) return { ok: false, error: "삭제하지 못했어요. 잠시 후 다시 시도해 주세요." }

  refresh()
  return { ok: true }
}
