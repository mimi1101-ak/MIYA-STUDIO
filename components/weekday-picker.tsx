"use client"

import { WEEKDAYS } from "@/lib/date"
import { cn } from "@/lib/utils"

// 월~일 순서로 보여 줍니다(값은 0=일 … 6=토).
const ORDER = [1, 2, 3, 4, 5, 6, 0]

export function WeekdayPicker({
  value,
  onChange,
  label,
}: {
  value: number[]
  onChange: (days: number[]) => void
  label: string
}) {
  function toggle(day: number) {
    onChange(value.includes(day) ? value.filter((d) => d !== day) : [...value, day])
  }

  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-1">
      {ORDER.map((day) => {
        const on = value.includes(day)
        return (
          <button
            key={day}
            type="button"
            aria-pressed={on}
            onClick={() => toggle(day)}
            className={cn(
              "size-9 rounded-md text-sm ring-1 ring-foreground/10 transition-colors",
              on ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:bg-muted"
            )}
          >
            {WEEKDAYS[day]}
          </button>
        )
      })}
    </div>
  )
}
