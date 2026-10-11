import Link from "next/link"
import { notFound } from "next/navigation"
import { Suspense } from "react"

import { LoadingBlock, PageShell } from "@/components/page-shell"
import { requireUser } from "@/lib/auth"
import { todayKST } from "@/lib/date"
import { normalizeIdeaReport } from "@/lib/idea-report"
import { toChat, toIdea } from "@/lib/ideas"
import { isUuid } from "@/lib/validation"

import { IdeaHeader } from "./idea-header"
import { IdeaTabs } from "./idea-tabs"
import { IdeaWorkspace } from "./idea-workspace"

// MOMO가 사업계획서를 쓰는 데 1~2분 걸리므로, 이 화면의 서버 기능은 최대 5분까지 기다립니다.
export const maxDuration = 300

// 아이디어 하나: 머리(내용·상태) → MOMO와 대화 + MOMO가 쓴 문서(사업계획서·기획서·실행 계획서)
export default function IdeaPage({ params }: PageProps<"/ideas/[id]">) {
  return (
    <PageShell>
      <Link href="/ideas" className="pt-4 font-mono text-xs text-muted-foreground hover:text-foreground md:pt-8">
        ← 아이디어 목록
      </Link>
      <Suspense fallback={<LoadingBlock lines={6} />}>
        <IdeaContent params={params} />
      </Suspense>
    </PageShell>
  )
}

async function IdeaContent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!isUuid(id)) notFound()
  const { supabase } = await requireUser()

  const { data } = await supabase
    .from("ideas")
    .select("id, title, note, kind, status, pinned, created_at, revisited_at, chatted_at, reported_at, chat, report")
    .eq("id", id)
    .maybeSingle()
  if (!data) notFound()

  const idea = toIdea(data)
  return (
    <div className="flex flex-col gap-6">
      <IdeaHeader idea={idea} today={todayKST()} />
      {idea.kind === "business" && <IdeaTabs ideaId={idea.id} active="consult" />}
      <IdeaWorkspace
        idea={idea}
        messages={toChat(data.chat)}
        report={normalizeIdeaReport(data.report)}
        reportedAt={data.reported_at}
      />
    </div>
  )
}
