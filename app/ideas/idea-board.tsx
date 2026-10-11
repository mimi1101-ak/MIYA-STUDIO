"use client"

import { ChevronDown } from "lucide-react"
import Link from "next/link"
import { useRef, useState, useTransition, type FormEvent } from "react"

import { MomoLine } from "@/components/momo-avatar"
import { CornerFrame, SectionLabel } from "@/components/space-ui"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  ageDays,
  buriedIdeas,
  IDEA_KINDS,
  IDEA_SORTS,
  KIND_INFO,
  quietDays,
  RECALL_AFTER_DAYS,
  RECALL_COUNT,
  SORT_LABELS,
  sortIdeas,
  type Idea,
  type IdeaKind,
  type IdeaSort,
} from "@/lib/ideas"
import { cn } from "@/lib/utils"
import { LIMITS, type ActionResult } from "@/lib/validation"

import { addIdea, revisitIdea, setIdeaStatus } from "./actions"
import {
  ageLabel,
  chipClass,
  IdeaCard,
  IdeaNote,
  KindPicker,
  KindTag,
  MomoLink,
  NEXT_STATUS,
  stampOf,
  type Notice,
} from "./idea-card"

// 아이디어 화면: 새 아이디어 적기 → 다시 꺼낸 아이디어(오래 묻힌 것) → 모든 아이디어
export function IdeaBoard({ ideas, today }: { ideas: Idea[]; today: string }) {
  return (
    <div className="flex flex-col gap-6 md:gap-8">
      <Capture ideas={ideas} />
      <RecallPanel ideas={ideas} today={today} />
      <IdeaList ideas={ideas} today={today} />
    </div>
  )
}

// ── 새 아이디어 ─────────────────────────────────────────────

function summarize(ideas: Idea[]): string {
  if (ideas.length === 0) {
    return "떠오른 건 뭐든 한 줄로 적어 두세요. 오래된 아이디어도 묻히지 않게 제가 다시 꺼내 드릴게요."
  }
  const doing = ideas.filter((i) => i.status === "doing").length
  const done = ideas.filter((i) => i.status === "done").length
  return `지금 아이디어 ${ideas.length}개를 모아 두고 있어요. 진행 중 ${doing}개 · 끝냄 ${done}개.`
}

function Capture({ ideas }: { ideas: Idea[] }) {
  const [kind, setKind] = useState<IdeaKind>("thought")
  const [title, setTitle] = useState("")
  const [note, setNote] = useState("")
  const [showNote, setShowNote] = useState(false)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [pending, startTransition] = useTransition()
  const inputRef = useRef<HTMLInputElement>(null)

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const saved = title.trim()
    if (!saved) {
      setNotice({ type: "error", text: "아이디어를 한 줄이라도 적어 주세요." })
      inputRef.current?.focus()
      return
    }
    setNotice(null)
    startTransition(async () => {
      const result = await addIdea({ title, note, kind })
      if (result.ok) {
        setTitle("")
        setNote("")
        setShowNote(false)
        setNotice({
          type: "ok",
          text: `'${saved}' 적어 뒀어요. ${RECALL_AFTER_DAYS}일 넘게 손대지 않으면 제가 다시 꺼내 드릴게요.`,
        })
        inputRef.current?.focus()
      } else {
        setNotice({ type: "error", text: result.error })
      }
    })
  }

  return (
    <section aria-label="새 아이디어" className="flex flex-col gap-4 rounded-xl bg-card p-4 ring-1 ring-foreground/10 md:p-5">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <SectionLabel code="NEW">새 아이디어</SectionLabel>
        <KindPicker value={kind} onChange={setKind} />
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-2" noValidate>
        <div className="flex gap-2">
          <Input
            ref={inputRef}
            value={title}
            onChange={(e) => {
              setTitle(e.target.value)
              if (notice?.type === "error") setNotice(null)
            }}
            maxLength={LIMITS.ideaTitle}
            placeholder={KIND_INFO[kind].example}
            aria-label={`${KIND_INFO[kind].label} 아이디어 한 줄`}
            className="h-11"
          />
          <Button type="submit" className="h-11 px-5" disabled={pending}>
            {pending ? "적는 중…" : "적어 두기"}
          </Button>
        </div>
        {showNote ? (
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={(e) => {
              // Ctrl(⌘)+Enter로 바로 적어 두기
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) e.currentTarget.form?.requestSubmit()
            }}
            maxLength={LIMITS.ideaNote}
            rows={3}
            aria-label="자세한 내용"
            placeholder="자세한 내용 (선택) — 왜 떠올랐는지, 첫 단계는 무엇인지"
          />
        ) : (
          <button
            type="button"
            onClick={() => setShowNote(true)}
            className="self-start py-1 text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            + 자세히 적기
          </button>
        )}
      </form>

      <MomoLine tone={notice?.type === "error" ? "error" : "normal"}>{notice ? notice.text : summarize(ideas)}</MomoLine>
    </section>
  )
}

