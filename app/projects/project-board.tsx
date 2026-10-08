"use client"

import { useId, useState, useTransition, type FormEvent } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { isValidHttpUrl, LIMITS, URL_ERROR_MESSAGE, type ActionResult } from "@/lib/validation"

import { addProject, deleteProject, updateProject, type ProjectInput } from "./actions"

type Project = { id: string; name: string; url: string; description: string }

function hostOf(url: string) {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}

export function ProjectBoard({ projects }: { projects: Project[] }) {
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [error, setError] = useState("")
  const [, startTransition] = useTransition()
  const [deletingId, setDeletingId] = useState<string | null>(null)

  function handleDelete(project: Project) {
    if (!window.confirm(`"${project.name}" 프로젝트를 삭제할까요?`)) return
    setError("")
    setDeletingId(project.id)
    startTransition(async () => {
      const result = await deleteProject(project.id)
      if (!result.ok) setError(result.error)
      setDeletingId(null)
    })
  }

  return (
    <div className="flex flex-col gap-4">
      {adding ? (
        <div className="rounded-xl bg-card p-4 ring-1 ring-foreground/10">
          <h2 className="mb-3 text-sm font-medium">새 프로젝트</h2>
          <ProjectForm
            submitLabel="추가"
            onSubmit={addProject}
            onDone={() => setAdding(false)}
            onCancel={() => setAdding(false)}
          />
        </div>
      ) : (
        <div>
          <Button type="button" onClick={() => setAdding(true)}>
            새 프로젝트 추가
          </Button>
        </div>
      )}

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      {projects.length === 0 && !adding ? (
        <p className="text-sm text-muted-foreground">
          아직 등록한 프로젝트가 없어요. 만든 사이트를 추가해 보세요.
        </p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <li
              key={project.id}
              className="flex flex-col rounded-xl bg-card ring-1 ring-foreground/10"
            >
              {editingId === project.id ? (
                <div className="p-4">
                  <ProjectForm
                    initial={project}
                    submitLabel="저장"
                    onSubmit={(input) => updateProject(project.id, input)}
                    onDone={() => setEditingId(null)}
                    onCancel={() => setEditingId(null)}
                  />
                </div>
              ) : (
                <>
                  <a
                    href={project.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex flex-1 flex-col gap-1 rounded-t-xl p-4 transition-colors hover:bg-muted/60"
                  >
                    <span className="font-medium break-words">{project.name}</span>
                    {project.description && (
                      <span className="text-sm break-words text-muted-foreground">
                        {project.description}
                      </span>
                    )}
                    <span className="mt-1 truncate text-xs text-muted-foreground">
                      {hostOf(project.url)} ↗
                    </span>
                  </a>
                  <div className="flex justify-end gap-1 border-t px-2 py-1.5">
                    <Button
                      type="button"
                      size="xs"
                      variant="ghost"
                      onClick={() => setEditingId(project.id)}
                    >
                      수정
                    </Button>
                    <Button
                      type="button"
                      size="xs"
                      variant="ghost"
                      disabled={deletingId === project.id}
                      onClick={() => handleDelete(project)}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      {deletingId === project.id ? "삭제 중…" : "삭제"}
                    </Button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function ProjectForm({
  initial,
  submitLabel,
  onSubmit,
  onDone,
  onCancel,
}: {
  initial?: ProjectInput
  submitLabel: string
  onSubmit: (input: ProjectInput) => Promise<ActionResult>
  onDone: () => void
  onCancel: () => void
}) {
  const id = useId()
  const [name, setName] = useState(initial?.name ?? "")
  const [url, setUrl] = useState(initial?.url ?? "")
  const [description, setDescription] = useState(initial?.description ?? "")
  const [urlTouched, setUrlTouched] = useState(false)
  const [error, setError] = useState("")
  const [pending, startTransition] = useTransition()

  const urlInvalid = urlTouched && !isValidHttpUrl(url.trim())

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setUrlTouched(true)
    setError("")
    if (!name.trim()) {
      setError("프로젝트 이름을 입력해 주세요.")
      return
    }
    // 저장 전에 주소 형식을 먼저 확인합니다.
    if (!isValidHttpUrl(url.trim())) return

    startTransition(async () => {
      const result = await onSubmit({ name, url, description })
      if (result.ok) onDone()
      else setError(result.error)
    })
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3" noValidate>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${id}-name`}>이름</Label>
        <Input
          id={`${id}-name`}
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={LIMITS.projectName}
          placeholder="예: 24시간 비서"
          required
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${id}-url`}>주소(URL)</Label>
        <Input
          id={`${id}-url`}
          type="url"
          inputMode="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onBlur={() => url.trim() && setUrlTouched(true)}
          placeholder="https://example.com"
          aria-invalid={urlInvalid || undefined}
          aria-describedby={urlInvalid ? `${id}-url-error` : undefined}
          required
        />
        {urlInvalid && (
          <p id={`${id}-url-error`} className="text-xs text-destructive">
            {URL_ERROR_MESSAGE}
          </p>
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${id}-description`}>짧은 설명 (선택)</Label>
        <Textarea
          id={`${id}-description`}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={LIMITS.projectDescription}
          rows={2}
          placeholder="어떤 사이트인지 한 줄로"
        />
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "저장 중…" : submitLabel}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel} disabled={pending}>
          취소
        </Button>
      </div>
    </form>
  )
}
