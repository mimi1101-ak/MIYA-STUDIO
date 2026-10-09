import type { Metadata } from "next"
import { Doto, Hahmlet, IBM_Plex_Mono, IBM_Plex_Sans_KR } from "next/font/google"
import { Suspense } from "react"

import { AppHeader } from "@/components/app-header"
import { SpaceBackground } from "@/components/space-background"

import "./globals.css"

// 글꼴은 배포할 때 한 번 받아 두고 우리 사이트에서 직접 제공합니다(방문할 때 구글에 요청하지 않음).
// 한글 글꼴은 글자 묶음별로 나뉘어 있어, 화면에 나온 글자의 묶음만 내려받습니다.
const plexKr = IBM_Plex_Sans_KR({
  weight: ["400", "500", "600"],
  subsets: ["latin"],
  variable: "--font-plex-kr",
  display: "swap",
})
const plexMono = IBM_Plex_Mono({
  weight: ["400", "500"],
  subsets: ["latin"],
  variable: "--font-plex-mono",
  display: "swap",
})
const hahmlet = Hahmlet({ subsets: ["latin"], variable: "--font-hahmlet", display: "swap" })
const doto = Doto({ weight: ["700", "900"], subsets: ["latin"], variable: "--font-doto", display: "swap" })

export const metadata: Metadata = {
  title: "MIYA STUDIO",
  description: "하루를 설계하고 트렌드를 정리하는 개인 대시보드",
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ko"
      className={`dark h-full antialiased ${plexKr.variable} ${plexMono.variable} ${hahmlet.variable} ${doto.variable}`}
    >
      <body className="flex min-h-full flex-col">
        <SpaceBackground />
        {/* 메뉴는 현재 주소를 보고 그리므로, 주소가 정해지는 요청 시점에 채웁니다. */}
        <Suspense fallback={null}>
          <AppHeader />
        </Suspense>
        {children}
      </body>
    </html>
  )
}
