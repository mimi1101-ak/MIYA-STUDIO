// 사업 아이디어 대시보드(사진 보드)의 규칙. 화면(브라우저)과 서버가 함께 씁니다.

export const BOARD_BUCKET = "idea-boards"
// 보드 하나에 올릴 수 있는 사진 수 (무료 저장 공간 1GB를 아껴 쓰도록)
export const BOARD_MAX_ITEMS = 60
// 보드 칸: PC는 가로 6칸, 휴대폰은 3칸. 사진 하나는 가로 1~6칸 · 세로 1~4칸
export const BOARD_COLS = 6
export const BOARD_MOBILE_COLS = 3
export const BOARD_MAX_ROWS = 4
export const BOARD_CAPTION_MAX = 100

export type BoardFit = "cover" | "contain"

export type BoardItem = {
  id: string
  path: string
  // 비공개 사진을 잠깐 볼 수 있는 주소(서버가 매번 새로 만듦). 만들지 못하면 null
  url: string | null
  width: number
  height: number
  colSpan: number
  rowSpan: number
  fit: BoardFit
  caption: string
}

// 화면에서 바꾸는 값만 (순서·크기·맞춤·설명)
export type BoardLayoutChange = {
  id: string
  sortOrder: number
  colSpan: number
  rowSpan: number
  fit: BoardFit
  caption: string
}

export function clampSpan(value: number, max: number): number {
  return Math.min(max, Math.max(1, Math.round(value)))
}

// 새 사진의 처음 크기: 가로 사진은 넓게, 세로 사진은 길게, 나머지는 2×2
export function defaultSpans(width: number, height: number): { colSpan: number; rowSpan: number } {
  const ratio = width / height
  if (ratio >= 1.3) return { colSpan: 3, rowSpan: 2 }
  if (ratio <= 0.77) return { colSpan: 2, rowSpan: 3 }
  return { colSpan: 2, rowSpan: 2 }
}

// 올린 파일 경로는 반드시 "사용자ID/아이디어ID/무작위이름.확장자" 모양
export function isBoardPath(path: unknown, userId: string, ideaId: string): path is string {
  if (typeof path !== "string") return false
  const prefix = `${userId}/${ideaId}/`
  return path.startsWith(prefix) && /^[0-9a-f-]{36}\.(webp|jpg|png)$/.test(path.slice(prefix.length))
}

type BoardRow = {
  id: string
  path: string
  width: number
  height: number
  col_span: number
  row_span: number
  fit: string
  caption: string
}

export function toBoardItem(row: BoardRow, url: string | null): BoardItem {
  return {
    id: row.id,
    path: row.path,
    url,
    width: row.width,
    height: row.height,
    colSpan: clampSpan(row.col_span, BOARD_COLS),
    rowSpan: clampSpan(row.row_span, BOARD_MAX_ROWS),
    fit: row.fit === "contain" ? "contain" : "cover",
    caption: row.caption,
  }
}
