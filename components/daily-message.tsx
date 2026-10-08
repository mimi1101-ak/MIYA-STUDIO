"use client"

import { useEffect, useRef, useState } from "react"

import { Button } from "@/components/ui/button"

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

// 대시보드 맨 위 "오늘의 메시지". 저장된 메시지가 없을 때만 서버에 만들어 달라고 요청합니다.
export function DailyMessage({
  initialContent,
  dateLabel,
}: {
  initialContent: string | null
  dateLabel: string
}) {
  const [content, setContent] = useState(initialContent)
  const [loading, setLoading] = useState(initialContent === null)
  const [errorCode, setErrorCode] = useState<string | null>(null)
  const requested = useRef(false)

  function apply(result: Result) {
    if ("content" in result) {
      setContent(result.content)
      setErrorCode(null)
    } else {
      setErrorCode(result.error)
    }
    setLoading(false)
  }

  useEffect(() => {
    // 같은 화면에서 두 번 요청하지 않도록 한 번만 실행
    if (initialContent !== null || requested.current) return
    requested.current = true
    requestMessage().then(apply)
  }, [initialContent])

  function retry() {
    setLoading(true)
    setErrorCode(null)
    requestMessage().then(apply)
  }

  return (
    <section
      aria-label="오늘의 메시지"
      aria-live="polite"
      className="flex flex-col gap-3 rounded-xl bg-card p-5 ring-1 ring-foreground/10 md:p-6"
    >
      <p className="text-xs font-medium text-muted-foreground">오늘의 메시지 · {dateLabel}</p>

      {loading ? (
        <div className="flex flex-col gap-2" aria-busy="true">
          <p className="text-sm text-muted-foreground">MOMO가 오늘의 메시지를 준비하고 있어요…</p>
          <div className="h-4 w-11/12 animate-pulse rounded bg-muted" />
          <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
        </div>
      ) : errorCode ? (
        <div className="flex flex-col items-start gap-3">
          <p className="text-base">오늘의 메시지를 불러오지 못했어요</p>
          {errorCode === "missing_key" && (
            <p className="text-xs text-muted-foreground">
              AI 키(ANTHROPIC_API_KEY)가 아직 설정되지 않았어요.
            </p>
          )}
          <Button type="button" variant="outline" size="sm" onClick={retry}>
            다시 시도
          </Button>
        </div>
      ) : (
        <p className="text-lg leading-relaxed whitespace-pre-line text-foreground md:text-xl">
          {content}
        </p>
      )}
    </section>
  )
}