// ── 다시 꺼낸 아이디어 ───────────────────────────────────────
// 일주일 넘게 다시 보지 않은 아이디어를 가장 오래된 것부터 3개 꺼냅니다.

function RecallPanel({ ideas, today }: { ideas: Idea[]; today: string }) {
  const [notice, setNotice] = useState<Notice | null>(null)
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  if (!ideas.some((i) => i.status !== "done")) return null
  const buried = buriedIdeas(ideas, today)
  const picks = buried.slice(0, RECALL_COUNT)

  function run(idea: Idea, action: () => Promise<ActionResult>, okText: string) {
    setNotice(null)
    setPendingId(idea.id)
    startTransition(async () => {
      const result = await action()
      setNotice(result.ok ? { type: "ok", text: okText } : { type: "error", text: result.error })
      setPendingId(null)
    })
  }

  const fallback =
    picks.length === 0
      ? `${RECALL_AFTER_DAYS}일 넘게 묻혀 있는 아이디어는 없어요. 오래 손대지 않은 아이디어가 생기면 여기로 다시 꺼내 드릴게요.`
      : `가장 오래 묻혀 있던 아이디어${picks.length > 1 ? " " + picks.length + "개" : ""}예요. 지금 다시 보니 어때요?`

  return (
    <CornerFrame aria-label="다시 꺼낸 아이디어" className="p-3 md:p-5">
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 px-1">
          <SectionLabel code="RECALL">다시 꺼낸 아이디어</SectionLabel>
          <p className="font-mono text-[11px] text-dim tabular-nums md:text-xs">
            {RECALL_AFTER_DAYS}일 넘게 그대로 · {buried.length}개
          </p>
        </div>

        <MomoLine tone={notice?.type === "error" ? "error" : "normal"}>{notice ? notice.text : fallback}</MomoLine>

        {picks.length > 0 && (
          <ul className="grid gap-3 md:grid-cols-3">
            {picks.map((idea) => {
              const quiet = quietDays(idea, today)
              const next = NEXT_STATUS[idea.status]
              const pending = pendingId === idea.id
              return (
                <li
                  key={idea.id}
                  aria-busy={pending || undefined}
                  className={cn(
                    "flex flex-col gap-4 rounded-xl bg-foreground/[0.04] p-4 ring-1 ring-foreground/15 transition-opacity md:p-5",
                    pending && "opacity-60"
                  )}
                >
                  <div className="flex items-end gap-2.5">
                    <p className="font-pixel text-[2.75rem] leading-[0.9] font-black tabular-nums">{quiet}</p>
                    <p className="mb-0.5 text-xs leading-normal text-dim">
                      일째
                      <br />
                      그대로
                    </p>
                  </div>
                  <div className="flex flex-col gap-2">
                    <KindTag kind={idea.kind} />
                    <Link
                      href={`/ideas/${idea.id}`}
                      className="text-lg leading-snug font-medium break-words underline-offset-4 hover:underline"
                    >
                      {idea.title}
                    </Link>
                    {idea.note && <IdeaNote text={idea.note} />}
                    <p className="font-mono text-[11px] text-dim tabular-nums">
                      {stampOf(idea.createdAt)} 적음 · {ageLabel(ageDays(idea, today))}
                    </p>
                  </div>
                  <div className="mt-auto flex flex-col gap-3">
                    <MomoLink idea={idea} />
                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        type="button"
                        className="h-10"
                        disabled={pending}
                        onClick={() =>
                          run(idea, () => revisitIdea(idea.id), `좋아요. '${idea.title}'은(는) ${RECALL_AFTER_DAYS}일 뒤에 다시 꺼내 드릴게요.`)
                        }
                      >
                        다시 봤어요
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="h-10"
                        disabled={pending}
                        onClick={() =>
                          run(
                            idea,
                            () => setIdeaStatus(idea.id, next.status),
                            next.status === "doing" ? `'${idea.title}' 시작해 볼까요? 진행 중으로 옮겼어요.` : `'${idea.title}' 끝냈어요. 수고했어요.`
                          )
                        }
                      >
                        {next.label}
                      </Button>
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </CornerFrame>
  )
}

// ── 모든 아이디어 ───────────────────────────────────────────
// 페이지를 나누지 않고 전부 보여 줍니다. 기본은 '오래 안 본 순'이라 묻힌 아이디어가 위에 옵니다.

function IdeaList({ ideas, today }: { ideas: Idea[]; today: string }) {
  const [query, setQuery] = useState("")
  const [kind, setKind] = useState<IdeaKind | "all">("all")
  const [sort, setSort] = useState<IdeaSort>("quiet")
  const [showDone, setShowDone] = useState(false)

  const q = query.trim().toLowerCase()
  const matches = ideas.filter(
    (i) => (kind === "all" || i.kind === kind) && (!q || `${i.title}\n${i.note}`.toLowerCase().includes(q))
  )
  const live = sortIdeas(
    matches.filter((i) => i.status !== "done"),
    sort
  )
  const done = sortIdeas(
    matches.filter((i) => i.status === "done"),
    sort
  )

  const chips: { value: IdeaKind | "all"; label: string; count: number }[] = [
    { value: "all", label: "전체", count: ideas.length },
    ...IDEA_KINDS.map((k) => ({ value: k, label: KIND_INFO[k].label, count: ideas.filter((i) => i.kind === k).length })),
  ]

  return (
    <section aria-label="모든 아이디어" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <SectionLabel code="ALL">모든 아이디어</SectionLabel>
        <p className="font-mono text-xs text-dim tabular-nums">{ideas.length}개</p>
      </div>

      {ideas.length === 0 ? (
        <p className="text-sm text-muted-foreground">아직 적어 둔 아이디어가 없어요. 위 칸에 떠오른 걸 한 줄로 적어 보세요.</p>
      ) : (
        <>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <Input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="아이디어 찾기"
                aria-label="아이디어 찾기"
                className="h-10 md:max-w-xs"
              />
              <div role="group" aria-label="정렬" className="no-scrollbar -mx-4 flex gap-1 overflow-x-auto px-4 md:mx-0 md:px-0">
                {IDEA_SORTS.map((s) => (
                  <button key={s} type="button" aria-pressed={sort === s} onClick={() => setSort(s)} className={chipClass(sort === s)}>
                    {SORT_LABELS[s]}
                  </button>
                ))}
              </div>
            </div>
            <div role="group" aria-label="종류별로 보기" className="flex flex-wrap gap-1.5">
              {chips.map((chip) => (
                <button
                  key={chip.value}
                  type="button"
                  aria-pressed={kind === chip.value}
                  onClick={() => setKind(chip.value)}
                  className={cn(
                    "h-8 rounded-full px-3 text-xs ring-1 ring-foreground/10 transition-colors",
                    kind === chip.value ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:bg-muted"
                  )}
                >
                  {chip.label} <span className="font-mono tabular-nums">{chip.count}</span>
                </button>
              ))}
            </div>
            <p className="text-xs text-dim">
              {sort === "quiet"
                ? "오래 손대지 않은 아이디어가 위로 올라와요. 고정한 아이디어는 늘 맨 위에 있어요."
                : "고정한 아이디어는 늘 맨 위에 있어요."}
            </p>
          </div>

          {live.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {matches.length === 0 ? "찾는 아이디어가 없어요." : "끝내지 않은 아이디어가 없어요."}
            </p>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {live.map((idea) => (
                <IdeaCard key={idea.id} idea={idea} today={today} />
              ))}
            </ul>
          )}

          {done.length > 0 && (
            <div className="flex flex-col gap-3">
              <button
                type="button"
                aria-expanded={showDone}
                onClick={() => setShowDone((v) => !v)}
                className="inline-flex items-center gap-1.5 self-start py-1 text-sm text-muted-foreground hover:text-foreground"
              >
                끝낸 아이디어 <span className="font-mono tabular-nums">{done.length}</span>개
                <ChevronDown className={cn("size-4 transition-transform", showDone && "rotate-180")} aria-hidden />
              </button>
              {showDone && (
                <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {done.map((idea) => (
                    <IdeaCard key={idea.id} idea={idea} today={today} />
                  ))}
                </ul>
              )}
            </div>
          )}
        </>
      )}
    </section>
  )
}
