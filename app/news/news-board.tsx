"use client"

import Link from "next/link"
import { useId, useState, useTransition, type FormEvent } from "react"

import { createInsight } from "@/app/insights/actions"
import { InsightForm } from "@/components/insight-form"
import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { NEWS_TABS, SOURCE_LABELS, type ArticleSource } from "@/lib/sources"
import { isValidHttpUrl, LIMITS, URL_ERROR_MESSAGE } from "@/lib/validation"

import { addArticle, deleteArticle } from "./actions"

export type ArticleView = {
  id: string
  source: ArticleSource
  category: string
  title: string
  url: string
  dateLabel: string
  insightCount: number
}

type NewsTab = (typeof NEWS_TABS)[number]

const CATEGORY_PLACEHOLDER: Record<string, string> = {
  eo_planet: "분야 (예: 창업, 커리어)",
  long_black: "분류 (예: 브랜드, 라이프)",
  naver: "분류 (예: 코스피, 환율, 검색 트렌드)",
}

export function NewsBoard({ articles, canWrite }: { articles: ArticleView[]; canWrite: boolean }) {
  return (
    <Tabs defaultValue={NEWS_TABS[0].value} className="gap-4">
      <div className="no-scrollbar -mx-4 overflow-x-auto overflow-y-hidden px-4 md:mx-0 md:px-0">
        <TabsList className="min-w-full md:min-w-0">
          {NEWS_TABS.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value} className="px-3">
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>
      {NEWS_TABS.map((tab) => (
        <TabsContent key={tab.value} value={tab.value}>
          <SourcePanel
            tab={tab}
            articles={articles.filter((a) => tab.sources.includes(a.source))}
            canWrite={canWrite}
          />
        </TabsContent>
      ))}
    </Tabs>
  )
}

function SourcePanel({
  tab,
  articles,
  canWrite,
}: {
  tab: NewsTab
  articles: ArticleView[]
  canWrite: boolean
}) {
  const [adding, setAdding] = useState(false)

  return (
    <div className="flex flex-col gap-4 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
      <div className="flex flex-wrap items-center gap-2">
        {!adding && (
          <Button type="button" size="sm" onClick={() => setAdding(true)}>
            글 추가
          </Button>
        )}
        {tab.links.map((link) => (
          <a
            key={link.url}
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            {link.label} ↗
          </a>
        ))}
      </div>

      {adding && (
        <ArticleForm
          tab={tab}
          canWrite={canWrite}
          onDone={() => setAdding(false)}
          onCancel={() => setAdding(false)}
        />
      )}

      {articles.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          아직 추가한 글이 없어요. 사이트에서 읽을 글을 찾아 링크를 붙여넣어 보세요.
        </p>
      ) : (
        <ul className="flex flex-col divide-y">
          {articles.map((article) => (
            <ArticleItem key={article.id} article={article} showSource={tab.sources.length > 1} />
          ))}
        </ul>
      )}
    </div>
  )
}

function ArticleItem({ article, showSource }: { article: ArticleView; showSource: boolean }) {
  const [writing, setWriting] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState("")
  const [deleting, startDelete] = useTransition()

  function handleDelete() {
    const note = article.insightCount > 0 ? "\n(이 글에 쓴 인사이트는 지워지지 않아요.)" : ""
    if (!window.confirm(`"${article.title}" 글을 목록에서 삭제할까요?${note}`)) return
    setError("")
    startDelete(async () => {
      const result = await deleteArticle(article.id)
      if (!result.ok) setError(result.error)
    })
  }

  return (
    <li className="flex flex-col gap-2 py-3">
      <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
        {showSource && <Badge variant="secondary">{SOURCE_LABELS[article.source]}</Badge>}
        {article.category && <Badge variant="outline">{article.category}</Badge>}
        <span>{article.dateLabel}</span>
      </div>
      <a
        href={article.url}
        target="_blank"
        rel="noopener noreferrer"
        className="font-medium break-words hover:underline"
      >
        {article.title} <span className="text-muted-foreground">↗</span>
      </a>
      <div className="flex flex-wrap items-center gap-1">
        <Button
          type="button"
          size="xs"
          variant="outline"
          onClick={() => {
            setWriting((v) => !v)
            setSaved(false)
          }}
        >
          인사이트 작성
        </Button>
        {article.insightCount > 0 && (
          <Link
            href="/insights"
            className="px-2 text-xs text-muted-foreground underline-offset-4 hover:underline"
          >
            인사이트 {article.insightCount}개
          </Link>
        )}
        <Button
          type="button"
          size="xs"
          variant="ghost"
          disabled={deleting}
          onClick={handleDelete}
          className="ml-auto text-muted-foreground hover:text-destructive"
        >
          {deleting ? "삭제 중…" : "삭제"}
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {writing && (
        <div className="rounded-lg bg-muted/50 p-3">
          <p className="mb-2 text-xs text-muted-foreground">이 글에 대한 인사이트</p>
          <InsightForm
            submitLabel="인사이트 저장"
            onSubmit={(input) => createInsight(article.id, input)}
            onDone={() => {
              setWriting(false)
              setSaved(true)
            }}
            onCancel={() => setWriting(false)}
          />
        </div>
      )}
      {saved && (
        <p className="text-xs text-muted-foreground">
          인사이트를 저장했어요.{" "}
          <Link href="/insights" className="underline underline-offset-4">
            인사이트 목록 보기
          </Link>
        </p>
      )}
    </li>
  )
}

