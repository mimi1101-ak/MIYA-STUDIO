import { Suspense } from "react"

import { MomoAvatar } from "@/components/momo-avatar"
import { CornerFrame, SectionLabel } from "@/components/space-ui"

import { LoginButtons } from "./login-buttons"

export default function LoginPage() {
  return (
    <main className="flex flex-1 flex-col items-center px-4 pt-7 md:px-6">
      {/* 보낸 사람 칩: MOMO가 먼저 인사 */}
      <p className="arrive pixel-corners inline-flex h-11 max-w-full items-center gap-2.5 bg-foreground/5 pr-4 pl-1.5 font-mono text-[11px] tracking-[0.08em] text-muted-foreground shadow-[inset_0_0_0_1px_rgb(255_255_255/0.14)] md:gap-3 md:pr-[18px] md:text-xs">
        <MomoAvatar size={32} />
        <span className="tracking-[0.16em] text-foreground">MOMO</span>
        <span className="text-foreground/25">·</span>
        <span className="truncate">로그인하면 오늘의 메시지를 보여 드려요</span>
      </p>

      <section
        aria-labelledby="login-title"
        className="flex flex-col items-center gap-6 pt-14 text-center md:gap-7 md:pt-16"
      >
        <p className="pl-[0.34em] font-pixel text-xl font-black tracking-[0.34em] md:text-[1.625rem]">MIYA STUDIO</p>
        <h1 id="login-title" className="font-serif text-[2.75rem] leading-[1.22] tracking-[-0.025em] md:text-[4.875rem]">
          하루의 궤도를
          <br />
          설계하는 시간
        </h1>
        <p className="max-w-xl text-[15px] leading-[1.7] text-muted-foreground md:text-[17px]">
          출근 첫 순간, MOMO가 먼저 말을 걸어요.
          <br />
          오늘의 한 문장과 지금 할 일, 이번 주 목표를 한 화면에서.
        </p>
        <div className="w-full max-w-[460px] pt-2">
          <Suspense fallback={<div className="h-12" />}>
            <LoginButtons />
          </Suspense>
        </div>
        <p className="font-mono text-[11px] tracking-[0.12em] text-dim">개인 대시보드 · 로그인한 본인만 볼 수 있어요</p>
      </section>

      {/* 아래로 살짝 보이는 대시보드 (꾸밈) */}
      <div
        aria-hidden
        className="mt-16 h-56 w-full max-w-[1040px] overflow-hidden [mask-image:linear-gradient(to_bottom,#000_40%,transparent)] md:mt-20 md:h-64"
      >
        <CornerFrame className="flex h-full flex-col gap-3.5 border-b-0 p-4 md:p-5">
          <div className="flex justify-between gap-3 font-mono text-[11px] tracking-[0.06em] text-dim">
            <span>
              MIYA STUDIO <span className="text-foreground/25">/</span> 오늘
            </span>
            <span className="hidden sm:inline">이번 주</span>
          </div>
          <div className="flex items-center gap-3 border border-dashed border-foreground/15 px-3 py-2 text-xs text-foreground/85">
            <MomoAvatar size={29} />
            <span className="font-mono text-dim">MOMO ›</span>
            <span className="truncate">오늘 할 일을 여기에 올려 둘게요.</span>
          </div>
          <div className="grid gap-3.5 sm:grid-cols-[minmax(0,2.2fr)_minmax(0,1fr)]">
            <div className="flex flex-col gap-3.5 rounded-xl bg-foreground/[0.04] p-5 ring-1 ring-foreground/15">
              <SectionLabel code="NOW">지금 할 일</SectionLabel>
              <div className="h-7 w-3/4 bg-foreground/10" />
              <div className="h-3 w-1/3 bg-foreground/[0.07]" />
            </div>
            <div className="hidden flex-col gap-3 rounded-xl bg-card p-5 ring-1 ring-foreground/10 sm:flex">
              <SectionLabel code="WEEK">이번 주 목표</SectionLabel>
              <div className="flex gap-0.5">
                {Array.from({ length: 16 }, (_, i) => (
                  <span key={i} className={i < 6 ? "h-1.5 flex-1 bg-foreground" : "h-1.5 flex-1 bg-foreground/10"} />
                ))}
              </div>
            </div>
          </div>
        </CornerFrame>
      </div>
    </main>
  )
}
