// "비서 읽기 보고서" 모양과 읽기 (브라우저·서버 공용)
// articles.summary에는 보고서를 JSON 글자로 저장합니다(v: 2).
// 예전 형식(첫 줄 요지 + 다음 줄 핵심)은 "간단 요약"으로 읽어서 보여 줍니다.

export type ArticleReport = {
  v: 2
  field: string
  keywords: string[]
  conclusion: string
  background: string
  points: { title: string; detail: string }[]
  facts: { label: string; text: string }[]
  quote: string | null
  advice: string[]
}

export type ParsedSummary =
  | { kind: "report"; report: ArticleReport }
  | { kind: "simple"; gist: string; points: string[] }

function text(value: unknown, max: number): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : ""
}

function list<T>(value: unknown, read: (item: unknown) => T | null, max: number): T[] {
  if (!Array.isArray(value)) return []
  return value
    .map(read)
    .filter((item): item is T => item !== null)
    .slice(0, max)
}

function fields(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null
}

// AI 답변이나 저장된 JSON을 보고서 모양으로 정리합니다. 결론이 없으면 null
export function normalizeReport(raw: unknown): ArticleReport | null {
  const r = fields(raw)
  if (!r) return null
  const conclusion = text(r.conclusion, 300)
  if (!conclusion) return null
  return {
    v: 2,
    field: text(r.field, 40),
    keywords: list(r.keywords, (k) => text(k, 20) || null, 6),
    conclusion,
    background: text(r.background, 500),
    points: list(
      r.points,
      (item) => {
        const p = fields(item)
        const title = text(p?.title, 60)
        const detail = text(p?.detail, 400)
        return title && detail ? { title, detail } : null
      },
      5
    ),
    facts: list(
      r.facts,
      (item) => {
        const f = fields(item)
        const label = text(f?.label, 20)
        const body = text(f?.text, 160)
        return label && body ? { label, text: body } : null
      },
      4
    ),
    quote: text(r.quote, 120) || null,
    advice: list(r.advice, (a) => text(a, 160) || null, 3),
  }
}

export function parseSummary(summary: string | null): ParsedSummary | null {
  if (!summary) return null
  if (summary.startsWith("{")) {
    try {
      const report = normalizeReport(JSON.parse(summary))
      if (report) return { kind: "report", report }
    } catch {
      // 아래 간단 요약으로 읽습니다.
    }
  }
  const [gist, ...points] = summary.split("\n").map((line) => line.trim()).filter(Boolean)
  return gist ? { kind: "simple", gist, points } : null
}
