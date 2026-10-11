"use client"

import { ArrowLeft, ArrowRight, ChevronsLeft, ChevronsRight, ImagePlus, Minus, Plus, Trash2, X } from "lucide-react"
import Image from "next/image"
import { useEffect, useRef, useState, useTransition, type CSSProperties, type DragEvent } from "react"

import { MomoAvatar, MomoLine } from "@/components/momo-avatar"
import { Starfield } from "@/components/space-background"
import { CornerFrame, SectionLabel } from "@/components/space-ui"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  BOARD_BUCKET,
  BOARD_CAPTION_MAX,
  BOARD_COLS,
  BOARD_MAX_ITEMS,
  BOARD_MAX_ROWS,
  BOARD_MOBILE_COLS,
  type BoardFit,
  type BoardItem,
  type BoardLayoutChange,
} from "@/lib/idea-board"
import { ImageReadError, shrinkImage } from "@/lib/image-resize"
import { createClient } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"

import { addBoardItems, deleteBoardItem, saveBoardLayout } from "../../board-actions"
import { chipClass, type Notice } from "../../idea-card"

type Layout = { id: string; colSpan: number; rowSpan: number; fit: BoardFit; caption: string }
type SaveState = "idle" | "saving" | "saved" | "error"

const toLayout = (item: BoardItem): Layout => ({
  id: item.id,
  colSpan: item.colSpan,
  rowSpan: item.rowSpan,
  fit: item.fit,
  caption: item.caption,
})

// 저장된 값과 비교하는 열쇠: 순서·크기·맞춤·설명
const snapshot = (l: Layout, index: number) => `${index}|${l.colSpan}|${l.rowSpan}|${l.fit}|${l.caption.trim()}`

const SAVE_LABELS: Record<SaveState, string> = {
  idle: "",
  saving: "저장 중…",
  saved: "모두 저장됨",
  error: "저장하지 못했어요",
}

