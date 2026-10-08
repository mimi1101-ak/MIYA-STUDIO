import "server-only"

import type { TaskItem } from "@/components/task-list"
import type { Period } from "@/lib/date"
import type { createClient } from "@/lib/supabase/server"

type Supabase = Awaited<ReturnType<typeof createClient>>

// 한 묶음(오늘/주간/월간)의 할 일을 순서대로 가져옵니다. 실패하면 null.
export async function fetchTasks(
  supabase: Supabase,
  period: Period,
  targetDate: string
): Promise<TaskItem[] | null> {
  const { data, error } = await supabase
    .from("tasks")
    .select("id, title, is_done")
    .eq("period", period)
    .eq("target_date", targetDate)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true })
  return error ? null : data
}
