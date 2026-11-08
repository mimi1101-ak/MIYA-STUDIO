"use client"

import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
} from "@dnd-kit/core"
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { ArrowRight, Check, GripVertical, Sparkles } from "lucide-react"
import Link from "next/link"
import { useOptimistic, useState, useTransition } from "react"

import { MomoAvatar, MomoLine } from "@/components/momo-avatar"
import { ItemEditor } from "@/components/schedule/item-editor"
import { SectionLabel } from "@/components/space-ui"
import { QuickAdd } from "@/components/today/quick-add"
import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import type { AgendaItem, GoalOption, UnscheduledTask } from "@/lib/agenda-types"
import { formatDayLabel, formatDuration } from "@/lib/date"
import {
  bringUnscheduledToToday,
  deleteTask,
  keepTask,
  postponeTaskAction,
  reorderTasks,
  setTaskDone,
  splitTask,
} from "@/lib/schedule-actions"
import { cn } from "@/lib/utils"
import type { ActionResult } from "@/lib/validation"

export type CarriedTask = { id: string; title: string; carry_count: number }

type Props = {
  today: string
  tomorrow: string
  todayTasks: AgendaItem[]
  tomorrowTasks: AgendaItem[]
  goals: GoalOption[]
  unscheduled: UnscheduledTask[]
  oftenCarried: CarriedTask[]
}

type Change = { type: "done"; key: string; done: boolean } | { type: "order"; ids: string[] }

// 화면에서 바로 바꿔 보여 주기(저장이 끝나면 서버에서 받은 목록으로 바뀜)
function applyChange(state: AgendaItem[], change: Change): AgendaItem[] {
  if (change.type === "done") {
    return state.map((t) => (t.key === change.key ? { ...t, done: change.done } : t))
  }
  const rank = new Map(change.ids.map((id, index) => [id, index]))
  return state.map((t) => (rank.has(t.id) ? { ...t, rank: rank.get(t.id)! } : t))
}

function byRank(tasks: AgendaItem[], ymd: string): AgendaItem[] {
  return tasks.filter((t) => t.ymd === ymd).sort((a, b) => a.rank - b.rank)
}

