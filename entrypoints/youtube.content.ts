import type { Message, Settings, TokenInfo } from '../utils/types'
import { tokenize } from '../utils/tokenizer'
import { difficultyLabel, scoreTokens } from '../utils/scoring'
import { fetchCaptionText, fetchVideoInfo, pickTrack, videoIdFromUrl } from '../utils/youtube-captions'

const STYLE = `
#ci-yt-badge {
  display: block; width: fit-content;
  margin: 0 0 6px; padding: 3px 12px; border-radius: 12px;
  background: #1a1a2e; color: #cfe3ff; font-size: 13px; font-weight: 600;
  white-space: nowrap; font-family: "Roboto", sans-serif;
}
#ci-yt-badge .ci-label { color: #8ab4f8; font-weight: 400; }
.ci-thumb-badge {
  position: absolute; top: 6px; left: 6px; z-index: 100;
  padding: 1px 7px; border-radius: 10px;
  background: rgba(26,26,46,0.92); color: #cfe3ff;
  font-size: 12px; font-weight: 700;
}
#ci-score-results {
  position: fixed; right: 16px; bottom: 16px; z-index: 9999;
  background: #1a1a2e; color: #cfe3ff; border: 0; border-radius: 10px;
  padding: 10px 14px; font: 600 13px/1 sans-serif; cursor: pointer;
  box-shadow: 0 4px 20px rgba(0,0,0,0.5);
}
#ci-score-results:hover { background: #2d4a77; }
`

function send(msg: Message): Promise<any> {
  return browser.runtime.sendMessage(msg)
}

