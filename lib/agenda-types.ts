// "오늘"과 캘린더 화면이 함께 쓰는 데이터 모양 (브라우저에서도 씀)

export type ItemKind = "task" | "event" | "routine"

export const KIND_LABELS: Record<ItemKind, string> = {
  task: "할 일",
  event: "일정",
  routine: "루틴",
}

// 화면에 놓이는 항목 하나. 시각은 한국 날짜(ymd) + 0시부터 지난 분(start/end)
export type AgendaItem = {
  key: string
  kind: ItemKind
  id: string
  title: string
  ymd: string
  start: number
  end: number
  done: boolean
  goalId: string | null
  goalTitle: string | null
  source: "manual" | "ai" | null
  carryCount: number
}

export type UnscheduledTask = {
  id: string
  title: string
  minutes: number
  goalTitle: string | null
  source: "manual" | "ai"
}

export type GoalOption = { id: string; title: string }

// 목표별 진척: 예상 소요시간(분) 합계 기준
export type GoalProgress = {
  id: string
  title: string
  deadline: string | null
  weekDone: number
  weekTotal: number
  done: number
  total: number
}

export function percent(done: number, total: number): number {
  return total > 0 ? Math.round((done / total) * 100) : 0
}

export function sortItems(items: AgendaItem[]): AgendaItem[] {
  const order: Record<ItemKind, number> = { event: 0, routine: 1, task: 2 }
  return [...items].sort(
    (a, b) =>
      a.ymd.localeCompare(b.ymd) || a.start - b.start || order[a.kind] - order[b.kind] || a.end - b.end
  )
}
