"use client"

import { useOptimistic, useState, useTransition, type FormEvent } from "react"

import { addTask, deleteTask, setTaskDone, updateTaskTitle } from "@/app/planner/actions"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import type { Period } from "@/lib/date"
import { cn } from "@/lib/utils"
import { LIMITS, type ActionResult } from "@/lib/validation"

export type TaskItem = { id: string; title: string; is_done: boolean }

type Change =
  | { type: "add"; task: TaskItem }
  | { type: "toggle"; id: string; isDone: boolean }
  | { type: "rename"; id: string; title: string }
  | { type: "delete"; id: string }

// 저장이 끝나기 전에도 화면에 바로 반영(낙관적 업데이트: 성공할 거라 보고 먼저 보여 주기)
function applyChange(tasks: TaskItem[], change: Change): TaskItem[] {
  switch (change.type) {
    case "add":
      return [...tasks, change.task]
    case "toggle":
      return tasks.map((t) => (t.id === change.id ? { ...t, is_done: change.isDone } : t))
    case "rename":
      return tasks.map((t) => (t.id === change.id ? { ...t, title: change.title } : t))
    case "delete":
      return tasks.filter((t) => t.id !== change.id)
  }
}

const TEMP_PREFIX = "temp-"

export function TaskList({
  period,
  tasks,
  placeholder,
  emptyText,
}: {
  period: Period
  tasks: TaskItem[]
  placeholder: string
  emptyText: string
}) {
  const [items, applyOptimistic] = useOptimistic(tasks, applyChange)
  const [, startTransition] = useTransition()
  const [newTitle, setNewTitle] = useState("")
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState("")
  const [error, setError] = useState("")

  function run(change: Change, action: () => Promise<ActionResult>) {
    setError("")
    startTransition(async () => {
      applyOptimistic(change)
      const result = await action()
      if (!result.ok) setError(result.error)
    })
  }

  function handleAdd(event: FormEvent) {
    event.preventDefault()
    const title = newTitle.trim()
    if (!title) return
    setNewTitle("")
    run(
      { type: "add", task: { id: `${TEMP_PREFIX}${crypto.randomUUID()}`, title, is_done: false } },
      () => addTask(period, title)
    )
  }

  function handleRename(event: FormEvent, task: TaskItem) {
    event.preventDefault()
    const title = editTitle.trim()
    setEditingId(null)
    if (!title || title === task.title) return
    run({ type: "rename", id: task.id, title }, () => updateTaskTitle(task.id, title))
  }

  function handleDelete(task: TaskItem) {
    if (!window.confirm(`"${task.title}"을(를) 삭제할까요?`)) return
    run({ type: "delete", id: task.id }, () => deleteTask(task.id))
  }

  const doneCount = items.filter((t) => t.is_done).length

  return (
    <div className="flex flex-col gap-3">
      {items.length > 0 ? (
        <>
          <p className="text-xs text-muted-foreground">
            {items.length}개 중 {doneCount}개 완료
          </p>
          <ul className="flex flex-col divide-y">
            {items.map((task) => {
              const saving = task.id.startsWith(TEMP_PREFIX)
              const editing = editingId === task.id
              return (
                <li key={task.id} className="flex min-h-11 items-center gap-3 py-1.5">
                  <Checkbox
                    checked={task.is_done}
                    disabled={saving}
                    onCheckedChange={(checked) =>
                      run({ type: "toggle", id: task.id, isDone: checked }, () =>
                        setTaskDone(task.id, checked)
                      )
                    }
                    aria-label={`${task.title} 완료 표시`}
                  />
                  {editing ? (
                    <form
                      onSubmit={(e) => handleRename(e, task)}
                      className="flex min-w-0 flex-1 items-center gap-2"
                    >
                      <Input
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        maxLength={LIMITS.taskTitle}
                        aria-label="할 일 수정"
                        autoFocus
                      />
                      <Button type="submit" size="sm">
                        저장
                      </Button>
                      <Button type="button" size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                        취소
                      </Button>
                    </form>
                  ) : (
                    <>
                      <span
                        className={cn(
                          "min-w-0 flex-1 text-sm break-words",
                          task.is_done && "text-muted-foreground line-through",
                          saving && "opacity-60"
                        )}
                      >
                        {task.title}
                      </span>
                      <div className="flex shrink-0 gap-1">
                        <Button
                          type="button"
                          size="xs"
                          variant="ghost"
                          disabled={saving}
                          onClick={() => {
                            setEditingId(task.id)
                            setEditTitle(task.title)
                          }}
                        >
                          수정
                        </Button>
                        <Button
                          type="button"
                          size="xs"
                          variant="ghost"
                          disabled={saving}
                          onClick={() => handleDelete(task)}
                          className="text-muted-foreground hover:text-destructive"
                        >
                          삭제
                        </Button>
                      </div>
                    </>
                  )}
                </li>
              )
            })}
          </ul>
        </>
      ) : (
        <p className="py-2 text-sm text-muted-foreground">{emptyText}</p>
      )}

      <form onSubmit={handleAdd} className="flex gap-2">
        <Input
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          placeholder={placeholder}
          maxLength={LIMITS.taskTitle}
          aria-label={placeholder}
        />
        <Button type="submit" disabled={!newTitle.trim()}>
          추가
        </Button>
      </form>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}
