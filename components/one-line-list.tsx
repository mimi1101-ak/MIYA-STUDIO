"use client"

import { useState, type FormEvent } from "react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { LIMITS } from "@/lib/validation"

// 한 줄 목록(체크 · 수정 · 삭제 · 아래 칸에 추가). 월별 목표와 Dream이 함께 씁니다.
// 저장은 부모가 하고, 끝나면 done()을 불러 입력 칸을 비우거나 수정 칸을 닫습니다.

export type OneLineItem = { id: string; title: string; done: boolean }

export type OneLineLabels = {
  // 예: "목표", "Dream" (안내 문구에 씀)
  item: string
  // 체크 상자 설명. 예: "달성 표시", "이룸 표시"
  check: string
  placeholder: string
  empty: string
  // 추가 칸 설명(화면 읽기 프로그램용)
  add: string
}

export function OneLineList({
  items,
  pending,
  labels,
  onAdd,
  onSave,
  onToggle,
  onDelete,
}: {
  items: OneLineItem[] | null
  pending: boolean
  labels: OneLineLabels
  onAdd: (title: string, done: () => void) => void
  onSave: (id: string, title: string, done: () => void) => void
  onToggle: (id: string, done: boolean) => void
  onDelete: (id: string, done: () => void) => void
}) {
  const [text, setText] = useState("")
  const [editing, setEditing] = useState<{ id: string; title: string } | null>(null)

  function handleAdd(event: FormEvent) {
    event.preventDefault()
    if (!text.trim()) return
    onAdd(text, () => setText(""))
  }

  function handleSave(event: FormEvent) {
    event.preventDefault()
    if (!editing || !editing.title.trim()) return
    onSave(editing.id, editing.title, () => setEditing(null))
  }

  return (
    <>
      {items && items.length > 0 ? (
        <ul className={cn("flex flex-col", pending && "opacity-60")}>
          {items.map((item) =>
            editing?.id === item.id ? (
              <li key={item.id} className="border-t border-foreground/[0.07] py-2 first:border-t-0">
                <form onSubmit={handleSave} className="flex flex-col gap-2">
                  <Input
                    value={editing.title}
                    onChange={(e) => setEditing({ id: item.id, title: e.target.value })}
                    maxLength={LIMITS.goalTitle}
                    aria-label={`${labels.item} 고치기`}
                    autoFocus
                  />
                  <div className="flex items-center gap-1.5">
                    <Button type="submit" size="xs" disabled={pending || !editing.title.trim()}>
                      저장
                    </Button>
                    <Button type="button" size="xs" variant="ghost" disabled={pending} onClick={() => setEditing(null)}>
                      취소
                    </Button>
                    <Button
                      type="button"
                      size="xs"
                      variant="ghost"
                      disabled={pending}
                      className="ml-auto text-muted-foreground hover:text-destructive"
                      onClick={() => {
                        if (window.confirm(`'${item.title}'을(를) 지울까요?`)) onDelete(item.id, () => setEditing(null))
                      }}
                    >
                      삭제
                    </Button>
                  </div>
                </form>
              </li>
            ) : (
              <li key={item.id} className="flex items-start gap-2.5 border-t border-foreground/[0.07] py-2 first:border-t-0">
                <Checkbox
                  className="mt-0.5"
                  checked={item.done}
                  disabled={pending}
                  onCheckedChange={(checked) => onToggle(item.id, checked)}
                  aria-label={`${item.title} ${labels.check}`}
                />
                <span
                  className={cn(
                    "min-w-0 flex-1 text-sm leading-5 break-words",
                    item.done && "text-dim line-through decoration-foreground/40"
                  )}
                >
                  {item.title}
                </span>
                <Button
                  type="button"
                  size="xs"
                  variant="ghost"
                  className="-my-0.5 text-muted-foreground"
                  disabled={pending}
                  onClick={() => setEditing({ id: item.id, title: item.title })}
                >
                  수정
                </Button>
              </li>
            )
          )}
        </ul>
      ) : (
        items && <p className="text-sm text-muted-foreground">{labels.empty}</p>
      )}

      <form onSubmit={handleAdd} className="flex gap-2">
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={LIMITS.goalTitle}
          placeholder={labels.placeholder}
          aria-label={labels.add}
          className="h-9 min-w-0"
        />
        <Button type="submit" size="sm" className="h-9 shrink-0 px-3" disabled={pending || !text.trim()}>
          추가
        </Button>
      </form>
    </>
  )
}
