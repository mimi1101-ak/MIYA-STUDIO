"use client"

import { ListPlus, Target } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useOptimistic, useState, useTransition } from "react"

import { MomoLine } from "@/components/momo-avatar"
import { ItemEditor, type EditorValue } from "@/components/schedule/item-editor"
import { SectionLabel } from "@/components/space-ui"
import { Button, buttonVariants } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import type { GoalOption } from "@/lib/agenda-types"
import { formatClock, formatDayLabel, formatDuration, msToKst } from "@/lib/date"
import { DOC_TYPES } from "@/lib/idea-report"
import {
  GOAL_STATUS_LABELS,
  isOpenGoal,
  type Idea,
  type IdeaLinks,
  type LinkedGoal,
  type LinkedTask,
} from "@/lib/ideas"
import { planQuickInput } from "@/lib/quick-parse"
import { setTaskDone } from "@/lib/schedule-actions"
import { cn } from "@/lib/utils"
import { LIMITS } from "@/lib/validation"

import { createGoalFromIdea } from "./actions"

// 아이디어 ↔ 할 일·목표 연결: 아이디어를 할 일로 보내기, 목표로 만들기, 연결된 할 일·목표 보기

// 할 일이 놓인 때. 예: "10월 12일 (월) 15:00", 시각이 없으면 "시간 미정"
export function taskWhen(task: LinkedTask): string {
  if (!task.scheduledAt) return "시간 미정"
  const { ymd, minutes } = msToKst(Date.parse(task.scheduledAt))
  return `${formatDayLabel(ymd)} ${formatClock(minutes)}`
}

// 목표 상태. 진행 중이면 끝낸 비율도. 예: "진행 중 40%"
export function goalState(goal: LinkedGoal): string {
  if (goal.status === "active" && goal.percent !== null) return `진행 중 ${goal.percent}%`
  return GOAL_STATUS_LABELS[goal.status] ?? goal.status
}

// 목표를 나타내는 마름모 (오늘 화면의 목표 표시와 같은 모양)
function GoalMark() {
  return <span aria-hidden className="size-1.5 shrink-0 rotate-45 bg-foreground" />
}

// 할 일을 나타내는 작은 네모
function TaskMark() {
  return <span aria-hidden className="size-1.5 shrink-0 border border-foreground" />
}

// 아이디어 한 줄을 할 일 양식에 미리 채웁니다. "금요일 3시 치과 1시간"처럼 적어 두었으면 날짜·시각·시간도 읽어요.
// 이 아이디어로 만든 진행 중 목표가 있으면 그 목표에 연결해 둡니다.
function taskDraft(idea: Idea, links: IdeaLinks, goals: GoalOption[]): EditorValue {
  const now = msToKst(Date.now())
  const plan = planQuickInput(idea.title, now.ymd, now.minutes, "task")
  const goal = links.goals.find((g) => g.status === "active" && goals.some((o) => o.id === g.id))
  return {
    kind: "task",
    id: null,
    title: (plan?.title || idea.title).slice(0, LIMITS.taskTitle),
    minutes: plan?.minutes ?? 30,
    goalId: goal?.id ?? null,
    date: plan?.date ?? null,
    start: plan?.start ?? null,
    weekdays: [],
    ideaId: idea.id,
    ideaTitle: idea.title,
  }
}

// 아이디어를 할 일로 보내는 양식. 이름·날짜·시각·예상 시간·목표를 고칠 수 있고, 시각을 비우면 빈 시간에 들어갑니다.
export function IdeaTaskEditor({
  idea,
  links,
  goals,
  onClose,
  onSaved,
}: {
  idea: Idea
  links: IdeaLinks
  goals: GoalOption[]
  onClose: () => void
  onSaved: (message: string) => void
}) {
  const [value] = useState(() => taskDraft(idea, links, goals))
  return (
    <div className="flex flex-col gap-2">
      <p className="flex min-w-0 items-baseline gap-2 text-xs text-muted-foreground">
        <span className="shrink-0 font-mono text-[11px] tracking-[0.14em] text-dim">IDEA › TODO</span>
        <span className="truncate">할 일로 보내기 · 이름은 하기 좋게 바꿔도 돼요</span>
      </p>
      <ItemEditor
        value={value}
        goals={goals}
        submitLabel="할 일로 보내기"
        onClose={onClose}
        onSaved={(message) => onSaved(`할 일로 보냈어요. ${message ?? ""}`.trim())}
      />
    </div>
  )
}

