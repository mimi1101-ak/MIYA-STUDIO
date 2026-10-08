"use server"

import { refresh } from "next/cache"
import { redirect } from "next/navigation"

import { requireUser } from "@/lib/auth"
import { createClient } from "@/lib/supabase/server"
import { formatClock } from "@/lib/date"
import { cleanText, isMinuteOfDay, isWeekdayList, LIMITS, type ActionResult } from "@/lib/validation"

export async function updateDisplayName(rawName: string): Promise<ActionResult> {
  const displayName = cleanText(rawName)
  if (!displayName) return { ok: false, error: "표시 이름을 입력해 주세요." }
  if (displayName.length > LIMITS.displayName) {
    return { ok: false, error: `${LIMITS.displayName}자 이내로 입력해 주세요.` }
  }
  const { supabase, userId } = await requireUser()

  // 프로필 행이 없을 때도 저장되도록 upsert(있으면 수정, 없으면 추가)
  const { error } = await supabase
    .from("profiles")
    .upsert({ id: userId, display_name: displayName }, { onConflict: "id" })
  if (error) return { ok: false, error: "저장하지 못했어요. 잠시 후 다시 시도해 주세요." }

  refresh()
  return { ok: true }
}

// 일할 수 있는 시간: AI·자동 배치가 할 일을 넣는 시간대
export async function updateWorkHours(days: number[], start: number, end: number): Promise<ActionResult> {
  if (!isWeekdayList(days) || !isMinuteOfDay(start) || !isMinuteOfDay(end)) {
    return { ok: false, error: "잘못된 요청이에요." }
  }
  if (end - start < 30) return { ok: false, error: "끝 시각은 시작보다 30분 이상 뒤여야 해요." }
  const { supabase, userId } = await requireUser()

  const { error } = await supabase
    .from("profiles")
    .upsert(
      {
        id: userId,
        work_days: [...days].sort(),
        work_start: formatClock(start),
        work_end: formatClock(end),
      },
      { onConflict: "id" }
    )
  if (error) return { ok: false, error: "저장하지 못했어요. 잠시 후 다시 시도해 주세요." }

  refresh()
  return { ok: true }
}

export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect("/login")
}
