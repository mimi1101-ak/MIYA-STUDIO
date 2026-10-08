"use server"

import { refresh } from "next/cache"

import { requireUser } from "@/lib/auth"
import { isArticleSource, type ArticleSource } from "@/lib/sources"
import { createAdminClient } from "@/lib/supabase/admin"
import {
  cleanText,
  isUuid,
  isValidDate,
  isValidHttpUrl,
  LIMITS,
  URL_ERROR_MESSAGE,
  type ActionResult,
} from "@/lib/validation"

export type ArticleInput = {
  source: ArticleSource
  title: string
  url: string
  category: string
  publishedDate: string // "YYYY-MM-DD" 또는 빈 값
}

const MISSING_KEY_ERROR =
  "서버 키(SUPABASE_SERVICE_ROLE_KEY)가 설정되지 않아 글을 추가·삭제할 수 없어요."

// 글 목록(articles)은 "서버만 쓰기" 규칙이라, 로그인 확인 후 서버 전용 키로 저장합니다.
// 외부 사이트 본문은 저장하지 않고 제목·링크·분류·날짜만 저장합니다.
export async function addArticle(input: ArticleInput): Promise<ActionResult> {
  const source = input?.source
  const title = cleanText(input?.title)
  const url = cleanText(input?.url)
  const category = cleanText(input?.category)
  const publishedDate = cleanText(input?.publishedDate)

  if (!isArticleSource(source)) return { ok: false, error: "출처를 골라 주세요." }
  if (!title) return { ok: false, error: "글 제목을 입력해 주세요." }
  if (title.length > LIMITS.articleTitle) {
    return { ok: false, error: `제목은 ${LIMITS.articleTitle}자 이내로 입력해 주세요.` }
  }
  if (!isValidHttpUrl(url)) return { ok: false, error: URL_ERROR_MESSAGE }
  if (category.length > LIMITS.articleCategory) {
    return { ok: false, error: `분류는 ${LIMITS.articleCategory}자 이내로 입력해 주세요.` }
  }
  if (publishedDate && !isValidDate(publishedDate)) {
    return { ok: false, error: "날짜 형식이 올바르지 않아요." }
  }

  await requireUser()
  const admin = createAdminClient()
  if (!admin) return { ok: false, error: MISSING_KEY_ERROR }

  const { error } = await admin.from("articles").insert({
    source,
    title,
    url,
    category,
    published_at: publishedDate ? `${publishedDate}T00:00:00+09:00` : null,
  })
  if (error) {
    if (error.code === "23505") return { ok: false, error: "이미 추가된 링크예요." }
    return { ok: false, error: "저장하지 못했어요. 잠시 후 다시 시도해 주세요." }
  }

  refresh()
  return { ok: true }
}

export async function deleteArticle(id: string): Promise<ActionResult> {
  if (!isUuid(id)) return { ok: false, error: "잘못된 요청이에요." }

  await requireUser()
  const admin = createAdminClient()
  if (!admin) return { ok: false, error: MISSING_KEY_ERROR }

  // 이 글에 쓴 인사이트는 지워지지 않고 "원문 없음"으로 남습니다(DB: on delete set null).
  const { error } = await admin.from("articles").delete().eq("id", id)
  if (error) return { ok: false, error: "삭제하지 못했어요. 잠시 후 다시 시도해 주세요." }

  refresh()
  return { ok: true }
}