// "목표로 만들기": 목표를 만들고 그 목표 화면(MOMO와 계획 세우기)으로 갑니다.
export function useMakeGoal(ideaId: string) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState("")

  function makeGoal() {
    setError("")
    startTransition(async () => {
      const result = await createGoalFromIdea(ideaId)
      if (!result.ok) setError(result.error)
      else if (result.goalId) router.push(`/goals/${result.goalId}`)
    })
  }
  return { makeGoal, pending, error }
}

// 아이디어 카드 안의 짧은 연결 요약: 목표(상태) · 할 일 몇 개 끝냈는지 · 다음 할 일
export function IdeaLinkSummary({ idea, links }: { idea: Idea; links: IdeaLinks }) {
  const total = links.tasks.length
  const done = links.tasks.filter((t) => t.done).length
  const next = links.tasks.find((t) => !t.done)
  if (links.goals.length === 0 && total === 0) return null

  const row =
    "flex min-w-0 items-center gap-1.5 underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
  return (
    <div aria-label="연결된 목표·할 일" className="flex flex-col gap-1 border-l-2 border-foreground/20 pl-2.5 text-xs">
      {links.goals.map((goal) => (
        <Link key={goal.id} href={`/goals/${goal.id}`} className={row}>
          <GoalMark />
          <span className="shrink-0 text-dim">목표</span>
          <span className="min-w-0 truncate text-foreground/85">{goal.title}</span>
          <span className="shrink-0 font-mono text-[11px] text-dim">{goalState(goal)}</span>
        </Link>
      ))}
      {total > 0 && (
        <Link href={`/ideas/${idea.id}#links`} className={row}>
          <TaskMark />
          <span className="shrink-0 text-dim">할 일</span>
          <span className="shrink-0 font-mono text-[11px] text-foreground/85 tabular-nums">
            {done}/{total} 끝냄
          </span>
          {next && <span className="min-w-0 truncate text-dim">· 다음 {taskWhen(next)}</span>}
        </Link>
      )}
    </div>
  )
}

