import { ArrowDown } from "lucide-react"
import Link from "next/link"
import { connection } from "next/server"
import { Suspense } from "react"

import { DailyMessage } from "@/components/daily-message"
import { MomoAvatar, MomoLine } from "@/components/momo-avatar"
import { LoadingBlock, PageShell } from "@/components/page-shell"
import { CornerFrame, SectionLabel, SegmentBar } from "@/components/space-ui"
import { MonthlyGoals } from "@/components/today/monthly-goals"
import { TodayBoard } from "@/components/today/today-board"
import { buttonVariants } from "@/components/ui/button"
import { loadGoalProgress, loadToday } from "@/lib/agenda"
import { percent, type GoalProgress } from "@/lib/agenda-types"
import { requireUser } from "@/lib/auth"
import {
  formatClock,
  formatDuration,
  formatFullDayLabel,
  formatStamp,
  formatWeekLabel,
  isoWeekNumber,
  monthStartKST,
  msToKst,
  todayKST,
  weekStartKST,
} from "@/lib/date"
import { loadJournal } from "@/lib/journal"
import { listMonthlyGoals } from "@/lib/monthly-goals"

// "오늘" 화면: 맨 위 MOMO의 메시지 → 관측 창(빠른 입력 · 지금 할 일 · 오늘·내일 할 일, 오른쪽에 월별 목표 · 이번 주 목표) → 하루 마무리(일지)
export default function TodayPage() {
  return (
    <PageShell>
      <section aria-label="오늘의 메시지" className="flex flex-col items-center gap-6 pt-10 pb-6 text-center md:pt-20 md:pb-12">
        <Suspense fallback={<MessageFallback />}>
          <TodayMessage />
        </Suspense>
        <div className="flex flex-wrap justify-center gap-2.5">
          <a href="#now" className={buttonVariants({ size: "lg", className: "h-11 px-5" })}>
            지금 할 일 보기
            <ArrowDown data-icon="inline-end" />
          </a>
          <Link href="/goals/new" className={buttonVariants({ size: "lg", variant: "outline", className: "h-11 px-5" })}>
            MOMO와 목표 세우기
          </Link>
        </div>
      </section>

      <CornerFrame id="now" aria-label="오늘 대시보드" className="scroll-mt-28 p-3 md:p-5">
        <div className="flex flex-col gap-4 md:gap-5">
          <Suspense fallback={<div className="h-5" />}>
            <PanelBar />
          </Suspense>
          <div className="grid items-start gap-4 md:grid-cols-[minmax(0,1fr)_18rem] md:gap-5">
            <Suspense fallback={<LoadingBlock lines={8} />}>
              <TodayContent />
            </Suspense>
            <div className="flex flex-col gap-4 md:gap-5">
              <Suspense fallback={<LoadingBlock lines={4} />}>
                <MonthlyGoalsPanel />
              </Suspense>
              <Suspense fallback={<LoadingBlock lines={4} />}>
                <WeeklyGoals />
              </Suspense>
            </div>
          </div>
        </div>
      </CornerFrame>

      <Suspense fallback={null}>
        <JournalNudge />
      </Suspense>

      <p className="flex items-center justify-center gap-2.5 text-center font-mono text-xs text-dim">
        <MomoAvatar size={29} />
        MOMO는 하루에 한 번, 아침에 메시지를 보내요
      </p>
    </PageShell>
  )
}

function MessageFallback() {
  return (
    <div className="flex w-full flex-col items-center gap-7" aria-busy="true">
      <span className="sr-only">불러오는 중…</span>
      <div className="h-11 w-64 animate-pulse bg-foreground/5" />
      <div className="h-6 w-full max-w-xl animate-pulse bg-foreground/10 md:h-8" />
      <div className="h-6 w-2/3 max-w-md animate-pulse bg-foreground/10 md:h-8" />
    </div>
  )
}

// 오늘 저장된 메시지가 있으면 바로 보여 주고, 없으면 화면이 열린 뒤 만들어 달라고 요청합니다.
async function TodayMessage() {
  const { supabase, userId } = await requireUser()
  const today = todayKST()
  const { data } = await supabase
    .from("daily_messages")
    .select("content, created_at")
    .eq("user_id", userId)
    .eq("message_date", today)
    .maybeSingle()

  const arrivedAt = data?.created_at ? formatClock(msToKst(Date.parse(data.created_at)).minutes) : null
  return (
    <>
      <DailyMessage initialContent={data?.content ?? null} arrivedAt={arrivedAt} />
      <p className="text-xs text-dim">{formatFullDayLabel(today)} · 하루에 한 번 도착하는 메시지</p>
    </>
  )
}

// 관측 창 머리줄: MIYA STUDIO / 오늘 / 2026.10.09 FRI · W41 이번 주
async function PanelBar() {
  await connection()
  const today = todayKST()
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-1 font-mono text-[11px] tracking-[0.06em] text-dim md:text-xs">
      <p>
        <span className="hidden sm:inline">
          MIYA STUDIO <span className="text-foreground/25">/</span>{" "}
        </span>
        오늘 <span className="text-foreground/25">/</span> <span className="text-foreground">{formatStamp(today)}</span>
      </p>
      <p className="text-muted-foreground">
        W{isoWeekNumber(today)} · {formatWeekLabel(weekStartKST())}
      </p>
    </div>
  )
}

