"use client"

import Link from "next/link"
import { useState } from "react"

import { ArticleCard } from "@/components/article-card"
import type { SavedArticleView } from "@/lib/saved-articles"
import { ARTICLE_SOURCES, SOURCE_LABELS, type ArticleSource } from "@/lib/sources"
import { cn } from "@/lib/utils"

// 저장한 글 목록. 위쪽 버튼으로 출처별로 걸러 봅니다.
export function SavedBoard({ articles }: { articles: SavedArticleView[] }) {
  const [filter, setFilter] = useState<ArticleSource | "all">("all")
  const shown = filter === "all" ? articles : articles.filter((a) => a.source === filter)

  if (articles.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        아직 저장한 글이 없어요.{" "}
        <Link href="/news/eo" className="underline underline-offset-4">
          트렌드
        </Link>
        에서 읽은 글의 링크를 붙여 넣으면 MOMO가 보고서로 정리해 여기에 모아 둬요.
      </p>
    )
  }

  const chips: { value: ArticleSource | "all"; label: string; count: number }[] = [
    { value: "all", label: "전체", count: articles.length },
    ...ARTICLE_SOURCES.map((s) => ({
      value: s,
      label: SOURCE_LABELS[s],
      count: articles.filter((a) => a.source === s).length,
    })),
  ]

  return (
    <div className="flex flex-col gap-4">
      <div role="group" aria-label="출처별로 보기" className="flex flex-wrap gap-1.5">
        {chips.map((chip) => (
          <button
            key={chip.value}
            type="button"
            aria-pressed={filter === chip.value}
            onClick={() => setFilter(chip.value)}
            className={cn(
              "h-7 rounded-full px-3 text-xs ring-1 ring-foreground/10 transition-colors",
              filter === chip.value ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:bg-muted"
            )}
          >
            {chip.label} {chip.count}
          </button>
        ))}
      </div>

      <ul className="flex flex-col gap-3">
        {shown.map((article) => (
          <ArticleCard key={article.id} article={article} />
        ))}
      </ul>
    </div>
  )
}
