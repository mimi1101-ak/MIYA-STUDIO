"use client"

import { useSearchParams } from "next/navigation"
import { useState } from "react"

import { cn } from "@/lib/utils"

type Provider = "kakao" | "google"

// 버튼은 서버의 로그인 시작 주소(/auth/login)로 가는 링크입니다.
// 서버가 로그인 확인용 쿠키를 만든 뒤 카카오·구글 화면으로 보내 줍니다.
export function LoginButtons() {
  const searchParams = useSearchParams()
  const [pending, setPending] = useState<Provider | null>(null)
  const hasError = Boolean(searchParams.get("error")) && pending === null

  // 픽셀 모서리 버튼. 카카오 버튼의 노란색은 카카오 로그인 디자인 가이드라 흑백 규칙의 예외입니다.
  const base =
    "pixel-corners flex h-12 w-full items-center justify-center text-[15px] font-medium transition-colors focus-visible:outline-none focus-visible:shadow-[inset_0_0_0_3px_#040405] aria-disabled:pointer-events-none aria-disabled:opacity-60"

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2.5 sm:flex-row">
        <a
          href="/auth/login?provider=kakao"
          onClick={() => setPending("kakao")}
          aria-disabled={pending !== null || undefined}
          className={cn(base, "bg-[#FEE500] text-black/85 hover:bg-[#FFEB3B]")}
        >
          {pending === "kakao" ? "카카오로 이동 중…" : "카카오로 로그인"}
        </a>
        <a
          href="/auth/login?provider=google"
          onClick={() => setPending("google")}
          aria-disabled={pending !== null || undefined}
          className={cn(
            base,
            "bg-foreground/5 text-foreground shadow-[inset_0_0_0_1px_rgb(255_255_255/0.22)] hover:bg-foreground/10 focus-visible:shadow-[inset_0_0_0_2px_#f3f3f1]"
          )}
        >
          {pending === "google" ? "구글로 이동 중…" : "구글로 로그인"}
        </a>
      </div>
      {hasError && (
        <p role="alert" className="text-center text-sm text-destructive">
          로그인에 실패했어요. 다시 시도해 주세요.
        </p>
      )}
    </div>
  )
}
