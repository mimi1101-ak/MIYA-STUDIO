"use client"

import { Pin } from "lucide-react"
import { useEffect, useId, useRef, useState, useTransition, type FormEvent } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  ageDays,
  IDEA_KINDS,
  IDEA_STATUSES,
  isBuried,
  KIND_INFO,
  kstDateOf,
  quietDays,
  STATUS_LABELS,
  type Idea,
  type IdeaKind,
  type IdeaStatus,
} from "@/lib/ideas"
import { cn } from "@/lib/utils"
import { LIMITS, type ActionResult } from "@/lib/validation"

import { deleteIdea, revisitIdea, sendIdeaToToday, setIdeaPinned, setIdeaStatus, updateIdea } from "./actions"

export type Notice = { type: "ok" | "error"; text: string }

// 고르는 단추(종류·상태·정렬). 고른 것은 흰 바탕
export function chipClass(on: boolean) {
  return cn(
    "h-8 rounded-sm px-3 text-xs whitespace-nowrap ring-1 ring-foreground/15 transition-colors",
    on ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
  )
}

export function KindPicker({ value, onChange }: { value: IdeaKind; onChange: (kind: IdeaKind) => void }) {
  return (
    <div role="group" aria-label="종류" className="flex flex-wrap gap-1">
      {IDEA_KINDS.map((kind) => (
        <button
          key={kind}
          type="button"
          aria-pressed={value === kind}
          onClick={() => onChange(kind)}
          className={chipClass(value === kind)}
        >
          {KIND_INFO[kind].label}
        </button>
      ))}
    </div>
  )
}

// 종류 이름표. 예: TODO 할 일
export function KindTag({ kind }: { kind: IdeaKind }) {
  return (
    <span className="inline-flex items-baseline gap-1.5 font-mono text-[10px] tracking-[0.16em] text-dim">
      {KIND_INFO[kind].code}
      <span className="font-sans text-xs tracking-normal text-foreground/85">{KIND_INFO[kind].label}</span>
    </span>
  )
}

// 적은 날. 예: 2026.09.18
export function stampOf(iso: string) {
  return kstDateOf(iso).replaceAll("-", ".")
}

// 적은 지 며칠. 오늘이면 "오늘"
export function ageLabel(days: number) {
  return days === 0 ? "오늘" : `D+${days}`
}

// 상태 단추: 모아 둠 → 진행 중 → 끝냄 → (다시) 모아 둠
export const NEXT_STATUS: Record<IdeaStatus, { status: IdeaStatus; label: string }> = {
  open: { status: "doing", label: "시작하기" },
  doing: { status: "done", label: "끝냈어요" },
  done: { status: "open", label: "다시 꺼내기" },
}

// 자세한 내용: 3줄까지만 보이고, 잘렸을 때만 "더 보기"
export function IdeaNote({ text }: { text: string }) {
  const [open, setOpen] = useState(false)
  const [clipped, setClipped] = useState(false)
  const ref = useRef<HTMLParagraphElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    // 처음 관찰할 때와 카드 너비가 바뀔 때마다 실제로 잘렸는지 잽니다.
    const observer = new ResizeObserver(() => setClipped(el.scrollHeight > el.clientHeight + 1))
    observer.observe(el)
    return () => observer.disconnect()
  }, [text])

  return (
    <div className="flex flex-col items-start gap-1">
      <p
        ref={ref}
        className={cn(
          "text-sm leading-relaxed break-words whitespace-pre-line text-muted-foreground",
          !open && "line-clamp-3"
        )}
      >
        {text}
      </p>
      {(open || clipped) && (
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="text-xs text-dim underline-offset-4 hover:text-foreground hover:underline"
        >
          {open ? "접기" : "더 보기"}
        </button>
      )}
    </div>
  )
}

