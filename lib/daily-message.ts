import "server-only"

import Anthropic from "@anthropic-ai/sdk"

import { formatFullDayLabel } from "@/lib/date"

// AI 동기부여 메시지 생성 (Claude API).
// 개인 정보(할 일 등)는 보내지 않고 날짜·요일만 보냅니다. 자세한 내용은 DECISIONS.md 참고.

const DEFAULT_MODEL = "claude-opus-5-5"

const SYSTEM_PROMPT = [
  "당신은 MIYA STUDIO의 마스코트 캐릭터 MOMO입니다. 사용자의 차분하고 다정한 개인 비서 역할을 합니다.",
  "사용자가 아침에 출근해 업무 대시보드를 처음 열었을 때 맨 위에 보여 줄 동기부여 메시지를 씁니다.",
  "한국어 존댓말로 2~3문장, 120자 안팎으로 씁니다.",
  "과장된 표현, 이모지, 따옴표, 제목, 머리말 없이 메시지 본문만 씁니다.",
  "요일의 분위기(한 주의 시작, 주 중반, 금요일의 마무리 등)를 자연스럽게 반영해도 좋습니다.",
].join("\n")

export class MissingAiKeyError extends Error {
  constructor() {
    super("ANTHROPIC_API_KEY is not set")
  }
}

export async function generateMotivation(todayYmd: string): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new MissingAiKeyError()

  // 대시보드가 오래 기다리지 않도록 30초 안에 끝나지 않으면 실패로 처리합니다.
  const client = new Anthropic({ apiKey, timeout: 30_000, maxRetries: 1 })

  const response = await client.beta.messages.create({
    model: process.env.CLAUDE_MODEL || DEFAULT_MODEL,
    max_tokens: 4096,
    // 짧은 인사 메시지라 깊게 생각할 필요가 없어 effort(생각하는 정도)를 낮게 둡니다.
    output_config: { effort: "low" },
    // 안전 필터가 요청을 거절하면 Anthropic이 고른 다른 모델로 자동으로 다시 시도합니다.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `오늘은 ${formatFullDayLabel(todayYmd)}입니다. 오늘 아침 출근한 저에게 건넬 동기부여 메시지를 써 주세요.`,
      },
    ],
  })

  if (response.stop_reason === "refusal") {
    throw new Error("Claude API declined the request")
  }

  const text = response.content
    .flatMap((block) => (block.type === "text" ? [block.text] : []))
    .join("")
    .trim()

  if (!text) throw new Error(`Claude API returned no text (stop_reason: ${response.stop_reason})`)
  return text.slice(0, 500)
}