export default defineContentScript({
  matches: ['*://www.youtube.com/*'],
  runAt: 'document_idle',

  main() {
    let settings: Settings | null = null
    let currentVideoId: string | null = null

    const style = document.createElement('style')
    style.textContent = STYLE
    document.head.appendChild(style)

    async function analyzeAll(lang: string, tokens: string[]): Promise<Map<string, TokenInfo>> {
      const unique = [...new Set(tokens)]
      const map = new Map<string, TokenInfo>()
      for (let i = 0; i < unique.length; i += 500) {
        const res: Record<string, TokenInfo> = await send({
          type: 'ANALYZE_TOKENS',
          payload: { lang, tokens: unique.slice(i, i + 500) },
        }).catch(() => ({}))
        for (const [t, info] of Object.entries(res || {})) map.set(t, info)
      }
      return map
    }

    // ── Watch page badge ────────────────────────────────────

    function badgeHost(): HTMLElement | null {
      // YouTube reshuffles its watch-page DOM regularly — try several shapes.
      // The badge is inserted as our own block ABOVE the metadata, never
      // inside YouTube's h1 (Polymer re-renders fight foreign children there).
      return (
        document.querySelector<HTMLElement>('ytd-watch-metadata') ||
        document.querySelector<HTMLElement>('#above-the-fold') ||
        document.querySelector<HTMLElement>('#below')
      )
    }

    function setBadge(html: string) {
      let badge = document.getElementById('ci-yt-badge')
      if (!badge) {
        const host = badgeHost()
        if (!host) {
          console.info('[znam] no badge host found on this layout')
          return
        }
        badge = document.createElement('div')
        badge.id = 'ci-yt-badge'
        host.prepend(badge)
      }
      badge.innerHTML = html
    }

    async function scoreWatchPage(videoId: string) {
      if (!settings) settings = await send({ type: 'GET_SETTINGS' })
      if (!settings) return
      const lang = settings.targetLanguage
      setBadge('⏳')

      try {
        // InnerTube player API (ANDROID/IOS client): its caption URLs work
        // without the proof-of-origin token that blocks WEB-client timedtext,
        // and it stays correct after SPA navigation.
        const video = await fetchVideoInfo(videoId)
        if (videoId !== currentVideoId) return
        const track = pickTrack(video.tracks, lang)
        console.info('[znam] tracks:', video.tracks.map(t => t.languageCode + (t.isAsr ? '/asr' : '')).join(', ') || 'none',
          '→ picked:', track?.languageCode ?? 'none')
        if (!track) {
          setBadge(`<span class="ci-label">no ${lang} subs</span>`)
          return
        }
        const text = await fetchCaptionText(track.baseUrl)
        if (videoId !== currentVideoId) return
        const tokens = tokenize(text)
        const info = await analyzeAll(lang, tokens)
        if (videoId !== currentVideoId) return
        const score = scoreTokens(tokens, t => info.get(t))
        if (score.countableTokens < 30) {
          setBadge(`<span class="ci-label">subs too short</span>`)
          return
        }
        const pct = Math.round(score.score * 100)
        setBadge(`${pct}% <span class="ci-label">${difficultyLabel(score.score)}${track.isAsr ? ' · auto-subs' : ''}</span>`)

        send({
          type: 'SAVE_LIBRARY_ENTRY',
          payload: {
            id: `yt:${videoId}`,
            url: `https://www.youtube.com/watch?v=${videoId}`,
            title: video.title || document.title.replace(/ - YouTube$/, ''),
            lang,
            kind: 'youtube',
            score: score.score,
            countableTokens: score.countableTokens,
            knownTokens: score.knownTokens,
            uniqueLemmas: Object.keys(score.lemmaCounts).length,
            unknownLemmas: score.uniqueUnknown.length,
            lemmaCounts: score.lemmaCounts,
            excerpt: text.slice(0, 200),
            pinned: false,
          },
        }).catch(() => {})
      } catch (err) {
        console.warn('[znam yt]', err)
        if (videoId === currentVideoId) setBadge(`<span class="ci-label">n/a</span>`)
      }
    }

    function onNavigation() {
      const videoId = videoIdFromUrl(location.href)
      console.info('[znam] navigation:', location.pathname, videoId ?? '')
      if (videoId) {
        if (videoId === currentVideoId) return
        currentVideoId = videoId
        document.getElementById('ci-yt-badge')?.remove()
        document.getElementById('ci-score-results')?.remove()
        // The metadata section renders shortly after yt-navigate-finish;
        // after ~5s we score anyway and fall back to the floating badge.
        const tryScore = (attempt = 0) => {
          if (videoId !== currentVideoId) return
          if (badgeHost() || attempt >= 10) scoreWatchPage(videoId)
          else setTimeout(() => tryScore(attempt + 1), 500)
        }
        tryScore()
      } else {
        currentVideoId = null
        document.getElementById('ci-yt-badge')?.remove()
        // Any browse surface with thumbnails can be scored on demand
        ensureScoreResultsButton()
      }
    }

    // ── Search results scoring ──────────────────────────────

    function ensureScoreResultsButton() {
      if (document.getElementById('ci-score-results')) return
      const btn = document.createElement('button')
      btn.id = 'ci-score-results'
      btn.textContent = '% Score results'
      btn.addEventListener('click', scoreSearchResults)
      document.body.appendChild(btn)
    }

    function collectResultVideos(): Map<string, HTMLElement> {
      const out = new Map<string, HTMLElement>()
      for (const a of document.querySelectorAll<HTMLAnchorElement>('a#thumbnail[href*="v="], a.yt-lockup-view-model-wiz__content-image[href*="v="]')) {
        const id = videoIdFromUrl(a.href)
        if (!id || out.has(id)) continue
        out.set(id, a)
      }
      return out
    }

    async function scoreSearchResults() {
      if (!settings) settings = await send({ type: 'GET_SETTINGS' })
      if (!settings) return
      const btn = document.getElementById('ci-score-results') as HTMLButtonElement | null
      if (btn) {
        btn.disabled = true
        btn.textContent = '⏳ Scoring…'
      }
      const videos = collectResultVideos()
      console.info(`[znam] scoring ${videos.size} thumbnails`)
      const scores: Record<string, number | null> = await send({
        type: 'SCORE_VIDEOS',
        payload: {
          lang: settings.targetLanguage,
          videoIds: [...videos.keys()].slice(0, 30),
        },
      }).catch(() => ({}))

      for (const [id, anchor] of videos) {
        if (!(id in scores)) continue
        const holder = anchor.closest<HTMLElement>('ytd-thumbnail, .yt-lockup-view-model-wiz__content-image') || anchor
        if (holder.querySelector('.ci-thumb-badge')) continue
        if (getComputedStyle(holder).position === 'static') holder.style.position = 'relative'
        const chip = document.createElement('span')
        chip.className = 'ci-thumb-badge'
        const s = scores[id]
        chip.textContent = s == null ? 'n/a' : `${Math.round(s * 100)}%`
        if (s != null) chip.title = difficultyLabel(s)
        holder.appendChild(chip)
      }
      if (btn) {
        btn.disabled = false
        btn.textContent = '% Score results'
      }
    }

    // ── Wire-up ─────────────────────────────────────────────

    document.addEventListener('yt-navigate-finish', () => setTimeout(onNavigation, 300))
    browser.runtime.onMessage.addListener((message: any, _sender, sendResponse) => {
      if (message?.type === 'SETTINGS_UPDATED') {
        settings = message.payload
        sendResponse({ ok: true })
      }
      return false
    })
    onNavigation()
  },
})
