"use client"

import { useRouter } from "next/navigation"
import { useEffect, useRef, useState, useTransition, type FormEvent, type KeyboardEvent } from "react"

import { MomoAvatar, MomoLine } from "@/components/momo-avatar"
import { CornerFrame, SectionLabel } from "@/components/space-ui"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import type { ChatMessage } from "@/lib/goal-ai"
import { LIMITS } from "@/lib/validation"

import { sendGoalMessage } from "./actions"

const EXAMPLES = ["12월까지 전자책 5권 쓰기", "3달 안에 토익 900점", "이번 달에 포트폴리오 사이트 완성"]

// MOMO와 목표를 정하는 대화창
export function GoalChat({ goalId, messages }: { goalId: string | null; messages: ChatMessage[] }) {
  const router = useRouter()
  const [text, setText] = useState("")
  const [sending, setSending] = useState<string | null>(null)
  const [error, setError] = useState("")
  const [pending, startTransition] = useTransition()
  const endRef = useRef<HTMLDivElement>(null)
  // 화면을 연 뒤에 새로 온 MOMO의 답만 한 글자씩 보여 줍니다(이전 대화는 바로 보임).
  const [firstUnseen] = useState(messages.length)

  // 새 메시지가 오면 맨 아래로
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "nearest" })
  }, [messages.length, pending])

  function send(message: string) {
    const trimmed = message.trim()
    if (!trimmed || pending) return
    setError("")
    setSending(trimmed)
    setText("")
    startTransition(async () => {
      const result = await sendGoalMessage(goalId, trimmed)
      setSending(null)
      if (!result.ok) setError(result.error)
      // 첫 메시지로 목표가 새로 만들어졌으면 그 목표 주소로 옮깁니다.
      if (!goalId && result.goalId) router.replace(`/goals/${result.goalId}`)
    })
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    send(text)
  }

  // Enter로 보내기, Shift+Enter로 줄바꿈
  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault()
      send(text)
    }
  }

  const shown = sending && !messages.some((m, i) => i === messages.length - 1 && m.content === sending)
    ? [...messages, { role: "user" as const, content: sending }]
    : messages

  return (
    <CornerFrame aria-label="MOMO와 대화" className="flex flex-col gap-6 p-4 md:p-6">
      <SectionLabel code="CHANNEL">MOMO와 대화</SectionLabel>

      <ol className="flex flex-col gap-6" aria-live="polite">
        <Bubble role="assistant">
          {"어떤 목표를 이루고 싶으세요? 대충 말해 주셔도 돼요.\n필요한 것만 몇 가지 여쭤본 뒤, 월 → 주 → 일 단위로 할 일을 쪼갠 계획안을 보여 드릴게요."}
        </Bubble>
        {shown.map((m, i) => (
          <Bubble key={i} role={m.role} typeOut={m.role === "assistant" && i >= firstUnseen}>
            {m.content}
          </Bubble>
        ))}
        {pending && (
          <li className="flex items-center gap-3.5 self-start">
            <MomoAvatar size={40} />
            <p className="flex items-center gap-2.5 font-mono text-[13px] leading-relaxed text-muted-foreground">
              <span aria-hidden className="thinking-dots">
                <span />
                <span />
                <span />
              </span>
              MOMO가 생각하고 있어요… 계획안을 만들 때는 1~2분 걸릴 수 있어요.
            </p>
          </li>
        )}
      </ol>
      <div ref={endRef} />

      {messages.length === 0 && !pending && (
        <div className="flex flex-col gap-2.5">
          <p className="font-mono text-[11px] tracking-[0.14em] text-dim">예시 · 누르면 입력 칸에 채워져요</p>
          <div className="flex flex-wrap gap-2">
            {EXAMPLES.map((example) => (
              <button
                key={example}
                type="button"
                onClick={() => setText(example)}
                className="h-10 border border-dashed border-foreground/30 px-4 text-sm transition-colors hover:border-solid hover:border-foreground hover:bg-foreground/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
              >
                {example}
              </button>
            ))}
          </div>
        </div>
      )}

      {error && <MomoLine tone="error">{error}</MomoLine>}

      <form onSubmit={handleSubmit} className="flex flex-col gap-2.5 border-t border-foreground/10 pt-5">
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          maxLength={LIMITS.chatMessage}
          rows={3}
          placeholder={messages.length ? "답하거나, 계획을 고쳐 달라고 말해 보세요." : "예: 12월까지 전자책 5권 쓰기"}
          aria-label="MOMO에게 보낼 메시지"
          disabled={pending}
          className="px-3.5 py-3 leading-relaxed"
        />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="font-mono text-[11px] text-dim">Enter로 보내기 · Shift+Enter로 줄바꿈</span>
          <Button type="submit" className="h-11 px-5" disabled={!text.trim() || pending}>
            {pending ? "답을 기다리는 중…" : "보내기"}
          </Button>
        </div>
      </form>
    </CornerFrame>
  )
}

// MOMO의 말은 프로필과 함께 바탕 없이, 내 말은 오른쪽 흰 상자로
function Bubble({ role, typeOut = false, children }: { role: ChatMessage["role"]; typeOut?: boolean; children: string }) {
  if (role === "user") {
    return (
      <li className="flex max-w-[85%] flex-col items-end gap-1.5 self-end">
        <p className="font-mono text-[11px] tracking-[0.14em] text-dim">나</p>
        <p className="pixel-corners bg-primary px-4 py-3 text-[15px] leading-relaxed whitespace-pre-line break-words text-primary-foreground">
          {children}
        </p>
      </li>
    )
  }
  return (
    <li className="flex max-w-[94%] items-start gap-3.5 self-start">
      <MomoAvatar size={40} />
      <div className="flex min-w-0 flex-col gap-1.5">
        <p className="font-mono text-[11px] tracking-[0.14em] text-dim">MOMO</p>
        <p className="text-[15px] leading-[1.8] whitespace-pre-line break-words md:text-base">
          {typeOut ? <TypeOut text={children} /> : children}
        </p>
      </div>
    </li>
  )
}

// 새로 온 답을 한 글자씩. 화면 읽기 프로그램에는 전체 문장을 한 번에 알려 줍니다.
function TypeOut({ text }: { text: string }) {
  const [shown, setShown] = useState(0)
  const total = Array.from(text).length

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    const chars = Array.from(text)
    let count = 0
    let timer: number
    const step = () => {
      count = reduce ? chars.length : count + 1
      setShown(count)
      if (count >= chars.length) return
      timer = window.setTimeout(step, /[.,?!\n]/.test(chars[count - 1]) ? 200 : 18)
    }
    timer = window.setTimeout(step, reduce ? 0 : 150)
    return () => clearTimeout(timer)
  }, [text])

  return (
    <>
      <span className="sr-only">{text}</span>
      <span aria-hidden>
        {Array.from(text).slice(0, shown).join("")}
        {shown < total && <span className="caret-inline" />}
      </span>
    </>
  )
}
