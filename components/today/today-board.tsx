"use client"

import { Check, Sparkles } from "lucide-react"
import Link from "next/link"
import { Fragment, useOptimistic, useState, useTransition } from "react"

import { MomoAvatar, MomoLine } from "@/components/momo-avatar"
import { ItemEditor } from "@/components/schedule/item-editor"
import { SectionLabel } from "@/components/space-ui"
import { QuickAdd } from "@/components/today/quick-add"
import { useNowMinutes } from "@/components/today/use-now"
import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { KIND_LABELS, type AgendaItem, type GoalOption, type UnscheduledTask } from "@/lib/agenda-types"
import { formatClock, formatDuration } from "@/lib/date"
import {
  deleteTask,
  keepTask,
  placeUnscheduledAction,
  postponeTaskAction,
  setRoutineDone,
  setTaskDone,
  splitTask,
} from "@/lib/schedule-actions"
import { cn } from "@/lib/utils"
import type { ActionResult } from "@/lib/validation"

export type CarriedTask = { id: string; title: string; carry_count: number }

type Props = {
  today: string
  initialNow: number
  items: AgendaItem[]
  goals: GoalOption[]
  unscheduled: UnscheduledTask[]
  oftenCarried: CarriedTask[]
}

// "오늘" 화면의 움직이는 부분: MOMO 신호 줄, 지금 할 일, 타임라인, 빠른 입력, 시간 미정 할 일
export function TodayBoard({ today, initialNow, items, goals, unscheduled, oftenCarried }: Props) {
  const now = useNowMinutes(initialNow, today)
  const [list, applyDone] = useOptimistic(items, (state, change: { key: string; done: boolean }) =>
    state.map((item) => (item.key === change.key ? { ...item, done: change.done } : item))
  )
  const [pendingKeys, setPendingKeys] = useState<string[]>([])
  const [skipped, setSkipped] = useState<string[]>([])
  const [notice, setNotice] = useState<{ type: "ok" | "error"; text: string } | null>(null)
  const [, startTransition] = useTransition()

  function run(key: string, action: () => Promise<ActionResult>, optimistic?: () => void) {
    setNotice(null)
    setPendingKeys((keys) => [...keys, key])
    startTransition(async () => {
      optimistic?.()
      const result = await action()
      if (!result.ok) setNotice({ type: "error", text: result.error })
      else if (result.message) setNotice({ type: "ok", text: result.message })
      setPendingKeys((keys) => keys.filter((k) => k !== key))
    })
  }

  function toggle(item: AgendaItem, done: boolean) {
    run(
      item.key,
      () => (item.kind === "task" ? setTaskDone(item.id, done) : setRoutineDone(item.id, item.ymd, done)),
      () => applyDone({ key: item.key, done })
    )
  }

  function later(item: AgendaItem) {
    // 루틴은 옮길 수 없으니 이 화면에서만 다음 항목으로 넘깁니다.
    if (item.kind === "routine") return setSkipped((keys) => [...keys, item.key])
    run(item.key, () => postponeTaskAction(item.id))
  }

  return (
    <div className="flex flex-col gap-4">
      <MomoLine tone={notice?.type === "error" ? "error" : "normal"}>{notice ? notice.text : summarize(list)}</MomoLine>

      <CarriedPrompt tasks={oftenCarried} />

      <NowCard
        items={list}
        now={now}
        skipped={skipped}
        pendingKeys={pendingKeys}
        onDone={(item) => toggle(item, true)}
        onLater={later}
      />

      <Timeline
        today={today}
        items={list}
        now={now}
        goals={goals}
        pendingKeys={pendingKeys}
        onToggle={toggle}
      />

      {unscheduled.length > 0 && <UnscheduledCard tasks={unscheduled} />}
    </div>
  )
}

// 알릴 일이 없을 때 MOMO가 하는 말: 오늘 할 일·일정 개수
function summarize(items: AgendaItem[]): string {
  if (items.length === 0) return "오늘은 잡힌 일이 없어요. 아래 빠른 입력으로 할 일을 넣어 보세요."
  const count = (kind: AgendaItem["kind"]) => items.filter((i) => i.kind === kind).length
  const tasks = count("task")
  const parts = [`할 일 ${tasks}개`, `일정 ${count("event")}개`]
  if (count("routine") > 0) parts.push(`루틴 ${count("routine")}개`)
  const allDone = tasks > 0 && items.every((i) => i.kind !== "task" || i.done)
  return `오늘은 ${parts.join(", ")}가 있어요.${allDone ? " 할 일은 모두 끝냈어요." : ""}`
}

// ── 지금 할 일 ───────────────────────────────────────────

