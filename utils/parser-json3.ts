import type { SubtitleCue } from './types'

export function parseYouTubeJson3(json: any): SubtitleCue[] {
  if (!json?.events) return []
  return json.events
    .filter((e: any) => e.segs?.length > 0)
    .map((e: any, i: number) => ({
      id: `yt-cue-${i}`,
      start: (e.tStartMs || 0) / 1000,
      end: ((e.tStartMs || 0) + (e.dDurationMs || 3000)) / 1000,
      text: e.segs
        .map((s: any) => s.utf8 || '')
        .join('')
        .replace(/\n/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&#39;/g, "'")
        .replace(/&quot;/g, '"')
        .trim(),
    }))
    .filter((c: SubtitleCue) => c.text.length > 0)
}
