"use client"

import Link from "next/link"
import { useState, useTransition } from "react"

import { InsightForm } from "@/components/insight-form"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

import { createInsight, deleteInsight, updateInsight } from "./actions"

export type InsightView = {
  id: string
  title: string
  content: string
  dateLabel: string
  article: { title: string; url: string; sourceLabel: string } | null
}

export function InsightsBoard({ insights }: { insights: InsightView[] }) {
  const [adding, setAdding] = useState(false)

  return (
    <div className="flex flex-col gap-4">
      {adding ? (
        <div className="rounded-xl bg-card p-4 ring-1 ring-foreground/10">
          <h2 className="mb-3 text-sm font-medium">새 인사이트</h2>
          <InsightForm
            submitLabel="저장"
            onSubmit={(input) => createInsight(null, input)}
            onDone={() => setAdding(false)}
            onCancel={() => setAdding(false)}
          />
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" onClick={() => setAdding(true)}>
            새 인사이트 쓰기
          </Button>
          <span className="text-xs text-muted-foreground">
            글에 대한 인사이트는{" "}
            <Link href="/news" className="underline underline-offset-4">
              뉴스
            </Link>
            에서 글을 골라 쓸 수 있어요.
          </span>
        </div>
      )}

      {insights.length === 0 ? (
        <p className="text-sm text-muted-foreground">아직 저장한 인사이트가 없어요.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {insights.map((insight) => (
            <InsightCard key={insight.id} insight={insight} />
          ))}
        </ul>
      )}
    </div>
  )
}

function InsightCard({ insight }: { insight: InsightView }) {
  const [editing, setEditing] = useState(false)
  const [error, setError] = useState("")
  const [deleting, startDelete] = useTransition()

  function handleDelete() {
    if (!window.confirm(`"${insight.title}" 인사이트를 삭제할까요?`)) return
    setError("")
    startDelete(async () => {
      const result = await deleteInsight(insight.id)
      if (!result.ok) setError(result.error)
    })
  }

  return (
    <li className="flex flex-col gap-3 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
      <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
        {insight.article ? (
          <Badge variant="secondary">{insight.article.sourceLabel}</Badge>
        ) : (
          <Badge variant="outline">직접 작성</Badge>
        )}
        <span>{insight.dateLabel}</span>
      </div>

      {editing ? (
        <InsightForm
          initial={{ title: insight.title, content: insight.content }}
          submitLabel="저장"
          onSubmit={(input) => updateInsight(insight.id, input)}
          onDone={() => setEditing(false)}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <>
          <div className="flex flex-col gap-1.5">
            <h2 className="font-medium break-words">{insight.title}</h2>
            <p className="text-sm leading-relaxed break-words whitespace-pre-wrap">
              {insight.content}
            </p>
          </div>
          {insight.article && (
            <a
              href={insight.article.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs break-words text-muted-foreground underline-offset-4 hover:underline"
            >
              원문: {insight.article.title} ↗
            </a>
          )}
          <div className="flex justify-end gap-1">
            <Button type="button" size="xs" variant="ghost" onClick={() => setEditing(true)}>
              수정
            </Button>
            <Button
              type="button"
              size="xs"
              variant="ghost"
              disabled={deleting}
              onClick={handleDelete}
              className="text-muted-foreground hover:text-destructive"
            >
              {deleting ? "삭제 중…" : "삭제"}
            </Button>
          </div>
        </>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </li>
  )
}
