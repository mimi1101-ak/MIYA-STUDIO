// 아이디어: 종류·상태 이름, 그리고 옛날 아이디어가 묻히지 않게 다시 꺼내는 규칙.
// 화면(브라우저)과 서버가 함께 씁니다.

import { daysBetween, msToKst } from "@/lib/date"

export const IDEA_KINDS = ["todo", "business", "make", "thought"] as const
export type IdeaKind = (typeof IDEA_KINDS)[number]

// 이름표: 영문 고정폭 표시 + 한글 이름 (SectionLabel과 같은 모양)
export const KIND_INFO: Record<IdeaKind, { label: string; code: string; example: string }> = {
  todo: { label: "할 일", code: "TODO", example: "예: 세금 신고 서류 모으기" },
  business: { label: "사업", code: "BIZ", example: "예: 동네 반려견 산책 구독 서비스" },
  make: { label: "만들기", code: "MAKE", example: "예: 읽은 책을 기록하는 앱" },
  thought: { label: "생각", code: "NOTE", example: "예: 아침 루틴을 30분 당겨 보기" },
}

export const IDEA_STATUSES = ["open", "doing", "done"] as const
export type IdeaStatus = (typeof IDEA_STATUSES)[number]

export const STATUS_LABELS: Record<IdeaStatus, string> = {
  open: "모아 둠",
  doing: "진행 중",
  done: "끝냄",
}

export type Idea = {
  id: string
  title: string
  note: string
  kind: IdeaKind
  status: IdeaStatus
  pinned: boolean
  createdAt: string
  // 마지막으로 다시 본 때. 적을 때·고칠 때·"다시 봤어요"를 누를 때 지금으로 바뀝니다.
  revisitedAt: string
  // MOMO와 대화한 적이 있는지, MOMO가 쓴 문서(사업계획서 등)가 있는지
  chatted: boolean
  reported: boolean
}

export function isIdeaKind(value: unknown): value is IdeaKind {
  return IDEA_KINDS.includes(value as IdeaKind)
}

export function isIdeaStatus(value: unknown): value is IdeaStatus {
  return IDEA_STATUSES.includes(value as IdeaStatus)
}

type IdeaRow = {
  id: string
  title: string
  note: string
  kind: string
  status: string
  pinned: boolean
  created_at: string
  revisited_at: string
  chatted_at?: string | null
  reported_at?: string | null
}

export function toIdea(row: IdeaRow): Idea {
  return {
    id: row.id,
    title: row.title,
    note: row.note,
    kind: isIdeaKind(row.kind) ? row.kind : "thought",
    status: isIdeaStatus(row.status) ? row.status : "open",
    pinned: row.pinned,
    createdAt: row.created_at,
    revisitedAt: row.revisited_at,
    chatted: Boolean(row.chatted_at),
    reported: Boolean(row.reported_at),
  }
}

// MOMO와 나눈 대화(ideas.chat)를 읽습니다. 모양이 틀린 줄은 버립니다.
export type ChatTurn = { role: "user" | "assistant"; content: string }

export function toChat(value: unknown): ChatTurn[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((m) =>
    m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string"
      ? [{ role: m.role as ChatTurn["role"], content: m.content as string }]
      : []
  )
}

// ── 묻히지 않게 ────────────────────────────────────────────
// 일주일 넘게 다시 보지 않은 아이디어를 MOMO가 맨 위로 3개씩 꺼냅니다(가장 오래된 것부터).
// "다시 봤어요"를 누르면 그 아이디어는 다시 일주일 뒤에 돌아오고, 다음 아이디어가 올라옵니다.
export const RECALL_AFTER_DAYS = 7
export const RECALL_COUNT = 3

// DB의 날짜시간 → 한국 날짜 (YYYY-MM-DD)
export function kstDateOf(iso: string): string {
  return msToKst(Date.parse(iso)).ymd
}

// 적은 지 며칠
export function ageDays(idea: Idea, today: string): number {
  return Math.max(0, daysBetween(kstDateOf(idea.createdAt), today))
}

// 마지막으로 다시 본 지 며칠
export function quietDays(idea: Idea, today: string): number {
  return Math.max(0, daysBetween(kstDateOf(idea.revisitedAt), today))
}

// 일주일 넘게 손대지 않은, 아직 끝내지 않은 아이디어 (고정한 아이디어는 늘 위에 있으니 빼요)
export function isBuried(idea: Idea, today: string): boolean {
  return idea.status !== "done" && !idea.pinned && quietDays(idea, today) >= RECALL_AFTER_DAYS
}

export function buriedIdeas(ideas: Idea[], today: string): Idea[] {
  return sortIdeas(
    ideas.filter((idea) => isBuried(idea, today)),
    "quiet"
  )
}

export const IDEA_SORTS = ["quiet", "newest", "oldest"] as const
export type IdeaSort = (typeof IDEA_SORTS)[number]

export const SORT_LABELS: Record<IdeaSort, string> = {
  quiet: "오래 안 본 순",
  newest: "최근 적은 순",
  oldest: "처음 적은 순",
}

const time = (iso: string) => Date.parse(iso)

// 고정한 아이디어를 맨 앞에 두고, 나머지는 고른 순서대로
export function sortIdeas(ideas: Idea[], sort: IdeaSort): Idea[] {
  const compare = {
    quiet: (a: Idea, b: Idea) => time(a.revisitedAt) - time(b.revisitedAt) || time(a.createdAt) - time(b.createdAt),
    newest: (a: Idea, b: Idea) => time(b.createdAt) - time(a.createdAt),
    oldest: (a: Idea, b: Idea) => time(a.createdAt) - time(b.createdAt),
  }[sort]
  return [...ideas].sort((a, b) => Number(b.pinned) - Number(a.pinned) || compare(a, b))
}
