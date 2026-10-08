import { Suspense } from "react"

import { LoadingBlock, PageShell } from "@/components/page-shell"
import { requireUser } from "@/lib/auth"
import { loadSavedArticles } from "@/lib/saved-articles"

import { NewsBoard } from "./news-board"

export default function NewsPage() {
  return (
    <PageShell
      title="뉴스·트렌드"
      description="EO planet과 Long Black의 인기글을 한 화면에서 보고, 읽은 글은 저장해 AI 요약과 인사이트를 남겨요."
    >
      <Suspense fallback={<LoadingBlock lines={5} />}>
        <NewsContent />
      </Suspense>
    </PageShell>
  )
}

async function NewsContent() {
  const { supabase } = await requireUser()
  const saved = await loadSavedArticles(supabase, 3)
  if (!saved) {
    return <p className="text-sm text-destructive">저장한 글을 불러오지 못했어요. 새로고침해 주세요.</p>
  }

  // 비밀 키 값은 넘기지 않고, 설정 여부(참/거짓)만 화면에 알려 줍니다.
  const canWrite = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY)

  return <NewsBoard recent={saved.articles} total={saved.total} canWrite={canWrite} />
}
