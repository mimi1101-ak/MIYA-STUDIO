"use server"

import { refresh } from "next/cache"

import { requireUser } from "@/lib/auth"
import {
  cleanText,
  isUuid,
  isValidHttpUrl,
  LIMITS,
  URL_ERROR_MESSAGE,
  type ActionResult,
} from "@/lib/validation"

export type ProjectInput = { name: string; url: string; description: string }

function checkInput(input: ProjectInput): { value: ProjectInput } | { error: string } {
  const name = cleanText(input?.name)
  const url = cleanText(input?.url)
  const description = cleanText(input?.description)
  if (!name) return { error: "프로젝트 이름을 입력해 주세요." }
  if (name.length > LIMITS.projectName) return { error: `이름은 ${LIMITS.projectName}자 이내로 입력해 주세요.` }
  if (!isValidHttpUrl(url)) return { error: URL_ERROR_MESSAGE }
  if (description.length > LIMITS.projectDescription) {
    return { error: `설명은 ${LIMITS.projectDescription}자 이내로 입력해 주세요.` }
  }
  return { value: { name, url, description } }
}

const SAVE_ERROR = "저장하지 못했어요. 잠시 후 다시 시도해 주세요."

export async function addProject(input: ProjectInput): Promise<ActionResult> {
  const checked = checkInput(input)
  if ("error" in checked) return { ok: false, error: checked.error }
  const { supabase, userId } = await requireUser()

  const { data: last } = await supabase
    .from("projects")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle()

  const { error } = await supabase
    .from("projects")
    .insert({ ...checked.value, user_id: userId, sort_order: (last?.sort_order ?? -1) + 1 })
  if (error) return { ok: false, error: SAVE_ERROR }

  refresh()
  return { ok: true }
}

export async function updateProject(id: string, input: ProjectInput): Promise<ActionResult> {
  if (!isUuid(id)) return { ok: false, error: "잘못된 요청이에요." }
  const checked = checkInput(input)
  if ("error" in checked) return { ok: false, error: checked.error }
  const { supabase, userId } = await requireUser()

  const { error } = await supabase
    .from("projects")
    .update(checked.value)
    .eq("id", id)
    .eq("user_id", userId)
  if (error) return { ok: false, error: SAVE_ERROR }

  refresh()
  return { ok: true }
}

export async function deleteProject(id: string): Promise<ActionResult> {
  if (!isUuid(id)) return { ok: false, error: "잘못된 요청이에요." }
  const { supabase, userId } = await requireUser()

  const { error } = await supabase.from("projects").delete().eq("id", id).eq("user_id", userId)
  if (error) return { ok: false, error: "삭제하지 못했어요. 잠시 후 다시 시도해 주세요." }

  refresh()
  return { ok: true }
}
