import { Suspense } from "react"

import { LoadingBlock, PageShell } from "@/components/page-shell"
import { loadCalendar, type CalendarView } from "@/lib/agenda"
import { requireUser } from "@/lib/auth"
import { isUuid, isValidDate } from "@/lib/validation"

import { CalendarBoard } from "./calendar-board"

// 캘린더: 보기 전용 화면. 주간/월간 날짜 칸에 할 일·일정 제목을 다 보여 주고, 눌러서 고치기·목표별 보기
export default function CalendarPage({ searchParams }: PageProps<"/calendar">) {
  return (
    <PageShell title="캘린더" description="날짜별 할 일과 일정을 한눈에 보고, 눌러서 고쳐요.">
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

  const { supabase } = await requireUser()
  const data = await loadCalendar(supabase, view, dateParam && isValidDate(dateParam) ? dateParam : null)
  if (!data) return <p className="text-sm text-destructive">캘린더를 불러오지 못했어요. 새로고침해 주세요.</p>

  return (
    <CalendarBoard
      view={view}
      date={data.date}
      today={data.today}
      first={data.first}
      last={data.last}
      items={data.items}
      goals={data.goals}
      allGoals={data.allGoals}
      routines={data.routines}
      goalId={goalParam && isUuid(goalParam) ? goalParam : null}
    />
  )
}
