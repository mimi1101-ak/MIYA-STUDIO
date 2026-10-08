import "server-only"

import { redirect } from "next/navigation"
import { connection } from "next/server"

import { createClient } from "@/lib/supabase/server"

// 로그인한 사용자를 확인합니다. 로그인하지 않았으면 로그인 화면으로 보냅니다.
// 서버 컴포넌트와 서버 액션에서 데이터에 접근하기 전에 항상 호출합니다.
export async function requireUser() {
  // 여기부터는 실제 요청이 왔을 때만 실행합니다. 로그인 확인과 "오늘" 날짜 계산이
  // 현재 시각을 쓰므로, 미리 그려 두는 단계(prerender)에서는 실행하지 않게 합니다.
  await connection()

  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()
  const claims = data?.claims
  if (!claims?.sub) {
    redirect("/login")
  }
  return { supabase, userId: claims.sub, claims }
}
