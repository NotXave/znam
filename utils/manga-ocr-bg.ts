import type { OcrEvent, OcrRegion, OcrRequest } from './types'
import { toTesseractLangs } from './ocr/langs'

// Firefox MV2: the persistent background page hosts the Tesseract worker
// directly. (Chrome MV3 would need an offscreen document — not wired here.)

const ocrCache = new Map<string, OcrRegion[]>() // key: url|lang

function cacheOcr(key: string, regions: OcrRegion[]) {
  ocrCache.set(key, regions)
  if (ocrCache.size > 60) {
    const first = ocrCache.keys().next().value
    if (first) ocrCache.delete(first)
  }
}

const MAX_CONCURRENT_OCR = 2
let activeOcrJobs = 0
const ocrQueue: (() => Promise<void>)[] = []

function enqueueOcr(job: () => Promise<void>) {
  ocrQueue.push(job)
  pumpOcrQueue()
}
function pumpOcrQueue() {
  while (activeOcrJobs < MAX_CONCURRENT_OCR && ocrQueue.length > 0) {
    const job = ocrQueue.shift()!
    activeOcrJobs++
    job().finally(() => {
      activeOcrJobs--
      pumpOcrQueue()
    })
  }
}

async function fetchImageBlob(url: string): Promise<Blob> {
  const resp = await fetch(url, { credentials: 'omit' })
  if (!resp.ok) throw new Error(`image fetch HTTP ${resp.status}`)
  return await resp.blob()
}

/** Sample each region's border to find the bubble background color (for patches). */
async function annotateRegionColors(blob: Blob, regions: OcrRegion[]): Promise<void> {
  if (regions.length === 0) return
  try {
    const bmp = await createImageBitmap(blob)
    const canvas = new OffscreenCanvas(bmp.width, bmp.height)
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!
    ctx.drawImage(bmp, 0, 0)
    bmp.close()
    for (const r of regions) {
      const pad = Math.max(4, Math.round(Math.min(r.bbox.w, r.bbox.h) * 0.08))
      const x0 = Math.max(0, r.bbox.x - pad)
      const y0 = Math.max(0, r.bbox.y - pad)
      const x1 = Math.min(canvas.width - 1, r.bbox.x + r.bbox.w + pad)
      const y1 = Math.min(canvas.height - 1, r.bbox.y + r.bbox.h + pad)
      const samples: [number, number, number][] = []
      const steps = 6
      for (let i = 0; i <= steps; i++) {
        const fx = Math.round(x0 + ((x1 - x0) * i) / steps)
        const fy = Math.round(y0 + ((y1 - y0) * i) / steps)
        for (const [px, py] of [[fx, y0], [fx, y1], [x0, fy], [x1, fy]]) {
          const d = ctx.getImageData(px, py, 1, 1).data
          samples.push([d[0], d[1], d[2]])
        }
      }
      samples.sort(
        (a, b) =>
          0.299 * a[0] + 0.587 * a[1] + 0.114 * a[2] -
          (0.299 * b[0] + 0.587 * b[1] + 0.114 * b[2]),
      )
      const pick = samples[Math.floor(samples.length * 0.8)]
      r.bgColor = `rgb(${pick[0]},${pick[1]},${pick[2]})`
    }
  } catch {
    // best effort
  }
}

export function handleOcrPort(port: any): void {
  const post = (event: OcrEvent) => {
    try { port.postMessage(event) } catch { /* port closed */ }
  }

  port.onMessage.addListener((msg: OcrRequest) => {
    if (msg.type !== 'OCR_PAGE') return

    enqueueOcr(async () => {
      const tessLangs = toTesseractLangs(msg.lang)
      if (!tessLangs) {
        post({ type: 'UNSUPPORTED', imageId: msg.imageId, lang: msg.lang })
        return
      }
      const cacheKey = `${msg.url}|${msg.lang}`
      const cached = ocrCache.get(cacheKey)
      if (cached) {
        post({ type: 'REGIONS', imageId: msg.imageId, regions: cached })
        return
      }
      try {
        const blob = msg.dataUrl
          ? await (await fetch(msg.dataUrl)).blob()
          : await fetchImageBlob(msg.url)
        const { recognizePage } = await import('./ocr/tesseract-host')
        const regions = await recognizePage(blob, msg.lang)
        await annotateRegionColors(blob, regions)
        cacheOcr(cacheKey, regions)
        console.log(`[znam] manga OCR: ${regions.length} region(s)`)
        post({ type: 'REGIONS', imageId: msg.imageId, regions })
      } catch (err: any) {
        console.error('[znam] manga OCR failed for', msg.url, err)
        post({ type: 'OCR_ERROR', imageId: msg.imageId, error: err.message || String(err) })
      }
    })
  })
}
