"use server"

import { requireUser } from "@/lib/auth"
import { todayKST } from "@/lib/date"
import { loadPastJournals, type JournalEntry } from "@/lib/journal"
import { cleanText, isValidDate, LIMITS, type ActionResult } from "@/lib/validation"

const BAD_REQUEST: ActionResult = { ok: false, error: "잘못된 요청이에요." }
const SAVE_ERROR: ActionResult = { ok: false, error: "저장하지 못했어요. 잠시 후 다시 시도해 주세요." }

// 오늘이나 지난 날만. (밤 12시를 넘겨 계속 쓰면 화면을 연 날짜로 저장되므로 '어제'도 받습니다.)
function isJournalDate(value: unknown): value is string {
  return typeof value === "string" && isValidDate(value) && value <= todayKST()
}

// 그날 일지를 저장합니다. 글을 모두 지우면 그날 일지도 지웁니다.
// 쓰는 동안 자주 불리는 자동 저장이라 화면을 새로 그리지 않습니다(화면은 이미 최신 글을 갖고 있음).
export async function saveJournal(date: string, content: string): Promise<ActionResult> {
  if (!isJournalDate(date) || typeof content !== "string") return BAD_REQUEST
  const text = cleanText(content)
  if (text.length > LIMITS.journalContent) {
    return { ok: false, error: `일지는 ${LIMITS.journalContent.toLocaleString()}자 이내로 적어 주세요.` }
  }
  const { supabase, userId } = await requireUser()

  const { error } = text
    ? await supabase
        .from("journals")
        .upsert({ user_id: userId, entry_date: date, content: text }, { onConflict: "user_id,entry_date" })
    : await supabase.from("journals").delete().eq("user_id", userId).eq("entry_date", date)
  return error ? SAVE_ERROR : { ok: true }
}

export async function deleteJournal(date: string): Promise<ActionResult> {
  if (!isJournalDate(date)) return BAD_REQUEST
  const { supabase, userId } = await requireUser()

  const { error } = await supabase.from("journals").delete().eq("user_id", userId).eq("entry_date", date)
  return error ? { ok: false, error: "지우지 못했어요. 잠시 후 다시 시도해 주세요." } : { ok: true }
}

// "이전 일지 더 보기": before보다 앞선 날의 일지
export async function loadOlderJournals(
  before: string
): Promise<{ ok: true; entries: JournalEntry[]; hasMore: boolean } | { ok: false; error: string }> {
  if (typeof before !== "string" || !isValidDate(before)) return { ok: false, error: "잘못된 요청이에요." }
  const { supabase } = await requireUser()

  const result = await loadPastJournals(supabase, before)
  return result ? { ok: true, ...result } : { ok: false, error: "일지를 불러오지 못했어요. 잠시 후 다시 시도해 주세요." }
}
