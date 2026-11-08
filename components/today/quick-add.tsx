"use client"

import { useRef, useState, useTransition, type FormEvent } from "react"

import { SectionLabel } from "@/components/space-ui"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { quickAdd } from "@/lib/schedule-actions"
import { cn } from "@/lib/utils"
import { LIMITS } from "@/lib/validation"

type Day = "today" | "tomorrow"

const DAY_LABELS: Record<Day, string> = { today: "오늘", tomorrow: "내일" }

// 한 줄로 오늘·내일 할 일 추가. 적은 그대로 제목이 되고, 그날 목록 맨 아래에 붙습니다.
export function QuickAdd() {
  const [day, setDay] = useState<Day>("today")
  const [text, setText] = useState("")
  const [message, setMessage] = useState<{ type: "ok" | "error"; text: string } | null>(null)
  const [pending, startTransition] = useTransition()
  const inputRef = useRef<HTMLInputElement>(null)

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!text.trim()) return
    setMessage(null)
    startTransition(async () => {
      const result = await quickAdd(text, day)
      if (result.ok) {
        setText("")
        setMessage({ type: "ok", text: result.message ?? "추가했어요." })
        // 여러 개를 연달아 적을 수 있게 입력 칸에 그대로 둡니다.
        inputRef.current?.focus()
      } else {
        setMessage({ type: "error", text: result.error })
      }
    })
  }

  return (
    <section aria-label="빠른 입력" className="flex flex-col gap-3 rounded-xl bg-card p-4 ring-1 ring-foreground/10 md:p-5">
      <SectionLabel code="INPUT">빠른 입력</SectionLabel>
      <form onSubmit={handleSubmit} className="flex flex-col gap-2">
        <div className="flex flex-col gap-2 sm:flex-row">
          <div role="group" aria-label="언제 할 일인지" className="flex shrink-0 gap-1">
            {(["today", "tomorrow"] as const).map((d) => (
              <button
                key={d}
                type="button"
                aria-pressed={day === d}
                onClick={() => {
                  setDay(d)
                  setMessage(null)
                  inputRef.current?.focus()
                }}
                className={cn(
                  "h-11 flex-1 rounded-sm px-4 text-sm ring-1 ring-foreground/15 sm:flex-none",
                  day === d ? "bg-primary font-medium text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {DAY_LABELS[d]}
              </button>
            ))}
          </div>
          <div className="flex min-w-0 flex-1 gap-2">
            <Input
              ref={inputRef}
              value={text}
              onChange={(e) => {
                setText(e.target.value)
                setMessage(null)
              }}
              maxLength={LIMITS.taskTitle}
              placeholder={`${DAY_LABELS[day]} 할 일 · 예: 보고서 초안 쓰기`}
              aria-label={`${DAY_LABELS[day]} 할 일`}
              aria-describedby="quick-add-status"
              className="h-11 min-w-0"
            />
            <Button type="submit" className="h-11 shrink-0 px-5" disabled={!text.trim() || pending}>
              {pending ? "추가 중…" : "추가"}
            </Button>
          </div>
        </div>
        <p
          id="quick-add-status"
          role={message?.type === "error" ? "alert" : "status"}
          className={cn("min-h-5 text-xs text-dim", message?.type === "error" && "text-destructive")}
        >
          {message ? message.text : `${DAY_LABELS[day]} 할 일 목록 맨 아래에 들어가요.`}
        </p>
      </form>
    </section>
  )
}
