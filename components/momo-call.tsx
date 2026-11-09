"use client"

import { X } from "lucide-react"
import { useEffect, useRef, useState, useSyncExternalStore, useTransition, type FormEvent, type ReactNode } from "react"
import { createPortal } from "react-dom"

import { MomoAvatar, MomoLine } from "@/components/momo-avatar"
import { CornerFrame, SectionLabel } from "@/components/space-ui"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { UndoPlan } from "@/lib/assistant"
import { callMomo, undoMomo } from "@/lib/assistant-actions"
import type { ChatMessage } from "@/lib/goal-ai"
import { cn } from "@/lib/utils"
import { LIMITS } from "@/lib/validation"

// MOMO 호출: 어느 화면에서든 위쪽 메뉴의 버튼으로 불러 말하면, MOMO가 할 일을 바로 바꾸고 설명합니다.
// 대화는 저장하지 않습니다(새로고침하면 처음부터). 화면을 옮겨 다녀도 창을 닫기 전까지는 대화가 남습니다.

const OPENER =
  "부르셨어요? 지금 상황이나 바꾸고 싶은 것을 편하게 말해 주세요. 할 일·일정·루틴·목표·Dream을 바로 넣고, 고치고, 지울게요."
const EXAMPLES = ["지금 뭘 해야 할지 모르겠어", "몸이 안 좋아", "오늘 할 일이 너무 많아"]

type Entry =
  | { role: "user"; content: string }
  | { role: "assistant"; content: string; changes: string[]; skipped: number; undo: UndoPlan | null; undone: boolean }

// MOMO가 무엇을 반영했는지도 대화에 남겨, 다음 차례에 MOMO가 알 수 있게 합니다.
function toHistory(entries: Entry[]): ChatMessage[] {
  return entries.map((e) => {
    if (e.role === "user" || e.changes.length === 0) return { role: e.role, content: e.content }
    const note = `\n\n[앱이 반영한 것${e.undone ? " — 사용자가 되돌림" : ""}]\n${e.changes.map((c) => `- ${c}`).join("\n")}`
    return { role: "assistant", content: `${e.content}${note}`.slice(0, LIMITS.chatMessage) }
  })
}

// MOMO의 답을 문장마다(. ? ! 뒤) 그리고 번호 질문(1) 2)) 앞에서 줄을 바꿔 읽기 쉽게 합니다.
// MOMO가 넣은 빈 줄(문단 나눔)은 그대로 둡니다. 예) "1.5시간"처럼 마침표 뒤에 띄어쓰기가 없으면 바꾸지 않음
function withLineBreaks(text: string): string {
  return text.replace(/([.?!])[ \t]+(?=\S)/g, "$1\n").replace(/[ \t]+(?=\d+\)\s)/g, "\n")
}

// 위쪽 메뉴에 넣는 버튼
export function MomoCallButton({
  open,
  onToggle,
  className,
}: {
  open: boolean
  onToggle: () => void
  className?: string
}) {
  return (
    <Button
      type="button"
      size="sm"
      onClick={onToggle}
      aria-expanded={open}
      aria-controls="momo-call"
      className={className}
    >
      MOMO 호출
    </Button>
  )
}

const subscribeNothing = () => () => {}

