"use client"

import Link from "next/link"
import { useId, useState, useSyncExternalStore, useTransition, type FormEvent } from "react"

import { createInsight } from "@/app/insights/actions"
import { InsightForm } from "@/components/insight-form"
import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ARTICLE_SOURCES, NEWS_SITES, SOURCE_LABELS, type ArticleSource } from "@/lib/sources"
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

type NewsSite = (typeof NEWS_SITES)[number]

// 위: EO planet·Long Black을 원래 사이트 모습 그대로 나란히(휴대폰은 위아래) 띄웁니다.
// 아래: 읽은 글의 제목·링크를 저장하고 인사이트를 남깁니다.
export function NewsBoard({ articles, canWrite }: { articles: ArticleView[]; canWrite: boolean }) {
  return (
    <div className="flex flex-col gap-8">
      <div className="grid gap-4 md:grid-cols-2">
        {NEWS_SITES.map((site) => (
          <SiteFrame key={site.source} site={site} />
        ))}
      </div>

      <section aria-labelledby="saved-articles" className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h2 id="saved-articles" className="text-base font-semibold">
            저장한 글 · 인사이트
          </h2>
          <p className="text-sm text-muted-foreground">
            위에서 읽은 글의 링크를 저장해 두고, 글마다 인사이트를 남겨요.
          </p>
        </div>
        <SavedArticles articles={articles} canWrite={canWrite} />
      </section>
    </div>
  )
}

// 서버가 그린 화면에서는 false, 브라우저에서 화면이 준비된 뒤에는 true
const noSubscribe = () => () => {}
function useHydrated() {
  return useSyncExternalStore(noSubscribe, () => true, () => false)
}

function SiteFrame({ site }: { site: NewsSite }) {
  // 사이트 칸은 브라우저에서 화면이 준비된 뒤에 만듭니다. 그래야 "다 불러왔다"는 신호를 놓치지 않습니다.
  const hydrated = useHydrated()
  // 칸 안에서 다른 글로 이동했다가 처음 화면으로 돌아갈 때 씁니다.
  const [reloadKey, setReloadKey] = useState(0)
  const [loadedKey, setLoadedKey] = useState(-1)
  const loaded = loadedKey === reloadKey

  return (
    <section
      aria-label={site.label}
      className="flex flex-col overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10"
    >
      <div className="flex items-start justify-between gap-2 border-b px-3 py-2.5">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            {site.label}
            {!loaded && (
              <span role="status" className="text-xs font-normal text-muted-foreground">
                불러오는 중…
              </span>
            )}
          </h2>
          <p className="text-xs text-muted-foreground">{site.hint}</p>
        </div>
        <div className="flex shrink-0 gap-1">
          <Button type="button" size="xs" variant="ghost" onClick={() => setReloadKey((k) => k + 1)}>
            처음으로
          </Button>
          <a
            href={site.openUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonVariants({ variant: "outline", size: "xs" })}
          >
            새 탭 ↗
          </a>
        </div>
      </div>
      {/* 다른 사이트가 우리 화면 전체를 다른 주소로 바꾸지 못하게 sandbox로 권한을 줄여 둡니다. */}
      {hydrated ? (
        <iframe
          key={reloadKey}
          src={site.embedUrl}
          title={`${site.label} 화면`}
          loading="lazy"
          sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-forms"
          onLoad={() => setLoadedKey(reloadKey)}
          className="h-[70vh] min-h-[30rem] w-full bg-white"
        />
      ) : (
        <div className="h-[70vh] min-h-[30rem] w-full bg-white" />
      )}
    </section>
  )
}

function SavedArticles({ articles, canWrite }: { articles: ArticleView[]; canWrite: boolean }) {
  const [adding, setAdding] = useState(false)

  return (
    <div className="flex flex-col gap-4 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
      {!adding && (
        <div>
          <Button type="button" size="sm" onClick={() => setAdding(true)}>
            글 저장하기
          </Button>
        </div>
      )}

      {adding && (
        <ArticleForm canWrite={canWrite} onDone={() => setAdding(false)} onCancel={() => setAdding(false)} />
      )}

      {articles.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          아직 저장한 글이 없어요. 위에서 읽은 글의 링크를 복사해 저장해 보세요.
        </p>
      ) : (
        <ul className="flex flex-col divide-y">
          {articles.map((article) => (
            <ArticleItem key={article.id} article={article} />
          ))}
        </ul>
      )}
    </div>
  )
}

function ArticleItem({ article }: { article: ArticleView }) {
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
        <Badge variant="secondary">{SOURCE_LABELS[article.source]}</Badge>
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
  canWrite,
  onDone,
  onCancel,
}: {
  canWrite: boolean
  onDone: () => void
  onCancel: () => void
}) {
  const id = useId()
  const [source, setSource] = useState<ArticleSource>(ARTICLE_SOURCES[0])
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
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${id}-source`}>출처</Label>
        <select
          id={`${id}-source`}
          value={source}
          onChange={(e) => setSource(e.target.value as ArticleSource)}
          className="h-8 w-full rounded-lg border border-input bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:w-60"
        >
          {ARTICLE_SOURCES.map((s) => (
            <option key={s} value={s}>
              {SOURCE_LABELS[s]}
            </option>
          ))}
        </select>
      </div>
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
            placeholder={NEWS_SITES.find((site) => site.source === source)?.categoryPlaceholder}
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
