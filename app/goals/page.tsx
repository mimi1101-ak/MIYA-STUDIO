import { Sparkles } from "lucide-react"
import Link from "next/link"
import { Suspense } from "react"

import { DreamList } from "@/components/goals/dream-list"
import { NextMonthTasks, type MonthTask } from "@/components/goals/next-month-tasks"
import { LoadingBlock, PageShell } from "@/components/page-shell"
import { SectionLabel, SegmentBar } from "@/components/space-ui"
import { MonthlyGoals } from "@/components/today/monthly-goals"
import { buttonVariants } from "@/components/ui/button"
import { loadGoalProgress } from "@/lib/agenda"
import { percent } from "@/lib/agenda-types"
import { requireUser } from "@/lib/auth"
import { addDays, formatDayLabel, formatDuration, monthStartKST, weekStartKST } from "@/lib/date"
import { listDreams } from "@/lib/dreams"
import { listMonthlyGoals, type MonthlyGoalsResult } from "@/lib/monthly-goals"
import { dayIso, TASK_ORDER, ymdOf } from "@/lib/task-order"

// 목표 화면: Dream(큰 목표) → 이번 달 목표 · 다음 달 목표·할 일 → MOMO와 세운 목표
export default function GoalsPage() {
  return (
    <PageShell title="목표" description="Dream을 품고, 이번 달과 다음 달을 정하고, 큰 목표는 MOMO와 계획을 세워요.">
      <Suspense fallback={<LoadingBlock lines={8} />}>
        <PlanningBoard />
      </Suspense>

      <section aria-label="MOMO와 세운 목표" className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex flex-col gap-1.5">
            <SectionLabel code="PLAN">MOMO와 세운 목표</SectionLabel>
            <p className="text-sm text-muted-foreground">목표를 정하면 MOMO가 할 일을 쪼개서 일정에 넣어 드려요.</p>
          </div>
          <Link href="/goals/new" className={buttonVariants({ size: "lg", className: "h-11 self-start px-5" })}>
            <Sparkles data-icon="inline-start" />
            새 목표 · MOMO와 대화
          </Link>
        </div>
        <Suspense fallback={<LoadingBlock lines={5} />}>
          <GoalList />
        </Suspense>
      </section>
    </PageShell>
  )
}

function nextMonthOf(month: string): string {
  const d = new Date(`${month}T00:00:00Z`)
  d.setUTCMonth(d.getUTCMonth() + 1, 1)
  return d.toISOString().slice(0, 10)
}

// 목록이 바뀌면(MOMO 호출 등) key가 바뀌어 칸이 새 목록으로 다시 그려지게 합니다.
function versionOf(items: { id: string; title: string; done: boolean }[] | null): string {
  return items ? items.map((i) => `${i.id}:${i.done ? 1 : 0}:${i.title}`).join("|") : "error"
}

function monthVersion(result: MonthlyGoalsResult): string {
  return versionOf(result.ok ? result.goals : null)
}

