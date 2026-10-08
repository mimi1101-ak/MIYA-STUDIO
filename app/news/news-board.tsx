"use client"

import { Check, ExternalLink, Loader2, Lock, Sparkles } from "lucide-react"
import Link from "next/link"
import {
  useEffect,
  useId,
  useState,
  useSyncExternalStore,
  useTransition,
  type FormEvent,
  type MouseEvent,
} from "react"

import { ArticleCard } from "@/components/article-card"
import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import type { SavedArticleView } from "@/lib/saved-articles"
import { canAutoRead, NEWS_SITES, SOURCE_LABELS, sourceFromUrl } from "@/lib/sources"
import { LIMITS } from "@/lib/validation"

import { addArticle, previewArticle } from "./actions"

type NewsSite = (typeof NEWS_SITES)[number]

// 위: EO planet·Long Black을 원래 사이트 모습 그대로 나란히(휴대폰은 위아래) 띄웁니다.
// 아래: 읽은 글의 링크를 저장하면 AI가 요약하고, 최근 저장한 글 몇 개를 보여 줍니다.
export function NewsBoard({
  recent,
  total,
  canWrite,
}: {
  recent: SavedArticleView[]
  total: number
  canWrite: boolean
}) {
  const [savingTitle, setSavingTitle] = useState<string | null>(null)

  return (
    <div className="flex flex-col gap-8">
      <div className="grid gap-4 md:grid-cols-2">
        {NEWS_SITES.map((site) => (
          <SiteFrame key={site.source} site={site} />
        ))}
      </div>

      <section aria-labelledby="save-article" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div className="flex flex-col gap-1">
            <h2 id="save-article" className="text-base font-semibold">
              글 저장하기
            </h2>
            <p className="text-sm text-muted-foreground">
              위에서 읽은 글의 링크를 붙여 넣으면 AI가 읽고 요약해 둬요.
            </p>
          </div>
          <Link href="/insights" className="text-sm text-muted-foreground hover:text-foreground">
            저장한 글 모두 보기 ({total}) →
          </Link>
        </div>

        <ArticleSaver canWrite={canWrite} onSavingChange={setSavingTitle} />

        <ul className="flex flex-col gap-3">
          {savingTitle !== null && (
            <li className="flex flex-col gap-2 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
              <span className="text-xs text-muted-foreground">방금 저장</span>
              <span className="font-medium break-words">{savingTitle || "글을 불러오는 중"}</span>
              <p
                role="status"
                className="flex items-center gap-1.5 rounded-lg bg-muted/60 px-3 py-2.5 text-sm text-muted-foreground"
              >
                <Loader2 className="size-3.5 animate-spin" aria-hidden />
                글을 읽고 요약하는 중이에요…
              </p>
            </li>
          )}
          {recent.map((article) => (
            <ArticleCard key={article.id} article={article} compact />
          ))}
        </ul>
        {recent.length === 0 && savingTitle === null && (
          <p className="text-sm text-muted-foreground">
            아직 저장한 글이 없어요. 위에서 읽은 글의 링크를 복사해 붙여 넣어 보세요.
          </p>
        )}
      </section>
    </div>
  )
}

// 서버가 그린 화면에서는 false, 브라우저에서 화면이 준비된 뒤에는 true
const noSubscribe = () => () => {}
function useHydrated() {
  return useSyncExternalStore(noSubscribe, () => true, () => false)
}

