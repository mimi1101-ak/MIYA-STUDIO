"use client"

import { FileText } from "lucide-react"
import { useEffect, useRef, useState, useTransition, type FormEvent, type KeyboardEvent } from "react"

import { MomoLine } from "@/components/momo-avatar"
import { ChatBubble, ThinkingLine } from "@/components/momo-chat"
import { CornerFrame, SectionLabel } from "@/components/space-ui"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { DOC_TYPES, sectionTitles, type IdeaReport } from "@/lib/idea-report"
import type { ChatTurn, Idea, IdeaKind } from "@/lib/ideas"
import { LIMITS } from "@/lib/validation"

import { sendIdeaMessage, writeIdeaReportAction } from "../consult-actions"
import { stampOf } from "../idea-card"
import { paperClass, PaperHead, ReportDocument } from "./report-document"

// MOMO의 첫인사 (AI를 부르지 않는 고정 문구)
const OPENERS: Record<IdeaKind, string> = {
  business:
    "사업가의 눈으로 같이 따져 보고, 해볼 만한 방법을 숫자와 함께 구체적으로 제안할게요.\n어디서 떠올린 아이디어인지, 누구에게 팔고 싶은지부터 편하게 말해 주세요.",
  make: "무엇을 왜 만들고 싶은지 들려주세요.\n가장 작게 만들어 보는 방법부터 쓸 사람을 모으는 방법까지 같이 짜 볼게요.",
  todo: "언제까지, 왜 해야 하는 일인지 알려 주세요.\n미루지 않고 끝낼 수 있게 단계와 순서를 같이 정해 볼게요.",
  thought: "어떤 생각에서 시작됐는지 들려주세요.\n실제로 해 볼 수 있는 방법으로 같이 바꿔 볼게요.",
}

// 처음 말 걸기 예시. 누르면 바로 보냅니다.
const STARTERS: Record<IdeaKind, string[]> = {
  business: ["이 아이디어, 사업이 될까요?", "돈은 어떻게 벌 수 있을까요?", "이번 주에 뭐부터 하면 될까요?"],
  make: ["이걸 만들 가치가 있을까요?", "가장 작게 만들어 보려면?", "이번 주에 뭐부터 하면 될까요?"],
  todo: ["미루지 않고 끝내려면 어떻게 할까요?", "단계별로 나눠 주세요", "이번 주에 뭐부터 하면 될까요?"],
  thought: ["이 생각, 어떻게 실천할까요?", "좋은 점과 걸림돌을 짚어 주세요", "이번 주에 뭐부터 하면 될까요?"],
}

type Props = {
  idea: Idea
  messages: ChatTurn[]
  report: IdeaReport | null
  reportedAt: string | null
}

