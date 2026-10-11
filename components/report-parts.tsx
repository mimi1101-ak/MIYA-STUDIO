"use client"

import { ChevronDown } from "lucide-react"
import { useState, type ReactNode } from "react"

import { cn } from "@/lib/utils"

// MOMO가 쓰는 종이 문서(읽기 보고서·사업계획서)의 공통 조각

// 결재 서류 같은 정보 표의 한 칸. wide면 넓은 화면에서 한 줄을 다 씁니다.
export function MetaCell({ label, wide = false, children }: { label: string; wide?: boolean; children: ReactNode }) {
  return (
    <>
      <dt className="border-r border-b border-foreground/25 bg-muted/60 px-2 py-1.5 text-muted-foreground">{label}</dt>
      <dd className={cn("border-r border-b border-foreground/25 px-2 py-1.5 break-words", wide && "sm:col-span-3")}>
        {children}
      </dd>
    </>
  )
}

// 보고서 섹션. 휴대폰에서는 눌러서 펼치고, 넓은 화면에서는 항상 펼쳐 둡니다.
export function Section({
  number,
  title,
  alwaysOpen = false,
  children,
}: {
  number: number
  title: string
  alwaysOpen?: boolean
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const heading = `${number}. ${title}`
  return (
    <section className="mt-5">
      <h3 className="mb-2 border-b border-foreground/25 pb-1 font-serif text-[15px] font-semibold">
        {alwaysOpen ? (
          heading
        ) : (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className="flex w-full items-center justify-between text-left md:pointer-events-none"
          >
            {heading}
            <ChevronDown className={cn("size-4 transition-transform md:hidden", open && "rotate-180")} aria-hidden />
          </button>
        )}
      </h3>
      <div className={cn(!alwaysOpen && !open && "hidden md:block")}>{children}</div>
    </section>
  )
}
