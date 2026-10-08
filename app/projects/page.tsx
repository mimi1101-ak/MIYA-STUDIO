import { Suspense } from "react"

import { LoadingBlock, PageShell } from "@/components/page-shell"
import { requireUser } from "@/lib/auth"

import { ProjectBoard } from "./project-board"

export default function ProjectsPage() {
  return (
    <PageShell title="마이 프로젝트" description="내가 만든 사이트를 모아 두고 한 번에 이동해요.">
      <Suspense fallback={<LoadingBlock lines={4} />}>
        <ProjectsContent />
      </Suspense>
    </PageShell>
  )
}

async function ProjectsContent() {
  const { supabase } = await requireUser()
  const { data, error } = await supabase
    .from("projects")
    .select("id, name, url, description")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true })

  if (error) {
    return <p className="text-sm text-destructive">프로젝트를 불러오지 못했어요. 새로고침해 주세요.</p>
  }
  return <ProjectBoard projects={data} />
}
