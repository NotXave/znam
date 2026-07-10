import type { OcrEvent, OcrRegion, OcrRequest } from './types'
import { toTesseractLangs } from './ocr/langs'
import { checkServerHealth, serverDetect, serverOcr } from './ocr/server-client'
import { getSettings } from './settings'

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

/**
 * Hybrid tier: the server's comic-text-detector finds the speech bubbles
 * (whole-page Tesseract segmentation is unreliable on busy manga/manhwa art),
 * then Tesseract reads each cropped bubble — which it does well.
 */
async function hybridOcr(blob: Blob, lang: string, serverUrl: string): Promise<OcrRegion[]> {
  const detected = await serverDetect(serverUrl, blob)
  if (detected.length === 0) return []
  const bmp = await createImageBitmap(blob)
  const { recognizeCrop } = await import('./ocr/tesseract-host')
  const out: OcrRegion[] = []
  let seq = 0
  try {
    for (const det of detected) {
      const pad = Math.round(Math.max(det.bbox.w, det.bbox.h) * 0.06) + 4
      const x = Math.max(0, det.bbox.x - pad)
      const y = Math.max(0, det.bbox.y - pad)
      const w = Math.min(bmp.width - x, det.bbox.w + pad * 2)
      const h = Math.min(bmp.height - y, det.bbox.h + pad * 2)
      if (w < 8 || h < 8) continue
      const canvas = new OffscreenCanvas(w, h)
      canvas.getContext('2d')!.drawImage(bmp, x, y, w, h, 0, 0, w, h)
      const cropBlob = await canvas.convertToBlob({ type: 'image/png' })
      for (const region of await recognizeCrop(cropBlob, lang, x, y)) {
        region.id = `r${seq++}`
        out.push(region)
      }
    }
  } finally {
    bmp.close()
  }
  return out
}

export function handleOcrPort(port: any): void {
  const post = (event: OcrEvent) => {
    try { port.postMessage(event) } catch { /* port closed */ }
  }

  port.onMessage.addListener((msg: OcrRequest) => {
    if (msg.type !== 'OCR_PAGE') return

    enqueueOcr(async () => {
      // Tier selection: Japanese needs the server; latin scripts use the
      // server's bubble detector + Tesseract when the server is up (much
      // better on busy art), otherwise plain whole-page Tesseract.
      const tessLangs = toTesseractLangs(msg.lang)
      const settings = await getSettings()
      const serverUp = await checkServerHealth(settings.mangaServerUrl)
      if (!tessLangs && !serverUp) {
        post({ type: 'UNSUPPORTED', imageId: msg.imageId, lang: msg.lang })
        return
      }
      const tier = !tessLangs ? 'server' : serverUp ? 'hybrid' : 'tesseract'

      const cacheKey = `${msg.url}|${msg.lang}|${tier}`
      const cached = ocrCache.get(cacheKey)
      if (cached) {
        post({ type: 'REGIONS', imageId: msg.imageId, regions: cached })
        return
      }
      try {
        const blob = msg.dataUrl
          ? await (await fetch(msg.dataUrl)).blob()
          : await fetchImageBlob(msg.url)

        let regions: OcrRegion[]
        if (tier === 'server') {
          regions = await serverOcr(settings.mangaServerUrl, blob, msg.lang)
        } else if (tier === 'hybrid') {
          try {
            regions = await hybridOcr(blob, msg.lang, settings.mangaServerUrl)
          } catch (err) {
            console.warn('[znam] hybrid OCR failed, falling back to plain Tesseract:', err)
            const { recognizePage } = await import('./ocr/tesseract-host')
            regions = await recognizePage(blob, msg.lang)
          }
        } else {
          const { recognizePage } = await import('./ocr/tesseract-host')
          regions = await recognizePage(blob, msg.lang)
        }

        await annotateRegionColors(blob, regions)
        cacheOcr(cacheKey, regions)
        console.log(`[znam] manga OCR (${tier}): ${regions.length} region(s)`)
        post({ type: 'REGIONS', imageId: msg.imageId, regions })
      } catch (err: any) {
        console.error('[znam] manga OCR failed for', msg.url, err)
        post({ type: 'OCR_ERROR', imageId: msg.imageId, error: err.message || String(err) })
      }
    })
  })
}
