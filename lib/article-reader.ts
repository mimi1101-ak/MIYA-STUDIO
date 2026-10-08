import "server-only"

import { canAutoRead, SOURCE_LABELS, sourceFromUrl, type ArticleSource } from "@/lib/sources"

// 저장한 글의 링크를 열어 제목과 본문 글자를 꺼냅니다.
// 본문은 요약할 때 잠깐만 쓰고 저장하지 않습니다(CLAUDE.md: 외부 본문 저장 금지).
// EO planet 주소만 엽니다(robots.txt에서 글 페이지 접근 허용). Long Black은 사이트 보안이 서버 요청을 막아
// 열지 않습니다(lib/sources.ts의 canAutoRead).

const MAX_HTML = 3_000_000
const MAX_TEXT = 30_000
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36"

export class ArticleReadError extends Error {}

export type ArticlePage = {
  source: ArticleSource
  title: string
  publishedAt: string | null
  text: string
}

// 제목 미리보기와 저장이 같은 글을 두 번 읽지 않도록 잠깐 기억해 둡니다(사이트에 요청을 덜 보내려고).
const CACHE_MS = 10 * 60_000
const cache = new Map<string, { page: ArticlePage; at: number }>()

export async function readArticle(url: string): Promise<ArticlePage> {
  const source = sourceFromUrl(url)
  if (!source) throw new ArticleReadError("EO planet·Long Black 글 링크만 읽을 수 있어요.")
  if (!canAutoRead(source)) throw new ArticleReadError(blockedMessage(source))

  const cached = cache.get(url)
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.page

  let response: Response
  try {
    response = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, "Accept-Language": "ko-KR,ko;q=0.9" },
      redirect: "follow",
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    })
  } catch (error) {
    console.error("[article-reader] 불러오기 실패:", error instanceof Error ? error.message : error)
    throw new ArticleReadError("글을 불러오지 못했어요. 링크를 확인하고 잠시 후 다시 시도해 주세요.")
  }
  // 사이트 보안이 "브라우저인지 확인"을 요구하면 서버는 통과할 수 없습니다(기다려도 안 풀림).
  if (response.headers.get("x-vercel-mitigated") === "challenge" || response.headers.get("cf-mitigated")) {
    throw new ArticleReadError(blockedMessage(source))
  }
  // 사이트가 "요청이 너무 많다"고 막은 경우: 잠시 뒤 다시 시도하면 됩니다.
  if (response.status === 429) {
    throw new ArticleReadError("사이트가 잠시 접속을 막고 있어요(요청이 많음). 몇 분 뒤 다시 시도해 주세요.")
  }
  // 다른 사이트로 넘어갔으면 읽지 않습니다.
  if (!response.ok || sourceFromUrl(response.url) !== source) {
    throw new ArticleReadError("글을 불러오지 못했어요. 링크를 확인해 주세요.")
  }

  const html = (await response.text()).slice(0, MAX_HTML)
  const title = decodeEntities(metaContent(html, "og:title") ?? tagText(html, "title") ?? "").trim()
  const publishedAt = metaContent(html, "article:published_time")
  const page: ArticlePage = {
    source,
    title: title.slice(0, 300),
    publishedAt: publishedAt && !Number.isNaN(Date.parse(publishedAt)) ? publishedAt : null,
    text: extractText(html),
  }

  if (cache.size >= 30) cache.delete(cache.keys().next().value!)
  cache.set(url, { page, at: Date.now() })
  return page
}

function blockedMessage(source: ArticleSource): string {
  return `${SOURCE_LABELS[source]}은(는) 사이트 보안 설정 때문에 앱이 글을 대신 읽을 수 없어요. 제목을 직접 적고, 요약하려면 글 내용을 붙여 넣어 주세요.`
}

function metaContent(html: string, property: string): string | null {
  const tag = new RegExp(`<meta[^>]+(?:property|name)=["']${property}["'][^>]*>`, "i").exec(html)?.[0]
  return tag ? (/content=["']([^"']*)["']/i.exec(tag)?.[1] ?? null) : null
}

function tagText(html: string, tag: string): string | null {
  return new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`, "i").exec(html)?.[1] ?? null
}

// HTML에서 읽을 수 있는 글자만 남깁니다. <article>이 충분히 길면 그 안만 씁니다.
function extractText(html: string): string {
  const article = /<article[\s\S]*?<\/article>/i.exec(html)?.[0]
  let body = article && article.length > 3000 ? article : (/<body[\s\S]*<\/body>/i.exec(html)?.[0] ?? html)
  body = body
    .replace(/<(script|style|noscript|svg|nav|header|footer|form|iframe|button)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>|<\/(p|div|h[1-6]|li|section|blockquote)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
  return decodeEntities(body)
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line.length > 1)
    .join("\n")
    .slice(0, MAX_TEXT)
}

function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&amp;/g, "&")
}
