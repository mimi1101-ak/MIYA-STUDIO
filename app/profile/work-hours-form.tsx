"use client"

import { useState, useTransition, type FormEvent } from "react"

import { WeekdayPicker } from "@/components/weekday-picker"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { formatClock, parseClock } from "@/lib/date"

import { updateWorkHours } from "./actions"

export function WorkHoursForm({
  initialDays,
  initialStart,
  initialEnd,
}: {
  initialDays: number[]
  initialStart: number
  initialEnd: number
}) {
  const [days, setDays] = useState(initialDays)
  const [start, setStart] = useState(formatClock(initialStart))
  const [end, setEnd] = useState(formatClock(initialEnd))
  const [message, setMessage] = useState<{ type: "ok" | "error"; text: string } | null>(null)
  const [pending, startTransition] = useTransition()

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setMessage(null)
    const startMinutes = parseClock(start)
    const endMinutes = parseClock(end)
    if (days.length === 0) return setMessage({ type: "error", text: "요일을 하나 이상 골라 주세요." })
    if (startMinutes === null || endMinutes === null) {
      return setMessage({ type: "error", text: "시각을 확인해 주세요." })
    }
    startTransition(async () => {
      const result = await updateWorkHours(days, startMinutes, endMinutes)
      setMessage(
        result.ok
          ? { type: "ok", text: "저장했어요. 앞으로 자동 배치는 이 시간 안에서만 해요." }
          : { type: "error", text: result.error }
      )
    })
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium">요일</span>
        <WeekdayPicker value={days} onChange={setDays} label="일하는 요일" />
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="work-start">시작</Label>
          <Input
            id="work-start"
            type="time"
            step={300}
            value={start}
            onChange={(e) => setStart(e.target.value)}
            className="w-32"
          />
        </div>
        <span className="pb-2 text-muted-foreground">~</span>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="work-end">끝</Label>
          <Input
            id="work-end"
            type="time"
            step={300}
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            className="w-32"
          />
        </div>
        <Button type="submit" disabled={pending}>
          {pending ? "저장 중…" : "저장"}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        점심시간처럼 빼고 싶은 시간은 캘린더에서 루틴으로 넣어 두면 그 시간은 비워 둬요.
      </p>
      {message && (
        <p
          role={message.type === "error" ? "alert" : "status"}
          className={message.type === "error" ? "text-sm text-destructive" : "text-sm text-muted-foreground"}
        >
          {message.text}
        </p>
      )}
    </form>
  )
}
