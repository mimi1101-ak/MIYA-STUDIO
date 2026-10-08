import { Sparkles } from "lucide-react"
import Link from "next/link"
import { Suspense } from "react"

import { DailyMessage } from "@/components/daily-message"
import { LoadingBlock, PageShell } from "@/components/page-shell"
import { TodayBoard } from "@/components/today/today-board"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { loadGoalProgress, loadToday } from "@/lib/agenda"
import { percent, type GoalProgress } from "@/lib/agenda-types"
import { requireUser } from "@/lib/auth"
import { formatDayLabel, formatDuration, formatWeekLabel, todayKST, weekStartKST } from "@/lib/date"

// "오늘" 화면: 실행에 집중. 맨 위 AI 메시지 → 지금 할 일 → 타임라인 → 빠른 입력, 오른쪽에 목표 진척도
export default function TodayPage() {
  return (
    <PageShell>
      <Suspense fallback={<LoadingBlock lines={2} />}>
        <TodayMessage />
      </Suspense>

      <div className="grid items-start gap-4 md:grid-cols-[minmax(0,1fr)_17rem]">
        <Suspense fallback={<LoadingBlock lines={8} />}>
          <TodayContent />
        </Suspense>
        <Suspense fallback={<LoadingBlock lines={4} />}>
          <WeeklyGoals />
        </Suspense>
      </div>
    </PageShell>
  )
}

// 오늘 저장된 메시지가 있으면 바로 보여 주고, 없으면 화면이 열린 뒤 만들어 달라고 요청합니다.
async function TodayMessage() {
  const { supabase, userId } = await requireUser()
  const today = todayKST()
  const { data } = await supabase
    .from("daily_messages")
    .select("content")
    .eq("user_id", userId)
    .eq("message_date", today)
    .maybeSingle()

  return <DailyMessage initialContent={data?.content ?? null} dateLabel={formatDayLabel(today)} />
}

async function TodayContent() {
  const { supabase, userId } = await requireUser()
  const data = await loadToday(supabase, userId)
  if (!data) {
    return <p className="text-sm text-destructive">오늘 일정을 불러오지 못했어요. 새로고침해 주세요.</p>
  }

  return (
    <TodayBoard
      today={data.today}
      initialNow={data.minutes}
      items={data.items}
      goals={data.goals}
      unscheduled={data.unscheduled}
      oftenCarried={data.oftenCarried}
    />
  )
}

async function WeeklyGoals() {
  const { supabase } = await requireUser()
  const weekStart = weekStartKST()
  const goals = await loadGoalProgress(supabase, weekStart)

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>이번 주 목표</CardTitle>
        <CardDescription>{formatWeekLabel(weekStart)}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {!goals ? (
          <p className="text-sm text-destructive">목표를 불러오지 못했어요.</p>
        ) : goals.length === 0 ? (
          <div className="flex flex-col items-start gap-3">
            <p className="text-sm text-muted-foreground">아직 진행 중인 목표가 없어요.</p>
            <Link href="/goals/new" className={buttonVariants({ size: "sm", variant: "outline" })}>
              <Sparkles data-icon="inline-start" />
              MOMO와 목표 세우기
            </Link>
          </div>
        ) : (
          <>
            <ul className="flex flex-col gap-4">
              {goals.map((goal) => (
                <GoalProgressRow key={goal.id} goal={goal} />
              ))}
            </ul>
            <Link href="/goals" className="text-xs text-muted-foreground hover:text-foreground">
              목표 모두 보기
            </Link>
          </>
        )}
      </CardContent>
    </Card>
  )
}

function GoalProgressRow({ goal }: { goal: GoalProgress }) {
  const week = percent(goal.weekDone, goal.weekTotal)
  return (
    <li className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <Link href={`/goals/${goal.id}`} className="min-w-0 truncate text-sm font-medium hover:underline">
          {goal.title}
        </Link>
        <span className="text-sm tabular-nums">{goal.weekTotal > 0 ? `${week}%` : "-"}</span>
      </div>
      <div
        role="progressbar"
        aria-label={`${goal.title} 이번 주 진척도`}
        aria-valuenow={week}
        aria-valuemin={0}
        aria-valuemax={100}
        className="h-1.5 overflow-hidden rounded-full bg-muted"
      >
        <div className="h-full rounded-full bg-foreground/80" style={{ width: `${week}%` }} />
      </div>
      <p className="text-xs text-muted-foreground">
        {goal.weekTotal > 0
          ? `이번 주 ${formatDuration(goal.weekDone)} / ${formatDuration(goal.weekTotal)}`
          : "이번 주에 잡힌 할 일 없음"}
        {" · "}전체 {percent(goal.done, goal.total)}%
      </p>
    </li>
  )
}