// 아이디어 화면의 연결 칸: 할 일로 보내기 · 목표로 만들기, 이 아이디어에서 나온 목표와 할 일(완료 표시 가능)
export function IdeaLinksPanel({ idea, links, goals }: { idea: Idea; links: IdeaLinks; goals: GoalOption[] }) {
  const [editing, setEditing] = useState(false)
  const [notice, setNotice] = useState<{ type: "ok" | "error"; text: string } | null>(null)
  const [toggling, startToggle] = useTransition()
  const [tasks, setOptimisticDone] = useOptimistic(links.tasks, (list, change: { id: string; done: boolean }) =>
    list.map((t) => (t.id === change.id ? { ...t, done: change.done } : t))
  )
  const { makeGoal, pending: making, error: goalError } = useMakeGoal(idea.id)

  const done = tasks.filter((t) => t.done).length
  const hasOpenGoal = links.goals.some(isOpenGoal)
  const empty = links.goals.length === 0 && tasks.length === 0
  const closed = idea.status === "done"

  function toggle(task: LinkedTask, value: boolean) {
    setNotice(null)
    startToggle(async () => {
      setOptimisticDone({ id: task.id, done: value })
      const result = await setTaskDone(task.id, value)
      if (!result.ok) setNotice({ type: "error", text: result.error })
    })
  }

  const message = goalError ? { type: "error" as const, text: goalError } : notice

  return (
    <section
      id="links"
      aria-label="할 일·목표 연결"
      className="flex scroll-mt-28 flex-col gap-4 rounded-xl bg-card p-4 ring-1 ring-foreground/10 md:p-5"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <SectionLabel code="LINK">할 일 · 목표로 옮기기</SectionLabel>
        {!empty && (
          <p className="font-mono text-[11px] text-dim tabular-nums">
            목표 {links.goals.length} · 할 일 {done}/{tasks.length} 끝냄
          </p>
        )}
      </div>

      {empty && (
        <p className="text-sm leading-relaxed text-muted-foreground">
          이 아이디어를 실행으로 옮겨 보세요. 할 일은 일정의 빈 시간에 들어가고, 목표는 MOMO가 아이디어
          {idea.reported ? `와 ${DOC_TYPES[idea.kind]}` : ""}를 읽고 월 → 주 → 일 계획을 세워요. 아이디어는 지워지지 않고 연결된 채
          남아요.
        </p>
      )}

      {links.goals.length > 0 && (
        <ul aria-label="이 아이디어로 만든 목표" className="flex flex-col gap-2">
          {links.goals.map((goal) => (
            <li key={goal.id}>
              <Link
                href={`/goals/${goal.id}`}
                className="flex items-center gap-2.5 border border-dashed border-foreground/15 px-3 py-2.5 transition-colors hover:border-foreground/40 hover:bg-foreground/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
              >
                <GoalMark />
                <span className="shrink-0 text-xs text-dim">목표</span>
                <span className="min-w-0 flex-1 truncate text-sm">{goal.title}</span>
                <span className="shrink-0 font-mono text-[11px] text-dim">{goalState(goal)}</span>
                <span aria-hidden className="font-mono text-dim">
                  ›
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {tasks.length > 0 && (
        <ul aria-label="이 아이디어에서 보낸 할 일" className="flex flex-col">
          {tasks.map((task) => {
            const ymd = task.scheduledAt ? msToKst(Date.parse(task.scheduledAt)).ymd : null
            return (
              <li key={task.id} className="flex items-start gap-3 border-t border-foreground/[0.07] py-2.5">
                <Checkbox
                  className="mt-0.5"
                  checked={task.done}
                  disabled={toggling}
                  onCheckedChange={(checked) => toggle(task, checked)}
                  aria-label={`${task.title} 완료 표시`}
                />
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span
                    className={cn(
                      "text-sm leading-5 break-words",
                      task.done && "text-dim line-through decoration-foreground/40"
                    )}
                  >
                    {task.title}
                  </span>
                  <span className="font-mono text-[11px] text-dim tabular-nums">
                    {taskWhen(task)} · {formatDuration(task.minutes)}
                  </span>
                </div>
                {ymd && (
                  <Link
                    href={`/calendar?date=${ymd}`}
                    className={buttonVariants({ size: "xs", variant: "ghost", className: "text-muted-foreground" })}
                  >
                    캘린더
                  </Link>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {editing ? (
        <IdeaTaskEditor
          idea={idea}
          links={links}
          goals={goals}
          onClose={() => setEditing(false)}
          onSaved={(text) => setNotice({ type: "ok", text })}
        />
      ) : (
        !closed && (
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              className="h-10 px-4"
              onClick={() => {
                setNotice(null)
                setEditing(true)
              }}
            >
              <ListPlus data-icon="inline-start" />
              할 일로 보내기
            </Button>
            <Button type="button" variant="outline" className="h-10 px-4" disabled={making} onClick={makeGoal}>
              <Target data-icon="inline-start" />
              {making ? "목표 만드는 중…" : hasOpenGoal ? "목표 하나 더 만들기" : "목표로 만들기"}
            </Button>
          </div>
        )
      )}

      {closed && empty && <p className="text-xs text-dim">끝낸 아이디어예요. &lsquo;다시 꺼내기&rsquo;를 누르면 다시 옮길 수 있어요.</p>}
      {message && <MomoLine tone={message.type === "error" ? "error" : "normal"}>{message.text}</MomoLine>}
    </section>
  )
}
