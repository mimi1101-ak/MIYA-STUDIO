import { Suspense } from "react"

import { LoadingBlock, PageShell } from "@/components/page-shell"
import { requireUser } from "@/lib/auth"
import {
  formatDayLabel,
  formatMonthLabel,
  formatWeekLabel,
  monthStartKST,
  todayKST,
  weekStartKST,
} from "@/lib/date"
import { fetchTasks } from "@/lib/tasks"

import { PlannerTabs } from "./planner-tabs"

export default function PlannerPage() {
  return (
    <PageShell title="플래너" description="오늘 할 일, 이번 주 할 일, 이번 달 목표를 관리해요.">
      <Suspense fallback={<LoadingBlock lines={5} />}>
        <PlannerContent />
      </Suspense>
    </PageShell>
  )
}

async function PlannerContent() {
  const { supabase } = await requireUser()
  const now = new Date()
  const today = todayKST(now)
  const week = weekStartKST(now)
  const month = monthStartKST(now)

  const [todayTasks, weekTasks, monthTasks] = await Promise.all([
    fetchTasks(supabase, "today", today),
    fetchTasks(supabase, "week", week),
    fetchTasks(supabase, "month", month),
  ])

  if (!todayTasks || !weekTasks || !monthTasks) {
    return <p className="text-sm text-destructive">할 일을 불러오지 못했어요. 새로고침해 주세요.</p>
  }

  return (
    <PlannerTabs
      groups={[
        {
          period: "today",
          label: "오늘",
          title: "오늘 할 일",
          dateLabel: formatDayLabel(today),
          placeholder: "오늘 할 일 추가",
          emptyText: "아직 오늘 할 일이 없어요.",
          tasks: todayTasks,
        },
        {
          period: "week",
          label: "이번 주",
          title: "이번 주 할 일",
          dateLabel: formatWeekLabel(week),
          placeholder: "이번 주 할 일 추가",
          emptyText: "아직 이번 주 할 일이 없어요.",
          tasks: weekTasks,
        },
        {
          period: "month",
          label: "이번 달",
          title: "이번 달 목표",
          dateLabel: formatMonthLabel(month),
          placeholder: "이번 달 목표 추가",
          emptyText: "아직 이번 달 목표가 없어요.",
          tasks: monthTasks,
        },
      ]}
    />
  )
}
