import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"

import type { Database } from "@/lib/database.types"

// 서버(서버 컴포넌트·서버 액션·API)에서 쓰는 Supabase 연결.
// 로그인 쿠키를 그대로 사용하므로 RLS 규칙(자기 데이터만)이 적용됩니다.
export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // 서버 컴포넌트에서는 쿠키를 쓸 수 없습니다. proxy.ts가 세션을 갱신하므로 무시해도 됩니다.
          }
        },
      },
    }
  )
}
