"use server"

import { refresh } from "next/cache"

import { requireUser } from "@/lib/auth"
import { BOARD_BUCKET } from "@/lib/idea-board"
import { markIdeaInProgress } from "@/lib/idea-links"
import { isIdeaKind, isIdeaStatus, type IdeaKind, type IdeaStatus } from "@/lib/ideas"
import { cleanText, isUuid, LIMITS, type ActionResult } from "@/lib/validation"

export type IdeaInput = { title: string; note: string; kind: IdeaKind }

const BAD_REQUEST: ActionResult = { ok: false, error: "잘못된 요청이에요." }
const SAVE_ERROR: ActionResult = { ok: false, error: "저장하지 못했어요. 잠시 후 다시 시도해 주세요." }

function checkInput(input: IdeaInput): { value: IdeaInput } | { error: string } {
  const title = cleanText(input?.title)
  const note = cleanText(input?.note)
  if (!title) return { error: "아이디어를 한 줄이라도 적어 주세요." }
  if (title.length > LIMITS.ideaTitle) return { error: `한 줄은 ${LIMITS.ideaTitle}자 이내로 적어 주세요.` }
  if (note.length > LIMITS.ideaNote) return { error: `자세한 내용은 ${LIMITS.ideaNote}자 이내로 적어 주세요.` }
  if (!isIdeaKind(input?.kind)) return { error: "종류를 골라 주세요." }
  return { value: { title, note, kind: input.kind } }
}

// 아이디어를 고치거나 상태를 바꾸면 "다시 본" 것으로 칩니다(다시 꺼낸 아이디어에서 빠짐).
const now = () => new Date().toISOString()

export async function addIdea(input: IdeaInput): Promise<ActionResult> {
  const checked = checkInput(input)
  if ("error" in checked) return { ok: false, error: checked.error }
  const { supabase, userId } = await requireUser()

  const { error } = await supabase.from("ideas").insert({ ...checked.value, user_id: userId })
  if (error) return SAVE_ERROR

  refresh()
  return { ok: true }
}

export async function updateIdea(id: string, input: IdeaInput & { status: IdeaStatus }): Promise<ActionResult> {
  if (!isUuid(id) || !isIdeaStatus(input?.status)) return BAD_REQUEST
  const checked = checkInput(input)
  if ("error" in checked) return { ok: false, error: checked.error }
  const { supabase, userId } = await requireUser()

  const { error } = await supabase
    .from("ideas")
    .update({ ...checked.value, status: input.status, revisited_at: now() })
    .eq("id", id)
    .eq("user_id", userId)
  if (error) return SAVE_ERROR

  refresh()
  return { ok: true }
}

export async function setIdeaStatus(id: string, status: IdeaStatus): Promise<ActionResult> {
  if (!isUuid(id) || !isIdeaStatus(status)) return BAD_REQUEST
  const { supabase, userId } = await requireUser()

  const { error } = await supabase
    .from("ideas")
    .update({ status, revisited_at: now() })
    .eq("id", id)
    .eq("user_id", userId)
  if (error) return SAVE_ERROR

  refresh()
  return { ok: true }
}

export async function setIdeaPinned(id: string, pinned: boolean): Promise<ActionResult> {
  if (!isUuid(id) || typeof pinned !== "boolean") return BAD_REQUEST
  const { supabase, userId } = await requireUser()

  const { error } = await supabase
    .from("ideas")
    .update({ pinned, revisited_at: now() })
    .eq("id", id)
    .eq("user_id", userId)
  if (error) return SAVE_ERROR

  refresh()
  return { ok: true }
}

// "다시 봤어요": 아이디어는 그대로 두고 다시 본 때만 지금으로
export async function revisitIdea(id: string): Promise<ActionResult> {
  if (!isUuid(id)) return BAD_REQUEST
  const { supabase, userId } = await requireUser()

  const { error } = await supabase
    .from("ideas")
    .update({ revisited_at: now() })
    .eq("id", id)
    .eq("user_id", userId)
  if (error) return SAVE_ERROR

  refresh()
  return { ok: true }
}

export async function deleteIdea(id: string): Promise<ActionResult> {
  if (!isUuid(id)) return BAD_REQUEST
  const { supabase, userId } = await requireUser()

  // 대시보드 사진 파일도 함께 지웁니다(표의 줄은 아이디어를 지우면 같이 지워짐).
  const folder = `${userId}/${id}`
  const { data: files } = await supabase.storage.from(BOARD_BUCKET).list(folder, { limit: 1000 })
  if (files?.length) {
    const { error: fileError } = await supabase.storage.from(BOARD_BUCKET).remove(files.map((f) => `${folder}/${f.name}`))
    if (fileError) console.error("[ideas] 대시보드 사진 삭제 실패:", fileError.message)
  }

  const { error } = await supabase.from("ideas").delete().eq("id", id).eq("user_id", userId)
  if (error) return { ok: false, error: "지우지 못했어요. 잠시 후 다시 시도해 주세요." }

  refresh()
  return { ok: true }
}

// 아이디어로 목표 만들기: 아이디어 내용으로 'MOMO와 대화 중' 목표를 만듭니다. 화면은 돌려준 목표 화면으로 옮겨 MOMO와 계획을 세웁니다.
// MOMO는 아이디어 메모와 MOMO가 쓴 문서를 읽고 계획을 세웁니다(lib/idea-links.ts의 ideaBriefForGoal).
// 아직 MOMO와 말을 나누지 않은 목표가 이미 있으면 새로 만들지 않고 그 목표로 갑니다(빈 목표가 쌓이지 않게).
export async function createGoalFromIdea(id: string): Promise<ActionResult & { goalId?: string }> {
  if (!isUuid(id)) return BAD_REQUEST
  const { supabase, userId } = await requireUser()

  const { data: idea } = await supabase.from("ideas").select("title, note").eq("id", id).maybeSingle()
  if (!idea) return BAD_REQUEST

  const { data: drafts } = await supabase.from("goals").select("id, chat").eq("idea_id", id).eq("status", "draft")
  let goalId = drafts?.find((g) => Array.isArray(g.chat) && g.chat.length === 0)?.id
  if (!goalId) {
    const { data, error } = await supabase
      .from("goals")
      .insert({
        user_id: userId,
        idea_id: id,
        title: idea.title.slice(0, LIMITS.goalTitle),
        description: idea.note.slice(0, LIMITS.goalDescription),
        status: "draft",
      })
      .select("id")
      .single()
    if (error || !data) return SAVE_ERROR
    goalId = data.id
  }
  await markIdeaInProgress(supabase, userId, id)

  refresh()
  return { ok: true, goalId }
}
