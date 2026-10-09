"use client"

import { Sparkles } from "lucide-react"
import { useState, useTransition } from "react"

import { MomoAvatar, MomoLine } from "@/components/momo-avatar"
import { CornerFrame, SectionLabel } from "@/components/space-ui"
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
    <CornerFrame aria-label="계획안" className="flex flex-col gap-6 p-4 md:p-6">
      <div className="flex flex-col gap-2">
        <SectionLabel code="PLAN">
          <span className="inline-flex items-center gap-1.5">
            <Sparkles className="size-3.5" aria-hidden />
            AI 계획안
          </span>
        </SectionLabel>
        <p className="font-mono text-xs text-muted-foreground">
          할 일 {tasks.length}개 · 모두 {formatDuration(total)}
        </p>
        {plan.summary && <p className="font-serif text-lg leading-relaxed md:text-xl">{plan.summary}</p>}
      </div>

      <div className="flex flex-col gap-6">
        {plan.months.map((month, mi) => (
          <div key={mi} className="flex flex-col gap-1">
            <div className="mb-1 flex flex-col gap-0.5">
              <h3 className="font-serif text-lg">{month.label}</h3>
              {month.focus && <p className="text-xs text-dim">{month.focus}</p>}
            </div>
            {month.weeks.map((week, wi) => {
              const minutes = week.tasks.reduce((sum, t) => sum + t.minutes, 0)
              return (
                <details key={wi} open={mi === 0 && wi === 0} className="group border-t border-foreground/[0.08] py-3">
                  <summary className="cursor-pointer text-sm">
                    <span className="font-medium">{week.label}</span>
                    <span className="font-mono text-xs text-dim">
                      {" "}
                      · {week.tasks.length}개 · {formatDuration(minutes)}
                    </span>
                    {week.focus && <span className="block pt-0.5 text-xs text-dim">{week.focus}</span>}
                  </summary>
                  <ul className="mt-3 flex flex-col gap-2">
                    {week.tasks.map((task, ti) => (
                      <li key={ti} className="flex gap-3 text-sm leading-relaxed">
                        <span className="w-24 shrink-0 font-mono text-xs leading-6 text-dim tabular-nums">
                          {formatDayLabel(task.date)}
                        </span>
                        <span className="min-w-0 flex-1 break-words">{task.title}</span>
                        <span className="shrink-0 font-mono text-xs leading-6 text-dim">{formatDuration(task.minutes)}</span>
                      </li>
                    ))}
                  </ul>
                </details>
              )
            })}
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-2.5">
        <Button type="button" size="lg" className="h-11" onClick={approve} disabled={pending}>
          {pending ? "일정에 넣는 중…" : approved ? "이 계획으로 일정 다시 넣기" : "승인하고 일정에 넣기"}
        </Button>
        <p className="text-xs leading-relaxed text-dim">
          날짜는 AI가 정하고, 시각은 일정·루틴을 피해 일할 수 있는 시간 안의 빈 자리에 자동으로 넣어요.
          {!approved && " 고치고 싶으면 승인 전에 대화로 말해 주세요."}
        </p>
        {message && <MomoLine tone={message.type === "error" ? "error" : "normal"}>{message.text}</MomoLine>}
      </div>
    </CornerFrame>
  )
}

// 계획안이 아직 없을 때: 월·주·일 궤도 가운데 MOMO
export function PlanPlaceholder() {
  return (
    <CornerFrame aria-label="계획안" className="flex flex-col gap-6 p-4 md:p-6">
      <SectionLabel code="PLAN">계획안</SectionLabel>
      <div className="flex flex-col items-center gap-6 pt-6 pb-2">
        <div aria-hidden className="relative grid size-[230px] place-items-center">
          <span className="absolute size-[224px] rounded-full border border-dashed border-foreground/15" />
          <span className="absolute size-[160px] rounded-full border border-dashed border-foreground/20" />
          <span className="absolute size-[96px] rounded-full border border-foreground/30" />
          <span className="orbit-slow absolute size-[224px]">
            <span className="absolute top-[-3px] left-1/2 -ml-[3px] size-1.5 bg-muted-foreground" />
          </span>
          <span className="orbit absolute size-[160px]">
            <span className="absolute top-[-3px] left-1/2 -ml-[3px] size-1.5 bg-foreground shadow-[0_0_8px_rgb(255_255_255/0.8)]" />
          </span>
          <span className="absolute top-[-2px] left-1/2 -translate-x-1/2 -translate-y-full font-mono text-[10px] tracking-[0.2em] text-dim">
            MONTH
          </span>
          <span className="absolute top-[21px] left-1/2 -translate-x-1/2 font-mono text-[10px] tracking-[0.2em] text-dim">
            WEEK
          </span>
          <span className="absolute top-[53px] left-1/2 -translate-x-1/2 font-mono text-[10px] tracking-[0.2em] text-muted-foreground">
            DAY
          </span>
          <MomoAvatar size={58} className="relative" />
        </div>
        <p className="text-center text-sm leading-relaxed text-muted-foreground">
          MOMO의 질문에 답하면 여기에
          <br />월 → 주 → 일 계획안이 나타나요.
        </p>
      </div>
    </CornerFrame>
  )
}
