import { Suspense } from "react"

import { MomoLine } from "@/components/momo-avatar"
import { LoadingBlock, PageShell } from "@/components/page-shell"
import { loadGoalOptions } from "@/lib/agenda"
import { requireUser } from "@/lib/auth"
import { todayKST } from "@/lib/date"
import { loadIdeaLinks } from "@/lib/idea-links"
import { toIdea } from "@/lib/ideas"

import { IdeaBoard } from "./idea-board"

export default function IdeasPage() {
  return (
    <PageShell
      title="아이디어"
      description="해야 할 일, 만들고 싶은 사업, 떠오른 생각을 전부 적어 두세요. 오래된 아이디어는 MOMO가 다시 꺼내 드리고, 언제든 할 일·목표로 옮길 수 있어요."
    >
      <Suspense fallback={<LoadingBlock lines={5} />}>
        <IdeasContent />
      </Suspense>
    </PageShell>
  )
}

async function IdeasContent() {
  const { supabase } = await requireUser()
  const [{ data, error }, links, goals] = await Promise.all([
    supabase
      .from("ideas")
      .select("id, title, note, kind, status, pinned, created_at, revisited_at, chatted_at, reported_at")
      .order("created_at", { ascending: false }),
    loadIdeaLinks(supabase),
    loadGoalOptions(supabase),
  ])

  if (error || !links || !goals) {
    return <MomoLine tone="error">아이디어를 불러오지 못했어요. 새로고침해 주세요.</MomoLine>
  }
  return <IdeaBoard ideas={data.map(toIdea)} today={todayKST()} links={links} goals={goals} />
}