type NowPick = { item: AgendaItem; status: "now" | "overdue" | "next" }

function pickNow(items: AgendaItem[], now: number, skipped: string[]): NowPick | null {
  const actionable = items.filter((i) => i.kind !== "event" && !i.done && !skipped.includes(i.key))
  const current = actionable.find((i) => i.start <= now && now < i.end)
  if (current) return { item: current, status: "now" }
  const overdue = actionable.find((i) => i.kind === "task" && i.end <= now)
  if (overdue) return { item: overdue, status: "overdue" }
  const next = actionable.find((i) => i.start > now)
  return next ? { item: next, status: "next" } : null
}

function timeRange(item: AgendaItem) {
  return `${formatClock(item.start)}–${formatClock(item.end)}`
}

function NowCard({
  items,
  now,
  skipped,
  pendingKeys,
  onDone,
  onLater,
}: {
  items: AgendaItem[]
  now: number
  skipped: string[]
  pendingKeys: string[]
  onDone: (item: AgendaItem) => void
  onLater: (item: AgendaItem) => void
}) {
  const pick = pickNow(items, now, skipped)
  const events = items.filter((i) => i.kind === "event")
  const currentEvent = events.find((e) => e.start <= now && now < e.end)
  const nextEvent = events.find((e) => e.start > now)

  const eventNote = currentEvent
    ? `지금은 '${currentEvent.title}' 일정 중이에요 (~${formatClock(currentEvent.end)})`
    : nextEvent
      ? `다음 일정 ${formatClock(nextEvent.start)} ${nextEvent.title}`
      : null

  return (
    <section
      aria-label="지금 할 일"
      className="flex flex-col gap-5 rounded-xl bg-foreground/[0.04] p-5 ring-1 ring-foreground/15 md:p-7"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <SectionLabel code="NOW">지금 할 일</SectionLabel>
        {eventNote && <p className="min-w-0 truncate text-xs text-muted-foreground">{eventNote}</p>}
      </div>

      {pick ? (
        <>
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-1.5">
              <StatusBadge pick={pick} />
              {pick.item.goalTitle && (
                <Badge variant="outline">
                  <span aria-hidden className="size-1.5 rotate-45 bg-foreground" />
                  {pick.item.goalTitle}
                </Badge>
              )}
              <KindBadges item={pick.item} />
            </div>
            <p className="text-2xl leading-snug font-medium tracking-tight break-words md:text-[2rem] md:leading-[1.3]">
              {pick.item.title}
            </p>
            <p className="font-mono text-[13px] text-muted-foreground">
              {timeRange(pick.item)} · {formatDuration(pick.item.end - pick.item.start)}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex">
            <Button
              type="button"
              size="lg"
              className="h-11 px-6"
              disabled={pendingKeys.includes(pick.item.key)}
              onClick={() => onDone(pick.item)}
            >
              <Check data-icon="inline-start" />
              완료
            </Button>
            <Button
              type="button"
              size="lg"
              variant="outline"
              className="h-11 px-6"
              disabled={pendingKeys.includes(pick.item.key)}
              onClick={() => onLater(pick.item)}
            >
              {pendingKeys.includes(pick.item.key) ? "옮기는 중…" : "나중에"}
            </Button>
          </div>
        </>
      ) : (
        <div className="flex flex-col items-start gap-3">
          <p className="font-serif text-2xl md:text-[1.75rem]">오늘 남은 할 일이 없어요.</p>
          <p className="text-sm text-muted-foreground">
            목표를 정해 두면 MOMO가 할 일을 쪼개서 빈 시간에 넣어 드려요.
          </p>
          <Link href="/goals/new" className={buttonVariants({ size: "lg", className: "h-11 px-5" })}>
            <Sparkles data-icon="inline-start" />
            MOMO와 목표 세우기
          </Link>
        </div>
      )}
    </section>
  )
}

function StatusBadge({ pick }: { pick: NowPick }) {
  if (pick.status === "now") return <Badge>진행 중</Badge>
  if (pick.status === "overdue") {
    return <Badge variant="outline">밀린 일 · {formatClock(pick.item.start)} 예정이었어요</Badge>
  }
  return <Badge variant="secondary">다음 · {formatClock(pick.item.start)} 시작</Badge>
}

// 종류·AI 표시. AI가 만든 할 일은 반짝이 표시로 구분합니다.
export function KindBadges({ item }: { item: AgendaItem }) {
  return (
    <>
      <Badge variant="outline" className="text-muted-foreground">
        {KIND_LABELS[item.kind]}
      </Badge>
      {item.source === "ai" && (
        <Badge variant="secondary">
          <Sparkles data-icon="inline-start" />
          AI
        </Badge>
      )}
    </>
  )
}

