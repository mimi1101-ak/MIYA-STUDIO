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
  // 이 사이트를 보여 주는 우리 화면 주소 (트렌드 하위 메뉴)
  path: string
  menuDescription: string
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
    path: "/news/eo",
    menuDescription: "오늘 많이 본 아티클",
    embedUrl: "https://eopla.net/magazines",
    openUrl: "https://eopla.net/magazines",
    hint: "맨 위 '오늘 많이 본 아티클'이 인기글이에요.",
    loginNote: "로그인·좋아요·댓글은 이 칸에서는 안 돼요",
    categoryPlaceholder: "분야 (예: 창업, 커리어)",
  },
  {
    source: "long_black",
    label: "Long Black",
    path: "/news/longblack",
    menuDescription: "오늘의 노트 · 베스트 노트",
    embedUrl: "https://www.longblack.co/",
    openUrl: "https://www.longblack.co/",
    hint: "오늘의 노트 아래로 내리면 '베스트 노트'가 있어요.",
    loginNote: "로그인·유료 글 읽기는 이 칸에서는 안 돼요",
    categoryPlaceholder: "분류 (예: 브랜드, 라이프)",
  },
]

// 위쪽 메뉴 '트렌드'의 하위 메뉴이자, 트렌드 화면 위 탭
export const TREND_LINKS = [
  ...NEWS_SITES.map((site) => ({ href: site.path, label: site.label, description: site.menuDescription })),
  { href: "/insights", label: "저장한 글", description: "MOMO가 정리한 읽기 보고서" },
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

// 앱 서버가 글을 직접 읽어 올 수 있는 사이트인지.
// Long Black은 사이트 보안(Vercel 봇 차단: 429 + x-vercel-mitigated: challenge)이 서버 요청을 막아 읽을 수 없습니다.
// 이 보안을 우회하지 않고, 사용자가 글 내용을 붙여 넣으면 그걸로 요약합니다(DECISIONS.md 7장).
export function canAutoRead(source: ArticleSource): boolean {
  return source !== "long_black"
}
