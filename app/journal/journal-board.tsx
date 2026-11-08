"use client"

import { useCallback, useEffect, useRef, useState, useTransition } from "react"

import { CornerFrame, SectionLabel } from "@/components/space-ui"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { formatClock, formatDayLabel, formatMonthLabel, formatStamp, msToKst } from "@/lib/date"
import type { DoneTask, JournalEntry } from "@/lib/journal"
import { cn } from "@/lib/utils"
import { LIMITS } from "@/lib/validation"

import { deleteJournal, loadOlderJournals, saveJournal } from "./actions"

type Props = {
  today: string
  entry: JournalEntry | null
  done: DoneTask[]
  past: JournalEntry[]
  hasMore: boolean
}

export function JournalBoard({ today, entry, done, past, hasMore }: Props) {
  return (
    <>
      <TodayJournal today={today} entry={entry} done={done} />
      <PastJournals initial={past} hasMore={hasMore} />
    </>
  )
}

const PLACEHOLDER = "오늘 어떤 하루였나요? 잘된 일, 아쉬운 일, 떠오른 생각을 편하게 적어 보세요."

// ── 오늘 일지: 쓰기를 1초 멈추면 저장하고, 칸을 벗어나거나 화면을 떠날 때도 바로 저장합니다 ──
type SaveState = "idle" | "saving" | "error"

function TodayJournal({ today, entry, done }: { today: string; entry: JournalEntry | null; done: DoneTask[] }) {
  const initial = entry?.content ?? ""
  const [text, setText] = useState(initial)
  const [saved, setSaved] = useState(initial)
  const [savedAt, setSavedAt] = useState(entry ? Date.parse(entry.updatedAt) : null)
  const [state, setState] = useState<SaveState>("idle")
  const textRef = useRef(initial)
  const savedRef = useRef(initial)
  const chainRef = useRef<Promise<void>>(Promise.resolve())

  // 저장은 한 줄로 세워 차례로 보냅니다(늦게 보낸 글이 먼저 저장되는 일이 없게).
  const flush = useCallback(() => {
    chainRef.current = chainRef.current.then(async () => {
      const content = textRef.current.trim()
      if (content === savedRef.current) return
      setState("saving")
      const result = await saveJournal(today, content)
      if (!result.ok) return setState("error")
      savedRef.current = content
      setSaved(content)
      setSavedAt(Date.now())
      setState("idle")
    })
  }, [today])

  useEffect(() => {
    textRef.current = text
    if (text.trim() === savedRef.current) return
    const timer = setTimeout(flush, 1000)
    return () => clearTimeout(timer)
  }, [text, flush])

  // 다른 앱으로 넘어가거나(휴대폰) 다른 화면으로 옮길 때 바로 저장하고,
  // 저장 전에 탭을 닫으려 하면 브라우저가 한 번 물어봅니다.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden") flush()
    }
    const onUnload = (event: BeforeUnloadEvent) => {
      if (textRef.current.trim() !== savedRef.current) event.preventDefault()
    }
    document.addEventListener("visibilitychange", onHide)
    window.addEventListener("beforeunload", onUnload)
    return () => {
      document.removeEventListener("visibilitychange", onHide)
      window.removeEventListener("beforeunload", onUnload)
      flush()
    }
  }, [flush])

  const dirty = text.trim() !== saved
  const status =
    state === "error"
      ? null
      : state === "saving"
        ? "저장 중…"
        : dirty
          ? "쓰는 중…"
          : savedAt && saved
            ? `저장됨 · ${formatClock(msToKst(savedAt).minutes)}`
            : "쓰는 대로 저장돼요"

  return (
    <CornerFrame aria-label="오늘 일지" className="p-3 md:p-5">
      <div className="flex flex-col gap-4 md:gap-5">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-1 font-mono text-[11px] tracking-[0.06em] text-dim md:text-xs">
          <p>
            JOURNAL <span className="text-foreground/25">/</span> <span className="text-foreground">{formatStamp(today)}</span>
          </p>
          {status ? (
            <p role="status" className="tabular-nums">
              {status}
            </p>
          ) : (
            <p role="alert" className="flex items-center gap-2 font-sans text-xs text-destructive">
              저장하지 못했어요
              <button type="button" onClick={flush} className="underline underline-offset-4 hover:text-foreground">
                다시 시도
              </button>
            </p>
          )}
        </div>

        <div className="grid items-start gap-4 md:grid-cols-[minmax(0,1fr)_16rem] md:gap-5">
          <div className="flex flex-col gap-2">
            <Textarea
              aria-label={`${formatDayLabel(today)} 일지`}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onBlur={flush}
              maxLength={LIMITS.journalContent}
              placeholder={PLACEHOLDER}
              className="min-h-64 resize-none rounded-xl bg-card p-4 text-[15px] leading-relaxed md:min-h-80 md:p-5 md:text-[15px] dark:bg-card"
            />
            <p className="self-end px-1 font-mono text-[11px] text-dim tabular-nums">
              {text.length.toLocaleString()} / {LIMITS.journalContent.toLocaleString()}
            </p>
          </div>

          {/* 휴대폰에서는 글 칸 위에 놓습니다. */}
          <aside aria-label="오늘 끝낸 할 일" className="order-first flex flex-col gap-3 px-1 md:order-none md:pt-1">
            <SectionLabel code="DONE">오늘 끝낸 일</SectionLabel>
            {done.length === 0 ? (
              <p className="text-sm text-muted-foreground">오늘 끝낸 할 일이 아직 없어요.</p>
            ) : (
              <ul className="flex max-h-36 flex-col gap-2 overflow-y-auto md:max-h-none">
                {done.map((task) => (
                  <li key={task.id} className="flex items-baseline gap-3 text-sm">
                    <span className="font-mono text-xs text-dim tabular-nums">{formatClock(task.minutes)}</span>
                    <span className="min-w-0 break-words">{task.title}</span>
                  </li>
                ))}
              </ul>
            )}
          </aside>
        </div>
      </div>
    </CornerFrame>
  )
}