// "오늘" 화면의 움직이는 부분: 빠른 입력, MOMO 신호 줄, 지금 할 일, 오늘·내일 할 일(끌어서 순서 바꾸기), 날짜 미정
export function TodayBoard({ today, tomorrow, todayTasks, tomorrowTasks, goals, unscheduled, oftenCarried }: Props) {
  const [tasks, change] = useOptimistic([...todayTasks, ...tomorrowTasks], applyChange)
  const [pendingKeys, setPendingKeys] = useState<string[]>([])
  const [notice, setNotice] = useState<{ type: "ok" | "error"; text: string } | null>(null)
  const [, startTransition] = useTransition()

  const todayList = byRank(tasks, today)
  const tomorrowList = byRank(tasks, tomorrow)

  function run(key: string, action: () => Promise<ActionResult>, optimistic?: () => void) {
    setNotice(null)
    setPendingKeys((keys) => [...keys, key])
    startTransition(async () => {
      optimistic?.()
      const result = await action()
      if (!result.ok) setNotice({ type: "error", text: result.error })
      else if (result.message) setNotice({ type: "ok", text: result.message })
      setPendingKeys((keys) => keys.filter((k) => k !== key))
    })
  }

  function toggle(task: AgendaItem, done: boolean) {
    run(task.key, () => setTaskDone(task.id, done), () => change({ type: "done", key: task.key, done }))
  }

  function reorder(ids: string[]) {
    setNotice(null)
    startTransition(async () => {
      change({ type: "order", ids })
      const result = await reorderTasks(ids)
      if (!result.ok) setNotice({ type: "error", text: result.error })
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <QuickAdd />

      <MomoLine tone={notice?.type === "error" ? "error" : "normal"}>
        {notice ? notice.text : summarize(todayList, tomorrowList)}
      </MomoLine>

      <CarriedPrompt tasks={oftenCarried} />

      <NowCard
        task={todayList.find((t) => !t.done) ?? null}
        hasTasks={todayList.length > 0}
        pendingKeys={pendingKeys}
        onDone={(task) => toggle(task, true)}
        onTomorrow={(task) => run(task.key, () => postponeTaskAction(task.id))}
      />

      <TaskList
        code="TODAY"
        label="오늘 할 일"
        dayLabel={formatDayLabel(today)}
        empty="오늘 할 일이 없어요. 위 빠른 입력에 적어 보세요."
        tasks={todayList}
        goals={goals}
        pendingKeys={pendingKeys}
        onToggle={toggle}
        onReorder={reorder}
      />

      <TaskList
        code="NEXT"
        label="내일 할 일"
        dayLabel={formatDayLabel(tomorrow)}
        empty="내일 할 일이 없어요. 빠른 입력에서 '내일'을 고르고 적어 보세요."
        tasks={tomorrowList}
        goals={goals}
        pendingKeys={pendingKeys}
        onToggle={toggle}
        onReorder={reorder}
      />

      {unscheduled.length > 0 && <UnscheduledCard tasks={unscheduled} />}
    </div>
  )
}

// 알릴 일이 없을 때 MOMO가 하는 말: 오늘·내일 할 일 개수
function summarize(todayList: AgendaItem[], tomorrowList: AgendaItem[]): string {
  const tomorrowText = tomorrowList.length > 0 ? ` 내일 할 일은 ${tomorrowList.length}개예요.` : ""
  if (todayList.length === 0) return `오늘은 할 일이 없어요. 위 빠른 입력으로 넣어 보세요.${tomorrowText}`
  const done = todayList.filter((t) => t.done).length
  if (done === todayList.length) return `오늘 할 일 ${done}개를 모두 끝냈어요.${tomorrowText}`
  return `오늘 할 일 ${todayList.length}개 중 ${done}개를 끝냈어요.${tomorrowText}`
}

// 할 일 옆 작은 정보: 목표 · 아이디어 · AI · 예상 시간 · 미룬 횟수
function taskMeta(task: AgendaItem): string {
  return [
    task.goalTitle,
    task.ideaTitle ? `아이디어 ‘${task.ideaTitle}’` : null,
    task.source === "ai" ? "AI" : null,
    formatDuration(task.end),
    task.carryCount > 0 ? `${task.carryCount}번 미룸` : null,
  ]
    .filter(Boolean)
    .join(" · ")
}

// ── 지금 할 일: 오늘 목록 맨 위의 안 끝낸 할 일 ────────────────

function NowCard({
  task,
  hasTasks,
  pendingKeys,
  onDone,
  onTomorrow,
}: {
  task: AgendaItem | null
  hasTasks: boolean
  pendingKeys: string[]
  onDone: (task: AgendaItem) => void
  onTomorrow: (task: AgendaItem) => void
}) {
  const pending = task ? pendingKeys.includes(task.key) : false
  return (
    <section
      aria-label="지금 할 일"
      className="flex flex-col gap-5 rounded-xl bg-foreground/[0.04] p-5 ring-1 ring-foreground/15 md:p-7"
    >
      <SectionLabel code="NOW">지금 할 일</SectionLabel>

      {task ? (
        <>
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge>오늘 목록 맨 위</Badge>
              {task.goalTitle && (
                <Badge variant="outline">
                  <span aria-hidden className="size-1.5 rotate-45 bg-foreground" />
                  {task.goalTitle}
                </Badge>
              )}
              {task.ideaId && task.ideaTitle && (
                <Badge variant="outline" className="max-w-full" render={<Link href={`/ideas/${task.ideaId}`} />}>
                  <span className="font-mono text-[10px] tracking-[0.14em] text-dim">IDEA</span>
                  <span className="truncate">{task.ideaTitle}</span>
                </Badge>
              )}
              {task.source === "ai" && (
                <Badge variant="secondary">
                  <Sparkles data-icon="inline-start" />
                  AI
                </Badge>
              )}
            </div>
            <p className="text-2xl leading-snug font-medium tracking-tight break-words md:text-[2rem] md:leading-[1.3]">
              {task.title}
            </p>
            <p className="font-mono text-[13px] text-muted-foreground">
              예상 {formatDuration(task.end)}
              {task.carryCount > 0 && ` · ${task.carryCount}번 미룸`}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex">
            <Button type="button" size="lg" className="h-11 px-6" disabled={pending} onClick={() => onDone(task)}>
              <Check data-icon="inline-start" />
              완료
            </Button>
            <Button
              type="button"
              size="lg"
              variant="outline"
              className="h-11 px-6"
              disabled={pending}
              onClick={() => onTomorrow(task)}
            >
              {pending ? "옮기는 중…" : "내일로"}
              {!pending && <ArrowRight data-icon="inline-end" />}
            </Button>
          </div>
        </>
      ) : (
        <div className="flex flex-col items-start gap-3">
          <p className="font-serif text-2xl md:text-[1.75rem]">
            {hasTasks ? "오늘 할 일을 모두 끝냈어요." : "오늘 남은 할 일이 없어요."}
          </p>
          <p className="text-sm text-muted-foreground">목표를 정해 두면 MOMO가 할 일을 쪼개서 날짜별로 넣어 드려요.</p>
          <Link href="/goals/new" className={buttonVariants({ size: "lg", className: "h-11 px-5" })}>
            <Sparkles data-icon="inline-start" />
            MOMO와 목표 세우기
          </Link>
        </div>
      )}
    </section>
  )
}

// ── 오늘·내일 할 일 목록: 손잡이를 끌어 순서 바꾸기 ─────────────

const SCREEN_READER = {
  draggable:
    "순서를 바꾸려면 손잡이에서 스페이스바를 누르고, 위아래 화살표로 옮긴 뒤 스페이스바를 다시 누르세요. Esc를 누르면 취소돼요.",
}

function announcements(tasks: AgendaItem[]): Announcements {
  const title = (id: string | number) => tasks.find((t) => t.id === id)?.title ?? "할 일"
  const place = (id: string | number | undefined) => tasks.findIndex((t) => t.id === id) + 1
  return {
    onDragStart: ({ active }) => `'${title(active.id)}'을(를) 집었어요.`,
    onDragOver: ({ active, over }) => (over ? `'${title(active.id)}'이(가) ${place(over.id)}번째 자리에 있어요.` : undefined),
    onDragEnd: ({ active, over }) =>
      over ? `'${title(active.id)}'을(를) ${place(over.id)}번째 자리에 놓았어요.` : `'${title(active.id)}'을(를) 내려놓았어요.`,
    onDragCancel: ({ active }) => `'${title(active.id)}' 옮기기를 취소했어요.`,
  }
}

function TaskList({
  code,
  label,
  dayLabel,
  empty,
  tasks,
  goals,
  pendingKeys,
  onToggle,
  onReorder,
}: {
  code: string
  label: string
  dayLabel: string
  empty: string
  tasks: AgendaItem[]
  goals: GoalOption[]
  pendingKeys: string[]
  onToggle: (task: AgendaItem, done: boolean) => void
  onReorder: (ids: string[]) => void
}) {
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const sensors = useSensors(
    // 조금 움직여야 끌기가 시작돼, 손잡이를 눌렀다 떼는 것만으로는 아무 일도 없게 합니다.
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )
  const doneCount = tasks.filter((t) => t.done).length

  function handleDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return
    const ids = tasks.map((t) => t.id)
    onReorder(arrayMove(ids, ids.indexOf(String(active.id)), ids.indexOf(String(over.id))))
  }

  return (
    <section aria-label={label} className="flex flex-col gap-4 rounded-xl bg-card p-4 ring-1 ring-foreground/10 md:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <SectionLabel code={code}>{label}</SectionLabel>
        <p className="font-mono text-xs text-muted-foreground tabular-nums">
          {dayLabel}
          {tasks.length > 0 && ` · 완료 ${doneCount} / ${tasks.length}`}
        </p>
      </div>

      {tasks.length === 0 ? (
        <p className="text-sm text-muted-foreground">{empty}</p>
      ) : (
        <DndContext
          id={`tasks-${code}`}
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
          accessibility={{ announcements: announcements(tasks), screenReaderInstructions: SCREEN_READER }}
        >
          <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
            <ol className="flex flex-col">
              {tasks.map((task) => (
                <TaskRow
                  key={task.key}
                  task={task}
                  goals={goals}
                  editing={editingKey === task.key}
                  pending={pendingKeys.includes(task.key)}
                  onToggle={onToggle}
                  onEdit={() => setEditingKey(editingKey === task.key ? null : task.key)}
                  onCloseEditor={() => setEditingKey(null)}
                />
              ))}
            </ol>
          </SortableContext>
        </DndContext>
      )}
      {tasks.length > 1 && (
        <p className="text-xs text-dim">왼쪽 손잡이(⋮⋮)를 끌어 순서를 바꿔요. 맨 위 할 일이 &apos;지금 할 일&apos;이 돼요.</p>
      )}
    </section>
  )
}

function TaskRow({
  task,
  goals,
  editing,
  pending,
  onToggle,
  onEdit,
  onCloseEditor,
}: {
  task: AgendaItem
  goals: GoalOption[]
  editing: boolean
  pending: boolean
  onToggle: (task: AgendaItem, done: boolean) => void
  onEdit: () => void
  onCloseEditor: () => void
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
  })

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(
        "relative flex flex-col gap-2 border-t border-foreground/[0.07] bg-card py-2.5 first:border-t-0",
        isDragging && "z-10 ring-1 ring-foreground/30"
      )}
    >
      <div className="flex items-start gap-2">
        <button
          type="button"
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          aria-label={`${task.title} 순서 바꾸기`}
          className="-my-1 flex size-8 shrink-0 cursor-grab touch-none items-center justify-center rounded-sm text-dim hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing"
        >
          <GripVertical className="size-4" aria-hidden />
        </button>
        <Checkbox
          className="mt-0.5"
          checked={task.done}
          disabled={pending}
          onCheckedChange={(checked) => onToggle(task, checked)}
          aria-label={`${task.title} 완료 표시`}
        />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span
            className={cn("text-[15px] leading-5 break-words", task.done && "text-dim line-through decoration-foreground/40")}
          >
            {task.title}
          </span>
          <span className="text-xs text-dim">{taskMeta(task)}</span>
        </div>
        <Button type="button" size="xs" variant="ghost" className="text-muted-foreground" onClick={onEdit}>
          {editing ? "닫기" : "수정"}
        </Button>
      </div>
      {editing && (
        <ItemEditor
          value={{
            kind: "task",
            id: task.id,
            title: task.title,
            minutes: task.end,
            goalId: task.goalId,
            date: task.ymd,
            start: null,
            weekdays: [],
            ideaId: task.ideaId,
            ideaTitle: task.ideaTitle,
          }}
          goals={goals}
          onClose={onCloseEditor}
        />
      )}
    </li>
  )
}

