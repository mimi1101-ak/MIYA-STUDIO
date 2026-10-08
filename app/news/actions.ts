"use server"

import { refresh } from "next/cache"

import { summarizeText } from "@/lib/article-ai"
import { ArticleReadError, readArticle, type ArticlePage } from "@/lib/article-reader"
import { requireUser } from "@/lib/auth"
import { aiErrorMessage } from "@/lib/goal-ai"
import { isPartialSource, sourceFromUrl, type ArticleSource } from "@/lib/sources"
import { createAdminClient } from "@/lib/supabase/admin"
import { cleanText, isUuid, isValidDate, LIMITS, type ActionResult } from "@/lib/validation"

export type ArticleInput = {
  url: string
  title: string // 비우면 글에서 자동으로 가져옴
  category: string
  publishedDate: string // "YYYY-MM-DD" 또는 빈 값
}

const MISSING_KEY_ERROR =
  "서버 키(SUPABASE_SERVICE_ROLE_KEY)가 설정되지 않아 글을 저장·삭제할 수 없어요."
const WRONG_LINK_ERROR = "EO planet 또는 Long Black 글 링크를 붙여 넣어 주세요."

function readError(error: unknown): string {
  return error instanceof ArticleReadError ? error.message : "글을 불러오지 못했어요. 잠시 후 다시 시도해 주세요."
}

// 링크를 붙여 넣으면 저장 전에 제목을 미리 가져옵니다.
export async function previewArticle(
  rawUrl: string
): Promise<{ ok: true; title: string; source: ArticleSource } | { ok: false; error: string }> {
  const url = cleanText(rawUrl)
  if (!sourceFromUrl(url)) return { ok: false, error: WRONG_LINK_ERROR }
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

  await requireUser()
  const admin = createAdminClient()
  if (!admin) return { ok: false, error: MISSING_KEY_ERROR }

  let page: ArticlePage | null = null
  try {
    page = await readArticle(url)
  } catch (error) {
    if (!title) return { ok: false, error: `${readError(error)} 제목을 직접 적으면 링크만 저장할 수 있어요.` }
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
  let message = "저장하고 요약했어요."
  if (!page) {
    message = "링크를 저장했어요. 글을 읽지 못해 요약은 하지 못했어요."
  } else {
    try {
      const summary = await summarizeText(title, page.text, isPartialSource(source))
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

// 요약 만들기 / 다시 만들기
export async function summarizeArticle(id: string): Promise<ActionResult> {
  if (!isUuid(id)) return { ok: false, error: "잘못된 요청이에요." }
  await requireUser()
  const admin = createAdminClient()
  if (!admin) return { ok: false, error: MISSING_KEY_ERROR }

  const { data: article } = await admin.from("articles").select("title, url, source").eq("id", id).maybeSingle()
  const source = article ? sourceFromUrl(article.url) : null
  if (!article || !source) return { ok: false, error: "요약할 수 없는 글이에요." }

  let summary: string
  try {
    const page = await readArticle(article.url)
    summary = await summarizeText(article.title, page.text, isPartialSource(source))
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
