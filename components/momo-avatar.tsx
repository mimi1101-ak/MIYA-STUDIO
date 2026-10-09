import Image from "next/image"
import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

// MOMO 프로필. 사용자가 준 원본(public/momo.png, 흰 바탕)을 자르기·색 바꾸기·둥글리기 없이
// 크기만 바꿔 보여 줍니다. 이미지 최적화(다시 저장)도 끄고, 픽셀이 뭉개지지 않게 또렷하게 그립니다.
// 29px보다 작으면 1칸짜리 눈 픽셀이 사라질 수 있어 29px 이상만 씁니다.
export function MomoAvatar({
  size,
  alt = "",
  className,
}: {
  size: 29 | 30 | 32 | 40 | 58
  alt?: string
  className?: string
}) {
  return (
    <Image
      src="/momo.png"
      alt={alt}
      width={size}
      height={size}
      unoptimized
      className={cn("block shrink-0 [image-rendering:pixelated]", className)}
    />
  )
}

// MOMO 신호 줄: 저장·이동·오류 같은 안내를 MOMO가 말하는 한 줄로 보여 줍니다.
export function MomoLine({
  children,
  tone = "normal",
  className,
}: {
  children: ReactNode
  tone?: "normal" | "error"
  className?: string
}) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "flex items-center gap-3 border border-dashed border-foreground/15 px-3 py-2 text-[13px] leading-relaxed",
        tone === "error" ? "text-destructive" : "text-foreground/85",
        className
      )}
    >
      <MomoAvatar size={29} />
      {/* 한글 문장은 고정폭 글꼴이면 띄어쓰기가 너무 넓어 보여서, 이름표만 고정폭 */}
      <span className="hidden shrink-0 font-mono tracking-wider text-dim sm:inline">MOMO ›</span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}
