"use client"

import { useState, useTransition } from "react"

import { OneLineList } from "@/components/one-line-list"
import { CornerFrame, SectionLabel } from "@/components/space-ui"
import { addDream, deleteDream, setDreamDone, updateDream, type Dream, type DreamsResult } from "@/lib/dreams"

// Dream: 기한 없이 오래 품는 큰 목표. 목표 화면 맨 위의 관측 창에 둡니다.
export function DreamList({ initialDreams }: { initialDreams: Dream[] | null }) {
  const [dreams, setDreams] = useState<Dream[] | null>(initialDreams)
  const [error, setError] = useState(initialDreams ? "" : "Dream을 불러오지 못했어요.")
  const [pending, startTransition] = useTransition()

  function run(action: () => Promise<DreamsResult>, after?: () => void) {
    setError("")
    startTransition(async () => {
      const result = await action()
      if (!result.ok) return setError(result.error)
      setDreams(result.dreams)
      after?.()
    })
  }

  const doneCount = dreams?.filter((d) => d.done).length ?? 0

  return (
    <CornerFrame aria-label="Dream" className="flex flex-col gap-4 p-4 md:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1.5">
          <SectionLabel code="DREAM">Dream</SectionLabel>
          <p className="font-serif text-[15px] leading-relaxed text-foreground/85 md:text-base">
            기한 없이 오래 품는 나의 큰 목표
          </p>
        </div>
        {dreams && dreams.length > 0 && (
          <p className="shrink-0 font-mono text-[13px] tabular-nums">
            {doneCount} / {dreams.length}
          </p>
        )}
      </div>

      <OneLineList
        items={dreams}
        pending={pending}
        labels={{
          item: "Dream",
          check: "이룸 표시",
          placeholder: "예: 내 브랜드로 생활하기",
          empty: "아직 적은 Dream이 없어요. 오래 품고 싶은 큰 목표를 적어 보세요.",
          add: "Dream 추가",
        }}
        onAdd={(text, done) => run(() => addDream(text), done)}
        onSave={(id, text, done) => run(() => updateDream(id, text), done)}
        onToggle={(id, checked) => run(() => setDreamDone(id, checked))}
        onDelete={(id, done) => run(() => deleteDream(id), done)}
      />

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </CornerFrame>
  )
}
