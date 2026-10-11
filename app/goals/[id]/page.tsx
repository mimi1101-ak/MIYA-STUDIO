import Link from "next/link"
import { notFound } from "next/navigation"
import { Suspense } from "react"

import { LoadingBlock, PageShell } from "@/components/page-shell"
import { Badge } from "@/components/ui/badge"
import { loadGoalProgress } from "@/lib/agenda"
import { percent } from "@/lib/agenda-types"
import { requireUser } from "@/lib/auth"
import { formatDayLabel, formatDuration, weekStartKST } from "@/lib/date"
import { normalizePlan, type ChatMessage } from "@/lib/goal-ai"
import { DOC_TYPES } from "@/lib/idea-report"
import { isIdeaKind, KIND_INFO } from "@/lib/ideas"
import { isUuid } from "@/lib/validation"

import { GoalActions } from "../goal-actions"
import { GoalChat } from "../goal-chat"
import { PlanPlaceholder, PlanView } from "../plan-view"

const STATUS_LABELS: Record<string, string> = {
  draft: "대화 중",
  active: "진행 중",
  done: "완료",
  archived: "보관",
}

export default function GoalPage({ params }: PageProps<"/goals/[id]">) {
  return (
    <PageShell>
      <Link href="/goals" className="pt-4 font-mono text-xs text-muted-foreground hover:text-foreground md:pt-8">
        ← 목표 목록
      </Link>
      <Suspense fallback={<LoadingBlock lines={6} />}>
        <GoalContent params={params} />
      </Suspense>
    </PageShell>
  )
}

async function GoalContent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!isUuid(id)) notFound()
  const { supabase } = await requireUser()

  const [{ data: goal }, progress] = await Promise.all([
    supabase
      .from("goals")
      .select("id, title, description, status, deadline, weekly_minutes, chat, plan, idea_id")
      .eq("id", id)
      .maybeSingle(),
    loadGoalProgress(supabase, weekStartKST()),
  ])
  if (!goal) notFound()

  // 아이디어로 만든 목표면 그 아이디어 (아이디어를 지웠으면 연결이 풀려 null)
  const { data: idea } = goal.idea_id
    ? await supabase.from("ideas").select("id, title, kind, status, reported_at").eq("id", goal.idea_id).maybeSingle()
    : { data: null }
  const ideaKind = idea && isIdeaKind(idea.kind) ? idea.kind : "thought"

  const chat = (Array.isArray(goal.chat) ? goal.chat : []) as ChatMessage[]
  const plan = normalizePlan(goal.plan, null)
  const p = progress?.find((g) => g.id === goal.id)

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-serif text-3xl tracking-tight break-words md:text-[2.5rem] md:leading-tight">{goal.title}</h1>
          <Badge variant={goal.status === "active" ? "default" : "outline"}>{STATUS_LABELS[goal.status]}</Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          {goal.deadline ? `마감 ${formatDayLabel(goal.deadline)}` : "마감 미정"}
          {goal.weekly_minutes ? ` · 주 ${formatDuration(goal.weekly_minutes)}` : ""}
          {p && ` · 전체 진척 ${percent(p.done, p.total)}% · 이번 주 ${percent(p.weekDone, p.weekTotal)}%`}
        </p>
        {goal.description && <p className="text-sm leading-relaxed">{goal.description}</p>}
        {idea && (
          <Link
            href={`/ideas/${idea.id}`}
            className="flex min-w-0 items-center gap-2 self-start text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            <span className="shrink-0 font-mono text-[11px] tracking-[0.14em] text-dim">FROM IDEA</span>
            <span className="truncate">
              {KIND_INFO[ideaKind].label} 아이디어 ‘{idea.title}’에서 시작한 목표
            </span>
            <span aria-hidden className="font-mono text-dim">
              ›
            </span>
          </Link>
        )}
        <GoalActions goalId={goal.id} status={goal.status} idea={idea ? { title: idea.title, status: idea.status } : null} />
      </div>

      <div className="grid items-start gap-6 md:grid-cols-2">
        <GoalChat
          goalId={goal.id}
          messages={chat}
          idea={idea ? { title: idea.title, docType: idea.reported_at ? DOC_TYPES[ideaKind] : null } : null}
        />
        {plan ? <PlanView goalId={goal.id} plan={plan} approved={goal.status !== "draft"} /> : <PlanPlaceholder />}
      </div>
    </div>
  )
}