// 사이트를 작은 옆 창으로 엽니다. 사이트를 직접 연 것이라 그 창에서는 로그인이 됩니다.
// 휴대폰처럼 좁은 화면이거나 창이 막히면 링크 그대로 새 탭으로 열립니다.
function openSideWindow(event: MouseEvent<HTMLAnchorElement>, site: NewsSite) {
  if (window.matchMedia("(max-width: 639px)").matches) return
  const width = 460
  const height = Math.min(900, window.screen.availHeight - 40)
  const left = Math.max(0, window.screenX + window.outerWidth - width - 20)
  const popup = window.open(site.openUrl, `miya-${site.source}`, `popup,width=${width},height=${height},left=${left},top=40`)
  if (!popup) return
  // 열린 사이트가 우리 화면을 건드리지 못하게 연결을 끊습니다.
  popup.opener = null
  event.preventDefault()
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
      <div className="flex flex-wrap items-start justify-between gap-2 border-b px-3 py-2.5 sm:flex-nowrap">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            {site.label}
            {!loaded && (
              <span role="status" className="text-xs font-normal text-muted-foreground">
                불러오는 중…
              </span>
            )}
          </h2>
          <p className="text-xs text-muted-foreground">{site.hint}</p>
          <p className="flex items-start gap-1 text-xs">
            <Lock className="mt-0.5 size-3 shrink-0" aria-hidden />
            {site.loginNote}
          </p>
        </div>
        <div className="flex w-full shrink-0 gap-1 sm:w-auto sm:flex-col sm:items-end">
          <a
            href={site.openUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(event) => openSideWindow(event, site)}
            className={buttonVariants({ size: "xs", className: "flex-1 sm:flex-none" })}
          >
            로그인해서 보기
            <ExternalLink data-icon="inline-end" />
          </a>
          <Button
            type="button"
            size="xs"
            variant="ghost"
            className="text-muted-foreground"
            onClick={() => setReloadKey((k) => k + 1)}
          >
            처음으로
          </Button>
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

type Preview =
  | { state: "idle" | "loading" }
  | { state: "ok"; title: string }
  | { state: "error"; text: string }

// 링크만 붙여 넣으면 출처와 제목을 알아서 채우고, 저장하면 AI가 요약합니다.
function ArticleSaver({
  canWrite,
  onSavingChange,
}: {
  canWrite: boolean
  onSavingChange: (title: string | null) => void
}) {
  const id = useId()
  const [url, setUrl] = useState("")
  const [preview, setPreview] = useState<Preview>({ state: "idle" })
  const [showMore, setShowMore] = useState(false)
  const [title, setTitle] = useState("")
  const [category, setCategory] = useState("")
  const [publishedDate, setPublishedDate] = useState("")
  const [pasted, setPasted] = useState("")
  const [message, setMessage] = useState<{ type: "ok" | "error"; text: string } | null>(null)
  const [pending, startTransition] = useTransition()

  const trimmed = url.trim()
  const source = sourceFromUrl(trimmed)
  // Long Black처럼 앱이 직접 읽을 수 없는 글: 제목을 적고, 요약하려면 내용을 붙여 넣습니다.
  const manual = source !== null && !canAutoRead(source)
  const willSummarize = !manual || pasted.trim().length > 0

  // 링크를 붙여 넣고 잠깐 멈추면 제목을 미리 가져옵니다.
  useEffect(() => {
    if (!source || !canAutoRead(source)) return
    let cancelled = false
    const timer = setTimeout(async () => {
      const result = await previewArticle(trimmed)
      if (cancelled) return
      setPreview(result.ok ? { state: "ok", title: result.title } : { state: "error", text: result.error })
    }, 500)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [trimmed, source])

  function handleUrlChange(value: string) {
    setUrl(value)
    setMessage(null)
    const next = sourceFromUrl(value.trim())
    setPreview(next && canAutoRead(next) ? { state: "loading" } : { state: "idle" })
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setMessage(null)
    if (!source) {
      setMessage({ type: "error", text: "EO planet 또는 Long Black 글 링크를 붙여 넣어 주세요." })
      return
    }
    if (manual && !title.trim()) {
      setMessage({ type: "error", text: "글 제목을 적어 주세요." })
      return
    }

    if (willSummarize) onSavingChange(title.trim() || (preview.state === "ok" ? preview.title : ""))
    startTransition(async () => {
      const result = await addArticle({
        url: trimmed,
        title,
        category,
        publishedDate,
        pastedText: manual ? pasted : "",
      })
      onSavingChange(null)
      if (result.ok) {
        setUrl("")
        setTitle("")
        setCategory("")
        setPublishedDate("")
        setPasted("")
        setPreview({ state: "idle" })
        setShowMore(false)
        setMessage({ type: "ok", text: result.message ?? "저장했어요." })
      } else {
        setMessage({ type: "error", text: result.error })
      }
    })
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-3 rounded-xl bg-card p-4 ring-1 ring-foreground/10"
      noValidate
    >
      {!canWrite && (
        <p role="alert" className="text-sm text-destructive">
          서버 키(SUPABASE_SERVICE_ROLE_KEY)가 아직 설정되지 않아 글을 저장할 수 없어요.
        </p>
      )}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Badge variant={source ? "secondary" : "outline"} className="h-8 shrink-0 px-3">
          {source ? SOURCE_LABELS[source] : "출처 자동"}
        </Badge>
        <Input
          type="url"
          inputMode="url"
          value={url}
          onChange={(e) => handleUrlChange(e.target.value)}
          placeholder="EO planet 또는 Long Black 글 링크를 붙여 넣어요"
          aria-label="글 링크"
          aria-describedby={`${id}-preview`}
        />
      </div>

      <p id={`${id}-preview`} className="min-h-5 text-xs text-muted-foreground" aria-live="polite">
        {preview.state === "loading" && (
          <span className="flex items-center gap-1">
            <Loader2 className="size-3 animate-spin" aria-hidden />
            제목을 가져오는 중…
          </span>
        )}
        {preview.state === "ok" && (
          <span className="flex items-center gap-1">
            <Check className="size-3 shrink-0" aria-hidden />
            제목을 가져왔어요: {preview.title}
          </span>
        )}
        {preview.state === "error" && <span className="text-destructive">{preview.text}</span>}
        {preview.state === "idle" && trimmed && !source && (
          <span className="text-destructive">EO planet 또는 Long Black 글 링크만 저장할 수 있어요.</span>
        )}
        {manual && (
          <span>
            {SOURCE_LABELS[source]}은(는) 사이트 보안 때문에 앱이 글을 대신 읽을 수 없어요. 제목을 적고, 요약하려면 글
            내용을 붙여 넣어 주세요.
          </span>
        )}
      </p>

      {manual && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${id}-manual-title`}>글 제목</Label>
            <Input
              id={`${id}-manual-title`}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={LIMITS.articleTitle}
              placeholder="글 제목을 적어요"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${id}-pasted`}>글 내용 (선택 · 요약에만 쓰고 저장하지 않아요)</Label>
            <Textarea
              id={`${id}-pasted`}
              value={pasted}
              onChange={(e) => setPasted(e.target.value)}
              rows={4}
              maxLength={LIMITS.pastedText}
              placeholder="글 화면에서 본문을 전체 선택(Ctrl+A)·복사(Ctrl+C)해 붙여 넣으면 AI가 요약해요"
            />
          </div>
        </div>
      )}

      {showMore && (
        <div className="grid gap-3 md:grid-cols-3">
          {!manual && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${id}-title`}>제목 직접 쓰기 (선택)</Label>
              <Input
                id={`${id}-title`}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={LIMITS.articleTitle}
                placeholder="비우면 글 제목을 써요"
              />
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${id}-category`}>분류 (선택)</Label>
            <Input
              id={`${id}-category`}
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              maxLength={LIMITS.articleCategory}
              placeholder={
                NEWS_SITES.find((site) => site.source === source)?.categoryPlaceholder ?? "분류 (예: 브랜드)"
              }
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${id}-date`}>글 날짜 (선택)</Label>
            <Input
              id={`${id}-date`}
              type="date"
              value={publishedDate}
              onChange={(e) => setPublishedDate(e.target.value)}
            />
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={pending || !canWrite}>
          <Sparkles data-icon="inline-start" />
          {pending ? (willSummarize ? "요약하는 중…" : "저장 중…") : willSummarize ? "저장하고 요약하기" : "링크 저장"}
        </Button>
        {willSummarize && <span className="text-xs text-muted-foreground">요약까지 10~20초 걸려요</span>}
        {!showMore && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="ml-auto text-muted-foreground"
            onClick={() => setShowMore(true)}
          >
            분류·날짜 넣기
          </Button>
        )}
      </div>

      {message && (
        <p
          role={message.type === "error" ? "alert" : "status"}
          className={message.type === "error" ? "text-sm text-destructive" : "text-sm text-muted-foreground"}
        >
          {message.text}
        </p>
      )}
    </form>
  )
}
