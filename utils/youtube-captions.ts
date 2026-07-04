import { parseYouTubeJson3 } from './parser-json3'

export interface CaptionTrack {
  languageCode: string
  baseUrl: string
  isAsr: boolean
  name: string
}

export interface VideoInfo {
  title: string
  tracks: CaptionTrack[]
}

// The WEB client's timedtext URLs return empty bodies without a
// proof-of-origin token (verified 2026-07). The ANDROID/IOS InnerTube
// clients still hand out caption URLs that work as-is.
const INNERTUBE_CLIENTS = [
  { clientName: 'ANDROID', clientVersion: '20.10.38', androidSdkVersion: 30 },
  { clientName: 'IOS', clientVersion: '20.10.4', deviceModel: 'iPhone16,2' },
]

function parseTracks(data: any): CaptionTrack[] {
  const tracks = data?.captions?.playerCaptionsTracklistRenderer?.captionTracks
  if (!Array.isArray(tracks)) return []
  return tracks.map((t: any) => ({
    languageCode: t.languageCode || '',
    baseUrl: t.baseUrl || '',
    isAsr: t.kind === 'asr',
    name: t.name?.simpleText || t.name?.runs?.[0]?.text || t.languageCode || '',
  }))
}

/** Title + caption tracks via the InnerTube player API. */
export async function fetchVideoInfo(videoId: string): Promise<VideoInfo> {
  let lastError = 'no client succeeded'
  for (const client of INNERTUBE_CLIENTS) {
    try {
      const resp = await fetch('https://www.youtube.com/youtubei/v1/player?prettyPrint=false', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'omit',
        body: JSON.stringify({ context: { client: { hl: 'en', ...client } }, videoId }),
      })
      if (!resp.ok) {
        lastError = `player API HTTP ${resp.status}`
        continue
      }
      const data = await resp.json()
      const status = data?.playabilityStatus?.status
      const tracks = parseTracks(data)
      if (tracks.length > 0 || status === 'OK') {
        return { title: data?.videoDetails?.title || '', tracks }
      }
      lastError = `playability ${status}`
    } catch (e: any) {
      lastError = e.message || String(e)
    }
  }
  throw new Error(lastError)
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
  if (!text.trim()) throw new Error('timedtext empty (blocked)')
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
