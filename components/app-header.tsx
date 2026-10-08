"use client"

import { ChevronDown } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect, useRef, useState } from "react"

import { TREND_LINKS } from "@/lib/sources"
import { cn } from "@/lib/utils"

type NavLink = { href: string; label: string }
type NavGroup = { label: string; href: string; children: typeof TREND_LINKS; match: string[] }

const NAV_ITEMS: (NavLink | NavGroup)[] = [
  { href: "/", label: "오늘" },
  { href: "/calendar", label: "캘린더" },
  { href: "/goals", label: "목표" },
  // 트렌드: EO planet · Long Black · 저장한 글을 하위 메뉴로
  { label: "트렌드", href: TREND_LINKS[0].href, children: TREND_LINKS, match: ["/news", "/insights"] },
  { href: "/projects", label: "프로젝트" },
  { href: "/profile", label: "프로필" },
]

const itemClass =
  "inline-flex h-8 items-center gap-1 rounded-md px-3 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
const activeClass = "bg-muted font-medium text-foreground"

// 모든 화면 위쪽의 메뉴. 로그인 화면에서는 숨깁니다.
export function AppHeader() {
  const pathname = usePathname()
  if (pathname === "/login" || pathname.startsWith("/auth")) return null

  return (
    <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-1 px-4 pt-3 md:flex-row md:items-center md:justify-between md:gap-6 md:px-6 md:py-3">
        <Link href="/" className="text-base font-semibold tracking-tight">
          MIYA STUDIO
        </Link>
        <nav
          aria-label="주 메뉴"
          className="no-scrollbar -mx-4 overflow-x-auto px-4 md:mx-0 md:overflow-visible md:px-0"
        >
          <ul className="flex min-w-max gap-1 pb-2 md:pb-0">
            {NAV_ITEMS.map((item) =>
              "children" in item ? (
                <TrendMenu
                  key={item.label}
                  group={item}
                  active={item.match.some((path) => pathname.startsWith(path))}
                  pathname={pathname}
                />
              ) : (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={isActive(item.href, pathname) ? "page" : undefined}
                    className={cn(itemClass, isActive(item.href, pathname) && activeClass)}
                  >
                    {item.label}
                  </Link>
                </li>
              )
            )}
          </ul>
        </nav>
      </div>
    </header>
  )
}

function isActive(href: string, pathname: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href)
}

// 넓은 화면: 누르면 아래로 하위 메뉴가 열립니다.
// 휴대폰: 메뉴 줄이 옆으로 밀리는 영역이라 펼침 대신 첫 하위 화면으로 바로 가고, 화면 위 탭으로 옮겨 다닙니다.
function TrendMenu({ group, active, pathname }: { group: NavGroup; active: boolean; pathname: string }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLLIElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false)
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false)
    }
    document.addEventListener("pointerdown", close)
    document.addEventListener("keydown", escape)
    return () => {
      document.removeEventListener("pointerdown", close)
      document.removeEventListener("keydown", escape)
    }
  }, [open])

  return (
    <li ref={ref} className="relative">
      <Link href={group.href} className={cn(itemClass, "md:hidden", active && activeClass)}>
        {group.label}
      </Link>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={cn(itemClass, "hidden md:inline-flex", active && activeClass)}
      >
        {group.label}
        <ChevronDown className={cn("size-3.5 transition-transform", open && "rotate-180")} aria-hidden />
      </button>
      {open && (
        <ul
          role="menu"
          aria-label={`${group.label} 하위 메뉴`}
          className="absolute top-full left-0 z-20 mt-1 hidden w-56 flex-col gap-0.5 rounded-lg bg-popover p-1 shadow-md ring-1 ring-foreground/10 md:flex"
        >
          {group.children.map((child) => {
            const current = pathname.startsWith(child.href)
            return (
              <li key={child.href} role="none">
                <Link
                  role="menuitem"
                  href={child.href}
                  aria-current={current ? "page" : undefined}
                  onClick={() => setOpen(false)}
                  className={cn(
                    "flex flex-col rounded-md px-3 py-2 text-sm transition-colors hover:bg-muted",
                    current && "bg-muted"
                  )}
                >
                  <span className={cn(current && "font-medium")}>{child.label}</span>
                  <span className="text-xs text-muted-foreground">{child.description}</span>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </li>
  )
}
