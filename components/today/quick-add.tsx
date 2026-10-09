"use client"

import { useState, useTransition, type FormEvent } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { KIND_LABELS } from "@/lib/agenda-types"
import { formatClock, formatDayLabel, formatDuration } from "@/lib/date"
import { planQuickInput } from "@/lib/quick-parse"
import { quickAdd } from "@/lib/schedule-actions"
import { cn } from "@/lib/utils"
import { LIMITS } from "@/lib/validation"

type Override = "task" | "event" | null

// 한 줄로 할 일/일정 추가. 적는 동안 어떻게 저장될지 미리 보여 줍니다.
export function QuickAdd({ today, now }: { today: string; now: number }) {
  const [text, setText] = useState("")
  const [override, setOverride] = useState<Override>(null)
  const [message, setMessage] = useState<{ type: "ok" | "error"; text: string } | null>(null)
  const [pending, startTransition] = useTransition()

  const plan = text.trim() ? planQuickInput(text, today, now, override) : null

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!plan) return
    setMessage(null)
    startTransition(async () => {
      const result = await quickAdd(text, override)
      if (result.ok) {
        setText("")
        setOverride(null)
        setMessage({ type: "ok", text: result.message ?? "추가했어요." })
      } else {
        setMessage({ type: "error", text: result.error })
      }
    })
  }

  const when = plan
    ? [
        plan.date ? formatDayLabel(plan.date) : "가장 가까운 빈 시간",
        plan.start !== null ? formatClock(plan.start) : plan.date ? "빈 시간" : null,
      ]
        .filter(Boolean)
        .join(" ")
    : ""

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2">
      <div className="flex gap-2">
        <Input
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            setMessage(null)
          }}
          maxLength={LIMITS.taskTitle}
          placeholder="예: 금요일 3시 치과 · 보고서 초안 2시간"
          aria-label="빠른 입력"
          aria-describedby="quick-add-preview"
          className="h-11"
        />
        <Button type="submit" className="h-11 px-5" disabled={!plan || pending}>
          {pending ? "추가 중…" : "추가"}
        </Button>
      </div>

      <div id="quick-add-preview" className="flex min-h-7 flex-wrap items-center gap-2 text-xs text-dim">
        {plan ? (
          <>
            <div role="group" aria-label="종류 바꾸기" className="flex gap-1">
              {(["task", "event"] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  aria-pressed={plan.kind === k}
                  onClick={() => setOverride(k)}
                  className={cn(
                    "h-7 rounded-sm px-2.5 ring-1 ring-foreground/15",
                    plan.kind === k ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {KIND_LABELS[k]}
                </button>
              ))}
            </div>
            <span>
              {when} · {formatDuration(plan.minutes)} · “{plan.title}”
            </span>
          </>
        ) : message ? (
          <span role={message.type === "error" ? "alert" : "status"} className={cn(message.type === "error" && "text-destructive")}>
            {message.text}
          </span>
        ) : (
          <span>시각이 있으면 일정, 없으면 할 일로 넣어요. 할 일은 빈 시간에 자동으로 들어가요.</span>
        )}
      </div>
    </form>
  )
}
