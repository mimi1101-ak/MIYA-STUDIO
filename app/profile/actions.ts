"use server"

import { refresh } from "next/cache"
import { redirect } from "next/navigation"

import { requireUser } from "@/lib/auth"
import { createClient } from "@/lib/supabase/server"
import { cleanText, LIMITS, type ActionResult } from "@/lib/validation"

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

export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect("/login")
}
