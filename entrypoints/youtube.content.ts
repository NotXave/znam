import type { LearningLevel, Message, Settings, TokenInfo, WordStatus } from '../utils/types'
import { tokenize } from '../utils/tokenizer'
import { difficultyLabel, scoreTokens } from '../utils/scoring'
import { fetchCaptionCues, fetchVideoInfo, pickTrack, videoIdFromUrl } from '../utils/youtube-captions'
import type { SubtitleCue } from '../utils/types'
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
#ci-yt-badge .ci-panel-toggle {
  margin-left: 8px; padding: 1px 8px; border: 0; border-radius: 10px;
  background: #2d4a77; color: #cfe3ff; font-size: 12px; cursor: pointer;
}
#ci-yt-badge .ci-panel-toggle:hover { background: #3a5d94; }
#ci-sub-panel {
  margin: 0 0 12px; padding: 12px 16px; border-radius: 12px;
  background: #14141f; color: #eee; font-family: "Roboto", sans-serif;
}
#ci-sub-panel .ci-sub-target { font-size: 20px; line-height: 1.5; }
#ci-sub-panel .ci-sub-target .ci-word { cursor: pointer; }
#ci-sub-panel .ci-sub-target .ci-word:hover { text-decoration: underline dotted; }
#ci-sub-panel .ci-sub-target .ci-word.ci-unknown { background: rgba(96,145,255,0.22); border-radius: 3px; }
#ci-sub-panel .ci-sub-target .ci-word.ci-l1 { background: rgba(193,75,75,0.30); border-radius: 3px; }
#ci-sub-panel .ci-sub-target .ci-word.ci-l2 { background: rgba(193,119,75,0.28); border-radius: 3px; }
#ci-sub-panel .ci-sub-target .ci-word.ci-l3 { background: rgba(255,213,0,0.28); border-radius: 3px; }
#ci-sub-panel .ci-sub-target .ci-word.ci-l4 { background: rgba(143,163,46,0.26); border-radius: 3px; }
#ci-sub-panel .ci-sub-target .ci-word.ci-l5 { background: rgba(93,158,74,0.22); border-radius: 3px; }
#ci-sub-panel .ci-sub-native { color: #9ab; font-size: 15px; margin-top: 6px; min-height: 18px; }
#ci-sub-panel .ci-sub-controls { display: flex; gap: 6px; align-items: center; margin-top: 10px; }
#ci-sub-panel .ci-sub-controls button {
  background: #242440; color: #cfe3ff; border: 0; border-radius: 6px;
  padding: 5px 10px; font-size: 13px; cursor: pointer;
}
#ci-sub-panel .ci-sub-controls button:hover { background: #2d4a77; }
#ci-sub-panel .ci-sub-controls button.active { background: #2d6e3e; }
#ci-sub-panel .ci-sub-controls .ci-sub-spacer { flex: 1; }
#ci-sub-panel .ci-sub-hint { color: #666; font-size: 11px; }
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

    // Auto level progression, per video: learning words seen in the subtitles
    // but not looked up advance a level over repeated videos.
    let videoExposureLemmas = new Set<string>()
    let ytInteracted = new Set<string>()
    let ytExposuresSent = false

    function sendVideoExposures() {
      if (ytExposuresSent || !settings || videoExposureLemmas.size === 0) return
      const lemmas = [...videoExposureLemmas].filter(l => !ytInteracted.has(l))
      if (lemmas.length === 0) return
      ytExposuresSent = true
      send({ type: 'RECORD_EXPOSURES', payload: { lang: settings.targetLanguage, lemmas } }).catch(() => {})
    }

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
        ytInteracted.add(lemma)
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
      setTranslation(lemma, translation) {
        if (!settings) return
        ytInteracted.add(lemma)
        send({
          type: 'SET_WORD_TRANSLATION',
          payload: { lang: settings.targetLanguage, lemma, translation },
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

    // ── Pinned subtitle panel (Language-Reactor-style) ──────
    // A stable, always-visible panel below the video: the current subtitle
    // line with clickable/colored words + its translation + line controls,
    // and an optional auto-pause at the end of each line. Uses the timed cues
    // fetched for scoring, synced to the video clock.

    let activeCues: SubtitleCue[] = []
    let subtitlePanelOn = false
    let autoPause = false
    let panel: HTMLElement | null = null
    let panelRaf = 0
    let panelCueIndex = -1
    let lastPauseCue = -1
    const nativeCache = new Map<number, string>()

    function video(): HTMLVideoElement | null {
      return document.querySelector('video.html5-main-video') || document.querySelector('video')
    }

    function panelHost(): HTMLElement | null {
      return badgeHost()
    }

    function cueIndexAt(t: number): number {
      // Last cue whose start is ≤ t (keeps the previous line pinned in gaps)
      let idx = -1
      for (let i = 0; i < activeCues.length; i++) {
        if (activeCues[i].start <= t + 0.05) idx = i
        else break
      }
      return idx
    }

    function toggleSubtitlePanel() {
      if (subtitlePanelOn) closeSubtitlePanel()
      else openSubtitlePanel()
    }

    function openSubtitlePanel() {
      subtitlePanelOn = true
      if (activeCues.length === 0) return
      if (!panel) {
        const host = panelHost()
        if (!host) return
        panel = document.createElement('div')
        panel.id = 'ci-sub-panel'
        if (settings) {
          panel.dataset.from = settings.targetLanguage
          panel.dataset.to = settings.nativeLanguage
        }
        panel.innerHTML = `
          <div class="ci-sub-target"></div>
          <div class="ci-sub-native"></div>
          <div class="ci-sub-controls">
            <button class="ci-prev" title="Previous line">⏮</button>
            <button class="ci-replay" title="Replay this line">🔁</button>
            <button class="ci-playpause" title="Play / pause">⏯</button>
            <button class="ci-next" title="Next line">⏭</button>
            <button class="ci-autopause" title="Pause at the end of every line">⏸ Auto-pause</button>
            <span class="ci-sub-spacer"></span>
            <span class="ci-sub-hint">click a word to look it up & mark it</span>
            <button class="ci-close" title="Hide panel">✕</button>
          </div>`
        host.prepend(panel)
        panel.querySelector('.ci-prev')!.addEventListener('click', () => seekCue(panelCueIndex - 1))
        panel.querySelector('.ci-replay')!.addEventListener('click', () => seekCue(panelCueIndex))
        panel.querySelector('.ci-next')!.addEventListener('click', () => seekCue(panelCueIndex + 1))
        panel.querySelector('.ci-playpause')!.addEventListener('click', () => {
          const v = video()
          if (v) v.paused ? v.play() : v.pause()
        })
        panel.querySelector('.ci-autopause')!.addEventListener('click', (e) => {
          autoPause = !autoPause
          ;(e.currentTarget as HTMLElement).classList.toggle('active', autoPause)
        })
        panel.querySelector('.ci-close')!.addEventListener('click', closeSubtitlePanel)
      }
      panelCueIndex = -1
      startPanelLoop()
    }

    function closeSubtitlePanel() {
      subtitlePanelOn = false
      cancelAnimationFrame(panelRaf)
      panelRaf = 0
      panel?.remove()
      panel = null
    }

    function seekCue(index: number) {
      const i = Math.max(0, Math.min(activeCues.length - 1, index))
      const v = video()
      if (v && activeCues[i]) {
        v.currentTime = activeCues[i].start + 0.01
        lastPauseCue = i // don't immediately auto-pause the line we jumped to
        v.play()
      }
    }

    function startPanelLoop() {
      cancelAnimationFrame(panelRaf)
      const tick = () => {
        if (!subtitlePanelOn) return
        const v = video()
        if (v && activeCues.length) {
          const idx = cueIndexAt(v.currentTime)
          if (idx !== panelCueIndex && idx >= 0) {
            panelCueIndex = idx
            renderPanelCue(idx)
          }
          // Auto-pause once, just past the end of the current line
          if (autoPause && idx >= 0 && idx !== lastPauseCue &&
              v.currentTime >= activeCues[idx].end - 0.05 && !v.paused) {
            lastPauseCue = idx
            v.pause()
          }
        }
        panelRaf = requestAnimationFrame(tick)
      }
      panelRaf = requestAnimationFrame(tick)
    }

    async function renderPanelCue(index: number) {
      if (!panel || !settings) return
      const cue = activeCues[index]
      if (!cue) return
      const target = panel.querySelector('.ci-sub-target') as HTMLElement
      const native = panel.querySelector('.ci-sub-native') as HTMLElement

      // Render + wrap the target line, then analyze & paint statuses
      target.textContent = cue.text
      const spans: HTMLElement[] = []
      for (const node of collectTextNodes(target)) spans.push(...wrapTextNode(node))
      const pending = [...new Set(spans.map(s => s.dataset.word || '').filter(w => w && !tokenInfo.has(w)))]
      for (const s of spans) paintSpan(s)
      if (pending.length) {
        const res: Record<string, TokenInfo> = await send({
          type: 'ANALYZE_TOKENS',
          payload: { lang: settings.targetLanguage, tokens: pending },
        }).catch(() => ({}))
        for (const [t, info] of Object.entries(res || {})) {
          tokenInfo.set(t, info)
          if (!lemmaStatus.has(info.lemma)) lemmaStatus.set(info.lemma, { status: info.status, level: info.level })
        }
        if (panelCueIndex === index) for (const s of spans) if (s.isConnected) paintSpan(s)
      }

      // Translation of the whole line (cached per cue)
      if (nativeCache.has(index)) {
        native.textContent = nativeCache.get(index)!
      } else {
        native.textContent = '…'
        const r = await send({
          type: 'TRANSLATE',
          payload: { text: cue.text, from: settings.targetLanguage, to: settings.nativeLanguage },
        }).catch(() => null)
        const translated = (r && typeof r === 'object' ? r.text : '') || ''
        nativeCache.set(index, translated)
        if (panelCueIndex === index) native.textContent = translated
      }
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
        const cues = await fetchCaptionCues(track.baseUrl)
        if (videoId !== currentVideoId) return
        activeCues = cues
        const text = cues.map(c => c.text).join(' ')
        const tokens = tokenize(text)
        const info = await analyzeAll(lang, tokens)
        if (videoId !== currentVideoId) return
        // Every learning word in this video's subtitles is a passive exposure
        for (const inf of info.values()) {
          if (inf.status === 'learning') videoExposureLemmas.add(inf.lemma)
        }
        const score = scoreTokens(tokens, t => info.get(t))
        if (score.countableTokens < 30) {
          setBadge(`<span class="ci-label">subs too short</span>`)
          return
        }
        const pct = Math.round(score.score * 100)
        setBadge(
          `${pct}% <span class="ci-label">${difficultyLabel(score.score)}${track.isAsr ? ' · auto-subs' : ''}</span>` +
          `<button class="ci-panel-toggle" title="Show a pinned, clickable subtitle panel below the video">📌 Subtitles</button>`,
        )
        document.getElementById('ci-yt-badge')?.querySelector('.ci-panel-toggle')
          ?.addEventListener('click', toggleSubtitlePanel)
        if (subtitlePanelOn) openSubtitlePanel()

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
        sendVideoExposures() // for the video we're leaving
        currentVideoId = videoId
        document.getElementById('ci-yt-badge')?.remove()
        document.getElementById('ci-score-results')?.remove()
        // New video: drop the old cues/translations; keep the panel open if
        // the user had it on (it repopulates once the new cues load).
        activeCues = []
        nativeCache.clear()
        panelCueIndex = -1
        lastPauseCue = -1
        panel?.remove()
        panel = null
        videoExposureLemmas = new Set()
        ytInteracted = new Set()
        ytExposuresSent = false
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
        sendVideoExposures() // leaving a watch page for a browse surface
        currentVideoId = null
        document.getElementById('ci-yt-badge')?.remove()
        closeSubtitlePanel()
        activeCues = []
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
    window.addEventListener('pagehide', sendVideoExposures)
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