// 아이디어 카드: 종류·상태·고정, 한 줄, 자세한 내용, 적은 날·그대로 둔 날, 할 수 있는 일
export function IdeaCard({ idea, today }: { idea: Idea; today: string }) {
  const [editing, setEditing] = useState(false)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [pending, startTransition] = useTransition()

  const age = ageDays(idea, today)
  const quiet = quietDays(idea, today)
  const buried = isBuried(idea, today)
  const next = NEXT_STATUS[idea.status]

  function run(action: () => Promise<ActionResult>) {
    setNotice(null)
    startTransition(async () => {
      const result = await action()
      if (!result.ok) setNotice({ type: "error", text: result.error })
      else if (result.message) setNotice({ type: "ok", text: result.message })
    })
  }

  function handleDelete() {
    if (!window.confirm(`'${idea.title}' 아이디어를 지울까요? 지우면 되돌릴 수 없어요.`)) return
    run(() => deleteIdea(idea.id))
  }

  if (editing) {
    return (
      <li className="rounded-xl bg-card p-4 ring-1 ring-foreground/25 sm:col-span-2">
        <IdeaEditForm idea={idea} onDone={() => setEditing(false)} />
      </li>
    )
  }

  return (
    <li
      aria-busy={pending || undefined}
      className={cn(
        "flex flex-col gap-3 rounded-xl bg-card p-4 ring-1 ring-foreground/10 transition-opacity",
        idea.pinned && "ring-foreground/30",
        buried && "ring-foreground/20",
        idea.status === "done" && "opacity-60",
        pending && "opacity-60"
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <KindTag kind={idea.kind} />
          {idea.status !== "open" && (
            <Badge variant={idea.status === "doing" ? "default" : "outline"}>{STATUS_LABELS[idea.status]}</Badge>
          )}
        </div>
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          aria-pressed={idea.pinned}
          aria-label={idea.pinned ? "고정 풀기" : "맨 위에 고정"}
          title={idea.pinned ? "고정 풀기" : "맨 위에 고정"}
          disabled={pending}
          onClick={() => run(() => setIdeaPinned(idea.id, !idea.pinned))}
          className={cn("-my-1 -mr-1", idea.pinned ? "text-foreground" : "text-dim")}
        >
          <Pin className={cn(idea.pinned && "fill-current")} />
        </Button>
      </div>

      <p className="text-[15px] leading-snug font-medium break-words">{idea.title}</p>
      {idea.note && <IdeaNote text={idea.note} />}

      <p className="mt-auto flex flex-wrap justify-between gap-x-3 gap-y-0.5 font-mono text-[11px] text-dim tabular-nums">
        <span>
          {stampOf(idea.createdAt)} · {ageLabel(age)}
        </span>
        {idea.status !== "done" && age > 0 && (
          // 오래 손대지 않을수록 밝게: 묻힌 아이디어가 오히려 눈에 띄게
          <span className={cn(buried && "text-foreground")}>{quiet === 0 ? "오늘 살펴봄" : `${quiet}일째 그대로`}</span>
        )}
      </p>

      {notice && (
        <p
          role={notice.type === "error" ? "alert" : "status"}
          className={cn("text-xs", notice.type === "error" ? "text-destructive" : "text-foreground/85")}
        >
          {notice.text}
        </p>
      )}

      <div className="-mx-2 -mb-2 flex flex-wrap items-center gap-0.5 border-t px-1 pt-1.5">
        {buried && (
          <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => run(() => revisitIdea(idea.id))}>
            다시 봤어요
          </Button>
        )}
        <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => setEditing(true)}>
          수정
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={() => run(() => setIdeaStatus(idea.id, next.status))}
        >
          {next.label}
        </Button>
        {idea.kind === "todo" && idea.status !== "done" && (
          <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => run(() => sendIdeaToToday(idea.id))}>
            할 일로 보내기
          </Button>
        )}
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={handleDelete}
          className="ml-auto text-muted-foreground hover:text-destructive"
        >
          삭제
        </Button>
      </div>
    </li>
  )
}

function IdeaEditForm({ idea, onDone }: { idea: Idea; onDone: () => void }) {
  const id = useId()
  const [kind, setKind] = useState(idea.kind)
  const [title, setTitle] = useState(idea.title)
  const [note, setNote] = useState(idea.note)
  const [status, setStatus] = useState(idea.status)
  const [error, setError] = useState("")
  const [pending, startTransition] = useTransition()

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError("")
    if (!title.trim()) {
      setError("아이디어를 한 줄이라도 적어 주세요.")
      return
    }
    startTransition(async () => {
      const result = await updateIdea(idea.id, { title, note, kind, status })
      if (result.ok) onDone()
      else setError(result.error)
    })
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3" noValidate>
      <KindPicker value={kind} onChange={setKind} />
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${id}-title`}>한 줄</Label>
        <Input
          id={`${id}-title`}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={LIMITS.ideaTitle}
          className="h-10"
          required
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${id}-note`}>자세한 내용 (선택)</Label>
        <Textarea
          id={`${id}-note`}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={LIMITS.ideaNote}
          rows={4}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">상태</span>
        <div role="group" aria-label="상태" className="flex flex-wrap gap-1">
          {IDEA_STATUSES.map((s) => (
            <button key={s} type="button" aria-pressed={status === s} onClick={() => setStatus(s)} className={chipClass(status === s)}>
              {STATUS_LABELS[s]}
            </button>
          ))}
        </div>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "저장 중…" : "저장"}
        </Button>
        <Button type="button" variant="ghost" onClick={onDone} disabled={pending}>
          취소
        </Button>
      </div>
    </form>
  )
}
