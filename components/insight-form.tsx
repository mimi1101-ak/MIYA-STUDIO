"use client"

import { useId, useState, useTransition, type FormEvent } from "react"

import type { InsightInput } from "@/app/insights/actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { LIMITS, type ActionResult } from "@/lib/validation"

// 인사이트 작성·수정 양식 (/news, /insights 공용)
export function InsightForm({
  initial,
  submitLabel,
  onSubmit,
  onDone,
  onCancel,
}: {
  initial?: Partial<InsightInput>
  submitLabel: string
  onSubmit: (input: InsightInput) => Promise<ActionResult>
  onDone: () => void
  onCancel: () => void
}) {
  const id = useId()
  const [title, setTitle] = useState(initial?.title ?? "")
  const [content, setContent] = useState(initial?.content ?? "")
  const [error, setError] = useState("")
  const [pending, startTransition] = useTransition()

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError("")
    if (!title.trim() || !content.trim()) {
      setError("제목과 내용을 모두 입력해 주세요.")
      return
    }
    startTransition(async () => {
      const result = await onSubmit({ title, content })
      if (result.ok) onDone()
      else setError(result.error)
    })
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3" noValidate>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${id}-title`}>제목</Label>
        <Input
          id={`${id}-title`}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={LIMITS.insightTitle}
          placeholder="한 줄로 요약하면?"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${id}-content`}>인사이트</Label>
        <Textarea
          id={`${id}-content`}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          maxLength={LIMITS.insightContent}
          rows={5}
          placeholder="읽고 느낀 점, 내 일에 적용할 점을 적어 보세요."
        />
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "저장 중…" : submitLabel}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel} disabled={pending}>
          취소
        </Button>
      </div>
    </form>
  )
}
