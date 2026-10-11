import Link from "next/link"
import { notFound } from "next/navigation"
import { Suspense } from "react"

import { MomoLine } from "@/components/momo-avatar"
import { LoadingBlock, PageShell } from "@/components/page-shell"
import { requireUser } from "@/lib/auth"
import { todayKST } from "@/lib/date"
import { BOARD_BUCKET, toBoardItem } from "@/lib/idea-board"
import { toIdea } from "@/lib/ideas"
import { isUuid } from "@/lib/validation"

import { IdeaHeader } from "../idea-header"
import { IdeaTabs } from "../idea-tabs"
import { BoardEditor } from "./board-editor"

// 비공개 사진을 화면에서 볼 수 있는 시간(이 시간이 지나면 새로고침하면 다시 보임)
const SIGNED_URL_SECONDS = 6 * 60 * 60

// '사업' 아이디어의 대시보드: 우주 배경 위에 레퍼런스·브랜드 사진을 모으고 순서·크기를 정합니다.
export default function IdeaBoardPage({ params }: PageProps<"/ideas/[id]/board">) {
  return (
    <PageShell>
      <Link href="/ideas" className="pt-4 font-mono text-xs text-muted-foreground hover:text-foreground md:pt-8">
        ← 아이디어 목록
      </Link>
      <Suspense fallback={<LoadingBlock lines={6} />}>
        <BoardContent params={params} />
      </Suspense>
    </PageShell>
  )
}

async function BoardContent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!isUuid(id)) notFound()
  const { supabase, userId } = await requireUser()

  const { data } = await supabase
    .from("ideas")
    .select("id, title, note, kind, status, pinned, created_at, revisited_at, chatted_at, reported_at")
    .eq("id", id)
    .maybeSingle()
  if (!data) notFound()
  const idea = toIdea(data)

  if (idea.kind !== "business") {
    return (
      <div className="flex flex-col gap-6">
        <IdeaHeader idea={idea} today={todayKST()} />
        <MomoLine>
          대시보드는 종류가 &lsquo;사업&rsquo;인 아이디어에서 쓸 수 있어요. 위 &lsquo;수정&rsquo;에서 종류를 사업으로 바꾸면 열려요.
        </MomoLine>
      </div>
    )
  }

  const { data: rows, error } = await supabase
    .from("idea_board_items")
    .select("id, path, width, height, col_span, row_span, fit, caption")
    .eq("idea_id", id)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true })

  let urls = new Map<string, string>()
  if (rows?.length) {
    const { data: signed } = await supabase.storage
      .from(BOARD_BUCKET)
      .createSignedUrls(
        rows.map((r) => r.path),
        SIGNED_URL_SECONDS
      )
    urls = new Map((signed ?? []).flatMap((s) => (s.path && s.signedUrl ? [[s.path, s.signedUrl] as const] : [])))
  }
  const items = (rows ?? []).map((row) => toBoardItem(row, urls.get(row.path) ?? null))

  return (
    <div className="flex flex-col gap-6">
      <IdeaHeader idea={idea} today={todayKST()} />
      <IdeaTabs ideaId={idea.id} active="board" boardCount={items.length} />
      {error ? (
        <MomoLine tone="error">대시보드를 불러오지 못했어요. 새로고침해 주세요.</MomoLine>
      ) : (
        <BoardEditor ideaId={idea.id} userId={userId} items={items} />
      )}
    </div>
  )
}
