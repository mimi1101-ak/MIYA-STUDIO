import "server-only"

import { createClient } from "@supabase/supabase-js"

import type { Database } from "@/lib/database.types"

// 서버 전용 관리자 연결(RLS를 거치지 않음). articles 쓰기처럼 "서버만 쓰기" 작업에만 씁니다.
// 비밀 키가 없으면 null을 돌려주고, 호출한 쪽에서 "키 필요" 안내를 보여 줍니다.
export function createAdminClient() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) return null

  return createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
}
