"use client"

import { ChevronLeft, ChevronRight, Sparkles } from "lucide-react"
import { useRouter } from "next/navigation"
import { useEffect, useRef, useState } from "react"

import { ItemEditor, newEditorValue, selectClass, type EditorValue } from "@/components/schedule/item-editor"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { CalendarView, RoutineRow } from "@/lib/agenda"
import { KIND_LABELS, type AgendaItem, type GoalOption } from "@/lib/agenda-types"
import {
  addDays,
  formatClock,
  formatDayLabel,
  formatDuration,
  formatMonthLabel,
  formatWeekLabel,
  WEEKDAYS,
} from "@/lib/date"
import { cn } from "@/lib/utils"

import { DayOffChat } from "./day-off-chat"

type Props = {
  view: CalendarView
  date: string
  today: string
  first: string
  last: string
  items: AgendaItem[]
  goals: GoalOption[]
  allGoals: GoalOption[]
  routines: RoutineRow[]
  goalId: string | null
}

function calendarUrl(view: CalendarView, date: string, goalId: string | null) {
  const params = new URLSearchParams({ view, date })
  if (goalId) params.set("goal", goalId)
  return `/calendar?${params}`
}

function shiftMonth(date: string, months: number): string {
  const d = new Date(`${date.slice(0, 8)}01T00:00:00Z`)
  d.setUTCMonth(d.getUTCMonth() + months)
  return d.toISOString().slice(0, 10)
}

function daysFrom(first: string, last: string): string[] {
  const days: string[] = []
  for (let ymd = first; ymd <= last; ymd = addDays(ymd, 1)) days.push(ymd)
  return days
}

