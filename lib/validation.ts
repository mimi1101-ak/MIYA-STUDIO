// 입력값 검사. 브라우저(저장 전 안내)와 서버(최종 확인) 양쪽에서 같이 씁니다.

export const LIMITS = {
  taskTitle: 200,
  displayName: 50,
  projectName: 100,
  projectDescription: 300,
  articleTitle: 300,
  articleCategory: 50,
  insightTitle: 200,
  insightContent: 10000,
} as const

export const URL_ERROR_MESSAGE =
  "https:// 로 시작하는 전체 주소를 입력해 주세요. (예: https://example.com)"

// 문자열이면 앞뒤 공백을 지운 값을, 아니면 빈 문자열을 돌려줍니다.
export function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}

export function isValidHttpUrl(value: string): boolean {
  if (!value || /\s/.test(value)) return false
  try {
    const url = new URL(value)
    if (url.protocol !== "http:" && url.protocol !== "https:") return false
    return url.hostname === "localhost" || url.hostname.includes(".")
  } catch {
    return false
  }
}

export function isValidDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`))
}

export function isUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
  )
}

// 서버 액션이 돌려주는 결과 모양
export type ActionResult = { ok: true } | { ok: false; error: string }
