import { Suspense } from "react"

import { LoadingBlock, PageShell } from "@/components/page-shell"
import { requireUser } from "@/lib/auth"
import { loadSavedArticles, loadStandaloneInsights } from "@/lib/saved-articles"

import { InsightsBoard } from "./insights-board"
import { SavedBoard } from "./saved-board"

// 저장한 글: 글마다 AI 요약과 내 인사이트 메모. 아래에는 글 없이 따로 쓴 인사이트.
export default function SavedPage() {
  return (
    <PageShell title="저장한 글" description="비서가 올린 읽기 보고서를 보고, 내 생각을 검토 메모로 남겨요.">
      <Suspense fallback={<LoadingBlock lines={6} />}>
        <SavedContent />
      </Suspense>
    </PageShell>
  )
}

async function SavedContent() {
  const { supabase } = await requireUser()
  const [saved, standalone] = await Promise.all([loadSavedArticles(supabase), loadStandaloneInsights(supabase)])
  if (!saved || !standalone) {
    return <p className="text-sm text-destructive">저장한 글을 불러오지 못했어요. 새로고침해 주세요.</p>
  }

  return (
    <div className="flex flex-col gap-10">
      <SavedBoard articles={saved.articles} />
      <section aria-labelledby="standalone-insights" className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h2 id="standalone-insights" className="text-base font-semibold">
            글 없이 쓴 인사이트
          </h2>
          <p className="text-sm text-muted-foreground">특정 글과 상관없이 떠오른 생각을 모아 둬요.</p>
        </div>
        <InsightsBoard insights={standalone} />
      </section>
    </div>
  )
}
