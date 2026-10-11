// 사진을 올리기 전에 브라우저에서 줄입니다(긴 쪽 최대 2000px).
// 휴대폰 사진(3~10MB)을 그대로 올리면 느리고 저장 공간을 많이 쓰기 때문입니다.
// 원본 파일은 올리지 않고, 줄인 사진만 올립니다.

const MAX_SIDE = 2000
const MAX_BYTES = 4.8 * 1024 * 1024 // Storage 한도(5MB)보다 조금 작게

export type ShrunkImage = {
  blob: Blob
  width: number
  height: number
  ext: "webp" | "jpg" | "png"
  type: "image/webp" | "image/jpeg" | "image/png"
}

export class ImageReadError extends Error {}

function encode(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality))
}

export async function shrinkImage(file: File): Promise<ShrunkImage> {
  let bitmap: ImageBitmap
  try {
    // 휴대폰 사진의 회전 정보(EXIF)를 반영해 바로 선 모양으로 읽습니다.
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" })
  } catch {
    throw new ImageReadError("이 사진 형식은 열 수 없어요.")
  }

  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height))
  const width = Math.max(1, Math.round(bitmap.width * scale))
  const height = Math.max(1, Math.round(bitmap.height * scale))
  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext("2d")
  if (!context) throw new ImageReadError("사진을 줄이지 못했어요.")
  context.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()

  // WebP를 만들 수 있는 브라우저는 WebP로(작고 투명 배경 유지). Safari 등은 PNG(투명 로고)나 JPEG로.
  const webp = await encode(canvas, "image/webp", 0.86)
  if (webp && webp.type === "image/webp" && webp.size <= MAX_BYTES) {
    return { blob: webp, width, height, ext: "webp", type: "image/webp" }
  }
  if (file.type === "image/png") {
    const png = await encode(canvas, "image/png")
    if (png && png.size <= MAX_BYTES) return { blob: png, width, height, ext: "png", type: "image/png" }
  }
  for (const quality of [0.86, 0.72]) {
    const jpeg = await encode(canvas, "image/jpeg", quality)
    if (jpeg && jpeg.size <= MAX_BYTES) return { blob: jpeg, width, height, ext: "jpg", type: "image/jpeg" }
  }
  throw new ImageReadError("사진이 너무 커서 올리지 못했어요.")
}
