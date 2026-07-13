// Local, in-browser Whisper transcription via transformers.js (WASM/ONNX).
//
// IMPORTANT: this module intentionally does NOT `import ... from
// '@huggingface/transformers'` as a normal value import. That package bundles
// onnxruntime-web's full JS surface, which a static import inflates
// background.js to 60MB+ (WXT's Firefox MV2 background build is a single
// IIFE bundle with no real code-splitting, so even a dynamic `import()` of
// the bare npm specifier gets inlined). Instead, the package's own prebuilt
// browser bundle (`transformers.web.min.js`, ~430KB) is committed to
// `public/asr/` and loaded via a *computed* dynamic import — `/* @vite-ignore
// */` stops Vite from trying to analyze/bundle it, so it stays a genuine
// runtime fetch of a local extension file. This is the same "heavy engine
// lives in public/, background.ts only orchestrates it" shape as Tesseract's
// worker+wasm files in public/tesseract/ (see utils/ocr/tesseract-host.ts).
//
// The actual Whisper model weights (and the ONNX WASM runtime binaries
// transformers.js needs) are NOT bundled — they're fetched from Hugging
// Face's CDN on first use and cached via `env.useBrowserCache` (Cache
// Storage), matching the project's established "download on first use,
// nothing heavy bundled by default" pattern (see utils/language-setup.ts).
//
// UNVERIFIED: this is the riskiest part of the Netflix ASR feature — it has
// not been exercised in a real Firefox background page. If it doesn't pan
// out (WASM path resolution, IIFE/module compatibility, or raw CPU inference
// speed), the 'server' tier (a local companion Python server, same shape as
// the manga OCR server) is the fallback most likely to work reliably.

type TransformersModule = typeof import('@huggingface/transformers')
let modPromise: Promise<TransformersModule> | null = null

async function loadTransformers(): Promise<TransformersModule> {
  if (!modPromise) {
    // Self-contained bundle built with esbuild (see scripts/build-transformers,
    // or the committed public/asr/transformers.bundle.js). Unlike the raw
    // dist/transformers.web.min.js this resolves onnxruntime-web's bare module
    // specifiers at build time — the raw file did `import('onnxruntime-web/
    // webgpu')` at runtime, which a browser without an import map rejects
    // ("bare specifier … was not remapped"), the exact error users hit.
    const url = browser.runtime.getURL('/asr/transformers.bundle.js' as any)
    modPromise = import(/* @vite-ignore */ url) as Promise<TransformersModule>
  }
  return modPromise
}

// Models are multilingual (NOT the .en-suffixed English-only variants) and
// downloaded on first use only.
const MODEL_IDS: Record<string, string> = {
  tiny: 'onnx-community/whisper-tiny',
  base: 'onnx-community/whisper-base',
  small: 'onnx-community/whisper-small',
}

// Whisper's `language` generate kwarg wants a full name, not an ISO code.
const LANG_NAMES: Record<string, string> = {
  pl: 'polish', en: 'english', de: 'german', es: 'spanish', fr: 'french',
  it: 'italian', pt: 'portuguese', nl: 'dutch', ru: 'russian', uk: 'ukrainian',
  cs: 'czech', sk: 'slovak', ja: 'japanese', ko: 'korean', zh: 'chinese',
}

let currentModel: string | null = null
let transcriber: any = null
let loadPromise: Promise<any> | null = null

export async function loadModel(
  size: 'tiny' | 'base' | 'small',
  onProgress: (pct: number, detail: string) => void,
): Promise<any> {
  const modelId = MODEL_IDS[size] ?? MODEL_IDS.tiny
  if (transcriber && currentModel === modelId) return transcriber
  if (loadPromise && currentModel === modelId) return loadPromise

  currentModel = modelId
  loadPromise = loadTransformers().then(({ pipeline, env }) => {
    env.allowLocalModels = false
    env.useBrowserCache = true
    // The ONNX WASM runtime is served from the packaged extension, not a CDN:
    // a Firefox MV2 extension's `script-src 'self'` CSP blocks importing the
    // loader .mjs from jsdelivr (transformers.js's default wasmPaths). Point
    // it at the local copy and force single-threaded — threaded WASM needs
    // SharedArrayBuffer/COOP-COEP we don't have.
    const wasm = env.backends?.onnx?.wasm
    if (wasm) {
      wasm.wasmPaths = browser.runtime.getURL('/asr/ort/' as any)
      wasm.numThreads = 1
      wasm.proxy = false
    }
    return pipeline('automatic-speech-recognition', modelId, {
      // Force 8-bit quantisation. transformers.js otherwise defaults the
      // decoder to q4 (4-bit MatMulNBits), which this onnxruntime-web build
      // can't build a session for ("Missing required scale … MatMulNBits").
      // q8 uses plain DequantizeLinear — well supported on the wasm backend —
      // and keeps the download small. fp16 needs webgpu (absent here).
      dtype: 'q8',
      device: 'wasm',
      progress_callback: (p: any) => {
        if (p.status === 'progress' && typeof p.progress === 'number') {
          onProgress(Math.round(p.progress), p.file || modelId)
        }
      },
    })
  }).then((p) => {
    transcriber = p
    return transcriber
  }).catch((err) => {
    loadPromise = null
    currentModel = null
    throw err
  })
  return loadPromise
}

export interface WhisperSegment {
  /** Seconds, relative to the start of the audio window passed in. */
  start: number
  end: number
  text: string
}

// The pipeline instance is not safe for concurrent overlapping calls —
// serialize inference the same way tesseract-host.ts's withWorker() does.
let busy: Promise<unknown> = Promise.resolve()

export async function transcribe(
  size: 'tiny' | 'base' | 'small',
  lang: string,
  pcm: Float32Array,
  onProgress: (pct: number, detail: string) => void,
): Promise<WhisperSegment[]> {
  const model = await loadModel(size, onProgress)
  const run = busy.then(async () => {
    const language = LANG_NAMES[lang.split('-')[0]] // undefined → auto-detect
    const result: any = await model(pcm, {
      language,
      task: 'transcribe',
      return_timestamps: true,
      chunk_length_s: 30,
    })
    const chunks: { timestamp: [number, number | null]; text: string }[] = result?.chunks ?? []
    if (chunks.length > 0) {
      return chunks
        .filter((c) => c.text.trim())
        .map((c) => ({ start: c.timestamp[0] ?? 0, end: c.timestamp[1] ?? c.timestamp[0] ?? 0, text: c.text.trim() }))
    }
    const text = (result?.text || '').trim()
    return text ? [{ start: 0, end: pcm.length / 16000, text }] : []
  })
  busy = run.catch(() => {})
  return run
}
