import { Suspense } from "react"

import { LoadingBlock, PageShell } from "@/components/page-shell"
import { TrendTabs } from "@/components/trend-tabs"
import { requireUser } from "@/lib/auth"
import { loadSavedArticles } from "@/lib/saved-articles"
import { NEWS_SITES, type ArticleSource } from "@/lib/sources"

import { NewsBoard } from "./news-board"

// 트렌드 > EO planet / Long Black 화면 (같은 모양, 사이트만 다름)
export function NewsSitePage({ source }: { source: ArticleSource }) {
  const site = NEWS_SITES.find((s) => s.source === source)!
  return (
    <PageShell title="트렌드" description="사이트의 인기글을 보고, 읽은 글은 저장해 MOMO의 보고서와 검토 메모를 남겨요.">
      <TrendTabs active={site.path} />
      <Suspense fallback={<LoadingBlock lines={5} />}>
        <NewsContent source={source} />
      </Suspense>
    </PageShell>
  )
}

async function NewsContent({ source }: { source: ArticleSource }) {
  const site = NEWS_SITES.find((s) => s.source === source)!
  const { supabase } = await requireUser()
  const saved = await loadSavedArticles(supabase, 3)
  if (!saved) {
    return <p className="text-sm text-destructive">저장한 글을 불러오지 못했어요. 새로고침해 주세요.</p>
  }

  // 비밀 키 값은 넘기지 않고, 설정 여부(참/거짓)만 화면에 알려 줍니다.
  const canWrite = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY)

  return <NewsBoard site={site} recent={saved.articles} total={saved.total} canWrite={canWrite} />
}
