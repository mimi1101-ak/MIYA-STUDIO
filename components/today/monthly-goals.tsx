"use client"

import { ChevronLeft, ChevronRight } from "lucide-react"
import { useState, useTransition, type FormEvent } from "react"

import { SectionLabel } from "@/components/space-ui"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { formatMonthLabel } from "@/lib/date"
import {
  addMonthlyGoal,
  deleteMonthlyGoal,
  listMonthlyGoals,
  setMonthlyGoalDone,
  updateMonthlyGoal,
  type MonthlyGoal,
  type MonthlyGoalsResult,
} from "@/lib/monthly-goals"
import { cn } from "@/lib/utils"
import { LIMITS } from "@/lib/validation"

function shiftMonth(month: string, by: number): string {
  const d = new Date(`${month}T00:00:00Z`)
  d.setUTCMonth(d.getUTCMonth() + by, 1)
  return d.toISOString().slice(0, 10)
}

// 홈 오른쪽 "월별 목표": 달마다 한 줄 목표를 적고, 끝내면 체크. ‹ ›로 다른 달을 봅니다.
export function MonthlyGoals({ thisMonth, initialGoals }: { thisMonth: string; initialGoals: MonthlyGoal[] | null }) {
  const [month, setMonth] = useState(thisMonth)
  const [goals, setGoals] = useState<MonthlyGoal[] | null>(initialGoals)
  const [text, setText] = useState("")
  const [editing, setEditing] = useState<{ id: string; title: string } | null>(null)
  const [error, setError] = useState(initialGoals ? "" : "월별 목표를 불러오지 못했어요.")
  const [pending, startTransition] = useTransition()

  // 서버에 바꾸고, 돌아온 그 달 목록으로 화면을 맞춥니다.
  function run(action: () => Promise<MonthlyGoalsResult>, after?: () => void) {
    setError("")
    startTransition(async () => {
      const result = await action()
      if (!result.ok) return setError(result.error)
      setGoals(result.goals)
      after?.()
    })
  }

  function go(by: number) {
    const next = shiftMonth(month, by)
    setMonth(next)
    setEditing(null)
    setGoals(null)
    run(() => listMonthlyGoals(next))
  }

  function handleAdd(event: FormEvent) {
    event.preventDefault()
    if (!text.trim()) return
    run(() => addMonthlyGoal(month, text), () => setText(""))
  }

  function handleSave(event: FormEvent) {
    event.preventDefault()
    if (!editing || !editing.title.trim()) return
    const { id, title } = editing
    run(() => updateMonthlyGoal(month, id, title), () => setEditing(null))
  }

  const doneCount = goals?.filter((g) => g.done).length ?? 0
  const label = formatMonthLabel(month)

  return (
    <section aria-label="월별 목표" className="flex flex-col gap-4 rounded-xl bg-card p-5 ring-1 ring-foreground/10">
      <div className="flex flex-col gap-1.5">
        <SectionLabel code="MONTH">월별 목표</SectionLabel>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center">
            <Button type="button" variant="ghost" size="icon-sm" aria-label="이전 달" disabled={pending} onClick={() => go(-1)}>
              <ChevronLeft />
            </Button>
            <p className="min-w-[6.5rem] text-center font-mono text-xs text-muted-foreground tabular-nums" aria-live="polite">
              {label}
            </p>
            <Button type="button" variant="ghost" size="icon-sm" aria-label="다음 달" disabled={pending} onClick={() => go(1)}>
              <ChevronRight />
            </Button>
          </div>
          {goals && goals.length > 0 && (
            <p className="font-mono text-[13px] tabular-nums">
              {doneCount} / {goals.length}
            </p>
          )}
        </div>
      </div>

      {goals && goals.length > 0 ? (
        <ul className={cn("flex flex-col", pending && "opacity-60")}>
          {goals.map((goal) =>
            editing?.id === goal.id ? (
              <li key={goal.id} className="border-t border-foreground/[0.07] py-2 first:border-t-0">
                <form onSubmit={handleSave} className="flex flex-col gap-2">
                  <Input
                    value={editing.title}
                    onChange={(e) => setEditing({ id: goal.id, title: e.target.value })}
                    maxLength={LIMITS.goalTitle}
                    aria-label="목표 고치기"
                    autoFocus
                  />
                  <div className="flex items-center gap-1.5">
                    <Button type="submit" size="xs" disabled={pending || !editing.title.trim()}>
                      저장
                    </Button>
                    <Button type="button" size="xs" variant="ghost" disabled={pending} onClick={() => setEditing(null)}>
                      취소
                    </Button>
                    <Button
                      type="button"
                      size="xs"
                      variant="ghost"
                      disabled={pending}
                      className="ml-auto text-muted-foreground hover:text-destructive"
                      onClick={() => {
                        if (window.confirm(`'${goal.title}'을(를) 지울까요?`)) {
                          run(() => deleteMonthlyGoal(month, goal.id), () => setEditing(null))
                        }
                      }}
                    >
                      삭제
                    </Button>
                  </div>
                </form>
              </li>
            ) : (
              <li key={goal.id} className="flex items-start gap-2.5 border-t border-foreground/[0.07] py-2 first:border-t-0">
                <Checkbox
                  className="mt-0.5"
                  checked={goal.done}
                  disabled={pending}
                  onCheckedChange={(checked) => run(() => setMonthlyGoalDone(month, goal.id, checked))}
                  aria-label={`${goal.title} 달성 표시`}
                />
                <span
                  className={cn(
                    "min-w-0 flex-1 text-sm leading-5 break-words",
                    goal.done && "text-dim line-through decoration-foreground/40"
                  )}
                >
                  {goal.title}
                </span>
                <Button
                  type="button"
                  size="xs"
                  variant="ghost"
                  className="-my-0.5 text-muted-foreground"
                  disabled={pending}
                  onClick={() => setEditing({ id: goal.id, title: goal.title })}
                >
                  수정
                </Button>
              </li>
            )
          )}
        </ul>
      ) : (
        goals && <p className="text-sm text-muted-foreground">{label}에 적은 목표가 없어요.</p>
      )}

      <form onSubmit={handleAdd} className="flex gap-2">
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={LIMITS.goalTitle}
          placeholder="예: 책 2권 읽기"
          aria-label={`${label} 목표 추가`}
          className="h-9 min-w-0"
        />
        <Button type="submit" size="sm" className="h-9 shrink-0 px-3" disabled={pending || !text.trim()}>
          추가
        </Button>
      </form>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </section>
  )
}
