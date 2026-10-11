"use client"

import { Check, Copy, Sparkles } from "lucide-react"
import { useState, useTransition, type ReactNode } from "react"

import { MomoAvatar } from "@/components/momo-avatar"
import { MetaCell, Section } from "@/components/report-parts"
import { Button } from "@/components/ui/button"
import { DOC_TYPES, reportToText, sectionTitles, type IdeaReport } from "@/lib/idea-report"
import type { IdeaKind } from "@/lib/ideas"
import { quickAdd } from "@/lib/schedule-actions"
import { cn } from "@/lib/utils"

const CIRCLED = ["①", "②", "③", "④", "⑤"]

// 종이 문서의 머리: MIYA STUDIO · 날짜 · 문서 이름 + 두 줄 선
export function PaperHead({ right }: { right: string }) {
  return (
    <>
      <div className="flex items-baseline justify-between gap-2 text-[11px] tracking-wide text-muted-foreground">
        <span>MIYA STUDIO</span>
        <span className="tabular-nums">{right}</span>
      </div>
      <div aria-hidden className="mt-2 mb-4 h-[5px] border-t-2 border-b border-foreground" />
    </>
  )
}

export const paperClass = "flex flex-col rounded-sm bg-card px-5 py-5 ring-1 ring-foreground/15 md:px-8 md:py-7"

const paragraph = "text-sm leading-7 whitespace-pre-line break-words"

