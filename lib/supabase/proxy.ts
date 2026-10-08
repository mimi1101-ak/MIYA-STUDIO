import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

import type { Database } from "@/lib/database.types"

const PUBLIC_PATHS = ["/login", "/auth"]

// 모든 요청마다 로그인 세션을 갱신하고, 로그인 여부에 따라 이동시킵니다.
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
          Object.entries(headers).forEach(([key, value]) =>
            supabaseResponse.headers.set(key, value)
          )
        },
      },
    }
  )

  // createServerClient와 getClaims 사이에는 다른 코드를 넣지 않습니다(세션이 끊길 수 있음).
  const { data } = await supabase.auth.getClaims()
  const isLoggedIn = Boolean(data?.claims)

  const { pathname } = request.nextUrl
  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))
  const isApi = pathname.startsWith("/api/")

  // 로그인하지 않았으면 로그인 화면으로 (API는 각자 401 응답)
  if (!isLoggedIn && !isPublic && !isApi) {
    return redirectWithCookies(request, "/login", supabaseResponse)
  }

  // 이미 로그인했는데 로그인 화면을 열면 대시보드로
  if (isLoggedIn && pathname === "/login") {
    return redirectWithCookies(request, "/", supabaseResponse)
  }

  return supabaseResponse
}

function redirectWithCookies(request: NextRequest, path: string, from: NextResponse) {
  const url = request.nextUrl.clone()
  url.pathname = path
  url.search = ""
  const response = NextResponse.redirect(url)
  from.cookies.getAll().forEach((cookie) => response.cookies.set(cookie))
  return response
}
