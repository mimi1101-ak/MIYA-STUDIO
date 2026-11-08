import { Suspense } from "react"

import { LoadingBlock, PageShell } from "@/components/page-shell"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { requireUser } from "@/lib/auth"
import { loadWorkHours } from "@/lib/schedule-db"

import { signOut } from "./actions"
import { DisplayNameForm } from "./display-name-form"
import { WorkHoursForm } from "./work-hours-form"

const PROVIDER_LABELS: Record<string, string> = { kakao: "카카오", google: "구글" }

export default function ProfilePage() {
  return (
    <PageShell title="프로필 · 설정">
      <Suspense fallback={<LoadingBlock lines={4} />}>
        <ProfileContent />
      </Suspense>
    </PageShell>
  )
}

async function ProfileContent() {
  const { supabase, userId, claims } = await requireUser()
  const [{ data: profile }, workHours] = await Promise.all([
    supabase.from("profiles").select("display_name").eq("id", userId).maybeSingle(),
    loadWorkHours(supabase, userId),
  ])

  const provider = claims.app_metadata?.provider
  const providerLabel = provider ? (PROVIDER_LABELS[provider] ?? provider) : "알 수 없음"

  return (
    <div className="flex max-w-xl flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>로그인 계정</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-[5rem_1fr] gap-y-2 text-sm">
            <dt className="text-muted-foreground">로그인</dt>
            <dd>{providerLabel}</dd>
            <dt className="text-muted-foreground">이메일</dt>
            <dd className="break-all">{claims.email || "제공되지 않음"}</dd>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>표시 이름</CardTitle>
        </CardHeader>
        <CardContent>
          <DisplayNameForm initialName={profile?.display_name ?? ""} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>일하는 요일·시간</CardTitle>
          <CardDescription>MOMO가 목표 계획을 짤 때 어느 요일에, 하루에 얼마나 넣을지 정하는 데 써요. 일정 미루기는 일하지 않는 요일을 건너뛰어요.</CardDescription>
        </CardHeader>
        <CardContent>
          <WorkHoursForm
            initialDays={workHours.days}
            initialStart={workHours.start}
            initialEnd={workHours.end}
          />
        </CardContent>
      </Card>

      <form action={signOut}>
        <Button type="submit" variant="outline">
          로그아웃
        </Button>
      </form>
    </div>
  )
}
