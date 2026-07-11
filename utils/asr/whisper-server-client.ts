import { pcmToWav } from './wav-encode'
import type { WhisperSegment } from './whisper-local'

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

/** POST a WAV chunk to the local ASR companion server; expects
 * `{ segments: [{ start, end, text }] }` (seconds relative to the chunk). */
export async function serverTranscribe(baseUrl: string, pcm: Float32Array, lang: string): Promise<WhisperSegment[]> {
  const wav = pcmToWav(pcm, 16000)
  const resp = await fetch(`${baseUrl}/transcribe`, {
    method: 'POST',
    headers: { 'Content-Type': 'audio/wav', 'X-Lang': lang },
    body: wav,
    signal: AbortSignal.timeout(60_000),
  })
  if (!resp.ok) throw new Error(`ASR server HTTP ${resp.status}`)
  const data = await resp.json()
  if (!Array.isArray(data?.segments)) throw new Error('ASR server: malformed response')
  return data.segments as WhisperSegment[]
}
