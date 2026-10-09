import Link from "next/link"

import { PageShell } from "@/components/page-shell"

import { GoalChat } from "../goal-chat"

export default function NewGoalPage() {
  return (
    <PageShell title="새 목표" description="MOMO와 대화하며 목표를 구체화해요.">
      <Link href="/goals" className="font-mono text-xs text-muted-foreground hover:text-foreground">
        ← 목표 목록
      </Link>
      <div className="max-w-2xl">
        <GoalChat goalId={null} messages={[]} />
      </div>
    </PageShell>
  )
}
