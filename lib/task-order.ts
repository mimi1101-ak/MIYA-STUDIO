import "server-only"

import { addDays, kstToIso, msToKst } from "@/lib/date"
import type { Supabase } from "@/lib/schedule-db"

// 할 일은 시각 없이 "날짜 + 그날 안의 순서"만 가집니다 (2026-11-08 개편).
// - 날짜: scheduled_at에 그날 한국 0시로 저장합니다. 예전 할 일은 원래 시각이 남아 있어도 날짜만 봅니다.
// - 순서: sort_order가 작을수록 위. 같은 번호끼리는 예전 시각 → 만든 순서로 줄 세웁니다.
// - 날짜가 없으면(scheduled_at이 비어 있으면) '날짜 미정'입니다.

// DB에서 할 일을 순서대로 가져올 때 쓰는 정렬 (같은 날 안에서 맞는 순서)
export const TASK_ORDER = [
  { column: "sort_order", ascending: true },
  { column: "scheduled_at", ascending: true },
  { column: "created_at", ascending: true },
] as const

export function dayIso(ymd: string): string {
  return kstToIso(ymd)
}

export function ymdOf(scheduledAt: string): string {
  return msToKst(Date.parse(scheduledAt)).ymd
}

// 그날(from~to, 둘 다 포함) 할 일 목록 맨 끝 자리를 차례로 나눠 주는 함수를 만듭니다.
// 예) next("2026-11-08") → 5, 다시 부르면 6 …
export async function createAppender(supabase: Supabase, dates: string[]): Promise<(ymd: string) => number> {
  const max = new Map<string, number>()
  if (dates.length > 0) {
    const sorted = [...dates].sort()
    const { data, error } = await supabase
      .from("tasks")
      .select("scheduled_at, sort_order")
      .gte("scheduled_at", dayIso(sorted[0]))
      .lt("scheduled_at", dayIso(addDays(sorted[sorted.length - 1], 1)))
    if (error) throw new Error("할 일 순서를 불러오지 못했어요")
    for (const t of data) {
      const ymd = ymdOf(t.scheduled_at!)
      max.set(ymd, Math.max(max.get(ymd) ?? -1, t.sort_order))
    }
  }
  return (ymd: string) => {
    const next = (max.get(ymd) ?? -1) + 1
    max.set(ymd, next)
    return next
  }
}

// 그날 할 일 id를 화면에 보이는 순서대로
export async function loadDayOrder(supabase: Supabase, ymd: string): Promise<string[]> {
  let query = supabase
    .from("tasks")
    .select("id")
    .gte("scheduled_at", dayIso(ymd))
    .lt("scheduled_at", dayIso(addDays(ymd, 1)))
  for (const o of TASK_ORDER) query = query.order(o.column, { ascending: o.ascending })
  const { data, error } = await query
  if (error) throw new Error("할 일 순서를 불러오지 못했어요")
  return data.map((t) => t.id)
}

// 어제 이전 날짜에 있는데 못 끝낸 할 일 → 오늘 목록 맨 아래로 (원래 날짜·순서대로), 이월 횟수 +1
export async function carryOverPastTasks(supabase: Supabase, now: number) {
  const today = msToKst(now).ymd
  let query = supabase
    .from("tasks")
    .select("id, scheduled_at, carry_count")
    .eq("is_done", false)
    .not("scheduled_at", "is", null)
    .lt("scheduled_at", dayIso(today))
  for (const o of TASK_ORDER) query = query.order(o.column, { ascending: o.ascending })
  const { data } = await query
  if (!data || data.length === 0) return

  // DB 정렬은 같은 날 안에서만 맞으니, 날짜 순으로 한 번 더 줄 세웁니다(같은 날은 순서 유지).
  const tasks = data
    .map((t, index) => ({ ...t, ymd: ymdOf(t.scheduled_at!), index }))
    .sort((a, b) => a.ymd.localeCompare(b.ymd) || a.index - b.index)
  const next = await createAppender(supabase, [today])
  await Promise.all(
    tasks.map((t) =>
      supabase
        .from("tasks")
        .update({ scheduled_at: dayIso(today), sort_order: next(today), carry_count: t.carry_count + 1 })
        .eq("id", t.id)
        .eq("is_done", false)
        // 오늘·캘린더 화면이 동시에 열려도 한 번만 옮기게, 원래 날짜가 그대로일 때만 바꿉니다.
        .eq("scheduled_at", t.scheduled_at!)
    )
  )
}
