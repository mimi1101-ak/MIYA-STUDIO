import { Suspense } from "react"

import { MomoLine } from "@/components/momo-avatar"
import { LoadingBlock, PageShell } from "@/components/page-shell"
import { requireUser } from "@/lib/auth"
import { todayKST } from "@/lib/date"
import { loadDoneTasks, loadJournal, loadPastJournals } from "@/lib/journal"

import { JournalBoard } from "./journal-board"

// "일지" 화면: 오늘 일지(쓰는 대로 자동 저장, 옆에 오늘 끝낸 할 일) → 지난 일지(달별, 고치기·지우기)
export default function JournalPage() {
  return (
    <PageShell
      title="일지"
      description="하루를 마무리하며 오늘의 생각을 정리해 두세요. 하루에 한 편, 쓰는 대로 저장돼요."
    >
      <Suspense fallback={<LoadingBlock lines={6} />}>
        <JournalContent />
      </Suspense>
    </PageShell>
  )
}

async function JournalContent() {
  const { supabase } = await requireUser()
  const today = todayKST()
  const [entry, done, past] = await Promise.all([
    loadJournal(supabase, today),
    loadDoneTasks(supabase, today),
    loadPastJournals(supabase, today),
  ])

  if (entry === undefined || !done || !past) {
    return <MomoLine tone="error">일지를 불러오지 못했어요. 새로고침해 주세요.</MomoLine>
  }
  return <JournalBoard today={today} entry={entry} done={done} past={past.entries} hasMore={past.hasMore} />
}
