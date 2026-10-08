import { NextResponse } from "next/server"

import { generateMotivation, MissingAiKeyError } from "@/lib/daily-message"
import { todayKST } from "@/lib/date"
import { createClient } from "@/lib/supabase/server"

// 오늘의 메시지를 돌려줍니다. 이미 있으면 저장된 것을, 없을 때만 AI를 한 번 호출해 만들고 저장합니다.
export async function POST() {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getClaims()
  const userId = auth?.claims?.sub
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const today = todayKST()
  const readSaved = () =>
    supabase
      .from("daily_messages")
      .select("content")
      .eq("user_id", userId)
      .eq("message_date", today)
      .maybeSingle()

  const existing = await readSaved()
  if (existing.error) {
    return NextResponse.json({ error: "failed" }, { status: 500 })
  }
  if (existing.data) {
    return NextResponse.json({ content: existing.data.content })
  }

  let content: string
  try {
    content = await generateMotivation(today)
  } catch (error) {
    if (error instanceof MissingAiKeyError) {
      return NextResponse.json({ error: "missing_key" }, { status: 503 })
    }
    console.error("[daily-message] 생성 실패:", error instanceof Error ? error.message : error)
    return NextResponse.json({ error: "failed" }, { status: 502 })
  }

  // 동시에 두 번 요청돼도 하루 한 개만 남도록, 이미 있으면 새로 넣지 않습니다.
  const { error: insertError } = await supabase
    .from("daily_messages")
    .upsert(
      { user_id: userId, message_date: today, content },
      { onConflict: "user_id,message_date", ignoreDuplicates: true }
    )
  if (insertError) {
    return NextResponse.json({ error: "failed" }, { status: 500 })
  }

  const saved = await readSaved()
  return NextResponse.json({ content: saved.data?.content ?? content })
}
