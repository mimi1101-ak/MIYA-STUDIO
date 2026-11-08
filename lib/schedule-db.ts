import "server-only"

import { parseClock } from "@/lib/date"
import { DEFAULT_WORK_HOURS, type WorkHours } from "@/lib/schedule"
import type { createClient } from "@/lib/supabase/server"

// 일정 관련 DB 공통 부분. 할 일의 날짜·순서 규칙은 lib/task-order.ts에 있습니다.

export type Supabase = Awaited<ReturnType<typeof createClient>>

// 일하는 요일·시간: MOMO가 계획을 짤 때(하루에 얼마나 넣을지)와 일정 미루기(쉬는 날 건너뛰기)에 씁니다.
export async function loadWorkHours(supabase: Supabase, userId: string): Promise<WorkHours> {
  const { data } = await supabase
    .from("profiles")
    .select("work_days, work_start, work_end")
    .eq("id", userId)
    .maybeSingle()
  if (!data) return DEFAULT_WORK_HOURS
  return {
    days: data.work_days,
    start: parseClock(data.work_start) ?? DEFAULT_WORK_HOURS.start,
    end: parseClock(data.work_end) ?? DEFAULT_WORK_HOURS.end,
  }
}
