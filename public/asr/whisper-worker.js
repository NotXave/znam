// Whisper inference worker — runs OFF the background page's main thread.
//
// Why a worker: ONNX wasm inference blocks its thread for seconds per 8s
// audio window. Running it directly in the MV2 background page froze ALL
// extension messaging (popup wouldn't open, ANALYZE_TOKENS stalled) while
// transcribing. A dedicated worker isolates that completely.
//
// Device: tries WebGPU first (Firefox 141+ on Windows supports it, including
// in dedicated workers) and falls back to single-threaded wasm on any
// failure. Same q8 weights either way — no re-download when falling back.

import { pipeline, env } from './transformers.bundle.js'

const MODEL_IDS = {
  tiny: 'onnx-community/whisper-tiny',
  base: 'onnx-community/whisper-base',
  small: 'onnx-community/whisper-small',
}

// Whisper's `language` generate kwarg wants a full name, not an ISO code.
const LANG_NAMES = {
  pl: 'polish', en: 'english', de: 'german', es: 'spanish', fr: 'french',
  it: 'italian', pt: 'portuguese', nl: 'dutch', ru: 'russian', uk: 'ukrainian',
  cs: 'czech', sk: 'slovak', ja: 'japanese', ko: 'korean', zh: 'chinese',
}

env.allowLocalModels = false
env.useBrowserCache = true
const wasm = env.backends?.onnx?.wasm
if (wasm) {
  // ONNX runtime files ship inside the extension (CSP forbids the CDN).
  wasm.wasmPaths = new URL('./ort/', import.meta.url).href
  wasm.numThreads = 1 // no SharedArrayBuffer without COOP/COEP
  wasm.proxy = false
}

let transcriber = null
let loadedModel = ''
let activeDevice = ''

async function ensurePipeline(size, post) {
  const modelId = MODEL_IDS[size] ?? MODEL_IDS.tiny
  if (transcriber && loadedModel === modelId) return transcriber

  const common = {
    dtype: 'q8',
    // 'basic' skips ORT's TransposeDQWeightsForMatMulNBits fusion pass,
    // which fails session creation on these q8 whisper exports
    // ("Missing required scale … MatMulNBits").
    session_options: { graphOptimizationLevel: 'basic' },
    progress_callback: (p) => {
      if (p.status === 'progress' && typeof p.progress === 'number') {
        post({ type: 'progress', pct: Math.round(p.progress), detail: p.file || modelId })
      }
    },
  }

  let pipe = null
  let device = 'wasm'
  try {
    if (navigator.gpu && (await navigator.gpu.requestAdapter())) {
      pipe = await pipeline('automatic-speech-recognition', modelId, { ...common, device: 'webgpu' })
      device = 'webgpu'
    }
  } catch (err) {
    console.warn('[znam ASR worker] webgpu init failed, falling back to wasm:', err)
    pipe = null
  }
  if (!pipe) pipe = await pipeline('automatic-speech-recognition', modelId, { ...common, device: 'wasm' })

  transcriber = pipe
  loadedModel = modelId
  activeDevice = device
  console.log('[znam ASR worker] pipeline ready on', device)
  post({ type: 'device', device })
  return pipe
}

// One inference at a time — the pipeline isn't safe for overlapping calls.
let busy = Promise.resolve()

self.onmessage = (e) => {
  const msg = e.data
  const post = (m) => self.postMessage({ id: msg.id, ...m })

  if (msg.type === 'load') {
    ensurePipeline(msg.size, post)
      .then(() => post({ type: 'done', device: activeDevice }))
      .catch((err) => post({ type: 'error', error: err?.message || String(err) }))
  } else if (msg.type === 'transcribe') {
    const run = busy.then(async () => {
      const model = await ensurePipeline(msg.size, post)
      const language = LANG_NAMES[(msg.lang || '').split('-')[0]] // undefined → auto-detect
      const pcm = new Float32Array(msg.pcm)
      const t0 = performance.now()
      const result = await model(pcm, {
        language,
        task: 'transcribe',
        return_timestamps: true,
        chunk_length_s: 30,
      })
      console.log('[znam ASR worker]', (pcm.length / 16000).toFixed(1) + 's audio in', Math.round(performance.now() - t0) + 'ms (' + activeDevice + ')')
      const chunks = result?.chunks ?? []
      let segments
      if (chunks.length > 0) {
        segments = chunks
          .filter((c) => c.text.trim())
          .map((c) => ({ start: c.timestamp[0] ?? 0, end: c.timestamp[1] ?? c.timestamp[0] ?? 0, text: c.text.trim() }))
      } else {
        const text = (result?.text || '').trim()
        segments = text ? [{ start: 0, end: pcm.length / 16000, text }] : []
      }
      post({ type: 'done', segments })
    }).catch((err) => post({ type: 'error', error: err?.message || String(err) }))
    busy = run.catch(() => {})
  }
}