// 왼쪽(휴대폰은 위): MOMO와 대화 · 오른쪽(휴대폰은 아래): MOMO가 쓴 문서
export function IdeaWorkspace({ idea, messages, report, reportedAt }: Props) {
  const docType = DOC_TYPES[idea.kind]
  const [text, setText] = useState("")
  const [sending, setSending] = useState<string | null>(null)
  const [chatError, setChatError] = useState("")
  const [reportError, setReportError] = useState("")
  const [notice, setNotice] = useState("")
  const [pending, startChat] = useTransition()
  const [writing, startWriting] = useTransition()
  const endRef = useRef<HTMLDivElement>(null)
  const reportRef = useRef<HTMLDivElement>(null)
  // 화면을 연 뒤에 새로 온 MOMO의 답만 한 글자씩 보여 줍니다(이전 대화는 바로 보임).
  const [firstUnseen] = useState(messages.length)

  const busy = pending || writing
  const canWrite = messages.some((m) => m.role === "assistant")

  // 새 메시지가 오면 대화창 맨 아래로
  useEffect(() => {
    if (messages.length > firstUnseen || pending) endRef.current?.scrollIntoView({ block: "nearest" })
  }, [messages.length, pending, firstUnseen])

  function send(message: string) {
    const trimmed = message.trim()
    if (!trimmed || busy) return
    setChatError("")
    setNotice("")
    setSending(trimmed)
    setText("")
    startChat(async () => {
      const result = await sendIdeaMessage(idea.id, trimmed)
      setSending(null)
      if (!result.ok) setChatError(result.error)
    })
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    send(text)
  }

  // Enter로 보내기, Shift+Enter로 줄바꿈
  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault()
      send(text)
    }
  }

  function writeReport() {
    if (busy || !canWrite) return
    if (report && !window.confirm(`지금 ${docType}를 대화 내용을 반영한 새 ${docType}로 바꿀까요?`)) return
    setReportError("")
    setNotice("")
    reportRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
    startWriting(async () => {
      const result = await writeIdeaReportAction(idea.id)
      if (!result.ok) setReportError(result.error)
      else {
        setNotice(result.message ?? "")
        reportRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
      }
    })
  }

  // 보내는 중인 내 말은 저장되기 전에도 바로 보여 줍니다.
  const shown =
    sending && !messages.some((m, i) => i === messages.length - 1 && m.content === sending)
      ? [...messages, { role: "user" as const, content: sending }]
      : messages

  return (
    <div className="grid items-start gap-6 lg:grid-cols-2">
      <CornerFrame aria-label="MOMO와 대화" className="flex flex-col gap-6 p-4 md:p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <SectionLabel code="CONSULT">MOMO와 대화</SectionLabel>
          <p className="font-mono text-[11px] tracking-[0.08em] text-dim">사업가 · 컨설턴트 모드</p>
        </div>

        <ol className="flex flex-col gap-6" aria-live="polite">
          <ChatBubble role="assistant">{`'${idea.title}' 이야기를 해 볼까요?\n${OPENERS[idea.kind]}`}</ChatBubble>
          {shown.map((m, i) => (
            <ChatBubble key={i} role={m.role} typeOut={m.role === "assistant" && i >= firstUnseen}>
              {m.content}
            </ChatBubble>
          ))}
          {pending && <ThinkingLine>MOMO가 생각하고 있어요… 20~40초쯤 걸려요.</ThinkingLine>}
        </ol>
        <div ref={endRef} />

        {messages.length === 0 && !pending && (
          <div className="flex flex-col gap-2.5">
            <p className="font-mono text-[11px] tracking-[0.14em] text-dim">이렇게 시작해 보세요 · 누르면 바로 보내요</p>
            <div className="flex flex-wrap gap-2">
              {STARTERS[idea.kind].map((starter) => (
                <button
                  key={starter}
                  type="button"
                  onClick={() => send(starter)}
                  disabled={busy}
                  className="h-10 border border-dashed border-foreground/30 px-4 text-sm transition-colors hover:border-solid hover:border-foreground hover:bg-foreground/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground disabled:opacity-50"
                >
                  {starter}
                </button>
              ))}
            </div>
          </div>
        )}

        {chatError && <MomoLine tone="error">{chatError}</MomoLine>}

        <form onSubmit={handleSubmit} className="flex flex-col gap-2.5 border-t border-foreground/10 pt-5">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            maxLength={LIMITS.chatMessage}
            rows={3}
            placeholder={messages.length ? "답하거나, 더 궁금한 걸 물어보세요." : "이 아이디어에 대해 무엇이든 말해 보세요."}
            aria-label="MOMO에게 보낼 메시지"
            disabled={pending}
            className="px-3.5 py-3 leading-relaxed"
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="hidden font-mono text-[11px] text-dim sm:inline">Enter로 보내기 · Shift+Enter로 줄바꿈</span>
            <div className="ml-auto flex gap-2">
              {canWrite && (
                <Button type="button" variant="outline" className="h-11 px-4" disabled={busy} onClick={writeReport}>
                  <FileText data-icon="inline-start" />
                  {docType} 쓰기
                </Button>
              )}
              <Button type="submit" className="h-11 px-5" disabled={!text.trim() || busy}>
                {pending ? "답을 기다리는 중…" : "보내기"}
              </Button>
            </div>
          </div>
        </form>
      </CornerFrame>

      <div ref={reportRef} id="report" className="flex scroll-mt-28 flex-col gap-3">
        {notice && <MomoLine>{notice}</MomoLine>}
        {reportError && <MomoLine tone="error">{reportError}</MomoLine>}
        {writing ? (
          <WritingPaper docType={docType} />
        ) : report ? (
          <ReportDocument
            report={report}
            ideaId={idea.id}
            kind={idea.kind}
            ideaTitle={idea.title}
            date={reportedAt ? stampOf(reportedAt) : "-"}
            busy={busy}
            onRewrite={writeReport}
          />
        ) : (
          <ReportPlaceholder kind={idea.kind} canWrite={canWrite} busy={busy} onWrite={writeReport} />
        )}
      </div>
    </div>
  )
}

