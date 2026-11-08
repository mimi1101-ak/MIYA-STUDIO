import "server-only"

import { addDays, kstToIso, msToKst } from "@/lib/date"
import type { Supabase } from "@/lib/schedule-db"

// 일지: 날짜(한국 시간)마다 한 편. 화면에는 날짜·글·마지막으로 저장한 시각만 넘깁니다.
export type JournalEntry = { date: string; content: string; updatedAt: string }

// 오늘 끝낸 할 일 (일지 옆 참고용). minutes는 끝낸 시각(0시부터 지난 분)
export type DoneTask = { id: string; title: string; minutes: number }

// 지난 일지는 한 번에 이만큼씩 불러옵니다.
export const JOURNAL_PAGE_SIZE = 30

function toEntry(row: { entry_date: string; content: string; updated_at: string }): JournalEntry {
  return { date: row.entry_date, content: row.content, updatedAt: row.updated_at }
}

export async function loadJournal(supabase: Supabase, date: string): Promise<JournalEntry | null | undefined> {
  const { data, error } = await supabase
    .from("journals")
    .select("entry_date, content, updated_at")
    .eq("entry_date", date)
    .maybeSingle()
  if (error) return undefined
  return data ? toEntry(data) : null
}

// before보다 앞선 날의 일지를 최신 순으로. 한 편 더 불러와서 더 있는지 알려 줍니다. 실패하면 null
export async function loadPastJournals(
  supabase: Supabase,
  before: string
): Promise<{ entries: JournalEntry[]; hasMore: boolean } | null> {
  const { data, error } = await supabase
    .from("journals")
    .select("entry_date, content, updated_at")
    .lt("entry_date", before)
    .order("entry_date", { ascending: false })
    .limit(JOURNAL_PAGE_SIZE + 1)
  if (error) return null
  return { entries: data.slice(0, JOURNAL_PAGE_SIZE).map(toEntry), hasMore: data.length > JOURNAL_PAGE_SIZE }
}

export async function loadDoneTasks(supabase: Supabase, date: string): Promise<DoneTask[] | null> {
  const { data, error } = await supabase
    .from("tasks")
    .select("id, title, done_at")
    .eq("is_done", true)
    .gte("done_at", kstToIso(date))
    .lt("done_at", kstToIso(addDays(date, 1)))
    .order("done_at")
  if (error) return null
  return data.map((t) => ({ id: t.id, title: t.title, minutes: msToKst(Date.parse(t.done_at!)).minutes }))
}