// 대시보드: 우주 창 위의 사진 보드. 보기 모드에서는 사진을 누르면 크게, 편집 모드에서는 순서·크기·맞춤·설명을 바꿉니다.
export function BoardEditor({ ideaId, userId, items }: { ideaId: string; userId: string; items: BoardItem[] }) {
  const byId = new Map(items.map((item) => [item.id, item]))
  const idsKey = items.map((item) => item.id).join(",")

  const [layout, setLayout] = useState<Layout[]>(() => items.map(toLayout))
  const [syncedKey, setSyncedKey] = useState(idsKey)
  // 사진을 올리거나 지워서 목록이 바뀌면, 지금 화면의 배치는 살리고 새 사진만 뒤에 붙입니다.
  if (idsKey !== syncedKey) {
    setSyncedKey(idsKey)
    const kept = layout.filter((l) => byId.has(l.id))
    const keptIds = new Set(kept.map((l) => l.id))
    setLayout([...kept, ...items.filter((item) => !keptIds.has(item.id)).map(toLayout)])
  }

  const [editing, setEditing] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)
  const [overId, setOverId] = useState<string | null>(null)
  const [fileOver, setFileOver] = useState(false)
  const [viewIndex, setViewIndex] = useState<number | null>(null)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [saveState, setSaveState] = useState<SaveState>("idle")
  const [deleting, startDelete] = useTransition()
  const fileRef = useRef<HTMLInputElement>(null)

  // ── 자동 저장: 바꾼 뒤 0.7초 동안 더 바꾸지 않으면, 바뀐 사진만 차례로 저장합니다 ──
  const savedRef = useRef(new Map(items.map((item, i) => [item.id, snapshot(toLayout(item), i)])))
  const layoutRef = useRef(layout)
  const chainRef = useRef<Promise<void>>(Promise.resolve())
  const [retry, setRetry] = useState(0)

  useEffect(() => {
    layoutRef.current = layout
    const saved = savedRef.current
    // 새로 올라온 사진은 서버에 저장된 그대로이므로 저장할 필요가 없습니다.
    layout.forEach((l, i) => {
      if (!saved.has(l.id)) saved.set(l.id, snapshot(l, i))
    })
    const pending = () =>
      layoutRef.current.flatMap((l, i): BoardLayoutChange[] =>
        saved.get(l.id) === snapshot(l, i) ? [] : [{ id: l.id, sortOrder: i, colSpan: l.colSpan, rowSpan: l.rowSpan, fit: l.fit, caption: l.caption }]
      )
    if (pending().length === 0) return
    const timer = setTimeout(() => {
      chainRef.current = chainRef.current.then(async () => {
        const changes = pending()
        if (changes.length === 0) return
        setSaveState("saving")
        const result = await saveBoardLayout(ideaId, changes)
        if (result.ok) {
          changes.forEach((c) => saved.set(c.id, snapshot(c, c.sortOrder)))
          setSaveState("saved")
        } else {
          setSaveState("error")
        }
      })
    }, 700)
    return () => clearTimeout(timer)
  }, [layout, ideaId, retry])

  // 저장 전에 화면을 떠나도 바꾼 내용을 보냅니다.
  useEffect(() => {
    const saved = savedRef.current
    return () => {
      const changes = layoutRef.current.flatMap((l, i): BoardLayoutChange[] =>
        saved.get(l.id) === snapshot(l, i) ? [] : [{ id: l.id, sortOrder: i, colSpan: l.colSpan, rowSpan: l.rowSpan, fit: l.fit, caption: l.caption }]
      )
      if (changes.length) void saveBoardLayout(ideaId, changes)
    }
  }, [ideaId])

  // ── 바꾸기 ──
  function update(id: string, patch: Partial<Layout>) {
    setLayout((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)))
  }

  function move(id: string, to: number) {
    setLayout((prev) => {
      const from = prev.findIndex((l) => l.id === id)
      if (from < 0) return prev
      const next = [...prev]
      const [item] = next.splice(from, 1)
      next.splice(Math.min(Math.max(to, 0), next.length), 0, item)
      return next
    })
  }

  function remove(id: string) {
    if (!window.confirm("이 사진을 대시보드에서 지울까요? 지우면 되돌릴 수 없어요.")) return
    setNotice(null)
    startDelete(async () => {
      const result = await deleteBoardItem(id)
      if (!result.ok) setNotice({ type: "error", text: result.error })
      else setSelectedId(null)
    })
  }

  // ── 사진 올리기: 브라우저에서 줄인 뒤 Storage에 바로 올리고, 보드에 등록합니다 ──
  async function upload(fileList: FileList | File[]) {
    if (progress) return
    const images = Array.from(fileList).filter((f) => f.type.startsWith("image/"))
    if (images.length === 0) {
      setNotice({ type: "error", text: "사진 파일만 올릴 수 있어요." })
      return
    }
    const room = BOARD_MAX_ITEMS - layout.length
    if (room <= 0) {
      setNotice({ type: "error", text: `보드 하나에는 사진을 ${BOARD_MAX_ITEMS}장까지 올릴 수 있어요.` })
      return
    }
    const files = images.slice(0, room)
    setNotice(null)
    setProgress({ done: 0, total: files.length })

    const supabase = createClient()
    const uploaded: { path: string; width: number; height: number }[] = []
    let failed = 0
    let reason = ""
    for (const [i, file] of files.entries()) {
      try {
        const image = await shrinkImage(file)
        const path = `${userId}/${ideaId}/${crypto.randomUUID()}.${image.ext}`
        const { error } = await supabase.storage
          .from(BOARD_BUCKET)
          .upload(path, image.blob, { contentType: image.type, cacheControl: "31536000", upsert: false })
        if (error) throw error
        uploaded.push({ path, width: image.width, height: image.height })
      } catch (error) {
        failed++
        reason = error instanceof ImageReadError ? error.message : "인터넷 연결을 확인하고 다시 시도해 주세요."
        console.error("[idea-board] 사진 올리기 실패:", error)
      }
      setProgress({ done: i + 1, total: files.length })
    }

    if (uploaded.length > 0) {
      const result = await addBoardItems(ideaId, uploaded)
      if (!result.ok) {
        // 보드에 등록하지 못한 파일은 지워서 공간을 차지하지 않게 합니다.
        await supabase.storage.from(BOARD_BUCKET).remove(uploaded.map((u) => u.path))
        setNotice({ type: "error", text: result.error })
        setProgress(null)
        return
      }
    }
    setProgress(null)
    const skipped = images.length - files.length
    if (failed > 0) {
      setNotice({
        type: "error",
        text: `${uploaded.length}장은 올렸지만 ${failed}장은 올리지 못했어요. ${reason}`,
      })
    } else {
      setNotice({
        type: "ok",
        text: `사진 ${uploaded.length}장을 올렸어요.${skipped > 0 ? ` 한도(${BOARD_MAX_ITEMS}장)를 넘은 ${skipped}장은 빼고 올렸어요.` : ""} '편집'에서 순서와 크기를 바꿀 수 있어요.`,
      })
    }
  }

  // ── 끌어다 놓기(PC): 사진 칸끼리는 순서 바꾸기, 파일은 올리기 ──
  function handleCanvasDragOver(event: DragEvent) {
    if (event.dataTransfer.types.includes("Files")) {
      event.preventDefault()
      setFileOver(true)
    }
  }

  function handleCanvasDrop(event: DragEvent) {
    if (event.dataTransfer.files.length > 0) {
      event.preventDefault()
      setFileOver(false)
      void upload(event.dataTransfer.files)
    }
  }

  const selectedIndex = layout.findIndex((l) => l.id === selectedId)
  const selected = selectedIndex >= 0 ? layout[selectedIndex] : null
  const viewable = layout.flatMap((l) => {
    const item = byId.get(l.id)
    return item?.url ? [{ ...item, caption: l.caption }] : []
  })
  const busy = Boolean(progress) || deleting

  return (
    <section aria-label="대시보드" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1.5">
          <SectionLabel code="BOARD">브랜드 대시보드</SectionLabel>
          <p className="text-xs text-dim md:text-[13px]">레퍼런스 · 로고 시안 · 컬러 무드 · 공간과 제품 사진을 모아 이 사업의 분위기를 만들어 보세요.</p>
        </div>
        <div className="flex items-center gap-2">
          {saveState !== "idle" && (
            <span
              role="status"
              className={cn("font-mono text-[11px] whitespace-nowrap", saveState === "error" ? "text-destructive" : "text-dim")}
            >
              {SAVE_LABELS[saveState]}
              {saveState === "error" && (
                <button type="button" onClick={() => setRetry((n) => n + 1)} className="ml-1.5 underline underline-offset-4">
                  다시 저장
                </button>
              )}
            </span>
          )}
          <Button type="button" variant="outline" className="h-10 px-3.5" disabled={busy} onClick={() => fileRef.current?.click()}>
            <ImagePlus data-icon="inline-start" />
            {progress ? `올리는 중 ${progress.done}/${progress.total}` : "사진 올리기"}
          </Button>
          {layout.length > 0 && (
            <Button
              type="button"
              variant={editing ? "default" : "outline"}
              className="h-10 px-4"
              aria-pressed={editing}
              onClick={() => {
                setEditing((v) => !v)
                setSelectedId(null)
              }}
            >
              {editing ? "완료" : "편집"}
            </Button>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => {
              if (e.target.files?.length) void upload(e.target.files)
              e.target.value = ""
            }}
          />
        </div>
      </div>

      {notice && <MomoLine tone={notice.type === "error" ? "error" : "normal"}>{notice.text}</MomoLine>}
      {editing && (
        <p className="font-mono text-[11px] leading-relaxed text-dim">
          사진을 눌러 고른 뒤 아래 막대에서 순서·크기를 바꿔요. PC에서는 사진을 끌어 다른 사진 위에 놓아도 돼요. 바꾸면 자동으로 저장돼요.
        </p>
      )}

      <CornerFrame
        aria-label="대시보드 보드"
        className="overflow-hidden bg-[#020203] p-2.5 md:p-5"
        onDragOver={handleCanvasDragOver}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFileOver(false)
        }}
        onDrop={handleCanvasDrop}
      >
        <Starfield />

        {layout.length === 0 ? (
          <div className="relative z-10 flex min-h-[22rem] flex-col items-center justify-center gap-5 px-4 py-10 text-center md:min-h-[28rem]">
            <div className="flex max-w-md items-start gap-3 text-left">
              <MomoAvatar size={40} />
              <p className="text-sm leading-relaxed text-foreground/85">
                아직 사진이 없어요. 마음에 드는 브랜드, 로고 시안, 색감, 공간·제품 사진을 올려 이 사업만의 우주를 채워 보세요.
              </p>
            </div>
            <Button type="button" className="h-11 px-5" disabled={busy} onClick={() => fileRef.current?.click()}>
              <ImagePlus data-icon="inline-start" />
              {progress ? `올리는 중 ${progress.done}/${progress.total}` : "첫 사진 올리기"}
            </Button>
            <p className="hidden font-mono text-[11px] text-dim md:block">PC에서는 사진 파일을 이 창에 끌어다 놓아도 돼요</p>
          </div>
        ) : (
          <ul className="relative z-10 grid auto-rows-[6.25rem] grid-cols-3 gap-2 md:auto-rows-[8.5rem] md:grid-cols-6 md:gap-3">
            {layout.map((l, index) => {
              const item = byId.get(l.id)
              const isSelected = editing && l.id === selectedId
              const style = {
                "--c": l.colSpan,
                "--cm": Math.min(l.colSpan, BOARD_MOBILE_COLS),
                "--r": l.rowSpan,
              } as CSSProperties
              return (
                <li
                  key={l.id}
                  style={style}
                  className={cn(
                    "relative [grid-column:span_var(--cm)/span_var(--cm)] [grid-row:span_var(--r)/span_var(--r)] md:[grid-column:span_var(--c)/span_var(--c)]",
                    dragId === l.id && "opacity-40"
                  )}
                  draggable={editing}
                  onDragStart={(e) => {
                    if (!editing) return
                    setDragId(l.id)
                    setSelectedId(l.id)
                    e.dataTransfer.effectAllowed = "move"
                    e.dataTransfer.setData("text/plain", l.id)
                  }}
                  onDragOver={(e) => {
                    if (!dragId) return
                    e.preventDefault()
                    if (overId !== l.id) setOverId(l.id)
                  }}
                  onDrop={(e) => {
                    if (!dragId) return
                    e.preventDefault()
                    e.stopPropagation()
                    move(dragId, index)
                    setDragId(null)
                    setOverId(null)
                  }}
                  onDragEnd={() => {
                    setDragId(null)
                    setOverId(null)
                  }}
                >
                  <button
                    type="button"
                    aria-pressed={editing ? isSelected : undefined}
                    aria-label={`${index + 1}번째 사진${l.caption ? ` · ${l.caption}` : ""}${editing ? " 고르기" : " 크게 보기"}`}
                    onClick={() => {
                      if (editing) setSelectedId(isSelected ? null : l.id)
                      else {
                        const at = viewable.findIndex((v) => v.id === l.id)
                        if (at >= 0) setViewIndex(at)
                      }
                    }}
                    className={cn(
                      "relative block size-full overflow-hidden bg-[#0b0b0d] ring-1 ring-foreground/10 transition-shadow focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground",
                      editing ? "cursor-grab" : "cursor-zoom-in",
                      isSelected && "ring-2 ring-foreground",
                      overId === l.id && dragId !== l.id && "outline-2 outline-offset-2 outline-dashed outline-foreground"
                    )}
                  >
                    {item?.url ? (
                      <Image
                        src={item.url}
                        alt={l.caption || "대시보드 사진"}
                        fill
                        unoptimized
                        draggable={false}
                        sizes="(min-width: 768px) 50vw, 100vw"
                        className={l.fit === "cover" ? "object-cover" : "object-contain"}
                      />
                    ) : (
                      <span className="absolute inset-0 flex items-center justify-center p-2 text-center text-xs text-dim">
                        사진을 불러오지 못했어요
                      </span>
                    )}
                    {l.caption && (
                      <span className="absolute inset-x-0 bottom-0 truncate bg-linear-to-t from-black/85 to-transparent px-2 pt-6 pb-1.5 text-left font-mono text-[11px] text-white/90">
                        {l.caption}
                      </span>
                    )}
                    {editing && (
                      <span className="absolute top-1.5 left-1.5 bg-black/75 px-1.5 py-0.5 font-mono text-[10px] text-white/90 tabular-nums">
                        {index + 1} · {l.colSpan}×{l.rowSpan}
                      </span>
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
        )}

        {fileOver && (
          <div className="pointer-events-none absolute inset-2 z-20 flex items-center justify-center border-2 border-dashed border-foreground/60 bg-black/70 font-mono text-sm">
            여기에 놓으면 사진을 올려요
          </div>
        )}
      </CornerFrame>

      {editing && selected && (
        <ItemToolbar
          index={selectedIndex}
          total={layout.length}
          item={selected}
          busy={busy}
          onMove={(to) => move(selected.id, to)}
          onChange={(patch) => update(selected.id, patch)}
          onDelete={() => remove(selected.id)}
          onClose={() => setSelectedId(null)}
        />
      )}

      {viewIndex !== null && viewable[viewIndex] && (
        <Lightbox
          items={viewable}
          index={viewIndex}
          onMove={(to) => setViewIndex((to + viewable.length) % viewable.length)}
          onClose={() => setViewIndex(null)}
        />
      )}
    </section>
  )
}

// 고른 사진을 바꾸는 막대: 순서 · 가로·세로 칸 · 맞춤 · 설명 · 지우기
function ItemToolbar({
  index,
  total,
  item,
  busy,
  onMove,
  onChange,
  onDelete,
  onClose,
}: {
  index: number
  total: number
  item: Layout
  busy: boolean
  onMove: (to: number) => void
  onChange: (patch: Partial<Layout>) => void
  onDelete: () => void
  onClose: () => void
}) {
  return (
    <div
      role="toolbar"
      aria-label={`${index + 1}번째 사진 바꾸기`}
      className="sticky bottom-3 z-30 flex flex-col gap-2.5 border border-foreground/20 bg-popover/95 p-3 shadow-lg backdrop-blur"
    >
      <div className="flex items-center justify-between gap-2">
        <p className="font-mono text-xs text-dim tabular-nums">
          {index + 1} / {total}번째 사진
        </p>
        <Button type="button" size="icon-sm" variant="ghost" aria-label="고르기 끝내기" onClick={onClose}>
          <X />
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2.5">
        <div role="group" aria-label="순서" className="flex items-center gap-1">
          <span className="mr-1 text-xs text-muted-foreground">순서</span>
          <Button type="button" size="icon-sm" variant="outline" aria-label="맨 앞으로" disabled={index === 0} onClick={() => onMove(0)}>
            <ChevronsLeft />
          </Button>
          <Button type="button" size="icon-sm" variant="outline" aria-label="한 칸 앞으로" disabled={index === 0} onClick={() => onMove(index - 1)}>
            <ArrowLeft />
          </Button>
          <Button type="button" size="icon-sm" variant="outline" aria-label="한 칸 뒤로" disabled={index === total - 1} onClick={() => onMove(index + 1)}>
            <ArrowRight />
          </Button>
          <Button type="button" size="icon-sm" variant="outline" aria-label="맨 뒤로" disabled={index === total - 1} onClick={() => onMove(total - 1)}>
            <ChevronsRight />
          </Button>
        </div>
        <Stepper label="가로" value={item.colSpan} max={BOARD_COLS} onChange={(colSpan) => onChange({ colSpan })} />
        <Stepper label="세로" value={item.rowSpan} max={BOARD_MAX_ROWS} onChange={(rowSpan) => onChange({ rowSpan })} />
        <div role="group" aria-label="맞춤" className="flex gap-1">
          {(
            [
              ["cover", "꽉 채우기"],
              ["contain", "전체 보기"],
            ] as const
          ).map(([fit, label]) => (
            <button key={fit} type="button" aria-pressed={item.fit === fit} onClick={() => onChange({ fit })} className={chipClass(item.fit === fit)}>
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Input
          value={item.caption}
          onChange={(e) => onChange({ caption: e.target.value })}
          maxLength={BOARD_CAPTION_MAX}
          placeholder="설명 (선택) · 예: 로고 레퍼런스, 메인 컬러"
          aria-label="사진 설명"
          className="h-9 min-w-0 flex-1"
        />
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={busy}
          onClick={onDelete}
          className="h-9 text-muted-foreground hover:text-destructive"
        >
          <Trash2 data-icon="inline-start" />
          지우기
        </Button>
      </div>
      {item.colSpan > BOARD_MOBILE_COLS && (
        <p className="text-[11px] text-dim md:hidden">휴대폰에서는 가로 {BOARD_MOBILE_COLS}칸까지만 보여요. PC에서는 {item.colSpan}칸으로 보여요.</p>
      )}
    </div>
  )
}

function Stepper({ label, value, max, onChange }: { label: string; value: number; max: number; onChange: (value: number) => void }) {
  return (
    <div role="group" aria-label={`${label} 칸 수`} className="flex items-center gap-1">
      <span className="mr-1 text-xs text-muted-foreground">{label}</span>
      <Button type="button" size="icon-sm" variant="outline" aria-label={`${label} 줄이기`} disabled={value <= 1} onClick={() => onChange(value - 1)}>
        <Minus />
      </Button>
      <span className="w-7 text-center font-mono text-sm tabular-nums" aria-live="polite">
        {value}
      </span>
      <Button type="button" size="icon-sm" variant="outline" aria-label={`${label} 늘리기`} disabled={value >= max} onClick={() => onChange(value + 1)}>
        <Plus />
      </Button>
    </div>
  )
}

// 사진 크게 보기. Esc로 닫고, ←/→로 넘깁니다.
function Lightbox({
  items,
  index,
  onMove,
  onClose,
}: {
  items: BoardItem[]
  index: number
  onMove: (to: number) => void
  onClose: () => void
}) {
  const item = items[index]
  const closeRef = useRef<HTMLButtonElement>(null)

  // 열릴 때 한 번만 닫기 단추로 초점을 옮깁니다.
  useEffect(() => {
    closeRef.current?.focus()
  }, [])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose()
      if (event.key === "ArrowLeft") onMove(index - 1)
      if (event.key === "ArrowRight") onMove(index + 1)
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [index, onMove, onClose])

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="사진 크게 보기"
      className="fixed inset-0 z-[60] flex flex-col items-center justify-center gap-3 bg-black/92 p-4"
      onClick={onClose}
    >
      <Button
        ref={closeRef}
        type="button"
        size="icon"
        variant="outline"
        aria-label="닫기"
        className="absolute top-4 right-4"
        onClick={onClose}
      >
        <X />
      </Button>
      {item.url && (
        <Image
          src={item.url}
          alt={item.caption || "대시보드 사진"}
          width={item.width}
          height={item.height}
          unoptimized
          onClick={(e) => e.stopPropagation()}
          className="h-auto max-h-[78vh] w-auto max-w-full object-contain"
        />
      )}
      <div className="flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
        {items.length > 1 && (
          <Button type="button" size="icon" variant="outline" aria-label="이전 사진" onClick={() => onMove(index - 1)}>
            <ArrowLeft />
          </Button>
        )}
        <p className="max-w-[60vw] truncate text-center font-mono text-xs text-white/80 tabular-nums">
          {index + 1} / {items.length}
          {item.caption && ` · ${item.caption}`}
        </p>
        {items.length > 1 && (
          <Button type="button" size="icon" variant="outline" aria-label="다음 사진" onClick={() => onMove(index + 1)}>
            <ArrowRight />
          </Button>
        )}
      </div>
    </div>
  )
}
