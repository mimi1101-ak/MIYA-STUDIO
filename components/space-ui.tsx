import type { ComponentProps, ReactNode } from "react"

import { cn } from "@/lib/utils"

// 관측 창: 화면의 핵심 영역(대시보드·대화·계획안)만 네 모서리에 픽셀 괄호를 답니다.
const CORNER = "M0 0H12V3H3V12H0Z M5 5H8V8H5Z"
const CORNERS = ["left-[-1px] top-[-1px]", "right-[-1px] top-[-1px] -scale-x-100", "left-[-1px] bottom-[-1px] -scale-y-100", "right-[-1px] bottom-[-1px] -scale-100"]

export function CornerFrame({
  children,
  className,
  ...props
}: ComponentProps<"section">) {
  return (
    <section className={cn("relative border border-foreground/15 bg-[rgb(8_8_10/0.74)]", className)} {...props}>
      {CORNERS.map((position) => (
        <svg key={position} aria-hidden width="12" height="12" viewBox="0 0 12 12" className={cn("absolute", position)}>
          <path d={CORNER} fill="currentColor" />
        </svg>
      ))}
      {children}
    </section>
  )
}

// 구역 이름표: 영문 고정폭 표시 + 한글 이름. 예: NOW 지금 할 일
export function SectionLabel({ code, children, className }: { code: string; children: ReactNode; className?: string }) {
  return (
    <p className={cn("flex items-baseline gap-2.5 font-mono text-[11px] tracking-[0.18em] text-dim", className)}>
      {code}
      <b className="font-sans text-[13px] font-medium tracking-normal text-foreground">{children}</b>
    </p>
  )
}

// 진척도: 부드러운 막대 대신 칸이 하나씩 켜지는 픽셀 막대
export function SegmentBar({ percent, label, segments = 24 }: { percent: number; label: string; segments?: number }) {
  const lit = Math.round((Math.min(100, Math.max(0, percent)) / 100) * segments)
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuenow={percent}
      aria-valuemin={0}
      aria-valuemax={100}
      className="flex gap-0.5"
    >
      {Array.from({ length: segments }, (_, i) => (
        <span key={i} className={cn("h-1.5 flex-1 transition-colors duration-500", i < lit ? "bg-foreground" : "bg-foreground/10")} />
      ))}
    </div>
  )
}
