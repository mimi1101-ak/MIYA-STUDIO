import type { Metadata } from "next"
import Link from "next/link"

export const metadata: Metadata = {
  title: "환불정책 · MIYA STUDIO",
}

// 토스페이먼츠 심사용 환불정책. 로그인 없이 누구나 볼 수 있습니다(lib/supabase/proxy.ts의 PUBLIC_PATHS).
const SECTIONS: { title: string; items: string[] }[] = [
  {
    title: "1. 적용 대상",
    items: ["이 정책은 MIYA STUDIO의 유료 이용권(월 정기결제)에 적용됩니다."],
  },
  {
    title: "2. 결제 후 7일 이내 취소",
    items: [
      "유료 기능을 한 번도 이용하지 않았다면 결제 금액 전액을 환불합니다.",
      "유료 기능을 이용했다면 이용한 날짜만큼의 금액을 뺀 나머지를 환불합니다. (환불 금액 = 결제 금액 × 남은 일수 ÷ 이용 기간 전체 일수)",
    ],
  },
  {
    title: "3. 결제 후 7일이 지난 뒤 해지",
    items: [
      "언제든 해지할 수 있으며, 해지하면 다음 결제일부터 요금이 청구되지 않습니다.",
      "이미 결제한 기간은 끝날 때까지 그대로 이용할 수 있으며, 그 기간의 요금은 환불되지 않습니다.",
    ],
  },
  {
    title: "4. 서비스 사정으로 이용하지 못한 경우",
    items: [
      "서비스 장애·중단 등 MIYA STUDIO의 책임으로 이용하지 못한 기간이 있으면, 결제일과 관계없이 그 기간만큼의 금액을 환불합니다.",
    ],
  },
  {
    title: "5. 환불 신청 방법과 처리 기간",
    items: [
      "아래 문의처로 가입한 계정과 결제일을 알려 주시면 신청됩니다.",
      "신청을 확인한 날부터 3영업일 이내에 결제를 취소합니다.",
      "카드 결제는 카드사에 따라 취소가 반영되기까지 3~7영업일이 더 걸릴 수 있습니다.",
      "환불은 결제하신 수단으로 돌려드립니다.",
    ],
  },
]

const CONTACT: [string, string][] = [
  ["상호", "MIYA STUDIO"],
  ["대표자", "양준영"],
  ["이메일", "heeyoung1101yang@naver.com"],
  ["전화", "010-3743-8751"],
]

export default function RefundPolicyPage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-10 md:px-6 md:py-14">
      <div className="flex flex-col gap-2">
        <Link href="/" className="font-pixel text-xl font-black tracking-[0.3em] hover:text-muted-foreground">
          MIYA STUDIO
        </Link>
        <h1 className="font-serif text-2xl tracking-tight">환불정책</h1>
        <p className="font-mono text-[11px] tracking-[0.08em] text-dim">시행일 2026년 10월 12일</p>
      </div>

      <div className="flex flex-col gap-5 text-[13px] leading-[1.7] text-muted-foreground">
        {SECTIONS.map((section) => (
          <section key={section.title} className="flex flex-col gap-1.5">
            <h2 className="text-sm font-medium text-foreground">{section.title}</h2>
            <ul className="flex list-disc flex-col gap-1 pl-5">
              {section.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>
        ))}

        <section className="flex flex-col gap-1.5">
          <h2 className="text-sm font-medium text-foreground">6. 문의</h2>
          <dl className="grid grid-cols-[4rem_1fr] gap-y-1">
            {CONTACT.map(([label, value]) => (
              <div key={label} className="contents">
                <dt>{label}</dt>
                <dd className="break-all text-foreground/85">{value}</dd>
              </div>
            ))}
          </dl>
        </section>
      </div>
    </main>
  )
}
