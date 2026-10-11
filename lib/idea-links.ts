import "server-only"

import { percent } from "@/lib/agenda-types"
import { DOC_TYPES, normalizeIdeaReport, reportToText } from "@/lib/idea-report"
import { isIdeaKind, KIND_INFO, kstDateOf, toChat, type IdeaLinks } from "@/lib/ideas"
import type { Supabase } from "@/lib/schedule-db"

// 아이디어 ↔ 할 일·목표 연결 (서버 전용)

// 아이디어를 할 일·목표로 옮기면 '모아 둠'은 '진행 중'으로, 다시 본 때는 지금으로 바꿉니다.
// 이미 진행 중이거나 끝낸 아이디어는 상태를 그대로 둡니다.
export async function markIdeaInProgress(supabase: Supabase, userId: string, ideaId: string) {
  const { data } = await supabase.from("ideas").select("status").eq("id", ideaId).maybeSingle()
  if (!data) return
  const { error } = await supabase
    .from("ideas")
    .update({ revisited_at: new Date().toISOString(), ...(data.status === "open" ? { status: "doing" } : {}) })
    .eq("id", ideaId)
    .eq("user_id", userId)
  if (error) console.error("[ideas] 진행 중으로 바꾸기 실패:", error.message)
}

// 아이디어별로 연결된 할 일·목표를 모읍니다. ideaId를 주면 그 아이디어만. 실패하면 null
export async function loadIdeaLinks(supabase: Supabase, ideaId?: string): Promise<Record<string, IdeaLinks> | null> {
  let tasksQuery = supabase
    .from("tasks")
    .select("id, title, is_done, scheduled_at, estimated_minutes, idea_id")
    .not("idea_id", "is", null)
  let goalsQuery = supabase.from("goals").select("id, title, status, idea_id").not("idea_id", "is", null)
  if (ideaId) {
    tasksQuery = tasksQuery.eq("idea_id", ideaId)
    goalsQuery = goalsQuery.eq("idea_id", ideaId)
  }
  const [tasks, goals] = await Promise.all([
    tasksQuery.order("scheduled_at", { ascending: true, nullsFirst: false }).order("created_at", { ascending: true }),
    goalsQuery.order("created_at", { ascending: true }),
  ])
  if (tasks.error || goals.error) return null

  // 목표마다 끝낸 비율: 그 목표에 묶인 할 일의 예상 시간 합계 기준 (목표 화면과 같은 계산)
  const progress = new Map<string, { done: number; total: number }>()
  if (goals.data.length > 0) {
    const goalTasks = await supabase
      .from("tasks")
      .select("goal_id, estimated_minutes, is_done")
      .in(
        "goal_id",
        goals.data.map((g) => g.id)
      )
    if (goalTasks.error) return null
    for (const t of goalTasks.data) {
      const p = progress.get(t.goal_id!) ?? { done: 0, total: 0 }
      p.total += t.estimated_minutes
      if (t.is_done) p.done += t.estimated_minutes
      progress.set(t.goal_id!, p)
    }
  }

  const links: Record<string, IdeaLinks> = {}
  const of = (id: string) => (links[id] ??= { goals: [], tasks: [] })
  for (const g of goals.data) {
    const p = progress.get(g.id)
    of(g.idea_id!).goals.push({ id: g.id, title: g.title, status: g.status, percent: p ? percent(p.done, p.total) : null })
  }
  for (const t of tasks.data) {
    of(t.idea_id!).tasks.push({
      id: t.id,
      title: t.title,
      done: t.is_done,
      scheduledAt: t.scheduled_at,
      minutes: t.estimated_minutes,
    })
  }
  return links
}

const MAX_BRIEF_CHARS = 12_000
const MAX_CHAT_TURNS = 6
const MAX_TURN_CHARS = 1_200

// 아이디어로 만든 목표를 MOMO와 계획할 때 함께 보내는 아이디어 요약.
// MOMO가 쓴 문서가 있으면 문서를, 없으면 아이디어 대화의 최근 몇 마디를 붙입니다.
export async function ideaBriefForGoal(supabase: Supabase, ideaId: string): Promise<string | null> {
  const { data } = await supabase
    .from("ideas")
    .select("title, note, kind, chat, report, reported_at")
    .eq("id", ideaId)
    .maybeSingle()
  if (!data) return null
  const kind = isIdeaKind(data.kind) ? data.kind : "thought"

  const lines = [
    "[앱이 붙인 참고 정보: 이 목표의 출발점인 아이디어]",
    "사용자가 아이디어 메모에서 이 목표를 만들었습니다. 아래 내용은 이미 아는 것으로 보고 다시 묻지 말고 목표와 계획에 반영하세요.",
    "MOMO가 쓴 문서가 있으면 그 로드맵·목표 숫자·이번 주 첫 행동을 계획의 뼈대로 쓰되, 마감일과 쓸 수 있는 시간처럼 문서에 없는 것만 묻습니다.",
    "",
    `종류: ${KIND_INFO[kind].label}`,
    `한 줄: ${data.title}`,
  ]
  if (data.note) lines.push(`자세한 내용: ${data.note}`)

  const report = normalizeIdeaReport(data.report)
  if (report) {
    lines.push("", `--- MOMO가 쓴 ${DOC_TYPES[kind]} ---`, reportToText(report, kind, data.reported_at ? kstDateOf(data.reported_at) : "-"))
  } else {
    const chat = toChat(data.chat).slice(-MAX_CHAT_TURNS)
    if (chat.length > 0) {
      lines.push("", "--- 아이디어를 두고 MOMO와 나눈 최근 대화 ---")
      for (const m of chat) {
        lines.push(`${m.role === "user" ? "사용자" : "MOMO"}: ${m.content.slice(0, MAX_TURN_CHARS)}`)
      }
    }
  }
  return lines.join("\n").slice(0, MAX_BRIEF_CHARS)
}
