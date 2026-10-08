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

  const base =
    "flex h-11 w-full items-center justify-center rounded-lg text-sm font-medium transition-opacity aria-disabled:pointer-events-none aria-disabled:opacity-60"

  return (
    <div className="flex flex-col gap-3">
      <a
        href="/auth/login?provider=kakao"
        onClick={() => setPending("kakao")}
        aria-disabled={pending !== null || undefined}
        className={cn(base, "bg-[#FEE500] text-black/85 hover:opacity-90")}
      >
        {pending === "kakao" ? "카카오로 이동 중…" : "카카오로 로그인"}
      </a>
      <a
        href="/auth/login?provider=google"
        onClick={() => setPending("google")}
        aria-disabled={pending !== null || undefined}
        className={cn(base, "border bg-background text-foreground hover:bg-muted")}
      >
        {pending === "google" ? "구글로 이동 중…" : "구글로 로그인"}
      </a>
      {hasError && (
        <p role="alert" className="text-center text-sm text-destructive">
          로그인에 실패했어요. 다시 시도해 주세요.
        </p>
      )}
    </div>
  )
}
