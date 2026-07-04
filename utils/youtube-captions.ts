import { parseYouTubeJson3 } from './parser-json3'

export interface CaptionTrack {
  languageCode: string
  baseUrl: string
  isAsr: boolean
  name: string
}

/**
 * Extract ytInitialPlayerResponse from watch-page HTML. Fetching the HTML
 * (rather than reading DOM script tags) also works after SPA navigation,
 * where the inline scripts still describe the first-loaded video.
 */
export function extractPlayerResponse(html: string): any {
  const m = html.match(/ytInitialPlayerResponse\s*=\s*({.+?});(?:\s*var\b|\s*<\/script>)/s)
  if (!m) return null
  try {
    return JSON.parse(m[1])
  } catch {
    return null
  }
}

export function listCaptionTracks(playerResponse: any): CaptionTrack[] {
  const tracks = playerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks
  if (!Array.isArray(tracks)) return []
  return tracks.map((t: any) => ({
    languageCode: t.languageCode || '',
    baseUrl: t.baseUrl || '',
    isAsr: t.kind === 'asr',
    name: t.name?.simpleText || t.name?.runs?.[0]?.text || t.languageCode || '',
  }))
}

/** Track for the target language; manual subtitles beat auto-generated. */
export function pickTrack(tracks: CaptionTrack[], lang: string): CaptionTrack | null {
  const base = lang.split('-')[0].toLowerCase()
  const matching = tracks.filter(t => t.languageCode.split('-')[0].toLowerCase() === base && t.baseUrl)
  if (matching.length === 0) return null
  return matching.find(t => !t.isAsr) ?? matching[0]
}

/** Fetch a track as json3 and join the cue text. */
export async function fetchCaptionText(baseUrl: string): Promise<string> {
  const url = baseUrl.includes('fmt=')
    ? baseUrl.replace(/fmt=\w+/, 'fmt=json3')
    : `${baseUrl}&fmt=json3`
  const resp = await fetch(url, { credentials: 'omit' })
  if (!resp.ok) throw new Error(`timedtext HTTP ${resp.status}`)
  const text = await resp.text()
  if (!text.trim()) throw new Error('timedtext empty') // pot-token wall returns 200 + empty body
  const cues = parseYouTubeJson3(JSON.parse(text))
  return cues.map(c => c.text).join(' ')
}

export function videoIdFromUrl(url: string): string | null {
  try {
    const u = new URL(url, 'https://www.youtube.com')
    if (u.pathname === '/watch') return u.searchParams.get('v')
    const short = u.pathname.match(/^\/shorts\/([\w-]+)/)
    if (short) return short[1]
  } catch {}
  return null
}
