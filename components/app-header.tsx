"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

import { cn } from "@/lib/utils"

const NAV_ITEMS = [
  { href: "/", label: "대시보드" },
  { href: "/planner", label: "플래너" },
  { href: "/news", label: "뉴스" },
  { href: "/insights", label: "인사이트" },
  { href: "/projects", label: "프로젝트" },
  { href: "/profile", label: "프로필" },
]

// 모든 화면 위쪽의 메뉴. 로그인 화면에서는 숨깁니다.
export function AppHeader() {
  const pathname = usePathname()
  if (pathname === "/login" || pathname.startsWith("/auth")) return null

  return (
    <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-1 px-4 pt-3 md:flex-row md:items-center md:justify-between md:gap-6 md:px-6 md:py-3">
        <Link href="/" className="text-base font-semibold tracking-tight">
          24시간 비서
        </Link>
        <nav aria-label="주 메뉴" className="no-scrollbar -mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
          <ul className="flex min-w-max gap-1 pb-2 md:pb-0">
            {NAV_ITEMS.map((item) => {
              const active =
                item.href === "/" ? pathname === "/" : pathname.startsWith(item.href)
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "inline-flex h-8 items-center rounded-md px-3 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                      active && "bg-muted font-medium text-foreground"
                    )}
                  >
                    {item.label}
                  </Link>
                </li>
              )
            })}
          </ul>
        </nav>
      </div>
    </header>
  )
}
