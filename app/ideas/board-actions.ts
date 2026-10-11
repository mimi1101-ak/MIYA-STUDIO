"use server"

import { refresh } from "next/cache"

import { requireUser } from "@/lib/auth"
import {
  BOARD_BUCKET,
  BOARD_CAPTION_MAX,
  BOARD_COLS,
  BOARD_MAX_ITEMS,
  BOARD_MAX_ROWS,
  defaultSpans,
  isBoardPath,
  type BoardLayoutChange,
} from "@/lib/idea-board"
import { cleanText, isUuid, type ActionResult } from "@/lib/validation"

// 사업 아이디어 대시보드: 사진 등록·배치 저장·삭제
// 사진 파일은 브라우저가 Storage에 바로 올리고(서버를 거치면 크기 제한에 걸림), 여기서는 보드에 등록만 합니다.

const BAD_REQUEST: ActionResult = { ok: false, error: "잘못된 요청이에요." }
const SAVE_ERROR: ActionResult = { ok: false, error: "저장하지 못했어요. 잠시 후 다시 시도해 주세요." }

const isSize = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 10000

const isSpan = (value: unknown, max: number): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= max

export async function addBoardItems(
  ideaId: string,
  uploads: { path: string; width: number; height: number }[]
): Promise<ActionResult> {
  if (!isUuid(ideaId) || !Array.isArray(uploads) || uploads.length === 0) return BAD_REQUEST
  const { supabase, userId } = await requireUser()
  if (!uploads.every((u) => isBoardPath(u?.path, userId, ideaId) && isSize(u.width) && isSize(u.height))) {
    return BAD_REQUEST
  }

  const { data: idea } = await supabase.from("ideas").select("kind").eq("id", ideaId).maybeSingle()
  if (!idea || idea.kind !== "business") return BAD_REQUEST

  const { data: existing, error: countError } = await supabase
    .from("idea_board_items")
    .select("sort_order")
    .eq("idea_id", ideaId)
    .order("sort_order", { ascending: false })
  if (countError) return SAVE_ERROR
  if (existing.length + uploads.length > BOARD_MAX_ITEMS) {
    return { ok: false, error: `보드 하나에는 사진을 ${BOARD_MAX_ITEMS}장까지 올릴 수 있어요.` }
  }

  const start = (existing[0]?.sort_order ?? -1) + 1
  const { error } = await supabase.from("idea_board_items").insert(
    uploads.map((u, i) => {
      const { colSpan, rowSpan } = defaultSpans(u.width, u.height)
      return {
        user_id: userId,
        idea_id: ideaId,
        path: u.path,
        width: u.width,
        height: u.height,
        col_span: colSpan,
        row_span: rowSpan,
        sort_order: start + i,
      }
    })
  )
  if (error) return SAVE_ERROR

  refresh()
  return { ok: true }
}

// 순서·크기·맞춤·설명 저장. 화면은 이미 바뀌어 있으므로 다시 그리지(refresh) 않습니다.
export async function saveBoardLayout(ideaId: string, changes: BoardLayoutChange[]): Promise<ActionResult> {
  if (!isUuid(ideaId) || !Array.isArray(changes) || changes.length === 0 || changes.length > BOARD_MAX_ITEMS) {
    return BAD_REQUEST
  }
  const valid = changes.every(
    (c) =>
      isUuid(c?.id) &&
      Number.isInteger(c.sortOrder) &&
      c.sortOrder >= 0 &&
      c.sortOrder < 10000 &&
      isSpan(c.colSpan, BOARD_COLS) &&
      isSpan(c.rowSpan, BOARD_MAX_ROWS) &&
      (c.fit === "cover" || c.fit === "contain") &&
      typeof c.caption === "string" &&
      cleanText(c.caption).length <= BOARD_CAPTION_MAX
  )
  if (!valid) return BAD_REQUEST
  const { supabase, userId } = await requireUser()

  const results = await Promise.all(
    changes.map((c) =>
      supabase
        .from("idea_board_items")
        .update({
          sort_order: c.sortOrder,
          col_span: c.colSpan,
          row_span: c.rowSpan,
          fit: c.fit,
          caption: cleanText(c.caption),
        })
        .eq("id", c.id)
        .eq("idea_id", ideaId)
        .eq("user_id", userId)
    )
  )
  if (results.some((r) => r.error)) return SAVE_ERROR
  return { ok: true }
}

export async function deleteBoardItem(id: string): Promise<ActionResult> {
  if (!isUuid(id)) return BAD_REQUEST
  const { supabase, userId } = await requireUser()

  const { data: item } = await supabase.from("idea_board_items").select("path").eq("id", id).maybeSingle()
  if (!item) return BAD_REQUEST

  // 파일을 먼저 지우고, 표에서 지웁니다(파일이 남아 공간을 차지하지 않게).
  const { error: fileError } = await supabase.storage.from(BOARD_BUCKET).remove([item.path])
  if (fileError) console.error("[idea-board] 파일 삭제 실패:", fileError.message)
  const { error } = await supabase.from("idea_board_items").delete().eq("id", id).eq("user_id", userId)
  if (error) return { ok: false, error: "지우지 못했어요. 잠시 후 다시 시도해 주세요." }

  refresh()
  return { ok: true }
}