// ── 날짜 미정 할 일 ───────────────────────────────────────

function UnscheduledCard({ tasks }: { tasks: UnscheduledTask[] }) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState("")

  return (
    <section aria-label="날짜 미정 할 일" className="flex flex-col gap-4 rounded-xl bg-card p-4 ring-1 ring-foreground/10 md:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1.5">
          <SectionLabel code="LATER">날짜 미정 {tasks.length}개</SectionLabel>
          <p className="text-xs text-dim">아직 할 날짜를 정하지 않은 할 일이에요.</p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-9 px-3"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const result = await bringUnscheduledToToday()
              setError(result.ok ? "" : result.error)
            })
          }
        >
          {pending ? "가져오는 중…" : "오늘로 가져오기"}
        </Button>
      </div>
      <ul className="flex flex-col text-sm">
        {tasks.map((task) => (
          <li
            key={task.id}
            className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-foreground/[0.07] py-3"
          >
            <span className="flex flex-wrap items-center gap-1.5">
              {task.title}
              {task.source === "ai" && (
                <Badge variant="secondary">
                  <Sparkles data-icon="inline-start" />
                  AI
                </Badge>
              )}
            </span>
            <span className="font-mono text-xs text-dim">
              {formatDuration(task.minutes)}
              {task.goalTitle && ` · ${task.goalTitle}`}
              {task.ideaTitle && ` · 아이디어 ‘${task.ideaTitle}’`}
            </span>
          </li>
        ))}
      </ul>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </section>
  )
}

