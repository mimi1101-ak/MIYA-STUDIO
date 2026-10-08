import "server-only"

import { formatDateKST } from "@/lib/date"
import type { Supabase } from "@/lib/schedule-db"
import { isArticleSource, type ArticleSource } from "@/lib/sources"

export type MemoView = { id: string; content: string }

export type SavedArticleView = {
  id: string
  source: ArticleSource
  category: string
  title: string
  url: string
  dateLabel: string
  summary: string | null
  // 보고서 번호(저장한 순서)와 보고일(요약한 날)
  docNumber: number
  reportDate: string | null
  memos: MemoView[]
}

export type StandaloneInsight = { id: string; title: string; content: string; dateLabel: string }

// 저장한 글(최신순) + 글마다 내 메모. limit을 주면 최근 몇 개만. 실패하면 null
export async function loadSavedArticles(
  supabase: Supabase,
  limit = 300
): Promise<{ articles: SavedArticleView[]; total: number } | null> {
  const [articles, insights] = await Promise.all([
    supabase
      .from("articles")
      .select("id, source, category, title, url, published_at, fetched_at, summary, summarized_at", {
        count: "exact",
      })
      .order("fetched_at", { ascending: false })
      .limit(limit),
    supabase
      .from("insights")
      .select("id, article_id, content")
      .not("article_id", "is", null)
      .order("created_at", { ascending: true }),
  ])
  if (articles.error || insights.error) return null

  const memos = new Map<string, MemoView[]>()
  for (const row of insights.data) {
    if (!row.article_id) continue
    memos.set(row.article_id, [...(memos.get(row.article_id) ?? []), { id: row.id, content: row.content }])
  }

  const total = articles.count ?? articles.data.length
  return {
    total,
    articles: articles.data.flatMap((a, index) =>
      isArticleSource(a.source)
        ? [
            {
              id: a.id,
              source: a.source,
              category: a.category,
              title: a.title,
              url: a.url,
              dateLabel: a.published_at ? formatDateKST(a.published_at) : `${formatDateKST(a.fetched_at)} 저장`,
              summary: a.summary,
              // 최신순으로 불러오므로, 가장 먼저 저장한 글이 1번입니다.
              docNumber: total - index,
              reportDate: a.summarized_at ? formatDateKST(a.summarized_at) : null,
              memos: memos.get(a.id) ?? [],
            },
          ]
        : []
    ),
  }
}

// 글과 상관없이 따로 쓴 인사이트
export async function loadStandaloneInsights(supabase: Supabase): Promise<StandaloneInsight[] | null> {
  const { data, error } = await supabase
    .from("insights")
    .select("id, title, content, created_at")
    .is("article_id", null)
    .order("created_at", { ascending: false })
  if (error) return null
  return data.map((i) => ({ id: i.id, title: i.title, content: i.content, dateLabel: formatDateKST(i.created_at) }))
}
