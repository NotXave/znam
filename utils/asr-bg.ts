import type { AsrEvent, AsrRequest, SubtitleCue } from './types'
import { getSettings } from './settings'
import type { WhisperSegment } from './asr/whisper-local'
import { checkServerHealth, serverTranscribe } from './asr/whisper-server-client'
import { cloudTranscribe } from './asr/whisper-cloud'

// @huggingface/transformers is large (WASM/ONNX runtime) — dynamically
// imported so it's only fetched when Netflix ASR is actually used, the same
// way manga-ocr-bg.ts defers tesseract.js. A static top-level import would
// bake the whole runtime into background.js for every user.
async function localEngine() {
  return import('./asr/whisper-local')
}

type Tier = 'local' | 'server' | 'cloud'

const MAX_BACKLOG_SEC = 20

/**
 * Handles Port 'asr'. One port connection = one viewing session: ASR_STOP
 * pauses (clears the queue) without disconnecting, so a loaded local model
 * survives pause/resume without paying the load cost twice.
 */
export function handleAsrPort(port: any): void {
  const post = (event: AsrEvent) => {
    try { port.postMessage(event) } catch { /* port closed */ }
  }

  let lang = 'pl'
  let tier: Tier = 'local'
  let modelSize: 'tiny' | 'base' | 'small' = 'tiny'
  let serverUrl = ''
  let cloudApiKey = ''
  let running = false
  let processing = false
  let serverFallbackWarned = false
  const queue: { seq: number; pcm: Float32Array; startTime: number; rate: number }[] = []

  function queuedSeconds(): number {
    return queue.reduce((s, c) => s + c.pcm.length / 16000, 0)
  }

  async function runInference(pcm: Float32Array): Promise<WhisperSegment[]> {
    if (tier === 'cloud') {
      return cloudTranscribe(cloudApiKey, pcm, lang)
    }
    if (tier === 'server') {
      // Health-gated per chunk (10s cache in checkServerHealth), never a
      // permanent downgrade: if the user starts the companion server
      // mid-session, the very next chunk picks it up again.
      try {
        if (!(await checkServerHealth(serverUrl))) throw new Error('health check failed')
        const segments = await serverTranscribe(serverUrl, pcm, lang)
        serverFallbackWarned = false
        return segments
      } catch (err) {
        console.warn('[znam] ASR server request failed, falling back to local:', err)
        if (!serverFallbackWarned) {
          serverFallbackWarned = true
          post({
            type: 'ERROR',
            error: `ASR server not reachable at ${serverUrl} — using slow local fallback (tiny) until it's back.`,
            fatal: false,
          })
        }
        // Emergency fallback always uses tiny: browser-wasm inference with the
        // user's configured size (e.g. small) is far slower than real-time
        // and just floods the session with backlog drops.
        const { transcribe } = await localEngine()
        return transcribe('tiny', lang, pcm, (pct, detail) => post({ type: 'PROGRESS', step: 'load', pct, detail }))
      }
    }
    const { transcribe } = await localEngine()
    return transcribe(modelSize, lang, pcm, (pct, detail) => post({ type: 'PROGRESS', step: 'load', pct, detail }))
  }

  async function pump() {
    if (processing) return
    processing = true
    try {
      while (running && queue.length > 0) {
        const chunk = queue.shift()!
        try {
          const segments = await runInference(chunk.pcm)
          for (const seg of segments) {
            // Segment offsets are audio-seconds; scale by the playback rate
            // the window was captured at to land on the video clock (the
            // 1.5× pre-scan pass compresses 12s of video into 8s of audio).
            const cue: SubtitleCue = {
              start: chunk.startTime + seg.start * chunk.rate,
              end: chunk.startTime + seg.end * chunk.rate,
              text: seg.text,
            }
            post({ type: 'SEGMENT', seq: chunk.seq, cue })
          }
        } catch (err: any) {
          console.error('[znam] ASR transcription failed:', err)
          post({ type: 'ERROR', error: err.message || String(err), fatal: false })
        }
      }
    } finally {
      processing = false
    }
  }

  port.onMessage.addListener(async (msg: AsrRequest) => {
    if (msg.type === 'ASR_START') {
      lang = msg.lang
      running = true
      serverFallbackWarned = false
      const settings = await getSettings()
      tier = settings.netflixAsrTier
      modelSize = settings.netflixModelSize
      serverUrl = settings.netflixServerUrl
      cloudApiKey = settings.netflixCloudApiKey

      try {
        if (tier === 'server') {
          // Warn if the server is down right now, but do NOT downgrade the
          // tier — runInference retries the server per chunk, so starting
          // the companion server mid-session recovers automatically.
          const up = await checkServerHealth(serverUrl)
          if (!up) {
            serverFallbackWarned = true
            post({
              type: 'ERROR',
              error: `ASR server not reachable at ${serverUrl} — start it (server/start_asr_server.bat); using slow local fallback (tiny) until then.`,
              fatal: false,
            })
          }
        }
        if (tier === 'local') {
          const { loadModel } = await localEngine()
          await loadModel(modelSize, (pct, detail) => post({ type: 'PROGRESS', step: 'download', pct, detail }))
        }
        post({ type: 'READY', tier, model: tier === 'local' ? modelSize : undefined })
      } catch (err: any) {
        post({ type: 'ERROR', error: `could not start transcription: ${err.message || err}`, fatal: true })
        running = false
      }
    } else if (msg.type === 'ASR_CHUNK') {
      if (!running) return
      queue.push({ seq: msg.seq, pcm: new Float32Array(msg.pcm), startTime: msg.startTime, rate: msg.rate || 1 })
      while (queuedSeconds() > MAX_BACKLOG_SEC && queue.length > 1) {
        queue.shift()
        post({ type: 'ERROR', error: 'falling behind — dropped audio to catch up', fatal: false })
      }
      pump()
    } else if (msg.type === 'ASR_STOP') {
      running = false
      queue.length = 0
      post({ type: 'STOPPED' })
    }
  })

  port.onDisconnect.addListener(() => {
    running = false
    queue.length = 0
  })
}
