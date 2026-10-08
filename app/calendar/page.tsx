import { Suspense } from "react"

import { LoadingBlock, PageShell } from "@/components/page-shell"
import { loadCalendar, type CalendarView } from "@/lib/agenda"
import { requireUser } from "@/lib/auth"
import { isUuid, isValidDate } from "@/lib/validation"

import { CalendarBoard } from "./calendar-board"

// 캘린더: 계획용 화면. 주간/월간 보기, 클릭으로 추가·수정·삭제, 끌어서 옮기기, 목표별 보기
export default function CalendarPage({ searchParams }: PageProps<"/calendar">) {
  return (
    <PageShell title="캘린더" description="할 일·일정·루틴을 한눈에 보고, 끌어서 옮기거나 눌러서 고쳐요.">
      <Suspense fallback={<LoadingBlock lines={10} />}>
        <CalendarContent searchParams={searchParams} />
      </Suspense>
    </PageShell>
  )
}

async function CalendarContent({ searchParams }: { searchParams: PageProps<"/calendar">["searchParams"] }) {
  const params = await searchParams
  const pick = (key: string) => (typeof params[key] === "string" ? (params[key] as string) : null)
  const view: CalendarView = pick("view") === "month" ? "month" : "week"
  const dateParam = pick("date")
  const goalParam = pick("goal")

  const { supabase, userId } = await requireUser()
  const data = await loadCalendar(supabase, userId, view, dateParam && isValidDate(dateParam) ? dateParam : null)
  if (!data) return <p className="text-sm text-destructive">캘린더를 불러오지 못했어요. 새로고침해 주세요.</p>

  return (
    <CalendarBoard
      view={view}
      date={data.date}
      today={data.today}
      nowMinutes={data.nowMinutes}
      first={data.first}
      last={data.last}
      items={data.items}
      goals={data.goals}
      allGoals={data.allGoals}
      routines={data.routines}
      work={data.work}
      goalId={goalParam && isUuid(goalParam) ? goalParam : null}
    />
  )
}
