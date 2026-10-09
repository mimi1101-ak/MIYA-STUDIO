"use client"

import { Fragment, useEffect, useEffectEvent, useRef, useState } from "react"

import { MomoAvatar } from "@/components/momo-avatar"
import { Button } from "@/components/ui/button"
import { formatClock, msToKst } from "@/lib/date"
import { cn } from "@/lib/utils"

type Result = { content: string } | { error: string }

async function requestMessage(): Promise<Result> {
  try {
    const response = await fetch("/api/daily-message", { method: "POST" })
    const data = await response.json().catch(() => ({}))
    if (response.ok && typeof data.content === "string") return { content: data.content }
    return { error: typeof data.error === "string" ? data.error : "failed" }
  } catch {
    return { error: "failed" }
  }
}

// 이보다 긴 문장은 쉼표 뒤에서 먼저 줄을 바꿉니다(예: "…출근하신 오늘," / "그 수고가…").
const LONG_SENTENCE = 24

// 문장 끝(. ? !)과 줄바꿈마다 한 줄씩. 긴 문장은 쉼표에서 나누고, 그래도 길면 단어 단위로 고르게 나눕니다.
function splitSentences(text: string): string[] {
  return text
    .split(/\n+/)
    .flatMap((part) => part.match(/[^.?!]*[.?!]+|[^.?!]+$/g) ?? [])
    .map((sentence) => sentence.trim())
    .filter(Boolean)
    .flatMap((sentence) => {
      if (Array.from(sentence).length <= LONG_SENTENCE) return [sentence]
      // "1,000"처럼 쉼표 뒤에 띄어쓰기가 없으면 나누지 않습니다.
      const clauses = sentence.split(/,\s+/)
      return clauses.map((clause, i) => (i < clauses.length - 1 ? `${clause},` : clause))
    })
}

type Status = "loading" | "typing" | "done" | "error"

// "오늘" 화면 맨 위 MOMO의 메시지. 저장된 메시지가 없을 때만 서버에 만들어 달라고 요청하고,
// 화면을 열 때마다 한 글자씩 도착합니다(아래 할 일은 기다리지 않고 바로 보임).
export function DailyMessage({
  initialContent,
  arrivedAt,
}: {
  initialContent: string | null
  arrivedAt: string | null
}) {
  const [content, setContent] = useState(initialContent)
  const [arrived, setArrived] = useState(arrivedAt)
  const [status, setStatus] = useState<Status>(initialContent === null ? "loading" : "typing")
  const [errorCode, setErrorCode] = useState<string | null>(null)
  const requested = useRef(false)

  function apply(result: Result) {
    if ("content" in result) {
      setContent(result.content)
      setArrived(formatClock(msToKst(Date.now()).minutes))
      setErrorCode(null)
      setStatus("typing")
    } else {
      setErrorCode(result.error)
      setStatus("error")
    }
  }

  useEffect(() => {
    // 같은 화면에서 두 번 요청하지 않도록 한 번만 실행
    if (initialContent !== null || requested.current) return
    requested.current = true
    requestMessage().then(apply)
  }, [initialContent])

  function retry() {
    setStatus("loading")
    setErrorCode(null)
    requestMessage().then(apply)
  }

  const statusText = {
    loading: "신호 수신 중",
    typing: "수신 중",
    done: arrived ? `${arrived} 도착` : "도착",
    error: "신호가 끊겼어요",
  }[status]

  return (
    <div aria-live="polite" className="flex w-full flex-col items-center gap-7 text-center">
      {/* 보낸 사람 칩: MOMO가 혼자 떠 있지 않게 이름·상태와 한 줄로 묶습니다 */}
      <p className="arrive pixel-corners inline-flex h-11 items-center gap-2.5 bg-foreground/5 pr-4 pl-1.5 font-mono text-[11px] tracking-[0.1em] whitespace-nowrap text-muted-foreground shadow-[inset_0_0_0_1px_rgb(255_255_255/0.14)] md:gap-3 md:pr-[18px] md:text-xs md:tracking-[0.12em]">
        <MomoAvatar size={32} />
        <span className="tracking-[0.16em] text-foreground">MOMO</span>
        <span className="text-foreground/25">·</span>
        오늘의 메시지
        <span className="text-foreground/25">·</span>
        <span className="inline-flex items-center gap-2">
          <span className={cn("signal-dot", (status === "loading" || status === "typing") && "pulse")} />
          {statusText}
        </span>
      </p>

      {status === "loading" ? (
        <div className="flex w-full max-w-xl flex-col items-center gap-3" aria-busy="true">
          <span className="sr-only">MOMO가 오늘의 메시지를 준비하고 있어요…</span>
          <div className="h-5 w-11/12 animate-pulse bg-foreground/10 md:h-7" />
          <div className="h-5 w-3/4 animate-pulse bg-foreground/10 md:h-7" />
          <div className="h-5 w-1/2 animate-pulse bg-foreground/10 md:h-7" />
        </div>
      ) : status === "error" || !content ? (
        <div className="flex flex-col items-center gap-3">
          <p className="font-serif text-xl md:text-2xl">오늘의 메시지를 불러오지 못했어요</p>
          {errorCode === "missing_key" && (
            <p className="text-xs text-dim">AI 키(ANTHROPIC_API_KEY)가 아직 설정되지 않았어요.</p>
          )}
          <Button type="button" variant="outline" onClick={retry}>
            다시 시도
          </Button>
        </div>
      ) : (
        <TypedMessage key={content} text={content} onDone={() => setStatus("done")} />
      )}
    </div>
  )
}

// 한 글자씩 흐림 → 선명으로 도착. 글자 자리는 처음부터 잡아 두어 줄이 흔들리지 않습니다.
// 기기에서 '동작 줄이기'를 켜 두면 바로 전체를 보여 줍니다.
function TypedMessage({ text, onDone }: { text: string; onDone: () => void }) {
  const lines = splitSentences(text).map((line) => Array.from(line))
  const flatText = lines.flat().join("")
  const total = lines.reduce((sum, line) => sum + line.length, 0)
  const starts = lines.map((_, i) => lines.slice(0, i).reduce((sum, line) => sum + line.length, 0))
  const [shown, setShown] = useState(0)
  const finish = useEffectEvent(onDone)

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    const chars = Array.from(flatText)
    let count = 0
    let timer: number
    const step = () => {
      count = reduce ? total : count + 1
      setShown(count)
      if (count >= total) return finish()
      // 문장 부호에서는 잠깐 쉬어 갑니다.
      timer = window.setTimeout(step, /[.,?!]/.test(chars[count - 1] ?? "") ? 380 : 42)
    }
    timer = window.setTimeout(step, reduce ? 0 : 700)
    return () => clearTimeout(timer)
  }, [flatText, total])

  const typing = shown < total
  return (
    <>
      <p className="sr-only">{lines.map((line) => line.join("")).join(" ")}</p>
      <p
        aria-hidden
        className="max-w-[56rem] font-serif text-xl leading-[1.75] tracking-[-0.01em] md:text-[2rem] md:leading-[1.7]"
      >
        {lines.map((line, li) => (
          <span key={li} className="block text-balance">
            {line.map((ch, ci) => {
              const index = starts[li] + ci
              return (
                <Fragment key={ci}>
                  <span className={index < shown ? "char on" : "char"}>{ch}</span>
                  {typing && shown > 0 && index === shown - 1 && (
                    <span className="relative">
                      <span className="caret" />
                    </span>
                  )}
                </Fragment>
              )
            })}
          </span>
        ))}
      </p>
    </>
  )
}
