"use client"

import type {
  DateSelectArg,
  EventClickArg,
  EventContentArg,
  EventDropArg,
  EventInput,
} from "@fullcalendar/core"
import koLocale from "@fullcalendar/core/locales/ko"
import dayGridPlugin from "@fullcalendar/daygrid"
import interactionPlugin, { type EventResizeDoneArg } from "@fullcalendar/interaction"
import FullCalendar from "@fullcalendar/react"
import timeGridPlugin from "@fullcalendar/timegrid"
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
import type { WorkHours } from "@/lib/schedule"
import { moveItem } from "@/lib/schedule-actions"
import { cn } from "@/lib/utils"

type Props = {
  view: CalendarView
  date: string
  today: string
  nowMinutes: number
  first: string
  last: string
  items: AgendaItem[]
  goals: GoalOption[]
  allGoals: GoalOption[]
  routines: RoutineRow[]
  work: WorkHours
  goalId: string | null
}

// 종류별 색(우주 팔레트): 할 일은 별빛 바탕에 검은 글자, 일정은 어두운 바탕에 흰 테두리, 루틴은 점선 테두리
const KIND_COLORS: Record<AgendaItem["kind"], { bg: string; border: string; text: string }> = {
  task: { bg: "#f3f3f1", border: "#f3f3f1", text: "#040405" },
  event: { bg: "#1b1b1f", border: "#a6a6ab", text: "#f3f3f1" },
  routine: { bg: "#0b0b0d", border: "#808086", text: "#a6a6ab" },
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

// FullCalendar는 시간대를 UTC로 두고 "한국 시각 그대로"를 넣고 받습니다(기기 시간대와 상관없이 한국 시간으로 보이게).
function toWallClock(ymd: string, minutes: number): string {
  return minutes >= 24 * 60 ? `${addDays(ymd, 1)}T00:00:00` : `${ymd}T${formatClock(minutes)}:00`
}

function fromWallClock(date: Date): { ymd: string; minutes: number } {
  return { ymd: date.toISOString().slice(0, 10), minutes: date.getUTCHours() * 60 + date.getUTCMinutes() }
}

export function CalendarBoard(props: Props) {
  const { view, date, today, nowMinutes, items, goals, allGoals, routines, work, goalId } = props
  const router = useRouter()
  const [editing, setEditing] = useState<{ value: EditorValue; isNew: boolean } | null>(null)
  const [notice, setNotice] = useState<{ type: "ok" | "error"; text: string } | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  // 휴대폰에서는 편집 칸이 캘린더 아래에 있으니, 열리면 그쪽으로 스크롤합니다.
  useEffect(() => {
    if (editing) panelRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" })
  }, [editing])

  const go = (nextView: CalendarView, nextDate: string, nextGoal = goalId) =>
    router.push(calendarUrl(nextView, nextDate, nextGoal))

  const step = (direction: 1 | -1) =>
    go(view, view === "month" ? shiftMonth(date, direction) : addDays(date, 7 * direction))

  // 보이는 시간대: 일할 시간과 항목을 모두 담도록 (최소 8시~20시)
  const timed = items.filter((i) => i.start > 0 || i.end < 24 * 60)
  const minHour = Math.floor(Math.min(work.start, 8 * 60, ...timed.map((i) => i.start)) / 60)
  const maxHour = Math.ceil(Math.max(work.end, 20 * 60, ...timed.map((i) => i.end)) / 60)

  const events: EventInput[] = items.map((item) => {
    const colors = KIND_COLORS[item.kind]
    const splitPiece = item.kind === "event" && (item.start === 0 || item.end === 24 * 60)
    const movable = item.kind === "task" || (item.kind === "event" && !splitPiece)
    return {
      id: item.key,
      title: item.title,
      start: toWallClock(item.ymd, item.start),
      end: toWallClock(item.ymd, item.end),
      editable: movable,
      backgroundColor: colors.bg,
      borderColor: colors.border,
      textColor: colors.text,
      classNames: [
        `ev-${item.kind}`,
        item.done ? "ev-done" : "",
        goalId && item.goalId !== goalId ? "ev-dim" : "",
      ].filter(Boolean),
      extendedProps: { item },
    }
  })

  function openItem(item: AgendaItem) {
    setNotice(null)
    if (item.kind === "routine") {
      const routine = routines.find((r) => r.id === item.id)
      if (!routine) return
      return setEditing({
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
    setEditing({
      isNew: false,
      value: {
        kind: item.kind,
        id: item.id,
        title: item.title,
        minutes: Math.max(item.end - item.start, 5),
        goalId: item.goalId,
        date: item.ymd,
        start: item.start,
        weekdays: [],
      },
    })
  }

  function handleSelect(info: DateSelectArg) {
    setNotice(null)
    const start = fromWallClock(info.start)
    const minutes = Math.round((info.end.getTime() - info.start.getTime()) / 60_000)
    const value = newEditorValue("task", start.ymd, info.allDay ? null : start.minutes)
    if (!info.allDay && minutes >= 15 && minutes <= 720) value.minutes = minutes
    setEditing({ isNew: true, value })
  }

  async function handleMove(info: EventDropArg | EventResizeDoneArg) {
    const item = info.event.extendedProps.item as AgendaItem
    const startDate = info.event.start
    if (!startDate || item.kind === "routine") return info.revert()
    const endDate = info.event.end ?? new Date(startDate.getTime() + (item.end - item.start) * 60_000)
    const start = fromWallClock(startDate)
    const minutes = Math.round((endDate.getTime() - startDate.getTime()) / 60_000)
    setNotice(null)
    const result = await moveItem(item.kind, item.id, start.ymd, start.minutes, minutes)
    if (!result.ok) {
      info.revert()
      setNotice({ type: "error", text: result.error })
    } else {
      setNotice({
        type: "ok",
        text: `'${item.title}'을(를) ${formatDayLabel(start.ymd)} ${formatClock(start.minutes)}로 옮겼어요.`,
      })
    }
  }

  const title = view === "month" ? formatMonthLabel(`${date.slice(0, 8)}01`) : formatWeekLabel(props.first)

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
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
          <div role="group" aria-label="보기" className="ml-auto flex rounded-lg bg-muted p-0.5">
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

        <Legend />

        {notice && (
          <p
            role={notice.type === "error" ? "alert" : "status"}
            className={cn("text-sm", notice.type === "error" ? "text-destructive" : "text-muted-foreground")}
          >
            {notice.text}
          </p>
        )}

        <div className="min-h-[28rem] rounded-xl bg-card p-1 ring-1 ring-foreground/10 sm:p-2">
          <div>
            <FullCalendar
              key={`${view}-${date}`}
              plugins={[timeGridPlugin, dayGridPlugin, interactionPlugin]}
              initialView={view === "month" ? "dayGridMonth" : "timeGridWeek"}
              initialDate={date}
              timeZone="UTC"
              now={toWallClock(today, nowMinutes)}
              locale={koLocale}
              firstDay={1}
              headerToolbar={false}
              height="auto"
              allDaySlot={false}
              nowIndicator
              slotMinTime={`${String(minHour).padStart(2, "0")}:00:00`}
              slotMaxTime={`${String(maxHour).padStart(2, "0")}:00:00`}
              slotDuration="00:30:00"
              snapDuration="00:15:00"
              slotLabelFormat={{ hour: "numeric", minute: "2-digit", hour12: false }}
              eventTimeFormat={{ hour: "2-digit", minute: "2-digit", hour12: false }}
              businessHours={{
                daysOfWeek: work.days,
                startTime: formatClock(work.start),
                endTime: formatClock(work.end),
              }}
              dayMaxEvents={view === "month" ? 4 : false}
              eventDisplay="block"
              events={events}
              editable
              eventDurationEditable
              selectable
              selectMirror
              longPressDelay={350}
              select={handleSelect}
              eventClick={(info: EventClickArg) => openItem(info.event.extendedProps.item as AgendaItem)}
              eventDrop={handleMove}
              eventResize={handleMove}
              eventContent={renderEvent}
              dayHeaderContent={(arg) =>
                view === "week" ? (
                  <span className="flex flex-col items-center leading-tight">
                    <span className="text-[0.7rem] text-muted-foreground">{WEEKDAYS[arg.date.getUTCDay()]}</span>
                    <span className="text-sm font-semibold">{arg.date.getUTCDate()}</span>
                  </span>
                ) : (
                  WEEKDAYS[arg.date.getUTCDay()]
                )
              }
            />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          빈 칸을 누르거나 끌어서 새 항목을 만들고, 항목을 끌어 시간·날짜를 옮기거나 아래 끝을 끌어 길이를 바꿔요.
          휴대폰에서는 길게 누른 뒤 끌어요. 회색 바탕은 일할 수 있는 시간이에요.
        </p>
      </div>

      <div ref={panelRef} className="flex flex-col gap-4">
        {editing ? (
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
                onSaved={(message) => setNotice(message ? { type: "ok", text: message } : null)}
              />
            </CardContent>
          </Card>
        ) : (
          <Button
            type="button"
            onClick={() => setEditing({ isNew: true, value: newEditorValue("task", today, null) })}
          >
            + 할 일·일정·루틴 추가
          </Button>
        )}

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

function renderEvent(arg: EventContentArg) {
  const item = arg.event.extendedProps.item as AgendaItem
  return (
    <div className="flex min-w-0 flex-col overflow-hidden px-0.5 leading-tight">
      <span className="truncate text-[0.7rem] opacity-80">{arg.timeText}</span>
      <span className="flex min-w-0 items-center gap-0.5 font-medium">
        {item.source === "ai" && <Sparkles className="size-3 shrink-0" aria-label="AI가 만든 할 일" />}
        <span className="truncate">{arg.event.title}</span>
      </span>
    </div>
  )
}

function Legend() {
  return (
    <ul className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground" aria-label="범례">
      {(["task", "event", "routine"] as const).map((kind) => (
        <li key={kind} className="flex items-center gap-1.5">
          <span
            aria-hidden
            className={cn("size-3 rounded-sm border", kind === "routine" && "border-dashed")}
            style={{ backgroundColor: KIND_COLORS[kind].bg, borderColor: KIND_COLORS[kind].border }}
          />
          {KIND_LABELS[kind]}
        </li>
      ))}
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
                  <span className="w-20 shrink-0 text-xs text-muted-foreground tabular-nums">
                    {t.ymd.slice(5).replace("-", "/")} {formatClock(t.start)}
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
            매일 아침 뉴스 30분, 점심시간처럼 반복되는 습관을 넣어 두면 그 시간은 비워 두고 할 일을 배치해요.
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
