import { Suspense } from "react"

import { LoginButtons } from "./login-buttons"

export default function LoginPage() {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-12">
      <div className="flex w-full max-w-sm flex-col gap-8 rounded-2xl bg-card p-8 ring-1 ring-foreground/10">
        <div className="flex flex-col gap-2 text-center">
          <p className="text-sm text-muted-foreground">출근 첫 순간을 함께하는</p>
          <h1 className="text-2xl font-semibold tracking-tight">24시간 비서</h1>
          <p className="text-sm text-muted-foreground">
            하루를 설계하고 트렌드를 정리하는 개인 대시보드
          </p>
        </div>
        <Suspense fallback={<div className="h-24" />}>
          <LoginButtons />
        </Suspense>
      </div>
    </main>
  )
}
