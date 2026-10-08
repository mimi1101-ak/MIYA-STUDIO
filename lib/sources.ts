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
  categoryPlaceholder: string
}[] = [
  {
    source: "eo_planet",
    label: "EO planet",
    embedUrl: "https://eopla.net/magazines",
    openUrl: "https://eopla.net/magazines",
    hint: "맨 위 '오늘 많이 본 아티클'이 인기글이에요.",
    categoryPlaceholder: "분야 (예: 창업, 커리어)",
  },
  {
    source: "long_black",
    label: "Long Black",
    embedUrl: "https://www.longblack.co/",
    openUrl: "https://www.longblack.co/",
    hint: "오늘의 노트 아래로 내리면 '베스트 노트'가 있어요. 유료 글은 새 탭에서 로그인해 읽어요.",
    categoryPlaceholder: "분류 (예: 브랜드, 라이프)",
  },
]
