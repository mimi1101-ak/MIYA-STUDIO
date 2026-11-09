"use client"

import { ChevronLeft, ChevronRight } from "lucide-react"
import { useState, useTransition } from "react"

import { OneLineList } from "@/components/one-line-list"
import { SectionLabel } from "@/components/space-ui"
import { Button } from "@/components/ui/button"
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

function shiftMonth(month: string, by: number): string {
  const d = new Date(`${month}T00:00:00Z`)
  d.setUTCMonth(d.getUTCMonth() + by, 1)
  return d.toISOString().slice(0, 10)
}

// "월별 목표": 달마다 한 줄 목표를 적고, 끝내면 체크.
// 홈 오른쪽에서는 ‹ ›로 다른 달을 보고, 목표 화면에서는 이번 달·다음 달을 고정해서 씁니다(navigable=false).
export function MonthlyGoals({
  thisMonth,
  initialGoals,
  navigable = true,
  code = "MONTH",
  title = "월별 목표",
}: {
  thisMonth: string
  initialGoals: MonthlyGoal[] | null
  navigable?: boolean
  code?: string
  title?: string
}) {
  const [month, setMonth] = useState(thisMonth)
  const [goals, setGoals] = useState<MonthlyGoal[] | null>(initialGoals)
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
    setGoals(null)
    run(() => listMonthlyGoals(next))
  }

  const doneCount = goals?.filter((g) => g.done).length ?? 0
  const label = formatMonthLabel(month)

  return (
    <section aria-label={title} className="flex flex-col gap-4 rounded-xl bg-card p-5 ring-1 ring-foreground/10">
      <div className="flex flex-col gap-1.5">
        <SectionLabel code={code}>{title}</SectionLabel>
        <div className="flex min-h-7 items-center justify-between gap-2">
          {navigable ? (
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
          ) : (
            <p className="font-mono text-xs text-muted-foreground tabular-nums">{label}</p>
          )}
          {goals && goals.length > 0 && (
            <p className="font-mono text-[13px] tabular-nums">
              {doneCount} / {goals.length}
            </p>
          )}
        </div>
      </div>

      <OneLineList
        items={goals}
        pending={pending}
        labels={{
          item: "목표",
          check: "달성 표시",
          placeholder: "예: 책 2권 읽기",
          empty: `${label}에 적은 목표가 없어요.`,
          add: `${label} 목표 추가`,
        }}
        onAdd={(text, done) => run(() => addMonthlyGoal(month, text), done)}
        onSave={(id, text, done) => run(() => updateMonthlyGoal(month, id, text), done)}
        onToggle={(id, checked) => run(() => setMonthlyGoalDone(month, id, checked))}
        onDelete={(id, done) => run(() => deleteMonthlyGoal(month, id), done)}
      />

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </section>
  )
}
