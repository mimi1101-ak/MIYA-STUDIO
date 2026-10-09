"use client"

import { ChevronDown } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect, useRef, useState, useSyncExternalStore } from "react"

import { buttonVariants } from "@/components/ui/button"
import { formatKstTime } from "@/lib/date"
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
]
const PROFILE: NavLink = { href: "/profile", label: "프로필" }
// 휴대폰 메뉴 줄에는 프로필도 함께 넣습니다(PC는 오른쪽 끝).
const MOBILE_ITEMS: (NavLink | NavGroup)[] = [...NAV_ITEMS, PROFILE]

// 지금 있는 메뉴는 흰 글자 + 앞에 작은 네모
const itemClass =
  "inline-flex items-center gap-2 whitespace-nowrap text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
const activeClass = "text-foreground before:size-1 before:bg-foreground before:content-['']"

// 모든 화면 위쪽의 메뉴. 로그인 화면에서는 숨깁니다.
// PC: 떠 있는 막대(왼쪽 메뉴 · 가운데 MIYA STUDIO · 오른쪽 시계·프로필·MOMO와 대화)
// 휴대폰·좁은 화면(1024px 미만): 맨 위 줄(MIYA STUDIO · 시계) + 옆으로 미는 메뉴 줄
export function AppHeader() {
  const pathname = usePathname()
  if (pathname === "/login" || pathname.startsWith("/auth")) return null

  const isGroupActive = (group: NavGroup) => group.match.some((path) => pathname.startsWith(path))

  return (
    <header className="sticky top-0 z-20 border-b border-foreground/10 bg-background/85 backdrop-blur lg:top-3 lg:mx-auto lg:mt-3 lg:w-[calc(100%-3rem)] lg:max-w-5xl lg:rounded-[10px] lg:border lg:bg-[rgb(14_14_16/0.8)]">
      {/* 휴대폰·좁은 화면 */}
      <div className="lg:hidden">
        <div className="flex h-12 items-center justify-between px-4">
          <Wordmark />
          <Clock />
        </div>
        <nav aria-label="주 메뉴" className="no-scrollbar overflow-x-auto px-4 pb-2">
          <ul className="flex min-w-max gap-1">
            {MOBILE_ITEMS.map((item) => {
              const active = "children" in item ? isGroupActive(item) : isActive(item.href, pathname)
              return (
                <li key={item.label}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      itemClass,
                      "h-10 rounded-full border border-transparent px-3.5 text-sm",
                      active && cn(activeClass, "border-foreground/20 bg-foreground/5")
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

      {/* PC */}
      <div className="hidden grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-4 p-1.5 pl-2 lg:grid">
        <nav aria-label="주 메뉴" className="min-w-0">
          <ul className="flex gap-0.5">
            {NAV_ITEMS.map((item) =>
              "children" in item ? (
                <TrendMenu key={item.label} group={item} active={isGroupActive(item)} pathname={pathname} />
              ) : (
                <li key={item.href}>
                  <NavItem href={item.href} label={item.label} active={isActive(item.href, pathname)} />
                </li>
              )
            )}
          </ul>
        </nav>
        <Wordmark />
        <div className="flex items-center gap-1 justify-self-end">
          <Clock />
          <NavItem href={PROFILE.href} label={PROFILE.label} active={isActive(PROFILE.href, pathname)} />
          <Link href="/goals/new" className={buttonVariants({ size: "sm", className: "h-9 px-3.5 text-[13px]" })}>
            MOMO와 대화
          </Link>
        </div>
      </div>
    </header>
  )
}

function isActive(href: string, pathname: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href)
}

function NavItem({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(itemClass, "h-9 rounded-md px-3 text-[13px] tracking-wide", active && activeClass)}
    >
      {label}
    </Link>
  )
}

function Wordmark() {
  return (
    <Link
      href="/"
      className="inline-flex h-11 items-center px-1 font-pixel text-[15px] font-black tracking-[0.28em] whitespace-nowrap"
    >
      MIYA STUDIO
    </Link>
  )
}

// 한국 시각 시계. 서버 화면에는 시각을 그리지 않고, 브라우저에서 1초마다 새로 그립니다.
function subscribeSecond(onChange: () => void) {
  const id = setInterval(onChange, 1000)
  return () => clearInterval(id)
}

function Clock() {
  const time = useSyncExternalStore(subscribeSecond, () => formatKstTime(Date.now()), () => null)
  return (
    <span className="px-2 font-mono text-xs tracking-[0.08em] whitespace-nowrap text-muted-foreground tabular-nums">
      <span className="sr-only">한국 시각 </span>
      {time ?? "--:--:--"} KST
    </span>
  )
}

// 트렌드 하위 메뉴(PC): 누르면 아래로 열립니다. 휴대폰은 메뉴 줄에서 첫 하위 화면으로 바로 가고, 화면 위 탭으로 옮겨 다닙니다.
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
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={cn(itemClass, "h-9 rounded-md px-3 text-[13px] tracking-wide", active && activeClass)}
      >
        {group.label}
        <ChevronDown className={cn("size-3.5 transition-transform", open && "rotate-180")} aria-hidden />
      </button>
      {open && (
        <ul
          role="menu"
          aria-label={`${group.label} 하위 메뉴`}
          className="absolute top-full left-0 z-20 mt-2 flex w-56 flex-col gap-0.5 border border-foreground/15 bg-popover p-1 shadow-lg"
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
                    "flex flex-col px-3 py-2 text-sm transition-colors hover:bg-foreground/5",
                    current && "bg-foreground/5"
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
