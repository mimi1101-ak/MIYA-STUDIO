import Link from "next/link"

import { cn } from "@/lib/utils"

// '사업' 아이디어 화면 위 탭: MOMO 컨설팅(대화·사업계획서) · 대시보드(사진 보드)
export function IdeaTabs({ ideaId, active, boardCount }: { ideaId: string; active: "consult" | "board"; boardCount?: number }) {
  const tabs = [
    { key: "consult", href: `/ideas/${ideaId}`, label: "MOMO 컨설팅" },
    { key: "board", href: `/ideas/${ideaId}/board`, label: "대시보드" },
  ] as const
  return (
    <nav aria-label="아이디어 메뉴" className="no-scrollbar -mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
      <ul className="flex min-w-max gap-1 border-b">
        {tabs.map((tab) => {
          const current = tab.key === active
          return (
            <li key={tab.key}>
              <Link
                href={tab.href}
                aria-current={current ? "page" : undefined}
                className={cn(
                  "-mb-px inline-flex h-10 items-center gap-1.5 border-b-2 px-3 text-sm transition-colors",
                  current
                    ? "border-foreground font-medium text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                )}
              >
                {tab.label}
                {tab.key === "board" && boardCount ? (
                  <span className="font-mono text-xs text-dim tabular-nums">{boardCount}</span>
                ) : null}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
