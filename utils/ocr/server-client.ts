import type { OcrRegion } from '../types'

let lastHealth: { url: string; ok: boolean; at: number } | null = null

export async function checkServerHealth(baseUrl: string): Promise<boolean> {
  if (lastHealth && lastHealth.url === baseUrl && Date.now() - lastHealth.at < 10_000) {
    return lastHealth.ok
  }
  let ok = false
  try {
    const resp = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(1500) })
    ok = resp.ok
  } catch {
    ok = false
  }
  lastHealth = { url: baseUrl, ok, at: Date.now() }
  return ok
}

async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = reader.result as string
      resolve(dataUrl.slice(dataUrl.indexOf(',') + 1))
    }
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

async function postOcr(baseUrl: string, image: Blob, lang: string, detectOnly: boolean): Promise<OcrRegion[]> {
  const base64 = await blobToBase64(image)
  const resp = await fetch(`${baseUrl}/ocr`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image: base64, lang, detect_only: detectOnly }),
    // Model inference on CPU can take a while for a full page
    signal: AbortSignal.timeout(120_000),
  })
  if (!resp.ok) throw new Error(`OCR server HTTP ${resp.status}`)
  const data = await resp.json()
  if (!Array.isArray(data?.regions)) throw new Error('OCR server: malformed response')
  return data.regions as OcrRegion[]
}

/** Full server OCR (detection + Japanese text recognition). */
export function serverOcr(baseUrl: string, image: Blob, lang: string): Promise<OcrRegion[]> {
  return postOcr(baseUrl, image, lang, false)
}

/** Detection only — region boxes without text (for the Tesseract hybrid). */
export function serverDetect(baseUrl: string, image: Blob): Promise<OcrRegion[]> {
  return postOcr(baseUrl, image, 'ja', true)
}
