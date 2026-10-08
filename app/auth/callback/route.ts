import { NextResponse } from "next/server"

import { createClient } from "@/lib/supabase/server"

// 카카오·구글 로그인 후 돌아오는 주소. 받은 코드를 로그인 세션으로 바꾸고 대시보드로 보냅니다.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get("code")

  // 카카오·구글·Supabase 쪽에서 실패하면 code 대신 error 설명이 붙어 옵니다.
  const providerError = searchParams.get("error_description") ?? searchParams.get("error")
  if (providerError) {
    console.error("[auth/callback] 로그인 서비스 오류:", providerError)
  }

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      const forwardedHost = request.headers.get("x-forwarded-host")
      if (process.env.NODE_ENV !== "development" && forwardedHost) {
        return NextResponse.redirect(`https://${forwardedHost}/`)
      }
      return NextResponse.redirect(`${origin}/`)
    }
    console.error("[auth/callback] 세션 교환 실패:", error.name, error.message)
  }

  return NextResponse.redirect(`${origin}/login?error=auth`)
}
