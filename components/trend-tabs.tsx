import Link from "next/link"

import { TREND_LINKS } from "@/lib/sources"
import { cn } from "@/lib/utils"

// 트렌드 화면 위 탭: EO planet · Long Black · 저장한 글 (휴대폰에서는 이 탭으로 옮겨 다닙니다)
export function TrendTabs({ active }: { active: string }) {
  return (
    <nav aria-label="트렌드 메뉴" className="no-scrollbar -mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
      <ul className="flex min-w-max gap-1 border-b">
        {TREND_LINKS.map((link) => {
          const current = link.href === active
          return (
            <li key={link.href}>
              <Link
                href={link.href}
                aria-current={current ? "page" : undefined}
                className={cn(
                  "-mb-px inline-flex h-9 items-center border-b-2 px-3 text-sm transition-colors",
                  current
                    ? "border-foreground font-medium text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                )}
              >
                {link.label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