// ── 지난 일지: 달별로 묶어 최신 순, 30편씩 더 불러오기 ──
function PastJournals({ initial, hasMore }: { initial: JournalEntry[]; hasMore: boolean }) {
  const [entries, setEntries] = useState(initial)
  const [more, setMore] = useState(hasMore)
  const [error, setError] = useState("")
  const [loading, startLoading] = useTransition()

  function loadMore() {
    const last = entries.at(-1)
    if (!last) return
    setError("")
    startLoading(async () => {
      const result = await loadOlderJournals(last.date)
      if (!result.ok) return setError(result.error)
      setEntries((prev) => [...prev, ...result.entries.filter((e) => !prev.some((p) => p.date === e.date))])
      setMore(result.hasMore)
    })
  }

  const months = new Map<string, JournalEntry[]>()
  for (const entry of entries) {
    const month = `${entry.date.slice(0, 8)}01`
    months.set(month, [...(months.get(month) ?? []), entry])
  }

  return (
    <section aria-label="지난 일지" className="flex flex-col gap-4">
      <SectionLabel code="LOG">지난 일지</SectionLabel>
      {entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">아직 지난 일지가 없어요. 오늘부터 하루를 마무리하며 적어 보세요.</p>
      ) : (
        [...months].map(([month, list]) => (
          <div key={month} className="flex flex-col gap-2">
            <h2 className="px-1 font-mono text-xs tracking-[0.06em] text-dim">{formatMonthLabel(month)}</h2>
            <ul className="flex flex-col gap-2">
              {list.map((entry) => (
                <PastEntry
                  key={entry.date}
                  entry={entry}
                  onSaved={(next) => setEntries((prev) => prev.map((e) => (e.date === next.date ? next : e)))}
                  onDeleted={() => setEntries((prev) => prev.filter((e) => e.date !== entry.date))}
                />
              ))}
            </ul>
          </div>
        ))
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {more && (
        <Button type="button" variant="outline" disabled={loading} onClick={loadMore} className="h-10 self-center px-4">
          {loading ? "불러오는 중…" : "이전 일지 더 보기"}
        </Button>
      )}
    </section>
  )
}

// 네 줄이 넘을 것 같은 글은 접어 두고 "펼쳐 읽기"로 엽니다.
function isLong(content: string) {
  return content.length > 180 || content.split("\n").length > 4
}

function PastEntry({
  entry,
  onSaved,
  onDeleted,
}: {
  entry: JournalEntry
  onSaved: (entry: JournalEntry) => void
  onDeleted: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(entry.content)
  const [error, setError] = useState("")
  const [pending, startTransition] = useTransition()
  const label = formatDayLabel(entry.date)

  function save() {
    setError("")
    startTransition(async () => {
      const content = draft.trim()
      const result = await saveJournal(entry.date, content)
      if (!result.ok) return setError(result.error)
      setEditing(false)
      // 글을 모두 지우고 저장하면 그날 일지도 지워집니다.
      if (content) onSaved({ ...entry, content, updatedAt: new Date().toISOString() })
      else onDeleted()
    })
  }

  function remove() {
    if (!window.confirm(`${label} 일지를 지울까요? 지우면 되돌릴 수 없어요.`)) return
    setError("")
    startTransition(async () => {
      const result = await deleteJournal(entry.date)
      if (result.ok) onDeleted()
      else setError(result.error)
    })
  }

  const long = isLong(entry.content)

  return (
    <li
      aria-busy={pending || undefined}
      className={cn(
        "flex flex-col gap-3 rounded-xl bg-card p-4 ring-1 ring-foreground/10 transition-opacity",
        editing && "ring-foreground/25",
        pending && "opacity-60"
      )}
    >
      <p className="text-sm font-medium">{label}</p>

      {editing ? (
        <Textarea
          aria-label={`${label} 일지 고치기`}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={LIMITS.journalContent}
          autoFocus
          className="min-h-40 resize-none p-3 text-[15px] leading-relaxed md:text-[15px]"
        />
      ) : (
        <>
          <p className={cn("text-[15px] leading-relaxed break-words whitespace-pre-wrap", long && !open && "line-clamp-4")}>
            {entry.content}
          </p>
          {long && (
            <button
              type="button"
              aria-expanded={open}
              onClick={() => setOpen((v) => !v)}
              className="self-start text-[13px] text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              {open ? "접기" : "펼쳐 읽기"}
            </button>
          )}
        </>
      )}

      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}

      <div className="-mx-2 -mb-2 flex flex-wrap items-center gap-0.5 border-t px-1 pt-1.5">
        {editing ? (
          <>
            <Button type="button" size="sm" disabled={pending} onClick={save}>
              {pending ? "저장 중…" : "저장"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() => {
                setDraft(entry.content)
                setError("")
                setEditing(false)
              }}
            >
              취소
            </Button>
          </>
        ) : (
          <>
            <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => setEditing(true)}>
              수정
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={remove}
              className="ml-auto text-muted-foreground hover:text-destructive"
            >
              삭제
            </Button>
          </>
        )}
      </div>
    </li>
  )
}
