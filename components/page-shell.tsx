import type { ReactNode } from "react"

// 화면 공통 틀: 가운데 정렬된 본문 + 제목·설명
export function PageShell({
  title,
  description,
  children,
}: {
  title?: string
  description?: string
  children: ReactNode
}) {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-6 md:px-6 md:py-8">
      {title && (
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
        </div>
      )}
      {children}
    </main>
  )
}

// 데이터를 불러오는 동안 보여 줄 회색 상자
export function LoadingBlock({ lines = 3 }: { lines?: number }) {
  return (
    <div className="flex flex-col gap-2 rounded-xl bg-card p-4 ring-1 ring-foreground/10" aria-busy="true">
      <span className="sr-only">불러오는 중…</span>
      {Array.from({ length: lines }, (_, i) => (
        <div key={i} className="h-4 animate-pulse rounded bg-muted" style={{ width: `${90 - i * 15}%` }} />
      ))}
    </div>
  )
}
