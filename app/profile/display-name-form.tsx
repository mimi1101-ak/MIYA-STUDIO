"use client"

import { useState, useTransition, type FormEvent } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { LIMITS } from "@/lib/validation"

import { updateDisplayName } from "./actions"

export function DisplayNameForm({ initialName }: { initialName: string }) {
  const [name, setName] = useState(initialName)
  const [message, setMessage] = useState<{ type: "ok" | "error"; text: string } | null>(null)
  const [pending, startTransition] = useTransition()

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setMessage(null)
    startTransition(async () => {
      const result = await updateDisplayName(name)
      setMessage(
        result.ok ? { type: "ok", text: "저장했어요." } : { type: "error", text: result.error }
      )
    })
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2">
      <div className="flex gap-2">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={LIMITS.displayName}
          placeholder="불릴 이름"
          aria-label="표시 이름"
        />
        <Button type="submit" disabled={pending || !name.trim()}>
          {pending ? "저장 중…" : "저장"}
        </Button>
      </div>
      {message && (
        <p
          role={message.type === "error" ? "alert" : "status"}
          className={message.type === "error" ? "text-sm text-destructive" : "text-sm text-muted-foreground"}
        >
          {message.text}
        </p>
      )}
    </form>
  )
}
