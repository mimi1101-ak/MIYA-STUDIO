import { Suspense } from "react"

import { LoadingBlock, PageShell } from "@/components/page-shell"
import { requireUser } from "@/lib/auth"
import { formatDateKST } from "@/lib/date"
import { isArticleSource, SOURCE_LABELS } from "@/lib/sources"

import { InsightsBoard, type InsightView } from "./insights-board"

export default function InsightsPage() {
  return (
    <PageShell title="인사이트" description="읽은 글에서 얻은 생각을 모아 봐요.">
      <Suspense fallback={<LoadingBlock lines={5} />}>
        <InsightsContent />
      </Suspense>
    </PageShell>
  )
}

async function InsightsContent() {
  const { supabase } = await requireUser()
  const { data, error } = await supabase
    .from("insights")
    .select("id, title, content, created_at, articles(title, url, source)")
    .order("created_at", { ascending: false })

  if (error) {
    return <p className="text-sm text-destructive">인사이트를 불러오지 못했어요. 새로고침해 주세요.</p>
  }

  const insights: InsightView[] = data.map((insight) => ({
    id: insight.id,
    title: insight.title,
    content: insight.content,
    dateLabel: formatDateKST(insight.created_at),
    article: insight.articles
      ? {
          title: insight.articles.title,
          url: insight.articles.url,
          sourceLabel: isArticleSource(insight.articles.source)
            ? SOURCE_LABELS[insight.articles.source]
            : insight.articles.source,
        }
      : null,
  }))

  return <InsightsBoard insights={insights} />
}
