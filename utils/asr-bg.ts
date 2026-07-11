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
  const queue: { seq: number; pcm: Float32Array; startTime: number }[] = []

  function queuedSeconds(): number {
    return queue.reduce((s, c) => s + c.pcm.length / 16000, 0)
  }

  async function runInference(pcm: Float32Array): Promise<WhisperSegment[]> {
    if (tier === 'cloud') {
      return cloudTranscribe(cloudApiKey, pcm, lang)
    }
    if (tier === 'server') {
      try {
        return await serverTranscribe(serverUrl, pcm, lang)
      } catch (err) {
        console.warn('[znam] ASR server request failed, falling back to local:', err)
        if (!serverFallbackWarned) {
          serverFallbackWarned = true
          post({
            type: 'ERROR',
            error: `ASR server not reachable at ${serverUrl} — falling back to local (slower) transcription.`,
            fatal: false,
          })
        }
        const { transcribe } = await localEngine()
        return transcribe(modelSize, lang, pcm, (pct, detail) => post({ type: 'PROGRESS', step: 'load', pct, detail }))
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
            const cue: SubtitleCue = {
              start: chunk.startTime + seg.start,
              end: chunk.startTime + seg.end,
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
          const up = await checkServerHealth(serverUrl)
          if (!up) {
            serverFallbackWarned = true
            post({
              type: 'ERROR',
              error: `ASR server not reachable at ${serverUrl} — using local transcription instead.`,
              fatal: false,
            })
            tier = 'local'
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
      queue.push({ seq: msg.seq, pcm: new Float32Array(msg.pcm), startTime: msg.startTime })
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
