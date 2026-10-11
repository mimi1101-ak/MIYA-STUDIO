"use client"

import Link from "next/link"
import { useState, useTransition } from "react"

import { Button, buttonVariants } from "@/components/ui/button"
import type { ActionResult } from "@/lib/validation"

import { deleteGoal, setGoalStatus } from "./actions"

// 목표 상세 위쪽 버튼들: 캘린더에서 보기, 완료 표시, 삭제
// idea: 이 목표를 만든 아이디어. 목표를 완료할 때 아이디어도 '끝냄'으로 바꿀지 묻습니다.
export function GoalActions({
  goalId,
  status,
  idea,
}: {
  goalId: string
  status: string
  idea: { title: string; status: string } | null
}) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState("")

  function run(action: () => Promise<ActionResult>) {
    setError("")
    startTransition(async () => {
      const result = await action()
      if (!result.ok) setError(result.error)
    })
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {status !== "draft" && (
        <Link href={`/calendar?goal=${goalId}`} className={buttonVariants({ size: "sm", variant: "outline" })}>
          캘린더에서 보기
        </Link>
      )}
      {status === "active" && (
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() => {
            const alsoIdea =
              idea !== null &&
              idea.status !== "done" &&
              window.confirm(
                `목표를 완료로 표시해요. 이 목표를 만든 아이디어 ‘${idea.title}’도 '끝냄'으로 바꿀까요?\n\n확인: 아이디어도 끝냄 · 취소: 목표만 완료`
              )
            run(() => setGoalStatus(goalId, "done", alsoIdea))
          }}
        >
          목표 완료로 표시
        </Button>
      )}
      {status === "done" && (
        <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => run(() => setGoalStatus(goalId, "active"))}>
          다시 진행 중으로
        </Button>
      )}
      <Button
        type="button"
        size="sm"
        variant="ghost"
        disabled={pending}
        className="text-muted-foreground hover:text-destructive"
        onClick={() => {
          if (window.confirm("이 목표를 삭제할까요? 아직 안 끝낸 할 일도 함께 지워져요. 끝낸 할 일은 남아요.")) {
            run(() => deleteGoal(goalId))
          }
        }}
      >
        목표 삭제
      </Button>
      {error && (
        <p role="alert" className="w-full text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}
