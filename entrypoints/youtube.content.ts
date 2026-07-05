import type { LearningLevel, Message, Settings, TokenInfo, WordStatus } from '../utils/types'
import { tokenize } from '../utils/tokenizer'
import { difficultyLabel, scoreTokens } from '../utils/scoring'
import { fetchCaptionText, fetchVideoInfo, pickTrack, videoIdFromUrl } from '../utils/youtube-captions'
import { ReaderTooltip, type WordStatusApi } from '../shared/tooltip'
import { collectTextNodes, wrapTextNode } from '../shared/word-wrapper'

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
.ytp-caption-window-container .ci-word { cursor: pointer; }
.ytp-caption-window-container .ci-word:hover { text-decoration: underline dotted; }
.ytp-caption-window-container .ci-word.ci-unknown { background: rgba(96, 145, 255, 0.45); border-radius: 3px; }
.ytp-caption-window-container .ci-word.ci-l1 { background: rgba(193, 75, 75, 0.55); border-radius: 3px; }
.ytp-caption-window-container .ci-word.ci-l2 { background: rgba(193, 119, 75, 0.50); border-radius: 3px; }
.ytp-caption-window-container .ci-word.ci-l3 { background: rgba(255, 213, 0, 0.45); border-radius: 3px; }
.ytp-caption-window-container .ci-word.ci-l4 { background: rgba(143, 163, 46, 0.45); border-radius: 3px; }
.ytp-caption-window-container .ci-word.ci-l5 { background: rgba(93, 158, 74, 0.40); border-radius: 3px; }
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

    // ── Clickable subtitle words ────────────────────────────
    // Wraps the rendered caption text in .ci-word spans: click → tooltip
    // with translation + Learning/Known/Ignore buttons. Marking words while
    // watching continuously refines the knowledge base ("calibration over
    // time"). Pattern from language-reactor-clone's caption injection.

    const tokenInfo = new Map<string, TokenInfo>()
    interface LiveStatus { status: WordStatus | 'unknown' | 'name'; level?: LearningLevel }
    const lemmaStatus = new Map<string, LiveStatus>()

    const statusApi: WordStatusApi = {
      lemmaFor(span) {
        return span.dataset.lemma || (span.dataset.word || '').toLowerCase()
      },
      statusFor(lemma) {
        const s = lemmaStatus.get(lemma)?.status
        return s === 'name' ? 'unknown' : (s ?? 'unknown')
      },
      levelFor(lemma) {
        return lemmaStatus.get(lemma)?.level
      },
      set(lemma, status, extras) {
        if (!settings) return
        lemmaStatus.set(lemma, { status, level: status === 'learning' ? (extras?.level ?? 1) : undefined })
        repaintLemma(lemma)
        send({
          type: 'SET_WORD_STATUS',
          payload: {
            lang: settings.targetLanguage,
            lemma,
            status,
            level: extras?.level,
            translation: extras?.translation,
            context: extras?.context,
            source: extras?.translation ? 'click' : 'manual',
          },
        }).catch(() => {})
      },
    }

    const tooltip = new ReaderTooltip(send, statusApi)
    tooltip.attach()

    // Clicking a subtitle word pauses the video (ReaderTooltip only calls
    // stopPropagation, so this capture listener still runs).
    document.addEventListener('click', (e) => {
      const t = e.target as HTMLElement
      if (t.closest?.('.ci-word') && t.closest('.ytp-caption-window-container')) {
        document.querySelector('video')?.pause()
      }
    }, true)

    function statusOf(token: string): TokenInfo | undefined {
      const info = tokenInfo.get(token)
      if (!info) return undefined
      const live = lemmaStatus.get(info.lemma)
      if (!live || (live.status === info.status && live.level === info.level)) return info
      return { lemma: info.lemma, status: live.status, level: live.level }
    }

    const HIGHLIGHT_CLASSES = ['ci-unknown', 'ci-l1', 'ci-l2', 'ci-l3', 'ci-l4', 'ci-l5']

    function paintSpan(span: HTMLElement) {
      const info = statusOf(span.dataset.word || '')
      span.classList.remove(...HIGHLIGHT_CLASSES)
      if (!info) return
      span.dataset.lemma = info.lemma
      if (info.status === 'unknown') span.classList.add('ci-unknown')
      else if (info.status === 'learning') span.classList.add(`ci-l${info.level ?? 1}`)
    }

    function repaintLemma(lemma: string) {
      const sel = `.ci-word[data-lemma="${CSS.escape(lemma)}"]`
      for (const span of document.querySelectorAll<HTMLElement>(sel)) paintSpan(span)
    }

    let captionObserver: MutationObserver | null = null
    let captionPoll: ReturnType<typeof setInterval> | null = null
    let injectTimer: ReturnType<typeof setTimeout> | null = null
    let injecting = false

    async function injectCaptions() {
      const cw = document.querySelector<HTMLElement>('.ytp-caption-window-container')
      if (!cw || !settings) return
      // Tooltip reads the language pair from this ancestor
      cw.dataset.from = settings.targetLanguage
      cw.dataset.to = settings.nativeLanguage

      injecting = true
      const spans: HTMLElement[] = []
      try {
        for (const node of collectTextNodes(cw)) spans.push(...wrapTextNode(node))
      } finally {
        injecting = false
      }

      const pending = [...new Set(
        spans.map(s => s.dataset.word || '').filter(w => w && !tokenInfo.has(w)),
      )]
      for (const span of spans) paintSpan(span) // paint already-known tokens now
      if (pending.length === 0) return

      const res: Record<string, TokenInfo> = await send({
        type: 'ANALYZE_TOKENS',
        payload: { lang: settings.targetLanguage, tokens: pending },
      }).catch(() => ({}))
      for (const [t, info] of Object.entries(res || {})) {
        tokenInfo.set(t, info)
        if (!lemmaStatus.has(info.lemma)) lemmaStatus.set(info.lemma, { status: info.status, level: info.level })
      }
      for (const span of spans) {
        if (span.isConnected) paintSpan(span)
      }
    }

    function startCaptionReader() {
      if (captionPoll || captionObserver) return
      captionPoll = setInterval(() => {
        const cw = document.querySelector('.ytp-caption-window-container')
        if (!cw) return
        clearInterval(captionPoll!)
        captionPoll = null
        captionObserver = new MutationObserver(() => {
          if (injecting) return
          if (injectTimer) clearTimeout(injectTimer)
          injectTimer = setTimeout(injectCaptions, 30)
        })
        captionObserver.observe(cw, { childList: true, subtree: true, characterData: true })
        injectCaptions()
      }, 1000)
    }

    function stopCaptionReader() {
      if (captionPoll) {
        clearInterval(captionPoll)
        captionPoll = null
      }
      captionObserver?.disconnect()
      captionObserver = null
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
        startCaptionReader()
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
        stopCaptionReader()
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
        if (settings) tooltip.setPrimaryTranslation(settings.primaryTranslation)
        sendResponse({ ok: true })
      }
      return false
    })
    send({ type: 'GET_SETTINGS' })
      .then((s: Settings) => {
        settings = s
        if (s) tooltip.setPrimaryTranslation(s.primaryTranslation)
      })
      .catch(() => {})
    onNavigation()
  },
})
