"use client"

import { useId, useState, useTransition, type FormEvent } from "react"

import { WeekdayPicker } from "@/components/weekday-picker"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { KIND_LABELS, type GoalOption, type ItemKind } from "@/lib/agenda-types"
import { formatClock, formatDuration, parseClock } from "@/lib/date"
import {
  addEvent,
  addRoutine,
  addTask,
  deleteEvent,
  deleteRoutine,
  deleteTask,
  updateEvent,
  updateRoutine,
  updateTask,
} from "@/lib/schedule-actions"
import { cn } from "@/lib/utils"
import { LIMITS, type ActionResult } from "@/lib/validation"

// 할 일·일정·루틴을 추가하거나 고치는 작은 양식. "오늘"과 캘린더에서 함께 씁니다.

export type EditorValue = {
  kind: ItemKind
  id: string | null
  title: string
  minutes: number
  goalId: string | null
  date: string | null
  start: number | null
  weekdays: number[]
}

export function newEditorValue(kind: ItemKind, date: string | null, start: number | null): EditorValue {
  return {
    kind,
    id: null,
    title: "",
    minutes: kind === "task" ? 30 : 60,
    goalId: null,
    date,
    start,
    weekdays: [1, 2, 3, 4, 5],
  }
}

const DURATIONS = [10, 15, 20, 30, 45, 60, 90, 120, 150, 180, 240, 300, 360, 480, 600, 720]

export const selectClass =
  "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"

export function ItemEditor({
  value,
  goals,
  allowKindChange = false,
  onClose,
  onSaved,
}: {
  value: EditorValue
  goals: GoalOption[]
  allowKindChange?: boolean
  onClose: () => void
  onSaved?: (message?: string) => void
}) {
  const [kind, setKind] = useState<ItemKind>(value.kind)
  const [title, setTitle] = useState(value.title)
  const [minutes, setMinutes] = useState(value.minutes)
  const [goalId, setGoalId] = useState(value.goalId ?? "")
  const [date, setDate] = useState(value.date ?? "")
  const [time, setTime] = useState(value.start === null ? "" : formatClock(value.start))
  const [weekdays, setWeekdays] = useState(value.weekdays)
  const [error, setError] = useState("")
  const [pending, startTransition] = useTransition()
  const uid = useId()

  const durations = DURATIONS.includes(minutes) ? DURATIONS : [...DURATIONS, minutes].sort((a, b) => a - b)
  const isNew = value.id === null

  function run(action: () => Promise<ActionResult>) {
    setError("")
    startTransition(async () => {
      const result = await action()
      if (!result.ok) return setError(result.error)
      onSaved?.(result.message)
      onClose()
    })
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const cleanTitle = title.trim()
    if (!cleanTitle) return setError("제목을 입력해 주세요.")
    const start = time ? parseClock(time) : null
    if (time && start === null) return setError("시각을 확인해 주세요.")
    const id = value.id

    if (kind === "task") {
      if (start !== null && !date) return setError("시각을 정하려면 날짜도 골라 주세요.")
      const input = { title: cleanTitle, minutes, goalId: goalId || null, date: date || null, start }
      return run(() => (id ? updateTask(id, input) : addTask(input)))
    }
    if (start === null) return setError("시작 시각을 골라 주세요.")
    if (kind === "event") {
      if (!date) return setError("날짜를 골라 주세요.")
      const input = { title: cleanTitle, date, start, minutes }
      return run(() => (id ? updateEvent(id, input) : addEvent(input)))
    }
    if (weekdays.length === 0) return setError("반복할 요일을 하나 이상 골라 주세요.")
    if (start + minutes > 24 * 60) return setError("루틴은 자정을 넘길 수 없어요.")
    const input = { title: cleanTitle, weekdays, start, minutes }
    return run(() => (id ? updateRoutine(id, input) : addRoutine(input)))
  }

  function handleDelete() {
    const id = value.id
    if (!id || !window.confirm(`"${value.title}"을(를) 삭제할까요?`)) return
    run(() => (kind === "task" ? deleteTask(id) : kind === "event" ? deleteEvent(id) : deleteRoutine(id)))
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 rounded-lg bg-muted/50 p-3">
      {allowKindChange && isNew && (
        <div role="group" aria-label="종류" className="flex gap-1">
          {(["task", "event", "routine"] as const).map((k) => (
            <button
              key={k}
              type="button"
              aria-pressed={kind === k}
              onClick={() => {
                setKind(k)
                if (k !== "task" && !time) setTime("09:00")
              }}
              className={cn(
                "h-7 rounded-md px-3 text-xs ring-1 ring-foreground/10",
                kind === k ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground"
              )}
            >
              {KIND_LABELS[k]}
            </button>
          ))}
        </div>
      )}

      <Input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        maxLength={LIMITS.taskTitle}
        placeholder={`${KIND_LABELS[kind]} 제목`}
        aria-label={`${KIND_LABELS[kind]} 제목`}
        autoFocus
      />

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {kind === "routine" ? (
          <div className="col-span-2 flex flex-col gap-1">
            <Label className="text-xs text-muted-foreground">반복 요일</Label>
            <WeekdayPicker value={weekdays} onChange={setWeekdays} label="반복 요일" />
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            <Label htmlFor={`${uid}-date`} className="text-xs text-muted-foreground">
              날짜{kind === "task" && " (선택)"}
            </Label>
            <Input id={`${uid}-date`} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
        )}
        <div className="flex flex-col gap-1">
          <Label htmlFor={`${uid}-time`} className="text-xs text-muted-foreground">
            시작{kind === "task" && " (선택)"}
          </Label>
          <Input id={`${uid}-time`} type="time" step={300} value={time} onChange={(e) => setTime(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor={`${uid}-minutes`} className="text-xs text-muted-foreground">
            {kind === "task" ? "예상 시간" : "길이"}
          </Label>
          <select
            id={`${uid}-minutes`}
            value={minutes}
            onChange={(e) => setMinutes(Number(e.target.value))}
            className={selectClass}
          >
            {durations.map((m) => (
              <option key={m} value={m}>
                {formatDuration(m)}
              </option>
            ))}
          </select>
        </div>
        {kind === "task" && (
          <div className="flex flex-col gap-1">
            <Label htmlFor={`${uid}-goal`} className="text-xs text-muted-foreground">
              목표
            </Label>
            <select
              id={`${uid}-goal`}
              value={goalId}
              onChange={(e) => setGoalId(e.target.value)}
              className={selectClass}
            >
              <option value="">연결 안 함</option>
              {goals.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.title}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {kind === "task" && (
        <p className="text-xs text-muted-foreground">
          시작 시각을 비워 두면 일할 수 있는 시간 중 빈 시간에 자동으로 넣어요.
        </p>
      )}

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "저장 중…" : isNew ? "추가" : "저장"}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onClose} disabled={pending}>
          취소
        </Button>
        {!isNew && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={handleDelete}
            disabled={pending}
            className="ml-auto text-muted-foreground hover:text-destructive"
          >
            삭제
          </Button>
        )}
      </div>
    </form>
  )
}