// 캘린더(보기 전용): 날짜 칸마다 일정(시각 순) → 할 일(그날 순서) 제목을 잘리지 않게 다 보여 줍니다.
// 시간표·끌어서 옮기기는 없고, 항목을 누르면 달력 바로 아래에서 고칩니다. 칸을 넓게 쓰려고 다른 칸(일정 미루기·목표·루틴)은 달력 아래에 둡니다.
export function CalendarBoard(props: Props) {
  const { view, date, today, first, last, items, goals, allGoals, routines, goalId } = props
  const router = useRouter()
  const [editing, setEditing] = useState<{ value: EditorValue; isNew: boolean } | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  // 편집 칸은 달력 아래에 있으니, 열리면 그쪽으로 스크롤합니다.
  useEffect(() => {
    if (editing) panelRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" })
  }, [editing])

  const go = (nextView: CalendarView, nextDate: string, nextGoal = goalId) =>
    router.push(calendarUrl(nextView, nextDate, nextGoal))

  const step = (direction: 1 | -1) =>
    go(view, view === "month" ? shiftMonth(date, direction) : addDays(date, 7 * direction))

  const byDay = new Map<string, AgendaItem[]>()
  for (const item of items) byDay.set(item.ymd, [...(byDay.get(item.ymd) ?? []), item])
  const days = daysFrom(first, last)
  const month = date.slice(0, 7)

  function openItem(item: AgendaItem) {
    setNotice(null)
    setEditing({
      isNew: false,
      value: {
        kind: item.kind,
        id: item.id,
        title: item.title,
        minutes: item.kind === "task" ? item.end : Math.max(item.end - item.start, 5),
        goalId: item.goalId,
        date: item.ymd,
        start: item.kind === "task" ? null : item.start,
        weekdays: [],
        ideaId: item.ideaId,
        ideaTitle: item.ideaTitle,
      },
    })
  }

  function addOn(ymd: string) {
    setNotice(null)
    setEditing({ isNew: true, value: newEditorValue("task", ymd, null) })
  }

  const title = view === "month" ? formatMonthLabel(`${date.slice(0, 8)}01`) : formatWeekLabel(first)
  const dayProps = { today, goalId, onOpen: openItem, onAdd: addOn }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex min-w-0 flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => go(view, today)}>
            오늘
          </Button>
          <div className="flex">
            <Button type="button" variant="ghost" size="icon-sm" aria-label="이전" onClick={() => step(-1)}>
              <ChevronLeft />
            </Button>
            <Button type="button" variant="ghost" size="icon-sm" aria-label="다음" onClick={() => step(1)}>
              <ChevronRight />
            </Button>
          </div>
          <h2 className="text-base font-semibold tabular-nums">{title}</h2>
          <div className="ml-auto flex items-center gap-2">
            <Button type="button" size="sm" onClick={() => addOn(today)}>
              + 추가
            </Button>
            <div role="group" aria-label="보기" className="flex rounded-lg bg-muted p-0.5">
              {(["week", "month"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  aria-pressed={view === v}
                  onClick={() => go(v, date)}
                  className={cn(
                    "h-7 rounded-md px-3 text-sm",
                    view === v ? "bg-card font-medium shadow-sm" : "text-muted-foreground"
                  )}
                >
                  {v === "week" ? "주간" : "월간"}
                </button>
              ))}
            </div>
          </div>
        </div>

        <Legend />

        {notice && (
          <p role="status" className="text-sm text-muted-foreground">
            {notice}
          </p>
        )}

        <div className="rounded-xl bg-card p-1 ring-1 ring-foreground/10 sm:p-2">
          {view === "week" ? (
            // 주간: PC는 7칸 가로, 휴대폰은 하루씩 세로로 쌓아 제목을 넓게 보여 줍니다.
            <ol className="grid grid-cols-1 md:grid-cols-7">
              {days.map((ymd) => (
                <li
                  key={ymd}
                  className="min-w-0 border-foreground/10 not-last:border-b md:min-h-[26rem] md:not-last:border-r md:not-last:border-b-0"
                >
                  <DayCell ymd={ymd} items={byDay.get(ymd) ?? []} layout="week" {...dayProps} />
                </li>
              ))}
            </ol>
          ) : (
            <div>
              <ol aria-hidden className="grid grid-cols-7 border-b border-foreground/10">
                {[1, 2, 3, 4, 5, 6, 0].map((d) => (
                  <li key={d} className="py-1.5 text-center font-mono text-[11px] text-dim">
                    {WEEKDAYS[d]}
                  </li>
                ))}
              </ol>
              <ol className="grid grid-cols-7">
                {days.map((ymd, index) => (
                  <li
                    key={ymd}
                    className={cn(
                      "min-h-[6.5rem] min-w-0 border-foreground/10 md:min-h-[9rem]",
                      index % 7 !== 6 && "border-r",
                      index < days.length - 7 && "border-b",
                      ymd.slice(0, 7) !== month && "opacity-40"
                    )}
                  >
                    <DayCell ymd={ymd} items={byDay.get(ymd) ?? []} layout="month" {...dayProps} />
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          보기 전용 캘린더예요. 항목을 누르면 고칠 수 있고, 날짜를 누르면 그날 할 일을 추가해요. 할 일 순서는 오늘 화면에서
          끌어서 바꿔요.
        </p>
      </div>

      {editing && (
        <div ref={panelRef} className="w-full max-w-xl scroll-mt-28">
          <Card size="sm">
            <CardHeader>
              <CardTitle>{editing.isNew ? "새로 만들기" : `${KIND_LABELS[editing.value.kind]} 고치기`}</CardTitle>
            </CardHeader>
            <CardContent>
              <ItemEditor
                key={`${editing.value.kind}-${editing.value.id ?? "new"}-${editing.value.date}-${editing.value.start}`}
                value={editing.value}
                goals={goals}
                allowKindChange={editing.isNew}
                onClose={() => setEditing(null)}
                onSaved={(message) => setNotice(message ?? null)}
              />
            </CardContent>
          </Card>
        </div>
      )}

      <div className="grid items-start gap-4 md:grid-cols-2 lg:grid-cols-3">
        <DayOffChat />

        <GoalPanel
          items={items}
          goals={allGoals}
          goalId={goalId}
          rangeLabel={view === "month" ? "이번 달 화면" : "이번 주 화면"}
          onSelect={(id) => go(view, date, id)}
        />

        <RoutinePanel
          routines={routines}
          onAdd={() => setEditing({ isNew: true, value: newEditorValue("routine", null, 9 * 60) })}
          onEdit={(routine) =>
            setEditing({
              isNew: false,
              value: {
                ...newEditorValue("routine", null, routine.start),
                id: routine.id,
                title: routine.title,
                weekdays: routine.weekdays,
                minutes: routine.minutes,
              },
            })
          }
        />
      </div>
    </div>
  )
}

// 날짜 칸 하나: 날짜(누르면 그날 할 일 추가) + 일정·할 일 목록
function DayCell({
  ymd,
  items,
  layout,
  today,
  goalId,
  onOpen,
  onAdd,
}: {
  ymd: string
  items: AgendaItem[]
  layout: "week" | "month"
  today: string
  goalId: string | null
  onOpen: (item: AgendaItem) => void
  onAdd: (ymd: string) => void
}) {
  const isToday = ymd === today
  const week = layout === "week"
  return (
    <div
      className={cn(
        "flex h-full gap-2 p-1.5",
        week ? "flex-row md:flex-col md:p-2" : "flex-col p-1 md:p-1.5",
        isToday && "bg-foreground/[0.06]"
      )}
    >
      <button
        type="button"
        onClick={() => onAdd(ymd)}
        aria-label={`${formatDayLabel(ymd)}에 할 일 추가`}
        className={cn(
          "flex shrink-0 items-baseline gap-1 self-start rounded-sm px-1 text-left hover:bg-foreground/10",
          week && "w-14 flex-col items-start gap-0 md:w-auto md:flex-row md:items-baseline md:gap-1.5"
        )}
      >
        {week && <span className="font-mono text-[11px] text-dim">{WEEKDAYS[new Date(`${ymd}T00:00:00Z`).getUTCDay()]}</span>}
        <span className={cn("font-mono text-sm tabular-nums", isToday && "font-bold underline underline-offset-4")}>
          {Number(ymd.slice(8))}
        </span>
      </button>
      {items.length > 0 ? (
        <ul className="flex min-w-0 flex-1 flex-col gap-1">
          {items.map((item) => (
            <li key={item.key}>
              <CalendarItem item={item} compact={!week} dim={goalId !== null && item.goalId !== goalId} onOpen={onOpen} />
            </li>
          ))}
        </ul>
      ) : (
        week && <p className="self-center text-xs text-dim md:hidden">비어 있어요</p>
      )}
    </div>
  )
}

// 항목 하나. 제목은 줄바꿈으로 끝까지 보여 줍니다(잘리지 않게).
function CalendarItem({
  item,
  compact,
  dim,
  onOpen,
}: {
  item: AgendaItem
  compact: boolean
  dim: boolean
  onOpen: (item: AgendaItem) => void
}) {
  const isTask = item.kind === "task"
  return (
    <button
      type="button"
      onClick={() => onOpen(item)}
      className={cn(
        "flex w-full flex-col items-start rounded-sm px-1.5 py-1 text-left leading-snug transition-opacity",
        compact ? "text-[10px] md:text-xs" : "text-[13px]",
        isTask ? "bg-foreground text-background" : "bg-secondary text-foreground ring-1 ring-foreground/40",
        item.done && "line-through opacity-45",
        dim && "opacity-20"
      )}
    >
      {!isTask && <span className="font-mono text-[0.9em] opacity-75">{formatClock(item.start)}</span>}
      <span className="w-full min-w-0 [overflow-wrap:anywhere]">
        {item.source === "ai" && <Sparkles className="mr-0.5 inline size-3 align-[-2px]" aria-label="AI가 만든 할 일" />}
        {item.title}
      </span>
    </button>
  )
}

function Legend() {
  return (
    <ul className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground" aria-label="범례">
      <li className="flex items-center gap-1.5">
        <span aria-hidden className="size-3 rounded-sm bg-foreground" />
        {KIND_LABELS.task}
      </li>
      <li className="flex items-center gap-1.5">
        <span aria-hidden className="size-3 rounded-sm bg-secondary ring-1 ring-foreground/40" />
        {KIND_LABELS.event}
      </li>
      <li className="flex items-center gap-1">
        <Sparkles className="size-3" aria-hidden />
        AI가 만든 할 일
      </li>
    </ul>
  )
}

// 목표별로 보이는 기간에 무엇이 잡혀 있는지
function GoalPanel({
  items,
  goals,
  goalId,
  rangeLabel,
  onSelect,
}: {
  items: AgendaItem[]
  goals: GoalOption[]
  goalId: string | null
  rangeLabel: string
  onSelect: (goalId: string | null) => void
}) {
  const tasks = items.filter((i) => i.kind === "task")
  const summary = goals
    .map((goal) => {
      const own = tasks.filter((t) => t.goalId === goal.id)
      const total = own.reduce((sum, t) => sum + (t.end - t.start), 0)
      const done = own.filter((t) => t.done).reduce((sum, t) => sum + (t.end - t.start), 0)
      return { goal, own, total, done }
    })
    .filter((s) => s.own.length > 0 || s.goal.id === goalId)
  const selected = summary.find((s) => s.goal.id === goalId)

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>목표별 보기</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <select
          value={goalId ?? ""}
          onChange={(e) => onSelect(e.target.value || null)}
          className={selectClass}
          aria-label="목표 고르기"
        >
          <option value="">모든 항목 보기</option>
          {goals.map((g) => (
            <option key={g.id} value={g.id}>
              {g.title}
            </option>
          ))}
        </select>

        {selected ? (
          <div className="flex flex-col gap-2">
            <p className="text-xs text-muted-foreground">
              {rangeLabel}: {selected.own.length}개 · {formatDuration(selected.total)} · 완료{" "}
              {formatDuration(selected.done)}
            </p>
            <ul className="flex max-h-72 flex-col gap-1 overflow-y-auto text-sm">
              {selected.own.map((t) => (
                <li key={t.key} className={cn("flex gap-2", t.done && "text-muted-foreground line-through")}>
                  <span className="w-12 shrink-0 text-xs text-muted-foreground tabular-nums">
                    {t.ymd.slice(5).replace("-", "/")}
                  </span>
                  <span className="min-w-0 break-words">{t.title}</span>
                </li>
              ))}
              {selected.own.length === 0 && <li className="text-xs text-muted-foreground">이 기간에 잡힌 할 일이 없어요.</li>}
            </ul>
          </div>
        ) : summary.length > 0 ? (
          <ul className="flex flex-col gap-1.5 text-sm">
            {summary.map((s) => (
              <li key={s.goal.id}>
                <button type="button" onClick={() => onSelect(s.goal.id)} className="flex w-full justify-between gap-2 text-left hover:underline">
                  <span className="min-w-0 truncate">{s.goal.title}</span>
                  <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                    {s.own.length}개 · {formatDuration(s.total)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-muted-foreground">{rangeLabel}에 목표와 연결된 할 일이 없어요.</p>
        )}
      </CardContent>
    </Card>
  )
}

function RoutinePanel({
  routines,
  onAdd,
  onEdit,
}: {
  routines: RoutineRow[]
  onAdd: () => void
  onEdit: (routine: RoutineRow) => void
}) {
  const ORDER = [1, 2, 3, 4, 5, 6, 0]
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>루틴</CardTitle>
        <CardAction>
          <Button type="button" size="xs" variant="outline" onClick={onAdd}>
            + 추가
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        {routines.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            매일 아침 뉴스 30분처럼 반복되는 습관을 적어 두는 곳이에요. 달력 칸에는 보이지 않고 여기에서만 보여요.
          </p>
        ) : (
          <ul className="flex flex-col gap-1.5 text-sm">
            {routines.map((r) => (
              <li key={r.id}>
                <button type="button" onClick={() => onEdit(r)} className="flex w-full flex-col text-left hover:underline">
                  <span>{r.title}</span>
                  <span className="text-xs text-muted-foreground">
                    {ORDER.filter((d) => r.weekdays.includes(d)).map((d) => WEEKDAYS[d]).join("")} ·{" "}
                    {formatClock(r.start)}~{formatClock(r.start + r.minutes)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
