// MOMO가 아이디어 대화를 바탕으로 쓰는 문서(사업계획서·기획서·실행 계획서)의 모양과 읽기.
// 브라우저와 서버가 함께 씁니다. ideas.report에 JSON으로 저장합니다(v: 1).

import type { IdeaKind } from "@/lib/ideas"

// 아이디어 종류에 따라 문서 이름이 바뀝니다.
export const DOC_TYPES: Record<IdeaKind, string> = {
  business: "사업계획서",
  make: "기획서",
  todo: "실행 계획서",
  thought: "실행 계획서",
}

export type IdeaReport = {
  v: 1
  title: string
  oneLiner: string
  summary: string
  strengths: string[]
  problem: string
  solution: string
  target: string
  revenue: string
  edge: string
  roadmap: { phase: string; period: string; goal: string; actions: string[] }[]
  metrics: { label: string; target: string }[]
  budget: { item: string; cost: string }[]
  risks: { risk: string; response: string }[]
  nextSteps: string[]
  cheer: string
}

// 섹션 이름: 사업계획서·기획서는 사업 용어로, 실행 계획서는 생활 용어로
export function sectionTitles(kind: IdeaKind) {
  const action = kind === "todo" || kind === "thought"
  return {
    summary: "요약",
    strengths: "이 아이디어가 좋은 이유",
    problem: action ? "왜 해야 하나" : "문제와 기회",
    solution: action ? "어떻게 할까" : "해결 방법 · 제공 가치",
    target: action ? "누구와 · 무엇이 필요한가" : "고객과 시장",
    revenue: "수익 모델",
    edge: kind === "business" ? "경쟁과 차별점" : "비슷한 것과 다른 점",
    roadmap: "실행 로드맵",
    metrics: action ? "완료 기준" : "목표 숫자",
    budget: "필요한 자원 · 예산",
    risks: "위험과 대응",
    nextSteps: "이번 주 첫 행동",
  }
}

function text(value: unknown, max: number): string {
  return typeof value === "string" ? value.replace(/[ \t]+/g, " ").replace(/\*\*/g, "").trim().slice(0, max) : ""
}

function fields(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {}
}

function list<T>(value: unknown, read: (item: unknown) => T | null, max: number): T[] {
  if (!Array.isArray(value)) return []
  return value
    .map(read)
    .filter((item): item is T => item !== null)
    .slice(0, max)
}

const lines = (max: number, count: number) => (value: unknown) => list(value, (item) => text(item, max) || null, count)

// AI 답변이나 저장된 JSON을 문서 모양으로 정리합니다. 제목·요약이 없으면 null
export function normalizeIdeaReport(raw: unknown): IdeaReport | null {
  const r = fields(raw)
  const title = text(r.title, 100)
  const summary = text(r.summary, 800)
  if (!title || !summary) return null
  return {
    v: 1,
    title,
    oneLiner: text(r.oneLiner, 160),
    summary,
    strengths: lines(300, 3)(r.strengths),
    problem: text(r.problem, 800),
    solution: text(r.solution, 800),
    target: text(r.target, 800),
    revenue: text(r.revenue, 800),
    edge: text(r.edge, 800),
    roadmap: list(
      r.roadmap,
      (item) => {
        const p = fields(item)
        const phase = text(p.phase, 40)
        if (!phase) return null
        return { phase, period: text(p.period, 40), goal: text(p.goal, 200), actions: lines(160, 5)(p.actions) }
      },
      5
    ),
    metrics: list(
      r.metrics,
      (item) => {
        const m = fields(item)
        const label = text(m.label, 40)
        const target = text(m.target, 120)
        return label && target ? { label, target } : null
      },
      6
    ),
    budget: list(
      r.budget,
      (item) => {
        const b = fields(item)
        const name = text(b.item, 60)
        const cost = text(b.cost, 80)
        return name && cost ? { item: name, cost } : null
      },
      8
    ),
    risks: list(
      r.risks,
      (item) => {
        const k = fields(item)
        const risk = text(k.risk, 160)
        const response = text(k.response, 240)
        return risk && response ? { risk, response } : null
      },
      5
    ),
    // "할 일로 보내기"에 그대로 쓰므로 할 일 제목 길이(200자) 안으로
    nextSteps: lines(100, 3)(r.nextSteps),
    cheer: text(r.cheer, 300),
  }
}

// 다른 곳(메모장·문서)에 붙여 넣을 수 있는 글로 바꿉니다.
export function reportToText(report: IdeaReport, kind: IdeaKind, date: string): string {
  const t = sectionTitles(kind)
  const out: string[] = [`[${DOC_TYPES[kind]}] ${report.title}`, `작성: MOMO (MIYA STUDIO) · ${date}`, ""]
  if (report.oneLiner) out.push(report.oneLiner, "")
  let n = 0
  const section = (title: string, body: string[]) => {
    if (body.length === 0) return
    out.push(`${++n}. ${title}`, ...body, "")
  }
  section(t.summary, [report.summary])
  section(t.strengths, report.strengths.map((s) => `- ${s}`))
  section(t.problem, report.problem ? [report.problem] : [])
  section(t.solution, report.solution ? [report.solution] : [])
  section(t.target, report.target ? [report.target] : [])
  section(t.revenue, report.revenue ? [report.revenue] : [])
  section(t.edge, report.edge ? [report.edge] : [])
  section(
    t.roadmap,
    report.roadmap.flatMap((p) => [
      `- ${p.phase}${p.period ? ` (${p.period})` : ""}${p.goal ? `: ${p.goal}` : ""}`,
      ...p.actions.map((a) => `  · ${a}`),
    ])
  )
  section(t.metrics, report.metrics.map((m) => `- ${m.label}: ${m.target}`))
  section(t.budget, report.budget.map((b) => `- ${b.item}: ${b.cost}`))
  section(t.risks, report.risks.map((r) => `- ${r.risk} → ${r.response}`))
  section(t.nextSteps, report.nextSteps.map((s, i) => `${i + 1}) ${s}`))
  if (report.cheer) out.push(`MOMO의 한마디: ${report.cheer}`, "")
  out.push("※ MOMO(AI)가 대화를 바탕으로 쓴 문서예요. 숫자에는 추정이 섞여 있으니 직접 확인하고 쓰세요.")
  return out.join("\n")
}
