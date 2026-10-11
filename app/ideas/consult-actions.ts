"use server"

import { refresh } from "next/cache"

import { requireUser } from "@/lib/auth"
import { todayKST } from "@/lib/date"
import { aiErrorMessage } from "@/lib/goal-ai"
import { askIdeaConsultant, writeIdeaReport, type IdeaContext } from "@/lib/idea-ai"
import { DOC_TYPES } from "@/lib/idea-report"
import { kstDateOf, toChat, toIdea, type ChatTurn } from "@/lib/ideas"
import type { Supabase } from "@/lib/schedule-db"
import { cleanText, isUuid, LIMITS, type ActionResult } from "@/lib/validation"

// 아이디어마다 MOMO와 나누는 대화, 그리고 대화를 바탕으로 한 문서(사업계획서·기획서·실행 계획서)

const BAD_REQUEST: ActionResult = { ok: false, error: "잘못된 요청이에요." }
const SAVE_ERROR: ActionResult = { ok: false, error: "저장하지 못했어요. 잠시 후 다시 시도해 주세요." }
// DB 한도(20만 바이트)보다 조금 작게: 넘으면 새 말을 받지 않고 문서로 정리하자고 안내
const MAX_CHAT_BYTES = 180_000

async function loadIdea(supabase: Supabase, id: string) {
  const { data } = await supabase
    .from("ideas")
    .select("id, title, note, kind, status, pinned, created_at, revisited_at, chat")
    .eq("id", id)
    .maybeSingle()
  if (!data) return null
  const idea = toIdea(data)
  const context: IdeaContext = {
    title: idea.title,
    note: idea.note,
    kind: idea.kind,
    status: idea.status,
    createdDate: kstDateOf(idea.createdAt),
  }
  return { idea, context, chat: toChat(data.chat) }
}

export async function sendIdeaMessage(id: string, rawText: string): Promise<ActionResult> {
  const text = cleanText(rawText)
  if (!text) return { ok: false, error: "메시지를 입력해 주세요." }
  if (text.length > LIMITS.chatMessage) return { ok: false, error: `${LIMITS.chatMessage}자 이내로 써 주세요.` }
  if (!isUuid(id)) return BAD_REQUEST
  const { supabase, userId } = await requireUser()
  const loaded = await loadIdea(supabase, id)
  if (!loaded) return BAD_REQUEST

  const history: ChatTurn[] = [...loaded.chat, { role: "user", content: text }]
  if (new TextEncoder().encode(JSON.stringify(history)).length > MAX_CHAT_BYTES) {
    return {
      ok: false,
      error: `대화가 너무 길어져 더 이어 갈 수 없어요. '${DOC_TYPES[loaded.idea.kind]} 쓰기'로 지금까지의 대화를 정리해 보세요.`,
    }
  }
  const now = new Date().toISOString()

  let reply: string
  try {
    reply = await askIdeaConsultant(history, loaded.context, todayKST())
  } catch (error) {
    // 보낸 말은 남겨 두고, 다시 보내면 이어서 답하게 합니다.
    await supabase.from("ideas").update({ chat: history, chatted_at: now }).eq("id", id).eq("user_id", userId)
    refresh()
    return { ok: false, error: aiErrorMessage(error) }
  }

  const { error } = await supabase
    .from("ideas")
    .update({ chat: [...history, { role: "assistant", content: reply }], chatted_at: now, revisited_at: now })
    .eq("id", id)
    .eq("user_id", userId)
  if (error) return SAVE_ERROR

  refresh()
  return { ok: true }
}

export async function writeIdeaReportAction(id: string): Promise<ActionResult> {
  if (!isUuid(id)) return BAD_REQUEST
  const { supabase, userId } = await requireUser()
  const loaded = await loadIdea(supabase, id)
  if (!loaded) return BAD_REQUEST
  if (!loaded.chat.some((m) => m.role === "assistant")) {
    return { ok: false, error: "MOMO와 먼저 이야기를 나눠 주세요. 대화를 바탕으로 문서를 써요." }
  }

  let report
  try {
    report = await writeIdeaReport(loaded.chat, loaded.context, todayKST())
  } catch (error) {
    return { ok: false, error: aiErrorMessage(error) }
  }

  const now = new Date().toISOString()
  const { error } = await supabase
    .from("ideas")
    .update({ report, reported_at: now, revisited_at: now })
    .eq("id", id)
    .eq("user_id", userId)
  if (error) return SAVE_ERROR

  refresh()
  return { ok: true, message: `${DOC_TYPES[loaded.idea.kind]}를 다 썼어요.` }
}
