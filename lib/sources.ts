// 뉴스·트렌드 출처 정보

export const ARTICLE_SOURCES = ["eo_planet", "long_black", "naver_market", "naver_trend"] as const
export type ArticleSource = (typeof ARTICLE_SOURCES)[number]

export const SOURCE_LABELS: Record<ArticleSource, string> = {
  eo_planet: "EO planet",
  long_black: "Long Black",
  naver_market: "네이버 시장",
  naver_trend: "네이버 트렌드",
}

export function isArticleSource(value: unknown): value is ArticleSource {
  return typeof value === "string" && (ARTICLE_SOURCES as readonly string[]).includes(value)
}

// /news 화면의 탭. 네이버 탭은 시장·트렌드 두 출처를 함께 보여 줍니다.
export const NEWS_TABS: {
  value: string
  label: string
  sources: ArticleSource[]
  links: { label: string; url: string }[]
}[] = [
  {
    value: "eo_planet",
    label: "EO planet",
    sources: ["eo_planet"],
    links: [{ label: "EO planet 열기", url: "https://eopla.net" }],
  },
  {
    value: "long_black",
    label: "Long Black",
    sources: ["long_black"],
    links: [{ label: "Long Black 열기", url: "https://www.longblack.co" }],
  },
  {
    value: "naver",
    label: "네이버 시장·트렌드",
    sources: ["naver_market", "naver_trend"],
    links: [
      { label: "네이버 증권 열기", url: "https://finance.naver.com" },
      { label: "네이버 데이터랩 열기", url: "https://datalab.naver.com" },
    ],
  },
]
