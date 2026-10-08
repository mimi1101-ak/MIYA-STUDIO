"use client"

import { useEffect, useState } from "react"

import { msToKst } from "@/lib/date"

// 오늘 0시부터 지난 분(한국 시간)을 30초마다 새로 계산합니다.
// 첫 값은 서버가 계산한 값을 써서 서버·브라우저 화면이 처음에 똑같이 그려지게 합니다.
export function useNowMinutes(initial: number, today: string): number {
  const [now, setNow] = useState(initial)
  useEffect(() => {
    const id = setInterval(() => {
      const current = msToKst(Date.now())
      setNow(current.ymd === today ? current.minutes : current.ymd > today ? 24 * 60 : 0)
    }, 30_000)
    return () => clearInterval(id)
  }, [today])
  return now
}
