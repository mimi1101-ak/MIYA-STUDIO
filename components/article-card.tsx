"use client"

import { ChevronDown, ExternalLink, Loader2, Sparkles, Trash2 } from "lucide-react"
import Link from "next/link"
import { useState, useTransition, type FormEvent, type ReactNode } from "react"

import { addMemo, deleteInsight, updateMemo } from "@/app/insights/actions"
import { deleteArticle, summarizeArticle } from "@/app/news/actions"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { parseSummary, type ArticleReport } from "@/lib/report"
import type { MemoView, SavedArticleView } from "@/lib/saved-articles"
import { canAutoRead, SOURCE_LABELS } from "@/lib/sources"
import { cn } from "@/lib/utils"
import { LIMITS, type ActionResult } from "@/lib/validation"

// 저장한 글 = 비서가 올린 "읽기 보고서" 한 장.
// 접으면 표지(결론 + 핵심 소제목), 펼치면 결론·배경·핵심·숫자·비서 의견·내 검토 메모.
export function ArticleCard({ article, compact = false }: { article: SavedArticleView; compact?: boolean }) {
  const [expanded, setExpanded] = useState(false)
  const [pasting, setPasting] = useState(false)
  const [pasted, setPasted] = useState("")
  const [error, setError] = useState("")
  const [pending, startTransition] = useTransition()
  const [deleting, startDelete] = useTransition()

  const parsed = parseSummary(article.summary)
  const report = parsed?.kind === "report" ? parsed.report : null
  const autoRead = canAutoRead(article.source)

  function summarize(text = "") {
    setError("")
    startTransition(async () => {
      const result = await summarizeArticle(article.id, text)
      if (!result.ok) return setError(result.error)
      setPasting(false)
      setPasted("")
    })
  }

  // 직접 읽을 수 있는 글은 바로 보고서를 만들고, 아니면 붙여 넣기 칸을 엽니다.
  function startReport() {
    setError("")
    if (autoRead) summarize()
    else setPasting(true)
  }

  function handleDelete() {
    const note = article.memos.length
      ? `\n(메모 ${article.memos.length}개는 '글 없이 쓴 인사이트'로 남아요.)`
      : ""
    if (!window.confirm(`"${article.title}" 글을 삭제할까요?${note}`)) return
    setError("")
    startDelete(async () => {
      const result = await deleteArticle(article.id)
      if (!result.ok) setError(result.error)
    })
  }

  let body: ReactNode
  if (pending) {
    body = (
      <p role="status" className="flex items-center gap-1.5 bg-muted/60 px-3 py-3 text-sm text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" aria-hidden />
        비서가 글을 읽고 보고서를 쓰는 중이에요… (20초 안팎)
      </p>
    )
  } else if (pasting) {
    body = (
      <PasteForm
        sourceLabel={SOURCE_LABELS[article.source]}
        value={pasted}
        onChange={(value) => {
          setPasted(value)
          setError("")
        }}
        onSubmit={() => summarize(pasted)}
        onCancel={() => setPasting(false)}
      />
    )
  } else if (expanded && !compact) {
    body = report ? (
      <FullReport article={article} report={report} />
    ) : (
      <div className="flex flex-col">
        <CoverSummary article={article} />
        <Section number={1} title="내 검토 메모" alwaysOpen>
          <Memos articleId={article.id} memos={article.memos} />
        </Section>
      </div>
    )
  } else {
    body = <CoverSummary article={article} />
  }

  const showFullReport = expanded && !compact && report && !pending && !pasting

  return (
    <li className="flex flex-col rounded-sm bg-card px-5 py-5 ring-1 ring-foreground/15 md:px-8 md:py-7">
      <div className="flex items-baseline justify-between gap-2 text-[11px] tracking-wide text-muted-foreground">
        <span>MIYA STUDIO 비서 · 읽기 보고서</span>
        <span className="tabular-nums">
          {article.reportDate ?? article.dateLabel} · No. {String(article.docNumber).padStart(3, "0")}
        </span>
      </div>
      {/* 보고서 머리의 두 줄 선 */}
      <div aria-hidden className="mt-2 mb-4 h-[5px] border-t-2 border-b border-foreground" />

      {!showFullReport && (
        <div className="mb-3 flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="secondary">{SOURCE_LABELS[article.source]}</Badge>
            {article.category && <Badge variant="outline">{article.category}</Badge>}
          </div>
          <a
            href={article.url}
            target="_blank"
            rel="noopener noreferrer"
            className="font-serif text-lg leading-snug font-semibold break-words hover:underline"
          >
            {article.title}{" "}
            <ExternalLink
              className="inline size-3.5 align-[-1px] text-muted-foreground"
              aria-label="원문 새 탭에서 열기"
            />
          </a>
        </div>
      )}

      {body}

      {error && (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {error}
        </p>
      )}

      {/* 아래 줄: 메모 수, 보고서 만들기·삭제·펼치기 */}
      {!pending && !pasting && (
        <div className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 border-t pt-3 text-xs">
          <span className="text-muted-foreground">내 검토 메모 {article.memos.length}</span>
          {compact ? (
            <Link href="/insights" className="ml-auto text-muted-foreground hover:text-foreground">
              저장한 글에서 보기 →
            </Link>
          ) : (
            <div className="ml-auto flex flex-wrap items-center gap-1">
              {(!report || expanded) && (
                <Button type="button" size="xs" variant="ghost" className="text-muted-foreground" onClick={startReport}>
                  <Sparkles data-icon="inline-start" />
                  {report
                    ? "보고서 다시 만들기"
                    : parsed
                      ? "보고서로 다시 만들기"
                      : autoRead
                        ? "보고서 만들기"
                        : "내용 붙여 넣고 보고서 만들기"}
                </Button>
              )}
              <Button
                type="button"
                size="xs"
                variant="ghost"
                disabled={deleting}
                onClick={handleDelete}
                className="text-muted-foreground hover:text-destructive"
              >
                <Trash2 data-icon="inline-start" />
                {deleting ? "삭제 중…" : "글 삭제"}
              </Button>
              <Button
                type="button"
                size="xs"
                variant="outline"
                onClick={() => setExpanded((v) => !v)}
                aria-expanded={expanded}
              >
                {expanded ? "보고서 접기" : "보고서 펼쳐 보기"}
                <ChevronDown data-icon="inline-end" className={cn("transition-transform", expanded && "rotate-180")} />
              </Button>
            </div>
          )}
        </div>
      )}
    </li>
  )
}