async function TodayContent() {
  const { supabase } = await requireUser()
  const data = await loadToday(supabase)
  if (!data) {
    return <MomoLine tone="error">오늘 일정을 불러오지 못했어요. 새로고침해 주세요.</MomoLine>
  }

  return (
    <TodayBoard
      today={data.today}
      tomorrow={data.tomorrow}
      todayTasks={data.todayTasks}
      tomorrowTasks={data.tomorrowTasks}
      goals={data.goals}
      unscheduled={data.unscheduled}
      oftenCarried={data.oftenCarried}
    />
  )
}

// 월별 목표: 이번 달 목록을 먼저 불러와 두고, 다른 달은 화면에서 넘겨 봅니다.
async function MonthlyGoalsPanel() {
  await requireUser()
  const month = monthStartKST()
  const result = await listMonthlyGoals(month)
  // MOMO 호출 등으로 목록이 바뀌면 key가 바뀌어 화면 목록도 새로 맞춰집니다(이 칸은 처음 받은 목록을 화면 안에서 들고 있어서).
  const version = result.ok ? result.goals.map((g) => `${g.id}:${g.done ? 1 : 0}:${g.title}`).join("|") : "error"
  return <MonthlyGoals key={`${month}|${version}`} thisMonth={month} initialGoals={result.ok ? result.goals : null} />
}

async function WeeklyGoals() {
  const { supabase } = await requireUser()
  const weekStart = weekStartKST()
  const goals = await loadGoalProgress(supabase, weekStart)
  const weekDone = goals?.reduce((sum, g) => sum + g.weekDone, 0) ?? 0
  const weekTotal = goals?.reduce((sum, g) => sum + g.weekTotal, 0) ?? 0

  return (
    <section aria-label="이번 주 목표" className="flex flex-col gap-5 rounded-xl bg-card p-5 ring-1 ring-foreground/10">
      <div className="flex flex-col gap-1.5">
        <SectionLabel code="WEEK">이번 주 목표</SectionLabel>
        <p className="font-mono text-xs text-dim">{formatWeekLabel(weekStart)}</p>
      </div>
      {!goals ? (
        <p className="text-sm text-destructive">목표를 불러오지 못했어요.</p>
      ) : goals.length === 0 ? (
        <div className="flex flex-col items-start gap-3">
          <p className="text-sm text-muted-foreground">아직 진행 중인 목표가 없어요.</p>
          <Link href="/goals/new" className={buttonVariants({ variant: "outline", className: "h-10 px-4" })}>
            MOMO와 목표 세우기
          </Link>
        </div>
      ) : (
        <>
          <div className="flex items-end gap-3">
            <p className="font-pixel text-[4rem] leading-[0.9] font-black">
              {weekTotal > 0 ? percent(weekDone, weekTotal) : "–"}
              {weekTotal > 0 && <span className="text-[1.75rem]">%</span>}
            </p>
            <p className="mb-1 text-xs leading-normal text-dim">
              이번 주
              <br />
              전체 진척도
            </p>
          </div>
          <ul className="flex flex-col gap-4">
            {goals.map((goal) => (
              <GoalProgressRow key={goal.id} goal={goal} />
            ))}
          </ul>
          <Link href="/goals" className="text-[13px] text-muted-foreground hover:text-foreground">
            목표 모두 보기 →
          </Link>
        </>
      )}
    </section>
  )
}

// 하루 마무리: 오늘 일지를 썼는지 보여 주고 일지 화면으로 보냅니다.
async function JournalNudge() {
  const { supabase } = await requireUser()
  const entry = await loadJournal(supabase, todayKST())

  return (
    <section
      aria-label="하루 마무리"
      className="flex flex-col gap-3 rounded-xl bg-card p-4 ring-1 ring-foreground/10 sm:flex-row sm:items-center sm:justify-between md:p-5"
    >
      <div className="flex flex-col gap-1.5">
        <SectionLabel code="LOG">하루 마무리</SectionLabel>
        <p className="text-sm text-muted-foreground">
          {entry
            ? `오늘 일지 ${entry.content.length.toLocaleString()}자 · ${formatClock(msToKst(Date.parse(entry.updatedAt)).minutes)} 저장`
            : "오늘 하루를 돌아보며 생각을 정리해 보세요."}
        </p>
      </div>
      <Link href="/journal" className={buttonVariants({ variant: "outline", className: "h-10 shrink-0 px-4" })}>
        {entry ? "일지 이어 쓰기" : "일지 쓰기"}
      </Link>
    </section>
  )
}

function GoalProgressRow({ goal }: { goal: GoalProgress }) {
  const week = percent(goal.weekDone, goal.weekTotal)
  return (
    <li className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <Link href={`/goals/${goal.id}`} className="min-w-0 truncate text-sm hover:underline">
          {goal.title}
        </Link>
        <span className="font-mono text-[13px] tabular-nums">{goal.weekTotal > 0 ? `${week}%` : "-"}</span>
      </div>
      <SegmentBar percent={week} label={`${goal.title} 이번 주 진척도`} />
      <p className="text-xs text-dim">
        {goal.weekTotal > 0
          ? `이번 주 ${formatDuration(goal.weekDone)} / ${formatDuration(goal.weekTotal)}`
          : "이번 주에 잡힌 할 일 없음"}
        {" · "}전체 {percent(goal.done, goal.total)}%
      </p>
    </li>
  )
}