// ── 3번 이상 미룬 할 일: MOMO가 쪼갤지/뺄지 묻기 ─────────────

function CarriedPrompt({ tasks }: { tasks: CarriedTask[] }) {
  const [pending, startTransition] = useTransition()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [message, setMessage] = useState<{ type: "ok" | "error"; text: string } | null>(null)

  function run(id: string, action: () => Promise<ActionResult>) {
    setMessage(null)
    setBusyId(id)
    startTransition(async () => {
      const result = await action()
      setMessage(result.ok ? (result.message ? { type: "ok", text: result.message } : null) : { type: "error", text: result.error })
      setBusyId(null)
    })
  }

  // 다 처리한 뒤에도 결과 문구는 보여 줍니다.
  if (tasks.length === 0 && !message) return null

  return (
    <section aria-label="자주 미룬 할 일" className="flex flex-col gap-4 border border-dashed border-foreground/15 p-3 md:p-4">
      {tasks.map((task) => (
        <div key={task.id} className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-center gap-3 text-sm leading-relaxed">
            <MomoAvatar size={29} />
            <span>
              <strong className="font-medium">‘{task.title}’</strong>을(를) {task.carry_count}번 미뤘어요. 쪼개서 작게 할까요, 뺄까요?
            </span>
          </p>
          <div className="flex shrink-0 flex-wrap gap-1.5">
            <Button type="button" size="sm" className="h-9 px-3" disabled={pending} onClick={() => run(task.id, () => splitTask(task.id))}>
              <Sparkles data-icon="inline-start" />
              {busyId === task.id ? "쪼개는 중…" : "AI로 쪼개기"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-9 px-3"
              disabled={pending}
              onClick={() => {
                if (window.confirm(`'${task.title}'을(를) 지울까요?`)) run(task.id, () => deleteTask(task.id))
              }}
            >
              빼기
            </Button>
            <Button type="button" size="sm" variant="ghost" className="h-9 px-3" disabled={pending} onClick={() => run(task.id, () => keepTask(task.id))}>
              그대로 두기
            </Button>
          </div>
        </div>
      ))}
      {message && (
        <p
          role={message.type === "error" ? "alert" : "status"}
          className={cn("text-sm", message.type === "error" ? "text-destructive" : "text-muted-foreground")}
        >
          {message.text}
        </p>
      )}
    </section>
  )
}