// 표지: 결론과 핵심 소제목만. 예전 형식이면 간단 요약, 없으면 안내
function CoverSummary({ article }: { article: SavedArticleView }) {
  const parsed = parseSummary(article.summary)
  if (!parsed) {
    return <p className="bg-muted/60 px-3 py-3 text-sm text-muted-foreground">아직 보고서가 없어요.</p>
  }
  if (parsed.kind === "simple") {
    return (
      <div className="flex flex-col gap-2 border-l-[3px] border-foreground/30 bg-muted/60 px-3 py-2.5">
        <span className="text-[11px] text-muted-foreground">간단 요약 · 예전 형식이에요. 보고서로 다시 만들 수 있어요.</span>
        <p className="text-sm leading-relaxed font-medium">{parsed.gist}</p>
        {parsed.points.length > 0 && (
          <ul className="list-disc pl-5 text-sm leading-relaxed text-muted-foreground">
            {parsed.points.map((point, i) => (
              <li key={i}>{point}</li>
            ))}
          </ul>
        )}
      </div>
    )
  }
  const { report } = parsed
  return (
    <div className="flex flex-col gap-3">
      <div className="border-l-[3px] border-foreground/40 bg-muted/60 px-3 py-2.5">
        <span className="text-[11px] text-muted-foreground">결론</span>
        <p className="text-sm leading-relaxed">{report.conclusion}</p>
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="text-xs text-muted-foreground">핵심 {report.points.length}가지</span>
        <div className="flex flex-wrap gap-1.5">
          {report.points.map((point, i) => (
            <Badge key={i} variant="outline" className="h-auto py-0.5 whitespace-normal">
              {point.title}
            </Badge>
          ))}
        </div>
      </div>
    </div>
  )
}

const CIRCLED = ["①", "②", "③", "④", "⑤"]

