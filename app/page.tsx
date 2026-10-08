import Link from "next/link"
import { Suspense } from "react"

import { DailyMessage } from "@/components/daily-message"
import { LoadingBlock, PageShell } from "@/components/page-shell"
import { TaskList } from "@/components/task-list"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { requireUser } from "@/lib/auth"
import { formatDayLabel, todayKST } from "@/lib/date"
import { fetchTasks } from "@/lib/tasks"

const SHORTCUTS = [
  { href: "/planner", title: "플래너", description: "주간 할 일·월간 목표" },
  { href: "/news", title: "뉴스·트렌드", description: "EO planet · Long Black · 네이버" },
  { href: "/insights", title: "인사이트", description: "정리한 생각 모아 보기" },
  { href: "/projects", title: "마이 프로젝트", description: "내가 만든 사이트로 이동" },
]

export default function DashboardPage() {
  return (
    <PageShell>
      <Suspense fallback={<LoadingBlock lines={2} />}>
        <TodayMessage />
      </Suspense>

      <Suspense fallback={<LoadingBlock lines={4} />}>
        <TodayTasks />
      </Suspense>

      <section aria-label="바로가기" className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {SHORTCUTS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="flex flex-col gap-1 rounded-xl bg-card p-4 ring-1 ring-foreground/10 transition-colors hover:bg-muted/60"
          >
            <span className="text-sm font-medium">{item.title}</span>
            <span className="text-xs text-muted-foreground">{item.description}</span>
          </Link>
        ))}
      </section>
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

async function TodayTasks() {
  const { supabase } = await requireUser()
  const today = todayKST()
  const tasks = await fetchTasks(supabase, "today", today)

  return (
    <Card>
      <CardHeader>
        <CardTitle>오늘 할 일</CardTitle>
        <CardDescription>{formatDayLabel(today)}</CardDescription>
        <CardAction>
          <Link href="/planner" className="text-xs text-muted-foreground hover:text-foreground">
            플래너 열기
          </Link>
        </CardAction>
      </CardHeader>
      <CardContent>
        {tasks ? (
          <TaskList
            period="today"
            tasks={tasks}
            placeholder="오늘 할 일 추가"
            emptyText="아직 오늘 할 일이 없어요. 첫 할 일을 적어 볼까요?"
          />
        ) : (
          <p className="text-sm text-destructive">할 일을 불러오지 못했어요. 새로고침해 주세요.</p>
        )}
      </CardContent>
    </Card>
  )
}