// Dream · 이번 달 목표 · 다음 달 목표 · 다음 달 할 일
async function PlanningBoard() {
  const { supabase } = await requireUser()
  const thisMonth = monthStartKST()
  const nextMonth = nextMonthOf(thisMonth)
  const afterNext = nextMonthOf(nextMonth)

  let tasksQuery = supabase
    .from("tasks")
    .select("id, title, scheduled_at, is_done")
    .gte("scheduled_at", dayIso(nextMonth))
    .lt("scheduled_at", dayIso(afterNext))
  for (const o of TASK_ORDER) tasksQuery = tasksQuery.order(o.column, { ascending: o.ascending })

  const [dreams, current, next, tasks] = await Promise.all([
    listDreams(),
    listMonthlyGoals(thisMonth),
    listMonthlyGoals(nextMonth),
    tasksQuery,
  ])
  // 같은 날 안의 순서는 DB 정렬로 맞으니, 날짜 순으로 한 번 더(같은 날은 순서 유지)
  const monthTasks: MonthTask[] = (tasks.data ?? [])
    .map((t, index) => ({ id: t.id, title: t.title, ymd: ymdOf(t.scheduled_at!), done: t.is_done, index }))
    .sort((a, b) => a.ymd.localeCompare(b.ymd) || a.index - b.index)
    .map((t) => ({ id: t.id, title: t.title, ymd: t.ymd, done: t.done }))

  return (
    <div className="flex flex-col gap-4 md:gap-5">
      <DreamList
        key={versionOf(dreams.ok ? dreams.dreams : null)}
        initialDreams={dreams.ok ? dreams.dreams : null}
      />
      <div className="grid items-start gap-4 md:grid-cols-2 md:gap-5">
        <MonthlyGoals
          key={`${thisMonth}|${monthVersion(current)}`}
          thisMonth={thisMonth}
          initialGoals={current.ok ? current.goals : null}
          navigable={false}
          code="MONTH"
          title="이번 달 목표"
        />
        <div className="flex flex-col gap-4 md:gap-5">
          <MonthlyGoals
            key={`${nextMonth}|${monthVersion(next)}`}
            thisMonth={nextMonth}
            initialGoals={next.ok ? next.goals : null}
            navigable={false}
            code="NEXT"
            title="다음 달 목표"
          />
          {tasks.error ? (
            <p className="text-sm text-destructive">다음 달 할 일을 불러오지 못했어요.</p>
          ) : (
            <NextMonthTasks month={nextMonth} lastDay={addDays(afterNext, -1)} tasks={monthTasks} />
          )}
        </div>
      </div>
    </div>
  )
}

async function GoalList() {
  const { supabase } = await requireUser()
  const [goals, progress, ideas] = await Promise.all([
    supabase
      .from("goals")
      .select("id, title, status, deadline, weekly_minutes, updated_at, idea_id")
      .order("updated_at", { ascending: false }),
    loadGoalProgress(supabase, weekStartKST()),
    supabase.from("ideas").select("id, title"),
  ])
  if (goals.error || !progress) {
    return <p className="text-sm text-destructive">목표를 불러오지 못했어요. 새로고침해 주세요.</p>
  }

  const byId = new Map(progress.map((p) => [p.id, p]))
  // 아이디어로 만든 목표면 그 아이디어 이름
  const ideaTitles = new Map((ideas.data ?? []).map((i) => [i.id, i.title]))
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
            <h2 className="font-mono text-xs tracking-[0.12em] text-dim">{group.title}</h2>
            <ul className="grid gap-3 md:grid-cols-2">
              {group.items.map((goal) => {
                const p = byId.get(goal.id)
                const done = p ? percent(p.done, p.total) : 0
                const ideaTitle = goal.idea_id ? ideaTitles.get(goal.idea_id) : undefined
                return (
                  <li key={goal.id}>
                    <Link
                      href={`/goals/${goal.id}`}
                      className="flex h-full flex-col gap-3 rounded-xl bg-card p-5 ring-1 ring-foreground/10 transition-colors hover:bg-muted/60 hover:ring-foreground/25"
                    >
                      <span className="text-[15px] font-medium break-words">{goal.title}</span>
                      {ideaTitle && (
                        <span className="flex min-w-0 items-baseline gap-1.5 text-xs text-muted-foreground">
                          <span className="shrink-0 font-mono text-[10px] tracking-[0.14em] text-dim">FROM IDEA</span>
                          <span className="truncate">{ideaTitle}</span>
                        </span>
                      )}
                      <span className="text-xs text-muted-foreground">
                        {goal.deadline ? `마감 ${formatDayLabel(goal.deadline)}` : "마감 미정"}
                        {goal.weekly_minutes ? ` · 주 ${formatDuration(goal.weekly_minutes)}` : ""}
                      </span>
                      {p && (
                        <>
                          <SegmentBar percent={done} label={`${goal.title} 전체 진척도`} />
                          <span className="font-mono text-xs text-dim">
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
