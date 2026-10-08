"use client"

import { Sparkles } from "lucide-react"
import { useState, useTransition } from "react"

import { Button } from "@/components/ui/button"
import { formatDayLabel, formatDuration } from "@/lib/date"
import type { GoalPlan } from "@/lib/goal-ai"

import { approvePlan } from "./actions"

// AI가 만든 계획안 (월 → 주 → 일). 승인하면 할 일이 빈 시간에 들어갑니다.
export function PlanView({ goalId, plan, approved }: { goalId: string; plan: GoalPlan; approved: boolean }) {
  const [message, setMessage] = useState<{ type: "ok" | "error"; text: string } | null>(null)
  const [pending, startTransition] = useTransition()

  const tasks = plan.months.flatMap((m) => m.weeks.flatMap((w) => w.tasks))
  const total = tasks.reduce((sum, t) => sum + t.minutes, 0)

  function approve() {
    if (
      approved &&
      !window.confirm("아직 안 끝낸 AI 할 일을 지금 계획안으로 바꿔 넣을까요? 끝낸 할 일은 그대로 남아요.")
    ) {
      return
    }
    setMessage(null)
    startTransition(async () => {
      const result = await approvePlan(goalId)
      setMessage(
        result.ok
          ? { type: "ok", text: `${result.message ?? "일정에 넣었어요."} 오늘 화면과 캘린더에서 확인해 보세요.` }
          : { type: "error", text: result.error }
      )
    })
  }

  return (
    <section aria-label="계획안" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="flex items-center gap-1.5 text-base font-semibold">
          <Sparkles className="size-4" aria-hidden />
          AI 계획안
        </h2>
        <p className="text-sm text-muted-foreground">
          할 일 {tasks.length}개 · 모두 {formatDuration(total)}
        </p>
        {plan.summary && <p className="text-sm leading-relaxed">{plan.summary}</p>}
      </div>

      <div className="flex flex-col gap-3">
        {plan.months.map((month, mi) => (
          <div key={mi} className="flex flex-col gap-2 rounded-lg bg-card p-3 ring-1 ring-foreground/10">
            <div>
              <h3 className="text-sm font-semibold">{month.label}</h3>
              {month.focus && <p className="text-xs text-muted-foreground">{month.focus}</p>}
            </div>
            {month.weeks.map((week, wi) => {
              const minutes = week.tasks.reduce((sum, t) => sum + t.minutes, 0)
              return (
                <details key={wi} open={mi === 0 && wi === 0} className="group rounded-md bg-muted/50 px-3 py-2">
                  <summary className="cursor-pointer text-sm">
                    <span className="font-medium">{week.label}</span>
                    <span className="text-xs text-muted-foreground">
                      {" "}
                      · {week.tasks.length}개 · {formatDuration(minutes)}
                    </span>
                    {week.focus && <span className="block text-xs text-muted-foreground">{week.focus}</span>}
                  </summary>
                  <ul className="mt-2 flex flex-col gap-1">
                    {week.tasks.map((task, ti) => (
                      <li key={ti} className="flex gap-2 text-sm">
                        <span className="w-24 shrink-0 text-xs text-muted-foreground tabular-nums">
                          {formatDayLabel(task.date)}
                        </span>
                        <span className="min-w-0 flex-1 break-words">{task.title}</span>
                        <span className="shrink-0 text-xs text-muted-foreground">{formatDuration(task.minutes)}</span>
                      </li>
                    ))}
                  </ul>
                </details>
              )
            })}
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-2">
        <Button type="button" size="lg" onClick={approve} disabled={pending}>
          {pending ? "일정에 넣는 중…" : approved ? "이 계획으로 일정 다시 넣기" : "승인하고 일정에 넣기"}
        </Button>
        <p className="text-xs text-muted-foreground">
          날짜는 AI가 정하고, 시각은 일정·루틴을 피해 일할 수 있는 시간 안의 빈 자리에 자동으로 넣어요.
          {!approved && " 고치고 싶으면 승인 전에 대화로 말해 주세요."}
        </p>
        {message && (
          <p
            role={message.type === "error" ? "alert" : "status"}
            className={message.type === "error" ? "text-sm text-destructive" : "text-sm"}
          >
            {message.text}
          </p>
        )}
      </div>
    </section>
  )
}