// ── 오늘 타임라인 ─────────────────────────────────────────

function Timeline({
  today,
  items,
  now,
  goals,
  pendingKeys,
  onToggle,
}: {
  today: string
  items: AgendaItem[]
  now: number
  goals: GoalOption[]
  pendingKeys: string[]
  onToggle: (item: AgendaItem, done: boolean) => void
}) {
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const checkable = items.filter((i) => i.kind !== "event")
  const doneCount = checkable.filter((i) => i.done).length
  const lineIndex = items.findIndex((i) => i.start > now)
  // 지금 선: 시각 + 숨 쉬는 신호 점 + 흐려지는 선
  const nowLine = (
    <li aria-hidden className="flex items-center gap-3 py-1.5">
      <span className="w-[3.25rem] shrink-0 pl-1 font-mono text-[11px] font-medium tracking-[0.04em] sm:w-[6.5rem] sm:pl-3 sm:text-xs">
        <span className="hidden sm:inline">NOW </span>
        {formatClock(now)}
      </span>
      <span className="signal-dot pulse" />
      <span className="h-px flex-1 bg-linear-to-r from-foreground/90 to-foreground/5" />
    </li>
  )

  return (
    <section aria-label="오늘 타임라인" className="flex flex-col gap-5 rounded-xl bg-card p-4 ring-1 ring-foreground/10 md:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <SectionLabel code="TIMELINE">타임라인</SectionLabel>
        <p className="font-mono text-xs text-muted-foreground tabular-nums">
          완료 {doneCount} / {checkable.length}
        </p>
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">오늘은 잡힌 할 일·일정·루틴이 없어요.</p>
      ) : (
        <ol className="flex flex-col gap-0.5">
          {items.map((item, index) => {
            const editing = editingKey === item.key
            const current = !item.done && item.start <= now && now < item.end
            const overdue = item.kind === "task" && !item.done && item.end <= now
            const meta = [
              KIND_LABELS[item.kind],
              item.goalTitle,
              item.source === "ai" ? "AI" : null,
              formatDuration(item.end - item.start),
              item.carryCount > 0 ? `${item.carryCount}번 미룸` : null,
            ]
              .filter(Boolean)
              .join(" · ")
            return (
              <Fragment key={item.key}>
                {index === lineIndex && nowLine}
                <li
                  className={cn(
                    "flex flex-col gap-2 rounded-md py-2.5 pr-1 transition-opacity",
                    current && "bg-foreground/[0.055]",
                    item.end <= now && !current && !editing && "opacity-50"
                  )}
                >
                  <div className="flex items-start gap-3">
                    <span className="w-[3.25rem] shrink-0 pl-1 font-mono text-xs leading-5 text-muted-foreground tabular-nums sm:w-[6.5rem] sm:pl-3">
                      {formatClock(item.start)}
                      <span className="block text-[11px] leading-4 text-foreground/30 sm:inline sm:text-xs sm:leading-5">
                        <span className="hidden sm:inline">–</span>
                        {formatClock(item.end)}
                      </span>
                    </span>
                    {item.kind === "event" ? (
                      <span aria-hidden className="mx-[3px] mt-[5px] size-[9px] shrink-0 rotate-45 border border-foreground" />
                    ) : (
                      <Checkbox
                        className="mt-0.5"
                        checked={item.done}
                        disabled={pendingKeys.includes(item.key)}
                        onCheckedChange={(checked) => onToggle(item, checked)}
                        aria-label={`${item.title} 완료 표시`}
                      />
                    )}
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <span
                        className={cn(
                          "text-[15px] leading-5 break-words",
                          item.done && "text-dim line-through decoration-foreground/40"
                        )}
                      >
                        {item.title}
                      </span>
                      <span className="text-xs text-dim">
                        {meta}
                        {overdue && <span className="text-foreground"> · 밀림</span>}
                      </span>
                    </div>
                    {current && (
                      <span className="hidden self-center font-mono text-[11px] tracking-[0.14em] whitespace-nowrap sm:inline">
                        진행 중
                      </span>
                    )}
                    {item.kind === "routine" ? (
                      <Link
                        href="/calendar"
                        className={buttonVariants({ size: "xs", variant: "ghost", className: "text-muted-foreground" })}
                      >
                        수정
                      </Link>
                    ) : (
                      <Button
                        type="button"
                        size="xs"
                        variant="ghost"
                        className="text-muted-foreground"
                        onClick={() => setEditingKey(editing ? null : item.key)}
                      >
                        {editing ? "닫기" : "수정"}
                      </Button>
                    )}
                  </div>
                  {editing && (
                    <ItemEditor
                      value={{
                        kind: item.kind,
                        id: item.id,
                        title: item.title,
                        minutes: item.end - item.start,
                        goalId: item.goalId,
                        date: item.ymd,
                        start: item.start,
                        weekdays: [],
                      }}
                      goals={goals}
                      onClose={() => setEditingKey(null)}
                    />
                  )}
                </li>
              </Fragment>
            )
          })}
          {lineIndex === -1 && nowLine}
        </ol>
      )}

      <div className="flex flex-col gap-2 border-t border-foreground/10 pt-5">
        <p className="text-[13px] font-medium">빠른 입력</p>
        <QuickAdd today={today} now={now} />
      </div>
    </section>
  )
}