// MOMO가 대화를 바탕으로 쓴 문서. 내용이 없는 섹션은 빼고 번호를 차례로 매깁니다.
export function ReportDocument({
  report,
  kind,
  ideaTitle,
  date,
  busy,
  onRewrite,
}: {
  report: IdeaReport
  kind: IdeaKind
  ideaTitle: string
  date: string
  busy: boolean
  onRewrite: () => void
}) {
  const docType = DOC_TYPES[kind]
  const t = sectionTitles(kind)
  const [copied, setCopied] = useState(false)

  async function copy() {
    const value = reportToText(report, kind, date)
    let ok = false
    try {
      await navigator.clipboard.writeText(value)
      ok = true
    } catch {
      // 일부 브라우저(앱 안 브라우저 등)는 위 방식을 막아서, 예전 방식으로 한 번 더 시도합니다.
      const area = document.createElement("textarea")
      area.value = value
      area.setAttribute("readonly", "")
      area.style.position = "fixed"
      area.style.opacity = "0"
      document.body.appendChild(area)
      area.select()
      ok = document.execCommand("copy")
      area.remove()
    }
    if (!ok) return window.alert("복사하지 못했어요. 브라우저가 복사를 막았을 수 있어요.")
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const sections: { title: string; alwaysOpen?: boolean; content: ReactNode }[] = [
    {
      title: t.summary,
      alwaysOpen: true,
      content: <p className={cn(paragraph, "border-l-[3px] border-foreground/40 bg-muted/60 px-3 py-2.5")}>{report.summary}</p>,
    },
  ]
  if (report.strengths.length > 0) {
    sections.push({
      title: t.strengths,
      alwaysOpen: true,
      content: (
        <ol className="flex flex-col gap-2.5">
          {report.strengths.map((line, i) => (
            <li key={i} className="grid grid-cols-[1.25rem_minmax(0,1fr)] gap-1 text-sm leading-7">
              <span aria-hidden>{CIRCLED[i]}</span>
              <span>{line}</span>
            </li>
          ))}
        </ol>
      ),
    })
  }
  for (const key of ["problem", "solution", "target", "revenue", "edge"] as const) {
    if (report[key]) sections.push({ title: t[key], content: <p className={paragraph}>{report[key]}</p> })
  }
  if (report.roadmap.length > 0) {
    sections.push({
      title: t.roadmap,
      content: (
        <ol className="flex flex-col gap-4">
          {report.roadmap.map((phase, i) => (
            <li key={i} className="border-l-2 border-foreground/25 pl-3.5">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <p className="text-sm font-semibold">
                  <span className="font-mono text-xs text-dim">{String(i + 1).padStart(2, "0")} </span>
                  {phase.phase}
                </p>
                {phase.period && <p className="font-mono text-xs text-muted-foreground">{phase.period}</p>}
              </div>
              {phase.goal && <p className="mt-1 text-sm leading-6 text-muted-foreground">{phase.goal}</p>}
              {phase.actions.length > 0 && (
                <ul className="mt-1.5 flex flex-col gap-1 text-sm leading-6">
                  {phase.actions.map((action, j) => (
                    <li key={j} className="grid grid-cols-[1rem_minmax(0,1fr)]">
                      <span aria-hidden>·</span>
                      <span>{action}</span>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ol>
      ),
    })
  }
  if (report.metrics.length > 0) {
    sections.push({
      title: t.metrics,
      content: (
        <Table rows={report.metrics.map((m) => [m.label, m.target])} />
      ),
    })
  }
  if (report.budget.length > 0) {
    sections.push({
      title: t.budget,
      content: <Table rows={report.budget.map((b) => [b.item, b.cost])} />,
    })
  }
  if (report.risks.length > 0) {
    sections.push({
      title: t.risks,
      content: (
        <ul className="flex flex-col gap-3">
          {report.risks.map((r, i) => (
            <li key={i} className="text-sm leading-6">
              <p className="font-semibold">{r.risk}</p>
              <p className="text-muted-foreground">→ {r.response}</p>
            </li>
          ))}
        </ul>
      ),
    })
  }
  if (report.nextSteps.length > 0) {
    sections.push({
      title: t.nextSteps,
      alwaysOpen: true,
      content: (
        <ol className="flex flex-col gap-2">
          {report.nextSteps.map((step, i) => (
            <NextStep key={`${i}-${step}`} number={i + 1} step={step} />
          ))}
        </ol>
      ),
    })
  }

  return (
    <article aria-label={docType} className={paperClass}>
      <PaperHead right={`${date} · ${docType}`} />

      <p className="text-center font-mono text-[11px] tracking-[0.4em] text-dim">{docType}</p>
      <h2 className="mt-1 text-center font-serif text-xl leading-snug font-semibold break-words md:text-2xl">{report.title}</h2>
      {report.oneLiner && (
        <p className="mx-auto mt-2 max-w-md text-center text-sm leading-relaxed text-muted-foreground">{report.oneLiner}</p>
      )}

      {/* 결재 서류처럼 정보 표 */}
      <dl className="mt-4 mb-2 grid grid-cols-[4.5rem_minmax(0,1fr)] border-t border-l border-foreground/25 text-xs sm:grid-cols-[4.5rem_minmax(0,1fr)_4.5rem_minmax(0,1fr)]">
        <MetaCell label="문서">{docType}</MetaCell>
        <MetaCell label="작성일">{date}</MetaCell>
        <MetaCell label="작성자">MOMO</MetaCell>
        <MetaCell label="바탕">MOMO와 나눈 대화</MetaCell>
        <MetaCell label="아이디어" wide>
          {ideaTitle}
        </MetaCell>
      </dl>

      {sections.map((section, i) => (
        <Section key={section.title} number={i + 1} title={section.title} alwaysOpen={section.alwaysOpen}>
          {section.content}
        </Section>
      ))}

      {report.cheer && (
        <div className="mt-6 flex items-start gap-3 border border-dashed border-foreground/20 p-3">
          <MomoAvatar size={40} />
          <div className="flex min-w-0 flex-col gap-1">
            <p className="font-mono text-[11px] tracking-[0.14em] text-dim">MOMO의 한마디</p>
            <p className="font-serif text-[15px] leading-relaxed break-words">{report.cheer}</p>
          </div>
        </div>
      )}

      <p className="mt-5 text-center text-[11px] leading-relaxed text-muted-foreground">
        ※ MOMO(AI)가 대화를 바탕으로 쓴 문서예요. 숫자에는 추정이 섞여 있으니 직접 확인하고 쓰세요.
      </p>

      <div className="mt-4 flex flex-wrap items-center justify-end gap-1 border-t pt-3">
        <Button type="button" size="sm" variant="ghost" className="text-muted-foreground" disabled={busy} onClick={onRewrite}>
          <Sparkles data-icon="inline-start" />
          대화 반영해 다시 쓰기
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={copy}>
          {copied ? <Check data-icon="inline-start" /> : <Copy data-icon="inline-start" />}
          {copied ? "복사했어요" : "글로 복사"}
        </Button>
      </div>
    </article>
  )
}

function Table({ rows }: { rows: [string, string][] }) {
  return (
    <dl className="grid grid-cols-[minmax(6rem,38%)_minmax(0,1fr)] text-sm">
      {rows.map(([label, value], i) => (
        <div key={i} className="contents">
          <dt className="border-b py-1.5 pr-2 font-semibold break-words">{label}</dt>
          <dd className="border-b py-1.5 break-words">{value}</dd>
        </div>
      ))}
    </dl>
  )
}

// 이번 주 첫 행동 하나. "할 일로 넣기"를 누르면 빠른 입력과 같은 규칙으로 빈 시간에 들어갑니다.
function NextStep({ number, step }: { number: number; step: string }) {
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null)
  const [pending, startTransition] = useTransition()

  function send() {
    setResult(null)
    startTransition(async () => {
      const res = await quickAdd(step, "task")
      setResult(res.ok ? { ok: true, text: `할 일로 넣었어요. ${res.message ?? ""}`.trim() } : { ok: false, text: res.error })
    })
  }

  return (
    <li className="flex flex-col gap-1.5 border border-foreground/15 px-3 py-2.5">
      <div className="flex items-start gap-3">
        <span className="font-mono text-xs leading-6 text-dim">{String(number).padStart(2, "0")}</span>
        <p className="min-w-0 flex-1 text-sm leading-6 font-medium break-words">{step}</p>
        <Button
          type="button"
          size="sm"
          variant={result?.ok ? "ghost" : "outline"}
          disabled={pending || result?.ok}
          onClick={send}
          className="shrink-0"
        >
          {result?.ok ? "넣었어요" : pending ? "넣는 중…" : "할 일로 넣기"}
        </Button>
      </div>
      {result && (
        <p role={result.ok ? "status" : "alert"} className={cn("pl-7 text-xs", result.ok ? "text-muted-foreground" : "text-destructive")}>
          {result.text}
        </p>
      )}
    </li>
  )
}
