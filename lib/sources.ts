// 뉴스·트렌드 출처 정보
// 네이버는 자동 수집과 다른 사이트 안에 띄우기를 모두 막고 있어 2026-10-08에 출처에서 뺐습니다(DECISIONS.md 6장).
// DB(articles.source)는 예전 값(naver_market, naver_trend)도 허용하지만 화면에서는 쓰지 않습니다.

export const ARTICLE_SOURCES = ["eo_planet", "long_black"] as const
export type ArticleSource = (typeof ARTICLE_SOURCES)[number]

export const SOURCE_LABELS: Record<ArticleSource, string> = {
  eo_planet: "EO planet",
  long_black: "Long Black",
}

export function isArticleSource(value: unknown): value is ArticleSource {
  return typeof value === "string" && (ARTICLE_SOURCES as readonly string[]).includes(value)
}

// /news 화면에 그대로 띄우는 사이트. 사이트 디자인과 인기글을 원래 모습 그대로 보여 줍니다(저장하지 않음).
export const NEWS_SITES: {
  source: ArticleSource
  label: string
  embedUrl: string
  openUrl: string
  hint: string
  // 이 칸 안에서는 안 되는 것 (사이트의 로그인 쿠키가 다른 사이트 안에서는 보내지지 않아서)
  loginNote: string
  categoryPlaceholder: string
}[] = [
  {
    source: "eo_planet",
    label: "EO planet",
    embedUrl: "https://eopla.net/magazines",
    openUrl: "https://eopla.net/magazines",
    hint: "맨 위 '오늘 많이 본 아티클'이 인기글이에요.",
    loginNote: "로그인·좋아요·댓글은 이 칸에서는 안 돼요",
    categoryPlaceholder: "분야 (예: 창업, 커리어)",
  },
  {
    source: "long_black",
    label: "Long Black",
    embedUrl: "https://www.longblack.co/",
    openUrl: "https://www.longblack.co/",
    hint: "오늘의 노트 아래로 내리면 '베스트 노트'가 있어요.",
    loginNote: "로그인·유료 글 읽기는 이 칸에서는 안 돼요",
    categoryPlaceholder: "분류 (예: 브랜드, 라이프)",
  },
]

// 링크 주소로 출처를 알아냅니다. 두 사이트가 아니면 null (서버가 아무 주소나 읽지 않게 막는 용도로도 씀)
const SOURCE_HOSTS: Record<string, ArticleSource> = {
  "eopla.net": "eo_planet",
  "www.eopla.net": "eo_planet",
  "longblack.co": "long_black",
  "www.longblack.co": "long_black",
}

export function sourceFromUrl(value: string): ArticleSource | null {
  try {
    const url = new URL(value)
    if (url.protocol !== "https:" && url.protocol !== "http:") return null
    return SOURCE_HOSTS[url.hostname] ?? null
  } catch {
    return null
  }
}

// Long Black은 유료라 로그인 없이 읽을 수 있는 앞부분만 요약합니다.
export function isPartialSource(source: ArticleSource): boolean {
  return source === "long_black"
}

// 저장된 요약: 첫 줄은 한 줄 요지, 다음 줄부터 핵심 내용
export function parseSummary(summary: string | null): { gist: string; points: string[] } | null {
  if (!summary) return null
  const [gist, ...points] = summary.split("\n").map((line) => line.trim()).filter(Boolean)
  return gist ? { gist, points } : null
}
