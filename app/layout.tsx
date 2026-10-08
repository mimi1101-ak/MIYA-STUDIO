import type { Metadata } from "next"
import { Suspense } from "react"

import { AppHeader } from "@/components/app-header"

import "./globals.css"

export const metadata: Metadata = {
  title: "MIYA STUDIO",
  description: "하루를 설계하고 트렌드를 정리하는 개인 대시보드",
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="flex min-h-full flex-col">
        {/* 메뉴는 현재 주소를 보고 그리므로, 주소가 정해지는 요청 시점에 채웁니다. */}
        <Suspense fallback={null}>
          <AppHeader />
        </Suspense>
        {children}
      </body>
    </html>
  )
}