// 아직 문서가 없을 때: 무엇이 담기는지 목차를 미리 보여 줍니다.
function ReportPlaceholder({
  kind,
  canWrite,
  busy,
  onWrite,
}: {
  kind: IdeaKind
  canWrite: boolean
  busy: boolean
  onWrite: () => void
}) {
  const docType = DOC_TYPES[kind]
  const t = sectionTitles(kind)
  const contents = [
    t.summary,
    t.strengths,
    t.problem,
    t.solution,
    ...(kind === "todo" || kind === "thought" ? [] : [t.target, t.revenue, t.edge]),
    t.roadmap,
    t.metrics,
    t.budget,
    t.risks,
    t.nextSteps,
  ]
  return (
    <section aria-label={docType} className={paperClass}>
      <PaperHead right={docType} />
      <div className="flex flex-col gap-4">
        <SectionLabel code="REPORT">{docType}</SectionLabel>
        <p className="text-sm leading-relaxed text-muted-foreground">
          MOMO와 이야기를 나눈 뒤 &lsquo;{docType} 쓰기&rsquo;를 누르면, 대화 내용을 바탕으로 MOMO가 {docType}를 써 드려요.
          대화에서 정하지 않은 부분은 MOMO가 현실적으로 가정해 채우고 &lsquo;(추정)&rsquo;이라고 표시해요.
        </p>
        <ol className="grid gap-x-4 gap-y-1 font-mono text-xs text-dim sm:grid-cols-2">
          {contents.map((title, i) => (
            <li key={title}>
              {String(i + 1).padStart(2, "0")} <span className="font-sans">{title}</span>
            </li>
          ))}
        </ol>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" className="h-11 px-5" disabled={!canWrite || busy} onClick={onWrite}>
            <FileText data-icon="inline-start" />
            {docType} 쓰기
          </Button>
          {!canWrite && <p className="text-xs text-dim">먼저 MOMO와 한 번 이상 이야기해 주세요.</p>}
        </div>
      </div>
    </section>
  )
}

// MOMO가 문서를 쓰는 동안
function WritingPaper({ docType }: { docType: string }) {
  return (
    <section aria-label={`${docType} 쓰는 중`} aria-busy="true" className={paperClass}>
      <PaperHead right={docType} />
      <ul className="flex flex-col">
        <ThinkingLine>
          MOMO가 {docType}를 쓰고 있어요… 1~2분 걸려요. 화면을 닫지 말고 기다려 주세요.
        </ThinkingLine>
      </ul>
      <div className="mt-6 flex flex-col gap-3" aria-hidden>
        <div className="mx-auto h-6 w-2/3 animate-pulse bg-foreground/10" />
        <div className="h-4 w-full animate-pulse bg-foreground/5" />
        <div className="h-4 w-11/12 animate-pulse bg-foreground/5" />
        <div className="h-4 w-4/5 animate-pulse bg-foreground/5" />
      </div>
    </section>
  )
}