function ArticleForm({
  tab,
  canWrite,
  onDone,
  onCancel,
}: {
  tab: NewsTab
  canWrite: boolean
  onDone: () => void
  onCancel: () => void
}) {
  const id = useId()
  const [source, setSource] = useState<ArticleSource>(tab.sources[0])
  const [title, setTitle] = useState("")
  const [url, setUrl] = useState("")
  const [category, setCategory] = useState("")
  const [publishedDate, setPublishedDate] = useState("")
  const [urlTouched, setUrlTouched] = useState(false)
  const [error, setError] = useState("")
  const [pending, startTransition] = useTransition()

  const urlInvalid = urlTouched && !isValidHttpUrl(url.trim())

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setUrlTouched(true)
    setError("")
    if (!title.trim()) {
      setError("글 제목을 입력해 주세요.")
      return
    }
    if (!isValidHttpUrl(url.trim())) return

    startTransition(async () => {
      const result = await addArticle({ source, title, url, category, publishedDate })
      if (result.ok) onDone()
      else setError(result.error)
    })
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 rounded-lg bg-muted/50 p-3" noValidate>
      <p className="text-xs text-muted-foreground">
        제목·링크·날짜만 저장해요. 글 본문은 저장하지 않아요.
      </p>
      {!canWrite && (
        <p role="alert" className="text-sm text-destructive">
          서버 키(SUPABASE_SERVICE_ROLE_KEY)가 아직 설정되지 않아 글을 저장할 수 없어요.
        </p>
      )}
      {tab.sources.length > 1 && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${id}-source`}>구분</Label>
          <select
            id={`${id}-source`}
            value={source}
            onChange={(e) => setSource(e.target.value as ArticleSource)}
            className="h-8 w-full rounded-lg border border-input bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:w-60"
          >
            {tab.sources.map((s) => (
              <option key={s} value={s}>
                {SOURCE_LABELS[s]}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${id}-title`}>글 제목</Label>
        <Input
          id={`${id}-title`}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={LIMITS.articleTitle}
          className="bg-background"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${id}-url`}>링크</Label>
        <Input
          id={`${id}-url`}
          type="url"
          inputMode="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onBlur={() => url.trim() && setUrlTouched(true)}
          placeholder="https://"
          aria-invalid={urlInvalid || undefined}
          aria-describedby={urlInvalid ? `${id}-url-error` : undefined}
          className="bg-background"
        />
        {urlInvalid && (
          <p id={`${id}-url-error`} className="text-xs text-destructive">
            {URL_ERROR_MESSAGE}
          </p>
        )}
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${id}-category`}>분류 (선택)</Label>
          <Input
            id={`${id}-category`}
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            maxLength={LIMITS.articleCategory}
            placeholder={CATEGORY_PLACEHOLDER[tab.value]}
            className="bg-background"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${id}-date`}>글 날짜 (선택)</Label>
          <Input
            id={`${id}-date`}
            type="date"
            value={publishedDate}
            onChange={(e) => setPublishedDate(e.target.value)}
            className="bg-background"
          />
        </div>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit" disabled={pending || !canWrite}>
          {pending ? "저장 중…" : "글 저장"}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel} disabled={pending}>
          취소
        </Button>
      </div>
    </form>
  )
}