function FullReport({ article, report }: { article: SavedArticleView; report: ArticleReport }) {
  // 내용이 없는 섹션은 빼고 번호를 차례로 매깁니다.
  const sections: { title: string; alwaysOpen?: boolean; content: ReactNode }[] = [
    {
      title: "결론",
      alwaysOpen: true,
      content: (
        <p className="border-l-[3px] border-foreground/40 bg-muted/60 px-3 py-2.5 text-sm leading-relaxed">
          {report.conclusion}
        </p>
      ),
    },
  ]
  if (report.background) {
    sections.push({
      title: "배경 · 문제 제기",
      content: <p className="text-sm leading-7">{report.background}</p>,
    })
  }
  sections.push({
    title: "핵심 내용",
    content: (
      <ol className="flex flex-col gap-3">
        {report.points.map((point, i) => (
          <li key={i} className="grid grid-cols-[1.25rem_minmax(0,1fr)] gap-1 text-sm leading-7">
            <span aria-hidden>{CIRCLED[i]}</span>
            <span>
              <strong className="font-semibold">{point.title}</strong>
              <br />
              {point.detail}
            </span>
          </li>
        ))}
      </ol>
    ),
  })
  if (report.facts.length > 0 || report.quote) {
    sections.push({
      title: "눈여겨볼 숫자 · 인용",
      content: (
        <dl className="grid grid-cols-[6rem_minmax(0,1fr)] text-sm">
          {report.facts.map((fact, i) => (
            <div key={i} className="contents">
              <dt className="border-b py-1.5 pr-2 font-semibold">{fact.label}</dt>
              <dd className="border-b py-1.5">{fact.text}</dd>
            </div>
          ))}
          {report.quote && (
            <div className="contents">
              <dt className="border-b py-1.5 pr-2 font-semibold">인용</dt>
              <dd className="border-b py-1.5 font-serif">&ldquo;{report.quote}&rdquo;</dd>
            </div>
          )}
        </dl>
      ),
    })
  }
  if (report.advice.length > 0) {
    sections.push({
      title: "비서 의견 · 이렇게 써먹어 보세요",
      content: (
        <ul className="flex flex-col gap-1.5 text-sm leading-7">
          {report.advice.map((line, i) => (
            <li key={i} className="grid grid-cols-[1rem_minmax(0,1fr)]">
              <span aria-hidden>·</span>
              <span>{line}</span>
            </li>
          ))}
        </ul>
      ),
    })
  }
  sections.push({
    title: "내 검토 메모",
    alwaysOpen: true,
    content: <Memos articleId={article.id} memos={article.memos} />,
  })

  return (
    <div className="flex flex-col">
      <a
        href={article.url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-center font-serif text-xl leading-snug font-semibold break-words hover:underline"
      >
        {article.title}
      </a>

      {/* 결재 서류처럼 정보 표 */}
      <dl className="mt-4 mb-2 grid grid-cols-[4.5rem_minmax(0,1fr)] border-t border-l border-foreground/25 text-xs sm:grid-cols-[4.5rem_minmax(0,1fr)_4.5rem_minmax(0,1fr)]">
        <MetaCell label="출처">
          {SOURCE_LABELS[article.source]} ·{" "}
          <a href={article.url} target="_blank" rel="noopener noreferrer" className="underline-offset-4 hover:underline">
            원문 보기 ↗
          </a>
        </MetaCell>
        <MetaCell label="보고일">{article.reportDate ?? "-"}</MetaCell>
        {report.field && (
          <MetaCell label="분야" wide>
            {report.field}
          </MetaCell>
        )}
        {report.keywords.length > 0 && (
          <MetaCell label="키워드" wide>
            {report.keywords.join(" · ")}
          </MetaCell>
        )}
      </dl>

      {sections.map((section, i) => (
        <Section key={section.title} number={i + 1} title={section.title} alwaysOpen={section.alwaysOpen}>
          {section.content}
        </Section>
      ))}

      <p className="mt-6 text-center text-[11px] text-muted-foreground">
        ※ AI 비서가 원문을 읽고 정리한 보고서예요. 정확한 내용은 원문에서 확인하세요.
      </p>
    </div>
  )
}

function MetaCell({ label, wide = false, children }: { label: string; wide?: boolean; children: ReactNode }) {
  return (
    <>
      <dt className="border-r border-b border-foreground/25 bg-muted/60 px-2 py-1.5 text-muted-foreground">{label}</dt>
      <dd className={cn("border-r border-b border-foreground/25 px-2 py-1.5 break-words", wide && "sm:col-span-3")}>
        {children}
      </dd>
    </>
  )
}

// 보고서 섹션. 휴대폰에서는 눌러서 펼치고, 넓은 화면에서는 항상 펼쳐 둡니다.
function Section({
  number,
  title,
  alwaysOpen = false,
  children,
}: {
  number: number
  title: string
  alwaysOpen?: boolean
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const heading = `${number}. ${title}`
  return (
    <section className="mt-5">
      <h3 className="mb-2 border-b border-foreground/25 pb-1 font-serif text-[15px] font-semibold">
        {alwaysOpen ? (
          heading
        ) : (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className="flex w-full items-center justify-between text-left md:pointer-events-none"
          >
            {heading}
            <ChevronDown className={cn("size-4 transition-transform md:hidden", open && "rotate-180")} aria-hidden />
          </button>
        )}
      </h3>
      <div className={cn(!alwaysOpen && !open && "hidden md:block")}>{children}</div>
    </section>
  )
}

function PasteForm({
  sourceLabel,
  value,
  onChange,
  onSubmit,
  onCancel,
}: {
  sourceLabel: string
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
  onCancel: () => void
}) {
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        onSubmit()
      }}
      className="flex flex-col gap-2 bg-muted/60 px-3 py-3"
    >
      <p className="text-xs text-muted-foreground">
        {sourceLabel}은(는) 사이트 보안 때문에 앱이 글을 대신 읽을 수 없어요. 글 화면에서 본문을 전체 선택(Ctrl+A)·
        복사(Ctrl+C)해 붙여 넣으면 보고서를 만들어요. 붙여 넣은 내용은 저장하지 않아요.
      </p>
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={5}
        maxLength={LIMITS.pastedText}
        placeholder="글 내용을 붙여 넣어요"
        aria-label="보고서로 정리할 글 내용"
        autoFocus
        className="bg-card"
      />
      <div className="flex gap-1">
        <Button type="submit" size="xs" disabled={!value.trim()}>
          보고서 만들기
        </Button>
        <Button type="button" size="xs" variant="ghost" onClick={onCancel}>
          취소
        </Button>
      </div>
    </form>
  )
}

