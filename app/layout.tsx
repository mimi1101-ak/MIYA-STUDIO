import type { Metadata } from "next"

import { AppHeader } from "@/components/app-header"

import "./globals.css"

export const metadata: Metadata = {
  title: "24시간 비서",
  description: "하루를 설계하고 트렌드를 정리하는 개인 대시보드",
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="flex min-h-full flex-col">
        <AppHeader />
        {children}
      </body>
    </html>
  )
}
