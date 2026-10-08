import { Sparkles } from "lucide-react"
import Link from "next/link"
import { Suspense } from "react"

import { LoadingBlock, PageShell } from "@/components/page-shell"
import { buttonVariants } from "@/components/ui/button"
import { loadGoalProgress } from "@/lib/agenda"
import { percent } from "@/lib/agenda-types"
import { requireUser } from "@/lib/auth"
import { formatDayLabel, formatDuration, weekStartKST } from "@/lib/date"

export default function GoalsPage() {
  return (
    <PageShell title="목표" description="목표를 정하면 MOMO가 할 일을 쪼개서 일정에 넣어 드려요.">
      <div>
        <Link href="/goals/new" className={buttonVariants({ size: "lg", className: "px-5" })}>
          <Sparkles data-icon="inline-start" />
          새 목표 · MOMO와 대화
        </Link>
      </div>
      <Suspense fallback={<LoadingBlock lines={5} />}>
        <GoalList />
      </Suspense>
    </PageShell>
  )
}

async function GoalList() {
  const { supabase } = await requireUser()
  const [goals, progress] = await Promise.all([
    supabase
      .from("goals")
      .select("id, title, status, deadline, weekly_minutes, updated_at")
      .order("updated_at", { ascending: false }),
    loadGoalProgress(supabase, weekStartKST()),
  ])
  if (goals.error || !progress) {
    return <p className="text-sm text-destructive">목표를 불러오지 못했어요. 새로고침해 주세요.</p>
  }

  const byId = new Map(progress.map((p) => [p.id, p]))
  const groups = [
    { title: "진행 중", items: goals.data.filter((g) => g.status === "active") },
    { title: "MOMO와 대화 중", items: goals.data.filter((g) => g.status === "draft") },
    { title: "완료", items: goals.data.filter((g) => g.status === "done" || g.status === "archived") },
  ]

  if (goals.data.length === 0) {
    return <p className="text-sm text-muted-foreground">아직 목표가 없어요. 위 버튼으로 첫 목표를 정해 보세요.</p>
  }

  return (
    <div className="flex flex-col gap-6">
      {groups
        .filter((group) => group.items.length > 0)
        .map((group) => (
          <section key={group.title} className="flex flex-col gap-2">
            <h2 className="text-sm font-medium text-muted-foreground">{group.title}</h2>
            <ul className="grid gap-3 md:grid-cols-2">
              {group.items.map((goal) => {
                const p = byId.get(goal.id)
                const done = p ? percent(p.done, p.total) : 0
                return (
                  <li key={goal.id}>
                    <Link
                      href={`/goals/${goal.id}`}
                      className="flex h-full flex-col gap-2 rounded-xl bg-card p-4 ring-1 ring-foreground/10 transition-colors hover:bg-muted/60"
                    >
                      <span className="font-medium break-words">{goal.title}</span>
                      <span className="text-xs text-muted-foreground">
                        {goal.deadline ? `마감 ${formatDayLabel(goal.deadline)}` : "마감 미정"}
                        {goal.weekly_minutes ? ` · 주 ${formatDuration(goal.weekly_minutes)}` : ""}
                      </span>
                      {p && (
                        <>
                          <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
                            <div className="h-full rounded-full bg-foreground/80" style={{ width: `${done}%` }} />
                          </div>
                          <span className="text-xs text-muted-foreground">
                            전체 {done}% · 이번 주 {percent(p.weekDone, p.weekTotal)}%
                          </span>
                        </>
                      )}
                    </Link>
                  </li>
                )
              })}
            </ul>
          </section>
        ))}
    </div>
  )
}
