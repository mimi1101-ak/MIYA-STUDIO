"use client"

import Link from "next/link"
import { useState, useTransition, type FormEvent } from "react"

import { SectionLabel } from "@/components/space-ui"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { formatDayLabel, formatMonthLabel } from "@/lib/date"
import { addTask, deleteTask, setTaskDone } from "@/lib/schedule-actions"
import type { ActionResult } from "@/lib/validation"
import { cn } from "@/lib/utils"
import { LIMITS } from "@/lib/validation"

export type MonthTask = { id: string; title: string; ymd: string; done: boolean }

const DEFAULT_MINUTES = 30

// 다음 달 할 일: 다음 달 날짜에 잡힌 실제 할 일. 날짜를 골라 넣으면 그날 목록 맨 아래에 들어가고,
// 그날이 되면 오늘 화면·캘린더에 그대로 나옵니다. 자세히 고치기는 캘린더에서.
export function NextMonthTasks({ month, lastDay, tasks }: { month: string; lastDay: string; tasks: MonthTask[] }) {
  const [title, setTitle] = useState("")
  const [date, setDate] = useState(month)
  const [error, setError] = useState("")
  const [pending, startTransition] = useTransition()

  function run(action: () => Promise<ActionResult>, after?: () => void) {
    setError("")
    startTransition(async () => {
      const result = await action()
      if (!result.ok) return setError(result.error)
      after?.()
    })
  }

  function handleAdd(event: FormEvent) {
    event.preventDefault()
    if (!title.trim() || !date) return
    run(() => addTask({ title, minutes: DEFAULT_MINUTES, goalId: null, date }), () => setTitle(""))
  }

  // 날짜별로 묶기(이미 날짜·순서대로 옴)
  const days: { ymd: string; tasks: MonthTask[] }[] = []
  for (const t of tasks) {
    const last = days[days.length - 1]
    if (last?.ymd === t.ymd) last.tasks.push(t)
    else days.push({ ymd: t.ymd, tasks: [t] })
  }
  const doneCount = tasks.filter((t) => t.done).length
  const label = formatMonthLabel(month)

  return (
    <section aria-label="다음 달 할 일" className="flex flex-col gap-4 rounded-xl bg-card p-5 ring-1 ring-foreground/10">
      <div className="flex flex-col gap-1.5">
        <SectionLabel code="TODO">다음 달 할 일</SectionLabel>
        <div className="flex min-h-7 items-center justify-between gap-2">
          <p className="font-mono text-xs text-muted-foreground tabular-nums">{label}</p>
          {tasks.length > 0 && (
            <p className="font-mono text-[13px] tabular-nums">
              {doneCount} / {tasks.length}
            </p>
          )}
        </div>
      </div>

      {days.length > 0 ? (
        <div className={cn("flex flex-col gap-3", pending && "opacity-60")}>
          {days.map((day) => (
            <div key={day.ymd} className="flex flex-col">
              <p className="font-mono text-[11px] tracking-[0.08em] text-dim">{formatDayLabel(day.ymd)}</p>
              <ul className="flex flex-col">
                {day.tasks.map((t) => (
                  <li key={t.id} className="flex items-start gap-2.5 border-b border-foreground/[0.07] py-2 last:border-b-0">
                    <Checkbox
                      className="mt-0.5"
                      checked={t.done}
                      disabled={pending}
                      onCheckedChange={(checked) => run(() => setTaskDone(t.id, checked))}
                      aria-label={`${t.title} 완료 표시`}
                    />
                    <span
                      className={cn(
                        "min-w-0 flex-1 text-sm leading-5 break-words",
                        t.done && "text-dim line-through decoration-foreground/40"
                      )}
                    >
                      {t.title}
                    </span>
                    <Button
                      type="button"
                      size="xs"
                      variant="ghost"
                      className="-my-0.5 text-muted-foreground hover:text-destructive"
                      disabled={pending}
                      onClick={() => {
                        if (window.confirm(`'${t.title}'을(를) 지울까요?`)) run(() => deleteTask(t.id))
                      }}
                    >
                      삭제
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{label}에 잡힌 할 일이 없어요.</p>
      )}

      <form onSubmit={handleAdd} className="flex flex-col gap-2">
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={LIMITS.taskTitle}
          placeholder="예: 연말 정산 서류 모으기"
          aria-label={`${label} 할 일 추가`}
          className="h-9 min-w-0"
        />
        <div className="flex gap-2">
          <Input
            type="date"
            value={date}
            min={month}
            max={lastDay}
            onChange={(e) => setDate(e.target.value)}
            aria-label="할 날짜"
            className="h-9 min-w-0 flex-1 [color-scheme:dark]"
          />
          <Button type="submit" size="sm" className="h-9 shrink-0 px-3" disabled={pending || !title.trim() || !date}>
            추가
          </Button>
        </div>
      </form>

      <Link
        href={`/calendar?view=month&date=${month}`}
        className="text-[13px] text-muted-foreground hover:text-foreground"
      >
        캘린더에서 {label} 보기 →
      </Link>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </section>
  )
}
