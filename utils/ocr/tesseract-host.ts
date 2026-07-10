import { createWorker, OEM, PSM, type Worker } from 'tesseract.js'
import type { OcrRegion, OcrWord, OcrLine, Box } from '../types'
import { toTesseractLangs } from './langs'

let worker: Worker | null = null
let workerLangs = ''
let initPromise: Promise<Worker> | null = null

async function ensureWorker(langs: string): Promise<Worker> {
  if (worker && workerLangs === langs) return worker
  if (initPromise && workerLangs === langs) return initPromise

  if (worker) {
    await worker.terminate().catch(() => {})
    worker = null
  }

  workerLangs = langs
  initPromise = createWorker(langs, OEM.LSTM_ONLY, {
    workerPath: browser.runtime.getURL('/tesseract/worker.min.js'),
    corePath: browser.runtime.getURL('/tesseract/tesseract-core-simd-lstm.wasm.js'),
    // WXT's typed PublicPath only lists files, not directories
    langPath: browser.runtime.getURL('/tesseract' as any),
    cacheMethod: 'none',
    gzip: true,
    // Extension CSP (script-src 'self') forbids blob: workers — load worker.min.js directly
    workerBlobURL: false,
    errorHandler: (err: any) => console.error('[znam] Tesseract worker error:', err),
  }).then(async w => {
    // Tesseract's API default (SINGLE_BLOCK) treats the whole page as one
    // paragraph — AUTO segments scattered speech bubbles individually.
    await w.setParameters({ tessedit_pageseg_mode: PSM.AUTO })
    worker = w
    return w
  }).catch(err => {
    console.error('[znam] Tesseract worker init failed:', err)
    initPromise = null
    workerLangs = ''
    throw err
  })
  return initPromise
}

// The single Tesseract worker is shared by concurrent page jobs, and PSM is
// worker-global state — serialize setParameters + recognize pairs.
let workerBusy: Promise<unknown> = Promise.resolve()

function withWorker<T>(fn: () => Promise<T>): Promise<T> {
  const run = workerBusy.then(fn, fn)
  workerBusy = run.catch(() => {})
  return run
}

interface Preprocessed {
  blob: Blob
  scale: number
}

// Manga lettering OCRs noticeably better upscaled and desaturated.
async function preprocess(blob: Blob): Promise<Preprocessed> {
  try {
    const bmp = await createImageBitmap(blob)
    const maxDim = Math.max(bmp.width, bmp.height)
    const scale = maxDim < 500 ? 3 : maxDim < 1800 ? 2 : 1
    const canvas = new OffscreenCanvas(bmp.width * scale, bmp.height * scale)
    const ctx = canvas.getContext('2d')!
    ctx.filter = 'grayscale(1) contrast(1.25)'
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height)
    bmp.close()
    const out = await canvas.convertToBlob({ type: 'image/png' })
    return { blob: out, scale }
  } catch {
    return { blob, scale: 1 }
  }
}

function scaleBox(b: { x0: number; y0: number; x1: number; y1: number }, s: number): Box {
  return {
    x: Math.round(b.x0 / s),
    y: Math.round(b.y0 / s),
    w: Math.round((b.x1 - b.x0) / s),
    h: Math.round((b.y1 - b.y0) / s),
  }
}

function hasLetters(text: string): boolean {
  return /\p{L}/u.test(text)
}

function offsetBox(b: Box, dx: number, dy: number): Box {
  return { x: b.x + dx, y: b.y + dy, w: b.w, h: b.h }
}

function parseBlocks(data: any, scale: number, dx = 0, dy = 0): OcrRegion[] {
  const regions: OcrRegion[] = []
  let regionSeq = 0

  for (const block of data.blocks ?? []) {
    for (const para of block.paragraphs ?? []) {
      const words: OcrWord[] = []
      const lines: OcrLine[] = []
      for (const line of para.lines ?? []) {
        const lineWords: OcrWord[] = []
        for (const word of line.words ?? []) {
          const text = (word.text || '').trim()
          if (!text || !hasLetters(text) || word.confidence < 35) continue
          lineWords.push({ text, bbox: offsetBox(scaleBox(word.bbox, scale), dx, dy) })
        }
        if (lineWords.length === 0) continue
        words.push(...lineWords)
        lines.push({
          text: lineWords.map(w2 => w2.text).join(' '),
          bbox: offsetBox(scaleBox(line.bbox, scale), dx, dy),
        })
      }
      if (words.length === 0) continue
      regions.push({
        id: `r${regionSeq++}`,
        bbox: offsetBox(scaleBox(para.bbox, scale), dx, dy),
        text: lines.map(l => l.text).join(' '),
        words,
        lines,
        source: 'tesseract',
      })
    }
  }
  return regions
}

async function recognize(imageBlob: Blob, lang: string, psm: PSM): Promise<{ data: any; scale: number }> {
  const tessLangs = toTesseractLangs(lang)
  if (!tessLangs) throw new Error(`Tesseract cannot handle language "${lang}"`)

  const { blob, scale } = await preprocess(imageBlob)
  return withWorker(async () => {
    const w = await ensureWorker(tessLangs)
    await w.setParameters({ tessedit_pageseg_mode: psm })
    const { data } = await w.recognize(blob, {}, { blocks: true, text: true })
    return { data, scale }
  })
}

/** OCR a whole page: AUTO segmentation finds scattered speech bubbles. */
export async function recognizePage(imageBlob: Blob, lang: string): Promise<OcrRegion[]> {
  const { data, scale } = await recognize(imageBlob, lang, PSM.AUTO)
  return parseBlocks(data, scale)
}

/**
 * OCR a cropped bubble whose position in the page is already known
 * (hybrid mode: server detects regions, Tesseract reads them).
 * Returned boxes are shifted back into page coordinates.
 */
export async function recognizeCrop(
  cropBlob: Blob,
  lang: string,
  offsetX: number,
  offsetY: number,
): Promise<OcrRegion[]> {
  const { data, scale } = await recognize(cropBlob, lang, PSM.SINGLE_BLOCK)
  return parseBlocks(data, scale, offsetX, offsetY)
}
