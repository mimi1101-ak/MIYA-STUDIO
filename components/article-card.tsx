"use client"

import { ExternalLink, Loader2, Sparkles, Trash2 } from "lucide-react"
import Link from "next/link"
import { useState, useTransition, type FormEvent } from "react"

import { addMemo, deleteInsight, updateMemo } from "@/app/insights/actions"
import { deleteArticle, summarizeArticle } from "@/app/news/actions"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import type { MemoView, SavedArticleView } from "@/lib/saved-articles"
import { canAutoRead, parseSummary, SOURCE_LABELS } from "@/lib/sources"
import { cn } from "@/lib/utils"
import { LIMITS, type ActionResult } from "@/lib/validation"

// 저장한 글 카드: 제목·출처 → AI 요약 → 내 인사이트 메모. compact면 요지만 짧게 보여 줍니다.
export function ArticleCard({ article, compact = false }: { article: SavedArticleView; compact?: boolean }) {
  const [error, setError] = useState("")
  const [deleting, startDelete] = useTransition()

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

  return (
    <li className="flex flex-col gap-3 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
      <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
        <Badge variant="secondary">{SOURCE_LABELS[article.source]}</Badge>
        {article.category && <Badge variant="outline">{article.category}</Badge>}
        <span>{article.dateLabel}</span>
        {!compact && (
          <Button
            type="button"
            size="xs"
            variant="ghost"
            disabled={deleting}
            onClick={handleDelete}
            className="ml-auto text-muted-foreground hover:text-destructive"
          >
            <Trash2 data-icon="inline-start" />
            {deleting ? "삭제 중…" : "글 삭제"}
          </Button>
        )}
      </div>

      <a
        href={article.url}
        target="_blank"
        rel="noopener noreferrer"
        className="font-medium break-words hover:underline"
      >
        {article.title}{" "}
        <ExternalLink className="inline size-3.5 align-[-2px] text-muted-foreground" aria-label="새 탭에서 열기" />
      </a>

      <SummaryBox article={article} compact={compact} />

      {compact ? (
        <p className="text-xs text-muted-foreground">
          내 인사이트 {article.memos.length} ·{" "}
          <Link href="/insights" className="underline-offset-4 hover:underline">
            저장한 글에서 메모하기
          </Link>
        </p>
      ) : (
        <Memos articleId={article.id} memos={article.memos} />
      )}

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </li>
  )
}

function SummaryBox({ article, compact }: { article: SavedArticleView; compact: boolean }) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState("")
  const [open, setOpen] = useState(false)
  // Long Black처럼 앱이 직접 읽을 수 없는 글은 내용을 붙여 넣어 요약합니다.
  const [pasting, setPasting] = useState(false)
  const [pasted, setPasted] = useState("")
  const summary = parseSummary(article.summary)
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

  // 요약 버튼: 직접 읽을 수 있으면 바로 요약, 아니면 붙여 넣기 칸을 엽니다.
  function startSummary() {
    if (autoRead) summarize()
    else setPasting(true)
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg bg-muted/60 px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="flex items-center gap-1 text-xs font-medium">
          <Sparkles className="size-3.5" aria-hidden />
          AI 요약
        </span>
        {!compact && summary && !pending && !pasting && (
          <Button
            type="button"
            size="xs"
            variant="ghost"
            onClick={startSummary}
            className="ml-auto text-muted-foreground"
          >
            요약 다시 만들기
          </Button>
        )}
      </div>

      {pasting && !pending ? (
        <form
          onSubmit={(event) => {
            event.preventDefault()
            summarize(pasted)
          }}
          className="flex flex-col gap-2"
        >
          <p className="text-xs text-muted-foreground">
            {SOURCE_LABELS[article.source]}은(는) 사이트 보안 때문에 앱이 글을 대신 읽을 수 없어요. 글 화면에서
            본문을 전체 선택(Ctrl+A)·복사(Ctrl+C)해 붙여 넣으면 요약해요. 붙여 넣은 내용은 저장하지 않아요.
          </p>
          <Textarea
            value={pasted}
            onChange={(e) => {
              setPasted(e.target.value)
              setError("")
            }}
            rows={5}
            maxLength={LIMITS.pastedText}
            placeholder="글 내용을 붙여 넣어요"
            aria-label="요약할 글 내용"
            autoFocus
          />
          <div className="flex gap-1">
            <Button type="submit" size="xs" disabled={!pasted.trim()}>
              요약하기
            </Button>
            <Button type="button" size="xs" variant="ghost" onClick={() => setPasting(false)}>
              취소
            </Button>
          </div>
        </form>
      ) : pending ? (
        <p role="status" className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" aria-hidden />
          {autoRead ? "글을 읽고 요약하는 중이에요… (10~20초)" : "요약하는 중이에요… (10초 안팎)"}
        </p>
      ) : summary ? (
        <>
          <p className="text-sm leading-relaxed font-medium">{summary.gist}</p>
          {!compact && summary.points.length > 0 && (
            <>
              <ul
                className={cn(
                  "list-disc flex-col gap-1 pl-5 text-sm leading-relaxed text-muted-foreground md:flex",
                  open ? "flex" : "hidden"
                )}
              >
                {summary.points.map((point, i) => (
                  <li key={i}>{point}</li>
                ))}
              </ul>
              <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                aria-expanded={open}
                className="self-start text-xs text-muted-foreground underline-offset-4 hover:underline md:hidden"
              >
                {open ? "핵심 접기 ▴" : `핵심 ${summary.points.length}줄 펼치기 ▾`}
              </button>
            </>
          )}
        </>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm text-muted-foreground">아직 요약이 없어요.</p>
          {!compact && (
            <Button type="button" size="xs" variant="outline" onClick={startSummary}>
              {autoRead ? "요약 만들기" : "내용 붙여 넣고 요약"}
            </Button>
          )}
        </div>
      )}

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
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
      <p className="text-xs font-medium">내 인사이트 {memos.length}</p>
      {memos.length > 0 && (
        <ul className="flex flex-col divide-y border-y">
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
          placeholder="이 글에서 얻은 생각을 메모해요"
          aria-label="인사이트 메모"
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
    <li className="flex flex-col gap-1.5 py-2">
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
            <Button type="button" size="xs" disabled={pending} onClick={() => run(() => updateMemo(memo.id, text), () => setEditing(false))}>
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
            <Button type="button" size="xs" variant="ghost" className="text-muted-foreground" onClick={() => setEditing(true)}>
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