function Memos({ articleId, memos }: { articleId: string; memos: MemoView[] }) {
  const [text, setText] = useState("")
  const [error, setError] = useState("")
  const [pending, startTransition] = useTransition()

  function handleAdd(event: FormEvent) {
    event.preventDefault()
    const value = text.trim()
    if (!value) return setError("메모를 입력해 주세요.")
    setError("")
    startTransition(async () => {
      const result = await addMemo(articleId, value)
      if (result.ok) setText("")
      else setError(result.error)
    })
  }

  return (
    <div className="flex flex-col gap-2">
      {memos.length > 0 && (
        <ul className="flex flex-col">
          {memos.map((memo) => (
            <MemoItem key={memo.id} memo={memo} />
          ))}
        </ul>
      )}
      <form onSubmit={handleAdd} className="flex flex-col gap-2 sm:flex-row sm:items-start">
        <Textarea
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            setError("")
          }}
          rows={2}
          maxLength={LIMITS.insightContent}
          placeholder="이 글을 읽고 든 생각, 해 볼 일을 메모해요"
          aria-label="검토 메모"
          className="min-h-0"
        />
        <Button type="submit" variant="outline" disabled={pending} className="shrink-0">
          {pending ? "저장 중…" : "메모 추가"}
        </Button>
      </form>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}

function MemoItem({ memo }: { memo: MemoView }) {
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(memo.content)
  const [error, setError] = useState("")
  const [pending, startTransition] = useTransition()

  function run(action: () => Promise<ActionResult>, after?: () => void) {
    setError("")
    startTransition(async () => {
      const result = await action()
      if (result.ok) after?.()
      else setError(result.error)
    })
  }

  return (
    <li className="flex flex-col gap-1.5 border-b border-dashed border-foreground/25 py-2">
      {editing ? (
        <div className="flex flex-col gap-2">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            maxLength={LIMITS.insightContent}
            aria-label="메모 고치기"
            autoFocus
          />
          <div className="flex gap-1">
            <Button
              type="button"
              size="xs"
              disabled={pending}
              onClick={() => run(() => updateMemo(memo.id, text), () => setEditing(false))}
            >
              저장
            </Button>
            <Button type="button" size="xs" variant="ghost" onClick={() => setEditing(false)}>
              취소
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex items-start gap-2">
          <p className="min-w-0 flex-1 text-sm leading-relaxed break-words whitespace-pre-wrap">{memo.content}</p>
          <div className="flex shrink-0 gap-0.5">
            <Button
              type="button"
              size="xs"
              variant="ghost"
              className="text-muted-foreground"
              onClick={() => setEditing(true)}
            >
              수정
            </Button>
            <Button
              type="button"
              size="xs"
              variant="ghost"
              disabled={pending}
              className="text-muted-foreground hover:text-destructive"
              onClick={() => {
                if (window.confirm("이 메모를 삭제할까요?")) run(() => deleteInsight(memo.id))
              }}
            >
              삭제
            </Button>
          </div>
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </li>
  )
}
