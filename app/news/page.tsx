import { Suspense } from "react"

import { LoadingBlock, PageShell } from "@/components/page-shell"
import { requireUser } from "@/lib/auth"
import { formatDateKST } from "@/lib/date"
import { isArticleSource } from "@/lib/sources"

import { NewsBoard, type ArticleView } from "./news-board"

export default function NewsPage() {
  return (
    <PageShell
      title="뉴스·트렌드"
      description="출처별로 읽을 글을 모아 두고, 읽은 글마다 인사이트를 남겨요."
    >
      <Suspense fallback={<LoadingBlock lines={5} />}>
        <NewsContent />
      </Suspense>
    </PageShell>
  )
}

async function NewsContent() {
  const { supabase } = await requireUser()
  const [articlesResult, insightsResult] = await Promise.all([
    supabase
      .from("articles")
      .select("id, source, category, title, url, published_at, fetched_at")
      .order("fetched_at", { ascending: false })
      .limit(300),
    supabase.from("insights").select("article_id").not("article_id", "is", null),
  ])

  if (articlesResult.error || insightsResult.error) {
    return <p className="text-sm text-destructive">글 목록을 불러오지 못했어요. 새로고침해 주세요.</p>
  }

  // 글마다 내가 쓴 인사이트 개수
  const insightCounts = new Map<string, number>()
  for (const row of insightsResult.data) {
    if (row.article_id) insightCounts.set(row.article_id, (insightCounts.get(row.article_id) ?? 0) + 1)
  }

  const articles: ArticleView[] = articlesResult.data.flatMap((article) =>
    isArticleSource(article.source)
      ? [
          {
            id: article.id,
            source: article.source,
            category: article.category,
            title: article.title,
            url: article.url,
            dateLabel: article.published_at
              ? formatDateKST(article.published_at)
              : `${formatDateKST(article.fetched_at)} 추가`,
            insightCount: insightCounts.get(article.id) ?? 0,
          },
        ]
      : []
  )

  // 비밀 키 값은 넘기지 않고, 설정 여부(참/거짓)만 화면에 알려 줍니다.
  const canWrite = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY)

  return <NewsBoard articles={articles} canWrite={canWrite} />
}
