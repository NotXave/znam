import { pcmToWav } from './wav-encode'
import type { WhisperSegment } from './whisper-local'

// OpenAI's Whisper transcription API, user's own key. Unlike deepl.ts this is
// an official, keyed API — throttling here is politeness/cost-control, not
// evasion of a rate wall. Cache is in-memory ONLY and never persisted to
// disk: captured audio is far more sensitive than translated text, and
// nothing about a Netflix episode should linger after the background page
// restarts.

const ENDPOINT = 'https://api.openai.com/v1/audio/transcriptions'
const MIN_INTERVAL_MS = 400

let lastRequestAt = 0
let queue: Promise<unknown> = Promise.resolve()

/** Best-effort cloud transcription; throws on failure — caller decides how to degrade. */
export async function cloudTranscribe(apiKey: string, pcm: Float32Array, lang: string): Promise<WhisperSegment[]> {
  if (!apiKey.trim()) throw new Error('no OpenAI API key configured')

  const run = queue.then(async (): Promise<WhisperSegment[]> => {
    const wait = lastRequestAt + MIN_INTERVAL_MS - Date.now()
    if (wait > 0) await new Promise((r) => setTimeout(r, wait))
    lastRequestAt = Date.now()

    const wav = pcmToWav(pcm, 16000)
    const form = new FormData()
    form.append('file', wav, 'chunk.wav')
    form.append('model', 'whisper-1')
    form.append('response_format', 'verbose_json')
    if (lang) form.append('language', lang.split('-')[0])

    const resp = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
      signal: AbortSignal.timeout(60_000),
    })
    if (!resp.ok) {
      const body = await resp.text().catch(() => '')
      throw new Error(`OpenAI HTTP ${resp.status}: ${body.slice(0, 200)}`)
    }
    const data = await resp.json()
    const segments: any[] = Array.isArray(data?.segments) ? data.segments : []
    if (segments.length > 0) {
      return segments
        .map((s) => ({ start: s.start ?? 0, end: s.end ?? s.start ?? 0, text: (s.text || '').trim() }))
        .filter((s) => s.text)
    }
    const text = (data?.text || '').trim()
    return text ? [{ start: 0, end: pcm.length / 16000, text }] : []
  })
  queue = run.catch(() => {})
  return run
}