// 대화창. 닫아도 대화가 남도록 늘 그려 두고 숨기기만 합니다.
// 위쪽 메뉴(배경 흐림 효과)가 고정 위치의 기준이 되지 않게 body에 바로 그립니다.
export function MomoCallPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const mounted = useSyncExternalStore(subscribeNothing, () => true, () => false)
  const [entries, setEntries] = useState<Entry[]>([])
  const [text, setText] = useState("")
  const [error, setError] = useState("")
  const [pending, startTransition] = useTransition()
  const listRef = useRef<HTMLOListElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // 열면 입력 칸으로, Esc로 닫기
  useEffect(() => {
    if (!open) return
    inputRef.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, onClose])

  // 새 말이 오면 대화 목록 안에서만 맨 아래로
  useEffect(() => {
    const list = listRef.current
    if (list) list.scrollTop = list.scrollHeight
  }, [entries.length, pending, open])

  function send(message: string) {
    const trimmed = message.trim()
    if (!trimmed || pending) return
    const next: Entry[] = [...entries, { role: "user", content: trimmed }]
    setEntries(next)
    setError("")
    setText("")
    startTransition(async () => {
      const result = await callMomo(toHistory(next))
      if (!result.ok) {
        setError(result.error)
        return
      }
      setEntries([
        ...next,
        {
          role: "assistant",
          content: result.reply,
          changes: result.changes,
          skipped: result.skipped,
          undo: result.undo,
          undone: false,
        },
      ])
    })
  }

  function undo(index: number) {
    const entry = entries[index]
    if (entry?.role !== "assistant" || !entry.undo || pending) return
    const plan = entry.undo
    setError("")
    startTransition(async () => {
      const result = await undoMomo(plan)
      if (!result.ok) {
        setError(result.error)
        return
      }
      setEntries((prev) => prev.map((e, i) => (i === index && e.role === "assistant" ? { ...e, undone: true } : e)))
    })
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    send(text)
  }

  // 되돌리기는 가장 최근에 반영한 답에만 둡니다(앞의 답을 되돌리면 뒤의 변경과 엉킬 수 있어서).
  const lastChangeIndex = entries.findLastIndex((e) => e.role === "assistant" && e.undo && !e.undone)

  if (!mounted) return null
  return createPortal(
    <>
      {/* 휴대폰: 뒤를 어둡게, 누르면 닫힘 */}
      <div
        aria-hidden
        onClick={onClose}
        className={cn("fixed inset-0 z-40 bg-black/60 lg:hidden", !open && "hidden")}
      />
      <CornerFrame
        id="momo-call"
        role="dialog"
        aria-label="MOMO 호출"
        className={cn(
          "fixed z-50 flex flex-col gap-3 bg-[rgb(8_8_10/0.96)] p-3.5 shadow-2xl",
          // 휴대폰: 아래에서 올라오는 창 / PC: 오른쪽에 붙는 창
          "inset-x-0 bottom-0 h-[82dvh] border-b-0 pb-[max(0.875rem,env(safe-area-inset-bottom))]",
          "lg:inset-x-auto lg:top-20 lg:right-4 lg:bottom-4 lg:h-auto lg:w-[25rem] lg:border-b lg:pb-3.5",
          !open && "hidden"
        )}
      >
        <div className="flex items-center justify-between gap-2">
          <SectionLabel code="CALL">MOMO 호출</SectionLabel>
          <Button type="button" size="icon-sm" variant="ghost" onClick={onClose} aria-label="MOMO 호출 닫기">
            <X />
          </Button>
        </div>

        <ol ref={listRef} aria-live="polite" className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pr-1">
          <MomoSays>{withLineBreaks(OPENER)}</MomoSays>
          {entries.map((e, i) =>
            e.role === "user" ? (
              <li key={i} className="max-w-[85%] self-end">
                <p className="pixel-corners bg-primary px-3 py-2 text-[14px] leading-relaxed break-words whitespace-pre-line text-primary-foreground">
                  {e.content}
                </p>
              </li>
            ) : (
              <MomoSays key={i}>
                {withLineBreaks(e.content)}
                {e.changes.length > 0 && (
                  <span className="mt-2.5 flex flex-col gap-2 border border-dashed border-foreground/25 p-2.5">
                    <span className="font-mono text-[11px] tracking-[0.14em] text-dim">
                      {e.undone ? "되돌렸어요" : "반영했어요"}
                    </span>
                    <span className="flex flex-col gap-1">
                      {e.changes.map((c, j) => (
                        <span
                          key={j}
                          className={cn("text-[12px] leading-snug break-words", e.undone && "text-dim line-through")}
                        >
                          {c}
                        </span>
                      ))}
                    </span>
                    {e.skipped > 0 && !e.undone && (
                      <span className="text-[12px] text-muted-foreground">
                        {e.skipped}개는 반영하지 못했어요. 필요하면 다시 말해 주세요.
                      </span>
                    )}
                    {i === lastChangeIndex && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => undo(i)}
                        disabled={pending}
                        className="self-start"
                      >
                        되돌리기
                      </Button>
                    )}
                  </span>
                )}
              </MomoSays>
            )
          )}
          {pending && (
            <li className="flex items-center gap-2.5">
              <MomoAvatar size={29} />
              <span className="flex items-center gap-2 font-mono text-[12px] text-muted-foreground">
                <span aria-hidden className="thinking-dots">
                  <span />
                  <span />
                  <span />
                </span>
                할 일과 목표를 살펴보고 있어요…
              </span>
            </li>
          )}
        </ol>

        {entries.length === 0 && !pending && (
          <div className="flex flex-wrap gap-1.5">
            {EXAMPLES.map((example) => (
              <button
                key={example}
                type="button"
                onClick={() => send(example)}
                className="h-8 border border-dashed border-foreground/30 px-2.5 text-[12px] transition-colors hover:border-solid hover:border-foreground hover:bg-foreground/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
              >
                {example}
              </button>
            ))}
          </div>
        )}

        {error && <MomoLine tone="error">{error}</MomoLine>}

        <form onSubmit={handleSubmit} className="flex gap-2">
          <Input
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={LIMITS.chatMessage}
            placeholder="예: 오늘 컨디션이 별로야"
            aria-label="MOMO에게 보낼 메시지"
            disabled={pending}
            className="h-10 min-w-0 flex-1"
          />
          <Button type="submit" disabled={!text.trim() || pending} className="h-10">
            보내기
          </Button>
        </form>
      </CornerFrame>
    </>,
    document.body
  )
}

function MomoSays({ children }: { children: ReactNode }) {
  return (
    <li className="flex items-start gap-2.5">
      <MomoAvatar size={29} />
      <div className="min-w-0 flex-1 pt-1 font-serif text-[14px] leading-relaxed break-words whitespace-pre-line">
        {children}
      </div>
    </li>
  )
}
