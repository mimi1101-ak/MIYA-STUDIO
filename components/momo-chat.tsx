"use client"

import { useEffect, useState, type ReactNode } from "react"

import { MomoAvatar } from "@/components/momo-avatar"

// MOMO와의 대화 줄: 목표 대화와 아이디어 대화가 함께 씁니다.

// MOMO의 말은 프로필과 함께 바탕 없이, 내 말은 오른쪽 흰 상자로
export function ChatBubble({
  role,
  typeOut = false,
  children,
}: {
  role: "user" | "assistant"
  typeOut?: boolean
  children: string
}) {
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

// MOMO가 답을 쓰는 동안 보이는 줄
export function ThinkingLine({ children }: { children: ReactNode }) {
  return (
    <li className="flex items-center gap-3.5 self-start">
      <MomoAvatar size={40} />
      <p className="flex items-center gap-2.5 font-mono text-[13px] leading-relaxed text-muted-foreground">
        <span aria-hidden className="thinking-dots">
          <span />
          <span />
          <span />
        </span>
        {children}
      </p>
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
    // 긴 답(컨설팅 답변 등)은 더 빠르게: 다 읽기 전에 지루하지 않게
    const [pause, tick] = chars.length > 300 ? [70, 6] : [200, 18]
    let count = 0
    let timer: number
    const step = () => {
      count = reduce ? chars.length : count + 1
      setShown(count)
      if (count >= chars.length) return
      timer = window.setTimeout(step, /[.,?!\n]/.test(chars[count - 1]) ? pause : tick)
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
