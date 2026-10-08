import { NextResponse } from "next/server"

import { createClient } from "@/lib/supabase/server"

const PROVIDERS = ["kakao", "google"] as const
type Provider = (typeof PROVIDERS)[number]

// 로그인 시작 주소. 서버에서 로그인 확인용 쿠키(PKCE)를 만든 뒤 카카오·구글 화면으로 보냅니다.
// 브라우저가 아니라 서버에서 쿠키를 만들어야 /auth/callback에서 확실히 읽을 수 있습니다.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const provider = searchParams.get("provider")
  if (!PROVIDERS.includes(provider as Provider)) {
    return NextResponse.redirect(`${origin}/login?error=auth`)
  }

  const supabase = await createClient()
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: provider as Provider,
    options: { redirectTo: `${origin}/auth/callback` },
  })

  if (error || !data.url) {
    console.error("[auth/login] 로그인 시작 실패:", error?.message ?? "no url")
    return NextResponse.redirect(`${origin}/login?error=auth`)
  }
  return NextResponse.redirect(data.url)
}
