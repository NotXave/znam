// Client for the Whisper inference worker (public/asr/whisper-worker.js).
//
// All heavy lifting — transformers.js, the ONNX wasm/WebGPU runtime, the
// model itself — lives in a dedicated Worker. Running inference directly on
// the background page's main thread blocked ALL extension messaging for
// seconds per audio window (the popup wouldn't even open while
// transcribing); a worker isolates that completely. The worker imports the
// esbuild-bundled transformers.bundle.js (bare specifiers resolved at build
// time) and loads the ONNX runtime from the packaged asr/ort/ files, never a
// CDN — see the worker file for the full history of why.

export interface WhisperSegment {
  /** Seconds, relative to the start of the audio window passed in. */
  start: number
  end: number
  text: string
}

type Pending = {
  resolve: (value: any) => void
  reject: (err: Error) => void
  onProgress?: (pct: number, detail: string) => void
}

let worker: Worker | null = null
let nextId = 1
const pending = new Map<number, Pending>()

function getWorker(): Worker {
  if (worker) return worker
  // WXT's typed PublicPath only lists known files, not this dynamic path.
  const url = browser.runtime.getURL('/asr/whisper-worker.js' as any)
  worker = new Worker(url, { type: 'module' })
  worker.onmessage = (e: MessageEvent<any>) => {
    const msg = e.data
    const p = pending.get(msg.id)
    if (!p) return
    if (msg.type === 'progress') {
      p.onProgress?.(msg.pct, msg.detail)
    } else if (msg.type === 'device') {
      console.log('[znam ASR] inference device:', msg.device)
    } else if (msg.type === 'done') {
      pending.delete(msg.id)
      p.resolve(msg.segments)
    } else if (msg.type === 'error') {
      pending.delete(msg.id)
      p.reject(new Error(msg.error))
    }
  }
  worker.onerror = (e) => {
    console.error('[znam ASR] worker crashed:', e.message || e)
    for (const [id, p] of pending) {
      p.reject(new Error('ASR worker crashed: ' + (e.message || 'unknown error')))
      pending.delete(id)
    }
    worker = null
  }
  return worker
}

function call(msg: Record<string, unknown>, transfer: Transferable[], onProgress?: Pending['onProgress']): Promise<any> {
  const id = nextId++
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject, onProgress })
    getWorker().postMessage({ id, ...msg }, transfer)
  })
}

export async function loadModel(
  size: 'tiny' | 'base' | 'small',
  onProgress: (pct: number, detail: string) => void,
): Promise<void> {
  await call({ type: 'load', size }, [], onProgress)
}

export async function transcribe(
  size: 'tiny' | 'base' | 'small',
  lang: string,
  pcm: Float32Array,
  onProgress: (pct: number, detail: string) => void,
): Promise<WhisperSegment[]> {
  // Transfer, don't copy — asr-bg constructs a fresh Float32Array per chunk
  // and never touches it again after this call.
  const buf = pcm.buffer as ArrayBuffer
  return call({ type: 'transcribe', size, lang, pcm: buf }, [buf], onProgress)
}
