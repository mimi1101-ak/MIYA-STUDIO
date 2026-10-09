// 모든 화면 뒤에 까는 검은 우주: 별, 반짝이는 십자 별, 왼쪽 아래 픽셀 성운, 옅은 가로줄.
// 별 자리는 무작위처럼 보이지만 씨앗 값이 고정이라 매번 같은 자리에 뜹니다(서버·브라우저 화면이 같게).

function seeded(seed: number) {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

type Star = { left: string; top: string; size: number; opacity: number; delay: string; twinkle: boolean }
type Dust = { x: number; y: number; size: number; opacity: number }

const STARS: Star[] = (() => {
  const r = seeded(1009)
  return Array.from({ length: 150 }, () => {
    const big = r() > 0.94
    return {
      left: `${(r() * 100).toFixed(2)}%`,
      top: `${(r() * 100).toFixed(2)}%`,
      size: big ? 2 : r() > 0.65 ? 1.5 : 1,
      opacity: Number((big ? 0.85 : 0.18 + r() * 0.5).toFixed(2)),
      delay: `${(r() * 6).toFixed(2)}s`,
      twinkle: r() > 0.68,
    }
  })
})()

// 6px 격자에 맞춘 사각형 구름(레퍼런스의 픽셀 성운)
const DUST: Dust[] = (() => {
  const r = seeded(77)
  return Array.from({ length: 64 }, () => {
    const mag = Math.sqrt(-2 * Math.log(Math.max(r(), 1e-6)))
    const angle = 2 * Math.PI * r()
    const gx = mag * Math.cos(angle)
    const gy = mag * Math.sin(angle)
    return {
      x: Math.round((gx * 52) / 6) * 6,
      y: Math.round((gy * 30) / 6) * 6,
      size: r() > 0.78 ? 12 : 6,
      opacity: Number(Math.max(0.03, 0.4 - Math.hypot(gx, gy) * 0.15).toFixed(2)),
    }
  })
})()

const SPARKLE_PATH = "M12 0C12.6 8 16 11.4 24 12C16 12.6 12.6 16 12 24C11.4 16 8 12.6 0 12C8 11.4 11.4 8 12 0Z"

// 픽셀로 찍은 십자 별
function PixelSparkle({ className, size }: { className: string; size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 9 9" shapeRendering="crispEdges" className={className}>
      <rect x="4" y="3" width="1" height="3" fill="#fff" />
      <rect x="3" y="4" width="3" height="1" fill="#fff" />
      <g fill="#fff" opacity=".5">
        <rect x="4" y="1" width="1" height="2" />
        <rect x="4" y="6" width="1" height="2" />
        <rect x="1" y="4" width="2" height="1" />
        <rect x="6" y="4" width="2" height="1" />
      </g>
    </svg>
  )
}

export function SpaceBackground() {
  return (
    <>
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        {STARS.map((star, i) => (
          <span
            key={i}
            className={star.twinkle ? "star twinkle" : "star"}
            style={{
              left: star.left,
              top: star.top,
              width: star.size,
              height: star.size,
              opacity: star.opacity,
              animationDelay: star.delay,
            }}
          />
        ))}
        {/* 큰 별과 성운은 본문과 겹치지 않게 넓은 화면(1280px 이상)에서만 */}
        <svg
          width="30"
          height="30"
          viewBox="0 0 24 24"
          className="absolute top-[22%] left-[4%] hidden drop-shadow-[0_0_8px_rgb(255_255_255/0.75)] xl:block"
        >
          <path d={SPARKLE_PATH} fill="#fff" />
        </svg>
        <PixelSparkle size={24} className="absolute top-[38%] right-[9%]" />
        <PixelSparkle size={18} className="absolute right-[4%] bottom-[18%] opacity-60" />
        <div className="absolute bottom-[14%] left-[3%] hidden xl:block">
          {DUST.map((d, i) => (
            <span
              key={i}
              className="absolute bg-[#d9d9dc]"
              style={{ left: d.x, top: d.y, width: d.size, height: d.size, opacity: d.opacity }}
            />
          ))}
        </div>
      </div>
      {/* 아주 옅은 가로줄: 글자 위에 덮여도 누르기·읽기에 방해되지 않게 2%만 */}
      <div aria-hidden className="scanlines pointer-events-none fixed inset-0 z-50" />
    </>
  )
}
