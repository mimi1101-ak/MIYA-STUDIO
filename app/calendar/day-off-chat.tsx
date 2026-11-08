"use client"

import { useEffect, useRef, useState, useTransition, type FormEvent } from "react"

import { MomoAvatar, MomoLine } from "@/components/momo-avatar"
import { CornerFrame, SectionLabel } from "@/components/space-ui"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { formatClock, formatDayLabel, msToKst } from "@/lib/date"
import { applyDayOff, askDayOff } from "@/lib/day-off-actions"
import type { DayOffPreview } from "@/lib/day-off"
import type { ChatMessage } from "@/lib/goal-ai"
import { LIMITS } from "@/lib/validation"

const OPENER = "다른 일정이 생긴 날을 알려 주세요. 그날부터의 할 일을 하루씩 뒤로 밀어 드릴게요."
const EXAMPLES = ["금요일에 외근 있어", "다음 주 수~목 출장"]

function formatAt(iso: string): string {
  const { ymd, minutes } = msToKst(Date.parse(iso))
  return `${formatDayLabel(ymd)} ${formatClock(minutes)}`
}

// 캘린더 옆 작은 대화창: 말하면 MOMO가 날짜를 알아듣고, 옮길 할 일을 미리 보여 준 뒤 확인을 받아 옮깁니다.
// 대화는 저장하지 않습니다(화면을 새로 열면 처음부터).
export function DayOffChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [preview, setPreview] = useState<DayOffPreview | null>(null)
  const [text, setText] = useState("")
  const [error, setError] = useState("")
  const [pending, startTransition] = useTransition()
  const listRef = useRef<HTMLOListElement>(null)

  // 새 말이 오면 대화 목록 안에서만 맨 아래로 (화면 전체는 움직이지 않음)
  useEffect(() => {
    const list = listRef.current
    if (list) list.scrollTop = list.scrollHeight
  }, [messages.length, preview, pending])

  function send(message: string) {
    const trimmed = message.trim()
    if (!trimmed || pending) return
    const history: ChatMessage[] = [...messages, { role: "user", content: trimmed }]
    setMessages(history)
    setPreview(null)
    setError("")
    setText("")
    startTransition(async () => {
      const result = await askDayOff(history)
      if (!result.ok) {
        setError(result.error)
        return
      }
      setMessages([...history, { role: "assistant", content: result.reply }])
      setPreview(result.preview)
    })
  }

  function apply() {
    if (!preview || pending) return
    const target = preview
    setError("")
    startTransition(async () => {
      const result = await applyDayOff(target.dates, target.label)
      if (!result.ok) {
        setError(result.error)
        return
      }
      setPreview(null)
      setMessages((prev) => [...prev, { role: "assistant", content: result.message ?? "옮겼어요." }])
    })
  }

  function cancel() {
    setPreview(null)
    setMessages((prev) => [...prev, { role: "assistant", content: "알겠어요. 그대로 둘게요." }])
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    send(text)
  }

  return (
    <CornerFrame aria-label="MOMO에게 일정 미루기" className="flex flex-col gap-3 p-3.5">
      <SectionLabel code="RESCHEDULE">일정 미루기</SectionLabel>

      <ol ref={listRef} aria-live="polite" className="flex max-h-80 flex-col gap-3 overflow-y-auto pr-1">
        <Line role="assistant">{OPENER}</Line>
        {messages.map((m, i) => (
          <Line key={i} role={m.role}>
            {m.content}
          </Line>
        ))}
        {pending && (
          <li className="flex items-center gap-2.5">
            <MomoAvatar size={29} />
            <span className="flex items-center gap-2 font-mono text-[12px] text-muted-foreground">
              <span aria-hidden className="thinking-dots">
                <span />
                <span />
                <span />
              </span>
              확인하고 있어요…
            </span>
          </li>
        )}
        {preview && !pending && (
          <li className="flex flex-col gap-2.5 border border-dashed border-foreground/25 p-3">
            <p className="text-[13px] font-medium">
              {preview.dates.map(formatDayLabel).join(", ")} → &lsquo;{preview.label}&rsquo;
            </p>
            {preview.moves.length ? (
              <ul className="flex flex-col gap-2">
                {preview.moves.map((m) => (
                  <li key={m.id} className="flex flex-col gap-0.5 text-[12px] leading-snug">
                    <span className="break-words text-foreground">{m.title}</span>
                    <span className="font-mono text-[11px] text-dim tabular-nums">
                      {formatAt(m.from)} → {formatAt(m.to)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[12px] text-muted-foreground">
                그날 할 일은 없어요. 일정만 넣어 두면 앞으로 할 일이 그날로 자동 배치되지 않아요.
              </p>
            )}
            {preview.laterCount > 0 && (
              <p className="text-[12px] text-muted-foreground">
                그 뒤 할 일 {preview.laterCount}개도 하루씩 밀려요(계획 순서는 그대로).
              </p>
            )}
            <div className="flex gap-2">
              <Button type="button" size="sm" onClick={apply}>
                {preview.moves.length + preview.laterCount ? "이대로 옮기기" : "일정만 넣기"}
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={cancel}>
                그만두기
              </Button>
            </div>
          </li>
        )}
      </ol>

      {messages.length === 0 && !pending && (
        <div className="flex flex-wrap gap-1.5">
          {EXAMPLES.map((example) => (
            <button
              key={example}
              type="button"
              onClick={() => setText(example)}
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
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={LIMITS.chatMessage}
          placeholder="예: 금요일에 외근 있어"
          aria-label="MOMO에게 보낼 메시지"
          disabled={pending}
          className="min-w-0 flex-1"
        />
        <Button type="submit" disabled={!text.trim() || pending}>
          보내기
        </Button>
      </form>
    </CornerFrame>
  )
}

// 작은 대화 줄: MOMO의 말은 프로필과 함께, 내 말은 오른쪽 흰 상자로
function Line({ role, children }: { role: "user" | "assistant"; children: string }) {
  if (role === "user") {
    return (
      <li className="max-w-[85%] self-end">
        <p className="pixel-corners bg-primary px-3 py-2 text-[13px] leading-relaxed break-words whitespace-pre-line text-primary-foreground">
          {children}
        </p>
      </li>
    )
  }
  return (
    <li className="flex items-start gap-2.5">
      <MomoAvatar size={29} />
      <p className="min-w-0 pt-1 text-[13px] leading-relaxed break-words whitespace-pre-line">{children}</p>
    </li>
  )
}