// ── 시간 미정 할 일 ───────────────────────────────────────

function UnscheduledCard({ tasks }: { tasks: UnscheduledTask[] }) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState("")

  return (
    <section aria-label="시간 미정 할 일" className="flex flex-col gap-4 rounded-xl bg-card p-4 ring-1 ring-foreground/10 md:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1.5">
          <SectionLabel code="LATER">시간 미정 {tasks.length}개</SectionLabel>
          <p className="text-xs text-dim">일할 수 있는 시간 안에 빈 자리가 없어 아직 못 넣은 할 일이에요.</p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-9 px-3"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const result = await placeUnscheduledAction()
              setError(result.ok ? "" : result.error)
            })
          }
        >
          {pending ? "넣는 중…" : "빈 시간에 넣기"}
        </Button>
      </div>
      <ul className="flex flex-col text-sm">
        {tasks.map((task) => (
          <li
            key={task.id}
            className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-foreground/[0.07] py-3"
          >
            <span className="flex flex-wrap items-center gap-1.5">
              {task.title}
              {task.source === "ai" && (
                <Badge variant="secondary">
                  <Sparkles data-icon="inline-start" />
                  AI
                </Badge>
              )}
            </span>
            <span className="font-mono text-xs text-dim">
              {formatDuration(task.minutes)}
              {task.goalTitle && ` · ${task.goalTitle}`}
            </span>
          </li>
        ))}
      </ul>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </section>
  )
}

// ── 3번 이상 미룬 할 일: MOMO가 쪼갤지/뺄지 묻기 ─────────────

function CarriedPrompt({ tasks }: { tasks: CarriedTask[] }) {
  const [pending, startTransition] = useTransition()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [message, setMessage] = useState<{ type: "ok" | "error"; text: string } | null>(null)

  function run(id: string, action: () => Promise<ActionResult>) {
    setMessage(null)
    setBusyId(id)
    startTransition(async () => {
      const result = await action()
      setMessage(result.ok ? (result.message ? { type: "ok", text: result.message } : null) : { type: "error", text: result.error })
      setBusyId(null)
    })
  }

  // 다 처리한 뒤에도 결과 문구는 보여 줍니다.
  if (tasks.length === 0 && !message) return null

  return (
    <section aria-label="자주 미룬 할 일" className="flex flex-col gap-4 border border-dashed border-foreground/15 p-3 md:p-4">
      {tasks.map((task) => (
        <div key={task.id} className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-center gap-3 text-sm leading-relaxed">
            <MomoAvatar size={29} />
            <span>
              <strong className="font-medium">‘{task.title}’</strong>을(를) {task.carry_count}번 미뤘어요. 쪼개서 작게 할까요, 뺄까요?
            </span>
          </p>
          <div className="flex shrink-0 flex-wrap gap-1.5">
            <Button type="button" size="sm" className="h-9 px-3" disabled={pending} onClick={() => run(task.id, () => splitTask(task.id))}>
              <Sparkles data-icon="inline-start" />
              {busyId === task.id ? "쪼개는 중…" : "AI로 쪼개기"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-9 px-3"
              disabled={pending}
              onClick={() => {
                if (window.confirm(`'${task.title}'을(를) 지울까요?`)) run(task.id, () => deleteTask(task.id))
              }}
            >
              빼기
            </Button>
            <Button type="button" size="sm" variant="ghost" className="h-9 px-3" disabled={pending} onClick={() => run(task.id, () => keepTask(task.id))}>
              그대로 두기
            </Button>
          </div>
        </div>
      ))}
      {message && (
        <p
          role={message.type === "error" ? "alert" : "status"}
          className={cn("text-sm", message.type === "error" ? "text-destructive" : "text-muted-foreground")}
        >
          {message.text}
        </p>
      )}
    </section>
  )
}
