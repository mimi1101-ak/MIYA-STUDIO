"use client"

import { Pin } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"

import { MomoLine } from "@/components/momo-avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ageDays, isBuried, quietDays, STATUS_LABELS, type Idea } from "@/lib/ideas"
import type { ActionResult } from "@/lib/validation"

import { deleteIdea, revisitIdea, setIdeaStatus } from "../actions"
import { ageLabel, IdeaEditForm, KindTag, NEXT_STATUS, stampOf } from "../idea-card"

// 아이디어 화면의 머리: 종류·상태, 제목, 자세한 내용, 적은 날, 수정·상태·삭제
export function IdeaHeader({ idea, today }: { idea: Idea; today: string }) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [error, setError] = useState("")
  const [pending, startTransition] = useTransition()

  const quiet = quietDays(idea, today)
  const next = NEXT_STATUS[idea.status]

  function run(action: () => Promise<ActionResult>, after?: () => void) {
    setError("")
    startTransition(async () => {
      const result = await action()
      if (!result.ok) setError(result.error)
      else after?.()
    })
  }

  function handleDelete() {
    if (!window.confirm(`'${idea.title}' 아이디어를 지울까요? MOMO와 나눈 대화와 문서도 함께 지워지고, 되돌릴 수 없어요.`)) return
    run(
      () => deleteIdea(idea.id),
      () => router.push("/ideas")
    )
  }

  if (editing) {
    return (
      <section aria-label="아이디어 고치기" className="max-w-2xl rounded-xl bg-card p-4 ring-1 ring-foreground/25 md:p-5">
        <IdeaEditForm idea={idea} onDone={() => setEditing(false)} />
      </section>
    )
  }

  return (
    <section aria-label="아이디어" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <KindTag kind={idea.kind} />
        <Badge variant={idea.status === "doing" ? "default" : "outline"}>{STATUS_LABELS[idea.status]}</Badge>
        {idea.pinned && (
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <Pin className="size-3 fill-current" aria-hidden />
            고정
          </span>
        )}
      </div>
      <h1 className="font-serif text-3xl tracking-tight break-words md:text-[2.5rem] md:leading-tight">{idea.title}</h1>
      {idea.note && (
        <p className="max-w-3xl text-sm leading-relaxed whitespace-pre-line break-words text-muted-foreground md:text-[15px]">
          {idea.note}
        </p>
      )}
      <p className="font-mono text-xs text-dim tabular-nums">
        {stampOf(idea.createdAt)} 적음 · {ageLabel(ageDays(idea, today))}
        {idea.status !== "done" && ` · ${quiet === 0 ? "오늘 살펴봄" : `${quiet}일째 그대로`}`}
      </p>
      <div className="flex flex-wrap items-center gap-1.5">
        <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => setEditing(true)}>
          수정
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() => run(() => setIdeaStatus(idea.id, next.status))}
        >
          {next.label}
        </Button>
        {isBuried(idea, today) && (
          <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => run(() => revisitIdea(idea.id))}>
            다시 봤어요
          </Button>
        )}
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={handleDelete}
          className="text-muted-foreground hover:text-destructive"
        >
          삭제
        </Button>
      </div>
      {error && <MomoLine tone="error">{error}</MomoLine>}
    </section>
  )
}
