import { createBrowserClient } from "@supabase/ssr"

import type { Database } from "@/lib/database.types"

// 브라우저에서 쓰는 Supabase 연결. 공개 값(NEXT_PUBLIC_)만 쓰고, 로그인 쿠키로 RLS 규칙(자기 데이터만)이 그대로 적용됩니다.
// 대시보드 사진처럼 큰 파일을 서버를 거치지 않고 Storage에 바로 올릴 때만 씁니다.
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  )
}
