import type {
  AsrEvent,
  AsrRequest,
  LearningLevel,
  LibraryEntry,
  Message,
  Settings,
  SubtitleCue,
  TokenInfo,
  WordStatus,
} from '../utils/types'
import { ReaderTooltip, type WordStatusApi } from '../shared/tooltip'
import { collectTextNodes, wrapTextNode } from '../shared/word-wrapper'
import { AudioCapture, listAudioInputDevices, type CaptureStartResult } from '../utils/asr/audio-capture'
import { scoreTokens } from '../utils/scoring'
import { tokenize } from '../utils/tokenizer'
import { saveSettings } from '../utils/settings'

// Reuses the exact #ci-sub-panel styling/markup from youtube.content.ts —
// copied, not shared, matching this codebase's per-content-script
// convention (manga/YouTube each already carry their own near-duplicate
// glue rather than a shared module).
const STYLE = `
#znam-nf-badge {
  position: fixed; left: 16px; bottom: 16px; z-index: 2147483000;
  background: #1a1a2e; color: #cfe3ff; border-radius: 12px;
  padding: 8px 14px; font: 600 13px/1.4 "Roboto", sans-serif;
  box-shadow: 0 4px 20px rgba(0,0,0,0.5); cursor: pointer; user-select: none;
}
#znam-nf-badge:hover { background: #242440; }
#znam-nf-badge.on { background: #2d6e3e; }
#znam-nf-badge .znam-nf-sub { display: block; color: #9ab; font-weight: 400; font-size: 11px; margin-top: 2px; }
#ci-sub-panel {
  position: fixed; left: 16px; right: 16px; bottom: 64px; z-index: 2147483000;
  max-width: 900px; margin: 0 auto;
  padding: 12px 16px; border-radius: 12px;
  background: #14141f; color: #eee; font-family: "Roboto", sans-serif;
  box-shadow: 0 4px 20px rgba(0,0,0,0.5);
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
#ci-sub-panel .ci-sub-controls { display: flex; gap: 6px; align-items: center; margin-top: 10px; flex-wrap: wrap; }
#ci-sub-panel .ci-sub-controls button {
  background: #242440; color: #cfe3ff; border: 0; border-radius: 6px;
  padding: 5px 10px; font-size: 13px; cursor: pointer;
}
#ci-sub-panel .ci-sub-controls button:hover { background: #2d4a77; }
#ci-sub-panel .ci-sub-controls button.active { background: #2d6e3e; }
#ci-sub-panel .ci-sub-controls .ci-sub-spacer { flex: 1; }
#ci-sub-panel .ci-sub-hint { color: #666; font-size: 11px; }
#znam-nf-progress {
  position: fixed; left: 16px; bottom: 64px; z-index: 2147483000;
  background: #1a1a2e; color: #cfe3ff; border-radius: 10px;
  padding: 8px 12px; font: 12px/1.4 sans-serif; max-width: 320px;
}
#znam-nf-devices {
  position: fixed; left: 16px; bottom: 64px; z-index: 2147483001;
  background: #1a1a2e; color: #eee; border-radius: 12px;
  padding: 14px 16px; font: 13px/1.5 "Roboto", sans-serif; max-width: 360px;
  box-shadow: 0 4px 20px rgba(0,0,0,0.5);
}
#znam-nf-devices .znam-nf-devices-title { font-weight: 600; margin-bottom: 6px; }
#znam-nf-devices .znam-nf-devices-hint { color: #999; font-size: 11px; margin-bottom: 10px; }
#znam-nf-devices select {
  width: 100%; background: #242440; color: #eee; border: 1px solid #333;
  border-radius: 6px; padding: 5px 8px; margin-bottom: 10px;
}
#znam-nf-devices .znam-nf-devices-buttons { display: flex; gap: 8px; }
#znam-nf-devices button {
  background: #242440; color: #cfe3ff; border: 0; border-radius: 6px;
  padding: 6px 12px; font-size: 12px; cursor: pointer;
}
#znam-nf-devices .znam-nf-device-use { background: #2d6e3e; }
#znam-nf-devices button:hover { filter: brightness(1.2); }
.znam-nf-replace .player-timedtext { visibility: hidden !important; }
`

function send(msg: Message): Promise<any> {
  return browser.runtime.sendMessage(msg)
}

function urlId(url: string): string {
  let h = 5381
  for (let i = 0; i < url.length; i++) h = ((h << 5) + h + url.charCodeAt(i)) >>> 0
  return h.toString(36)
}

export default defineContentScript({
  matches: ['*://www.netflix.com/watch/*'],
  runAt: 'document_idle',

  async main() {
    let settings: Settings = await send({ type: 'GET_SETTINGS' })
    const styleEl = document.createElement('style')
    styleEl.textContent = STYLE
    document.head.appendChild(styleEl)

    function video(): HTMLVideoElement | null {
      return document.querySelector('video')
    }

    function applySubtitleMode() {
      document.documentElement.classList.toggle('znam-nf-replace', settings.netflixSubtitleMode === 'replace')
    }
    applySubtitleMode()

    // ── Word tracking (identical shape to youtube.content.ts) ──

    const tokenInfo = new Map<string, TokenInfo>()
    interface LiveStatus { status: WordStatus | 'unknown' | 'name'; level?: LearningLevel }
    const lemmaStatus = new Map<string, LiveStatus>()
    const interacted = new Set<string>()

    const statusApi: WordStatusApi = {
      lemmaFor: (span) => span.dataset.lemma || (span.dataset.word || '').toLowerCase(),
      statusFor: (lemma) => {
        const s = lemmaStatus.get(lemma)?.status
        return s === 'name' ? 'unknown' : (s ?? 'unknown')
      },
      levelFor: (lemma) => lemmaStatus.get(lemma)?.level,
      set: (lemma, status, extras) => {
        interacted.add(lemma)
        lemmaStatus.set(lemma, { status, level: status === 'learning' ? (extras?.level ?? 1) : undefined })
        repaintLemma(lemma)
        send({
          type: 'SET_WORD_STATUS',
          payload: {
            lang: settings.targetLanguage, lemma, status, level: extras?.level,
            translation: extras?.translation, context: extras?.context,
            source: extras?.translation ? 'click' : 'manual',
          },
        }).catch(() => {})
      },
      setTranslation: (lemma, translation) => {
        interacted.add(lemma)
        send({ type: 'SET_WORD_TRANSLATION', payload: { lang: settings.targetLanguage, lemma, translation } }).catch(() => {})
      },
      recordLookup: (lemma) => {
        interacted.add(lemma)
        send({ type: 'RECORD_LOOKUP', payload: { lang: settings.targetLanguage, lemma } }).catch(() => {})
      },
      async getSavedTranslation(lemma) {
        const r = await send({ type: 'GET_WORD_TRANSLATION', payload: { lang: settings.targetLanguage, lemma } }).catch(() => null)
        return r && typeof r === 'object' ? r.translation : undefined
      },
    }

    const tooltip = new ReaderTooltip(send, statusApi)
    tooltip.attach()
    tooltip.setPrimaryTranslation(settings.primaryTranslation)

    // Clicking a subtitle word pauses playback so the tooltip can be read.
    document.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest?.('.ci-word')?.closest('#ci-sub-panel')) {
        video()?.pause()
      }
    }, true)

    function statusOf(token: string): TokenInfo | undefined {
      const info = tokenInfo.get(token)
      if (!info) return undefined
      const live = lemmaStatus.get(info.lemma)
      if (!live || (live.status === info.status && live.level === info.level)) return info
      return { lemma: info.lemma, status: live.status, level: live.level, rank: info.rank }
    }
    const HL = ['ci-unknown', 'ci-l1', 'ci-l2', 'ci-l3', 'ci-l4', 'ci-l5']
    function paintSpan(span: HTMLElement) {
      const info = statusOf(span.dataset.word || '')
      span.classList.remove(...HL)
      if (!info) return
      span.dataset.lemma = info.lemma
      if (info.status === 'unknown') span.classList.add('ci-unknown')
      else if (info.status === 'learning') span.classList.add(`ci-l${info.level ?? 1}`)
    }
    function repaintLemma(lemma: string) {
      for (const s of document.querySelectorAll<HTMLElement>(`.ci-word[data-lemma="${CSS.escape(lemma)}"]`)) paintSpan(s)
    }

    // ── Subtitle panel — activeCues grows LIVE as SEGMENTs arrive, unlike
    // YouTube's fully-known-upfront array; cueIndexAt/seekCue already
    // tolerate a growing array with no change needed. ──

    const activeCues: SubtitleCue[] = []
    let panel: HTMLElement | null = null
    let panelCueIndex = -1
    let panelRaf = 0
    let autoPause = false
    let lastPauseCue = -1
    const nativeCache = new Map<number, string>()

    function cueIndexAt(t: number): number {
      let idx = -1
      for (let i = 0; i < activeCues.length; i++) {
        if (activeCues[i].start <= t + 0.05) idx = i
        else break
      }
      return idx
    }

    function ensurePanel(): HTMLElement {
      if (panel?.isConnected) return panel
      panel = document.createElement('div')
      panel.id = 'ci-sub-panel'
      panel.dataset.from = settings.targetLanguage
      panel.dataset.to = settings.nativeLanguage
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
          <span class="ci-sub-hint">click = look up · shift-click = phrase · znam-transcribed, not Netflix's own subtitles</span>
        </div>`
      document.body.appendChild(panel)
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
      startPanelLoop()
      return panel
    }

    function removePanel() {
      cancelAnimationFrame(panelRaf)
      panelRaf = 0
      panel?.remove()
      panel = null
      panelCueIndex = -1
      lastPauseCue = -1
    }

    function seekCue(index: number) {
      const i = Math.max(0, Math.min(activeCues.length - 1, index))
      const v = video()
      if (v && activeCues[i]) {
        v.currentTime = activeCues[i].start + 0.01
        lastPauseCue = i
        v.play()
      }
    }

    function startPanelLoop() {
      cancelAnimationFrame(panelRaf)
      const tick = () => {
        if (!panel?.isConnected) return
        const v = video()
        if (v && activeCues.length) {
          const idx = cueIndexAt(v.currentTime)
          if (idx !== panelCueIndex && idx >= 0) {
            panelCueIndex = idx
            renderPanelCue(idx)
          }
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
      if (!panel) return
      const cue = activeCues[index]
      if (!cue) return
      const target = panel.querySelector('.ci-sub-target') as HTMLElement
      const native = panel.querySelector('.ci-sub-native') as HTMLElement

      target.textContent = cue.text
      const spans: HTMLElement[] = []
      for (const node of collectTextNodes(target)) spans.push(...wrapTextNode(node))
      const pending = [...new Set(spans.map((s) => s.dataset.word || '').filter((w) => w && !tokenInfo.has(w)))]
      for (const s of spans) paintSpan(s)
      if (pending.length) {
        const res: Record<string, TokenInfo> = await send({
          type: 'ANALYZE_TOKENS', payload: { lang: settings.targetLanguage, tokens: pending },
        }).catch(() => ({}))
        for (const [t, info] of Object.entries(res || {})) {
          tokenInfo.set(t, info)
          if (!lemmaStatus.has(info.lemma)) lemmaStatus.set(info.lemma, { status: info.status, level: info.level })
        }
        if (panelCueIndex === index) for (const s of spans) if (s.isConnected) paintSpan(s)
      }

      if (nativeCache.has(index)) {
        native.textContent = nativeCache.get(index)!
      } else {
        native.textContent = '…'
        const r = await send({
          type: 'TRANSLATE', payload: { text: cue.text, from: settings.targetLanguage, to: settings.nativeLanguage },
        }).catch(() => null)
        const translated = (r && typeof r === 'object' ? r.text : '') || ''
        nativeCache.set(index, translated)
        if (panelCueIndex === index) native.textContent = translated
      }
    }

    // ── Word-tracking + library entry from the growing transcript ──

    let libraryLemmaCounts: Record<string, number> = {}
    let libraryTimer: ReturnType<typeof setTimeout> | null = null
    let sessionId = ''

    function accumulateForLibrary(text: string) {
      for (const tok of tokenize(text)) {
        const lower = tok.toLowerCase()
        libraryLemmaCounts[lower] = (libraryLemmaCounts[lower] || 0) + 1
      }
      if (libraryTimer) return
      // Same ~5s "genuinely watched" threshold as YouTube Shorts
      libraryTimer = setTimeout(saveLibraryEntry, 5000)
    }

    async function saveLibraryEntry() {
      libraryTimer = null
      const tokens = Object.keys(libraryLemmaCounts)
      if (tokens.length === 0) return
      const info = await sendAnalyze(tokens)
      const score = scoreTokens(
        tokens.flatMap((t) => Array(libraryLemmaCounts[t]).fill(t)),
        (t) => info.get(t),
      )
      const payload: Omit<LibraryEntry, 'createdAt' | 'updatedAt'> = {
        id: `nf:${sessionId}`,
        url: location.href,
        title: document.title.replace(/^Netflix\s*[-–]\s*/, ''),
        lang: settings.targetLanguage,
        kind: 'netflix',
        score: score.score,
        countableTokens: score.countableTokens,
        knownTokens: score.knownTokens,
        uniqueLemmas: Object.keys(score.lemmaCounts).length,
        unknownLemmas: score.uniqueUnknown.length,
        lemmaCounts: score.lemmaCounts,
        excerpt: activeCues.slice(-20).map((c) => c.text).join(' ').slice(0, 200),
        pinned: false,
      }
      send({ type: 'SAVE_LIBRARY_ENTRY', payload }).catch(() => {})
    }

    async function sendAnalyze(tokens: string[]): Promise<Map<string, TokenInfo>> {
      const map = new Map<string, TokenInfo>()
      for (let i = 0; i < tokens.length; i += 500) {
        const res: Record<string, TokenInfo> = await send({
          type: 'ANALYZE_TOKENS', payload: { lang: settings.targetLanguage, tokens: tokens.slice(i, i + 500) },
        }).catch(() => ({}))
        for (const [t, info] of Object.entries(res || {})) map.set(t, info)
      }
      return map
    }

    // ── Audio capture + ASR port ────────────────────────────
    // Firefox's getDisplayMedia() ignores audio entirely (confirmed browser
    // limitation, not fixable here — see utils/asr/audio-capture.ts), so
    // capture goes through getUserMedia() against a virtual audio cable
    // (e.g. VB-Audio Virtual Cable on Windows) that the user routes their
    // Netflix/browser audio output into. znam doesn't install this for you.

    const capture = new AudioCapture()
    let asrPort: ReturnType<typeof browser.runtime.connect> | null = null
    let transcribing = false
    let seq = 0

    const badge = document.createElement('div')
    badge.id = 'znam-nf-badge'
    badge.title = 'Right-click to change the audio input device'
    badge.innerHTML = `🎙️ Transcribe audio<span class="znam-nf-sub"></span>`
    document.body.appendChild(badge)

    const progressEl = document.createElement('div')
    progressEl.id = 'znam-nf-progress'
    progressEl.hidden = true

    let devicePanel: HTMLElement | null = null

    function setBadgeSub(text: string) {
      const el = badge.querySelector('.znam-nf-sub') as HTMLElement
      el.textContent = text
    }

    function ensureAsrPort() {
      if (asrPort) return asrPort
      asrPort = browser.runtime.connect({ name: 'asr' })
      asrPort.onMessage.addListener((event: AsrEvent) => onAsrEvent(event))
      asrPort.onDisconnect.addListener(() => { asrPort = null })
      return asrPort
    }

    function showBanner(text: string, isError: boolean) {
      progressEl.hidden = false
      progressEl.textContent = text
      progressEl.style.background = isError ? '#5a1a1a' : '#1a1a2e'
      progressEl.style.color = isError ? '#ffd7d7' : '#cfe3ff'
      if (!progressEl.isConnected) document.body.appendChild(progressEl)
    }

    function onAsrEvent(event: AsrEvent) {
      console.log('[znam ASR] event', event.type, event)
      if (event.type === 'PROGRESS') {
        showBanner(`${event.step === 'download' ? 'Downloading model' : 'Loading model'}… ${event.pct}% (${event.detail})`, false)
      } else if (event.type === 'READY') {
        progressEl.hidden = true
        setBadgeSub(`transcribing (${event.tier}${event.model ? ' · ' + event.model : ''})`)
      } else if (event.type === 'SEGMENT') {
        activeCues.push(event.cue)
        accumulateForLibrary(event.cue.text)
        ensurePanel()
      } else if (event.type === 'ERROR') {
        console.warn('[znam] ASR:', event.error)
        setBadgeSub(event.fatal ? `error: ${event.error}` : `⚠ ${event.error}`)
        showBanner((event.fatal ? '❌ ' : '⚠ ') + event.error, true)
        if (event.fatal) stopTranscribing()
      } else if (event.type === 'STOPPED') {
        setBadgeSub('')
      }
    }

    capture.onSilentStretch = () => {
      showBanner(
        '⚠ Only silence is arriving from the audio device. Route Firefox\'s output to the virtual cable: Windows volume mixer → Firefox → output "CABLE Input", and pick "CABLE Output" as znam\'s device. To keep hearing sound: mmsys.cpl → Recording → CABLE Output → Listen → play through your speakers.',
        true,
      )
    }

    async function startCaptureWith(deviceId: string) {
      const result: CaptureStartResult = await capture.start(
        deviceId,
        (pcm, startTime) => {
          // Always a plain ArrayBuffer here — pcm comes from a fresh
          // Float32Array (see AudioCapture.emitWindow), never SharedArrayBuffer.
          const buf = pcm.buffer.slice(pcm.byteOffset, pcm.byteOffset + pcm.byteLength) as ArrayBuffer
          const req: AsrRequest = { type: 'ASR_CHUNK', seq: seq++, pcm: buf, startTime }
          ensureAsrPort().postMessage(req)
        },
        () => video()?.currentTime ?? 0,
      )
      console.log('[znam ASR] capture.start result=', result)
      if (result === 'denied') {
        showBanner('❌ Microphone permission denied for netflix.com — allow it in the address-bar 🎤 icon, then retry.', true)
        return
      }
      if (result === 'no-device') {
        showBanner('❌ That input has no audio — pick another device.', true)
        openDevicePicker()
        return
      }
      if (result === 'error') {
        showBanner('❌ Audio capture failed to initialise — see the page console ([znam ASR] lines).', true)
        return
      }
      transcribing = true
      sessionId = urlId(location.href)
      badge.classList.add('on')
      badge.firstChild!.textContent = '🎙️ Transcribing…'
      const startReq: AsrRequest = { type: 'ASR_START', lang: settings.targetLanguage }
      ensureAsrPort().postMessage(startReq)
    }

    function stopTranscribing() {
      transcribing = false
      capture.stop()
      badge.classList.remove('on')
      badge.firstChild!.textContent = '🎙️ Transcribe audio'
      setBadgeSub('')
      if (asrPort) {
        const stopReq: AsrRequest = { type: 'ASR_STOP' }
        asrPort.postMessage(stopReq)
      }
    }

    async function openDevicePicker() {
      devicePanel?.remove()
      const panel = document.createElement('div')
      panel.id = 'znam-nf-devices'
      panel.innerHTML = `
        <div class="znam-nf-devices-title">Which input is your virtual audio cable?</div>
        <div class="znam-nf-devices-hint">
          znam captures audio via a normal microphone input, not the browser's
          tab-share dialog — Firefox doesn't support sharing tab audio at all
          (a confirmed Mozilla limitation). Install a free virtual audio cable
          (e.g. "VB-Audio Virtual Cable" for Windows — znam does not install
          this for you), set your system/browser audio output to it, then
          pick that cable's output below as the input znam listens to.
        </div>
        <select class="znam-nf-device-select"><option>Loading devices…</option></select>
        <div class="znam-nf-devices-buttons">
          <button class="znam-nf-device-use">Use this device</button>
          <button class="znam-nf-device-cancel">Cancel</button>
        </div>`
      document.body.appendChild(panel)
      devicePanel = panel

      const select = panel.querySelector('.znam-nf-device-select') as HTMLSelectElement
      const devices = await listAudioInputDevices()
      select.innerHTML = ''
      if (devices.length === 0) {
        const opt = document.createElement('option')
        opt.textContent = 'No audio input devices found'
        select.appendChild(opt)
      } else {
        for (const d of devices) {
          const opt = document.createElement('option')
          opt.value = d.deviceId
          opt.textContent = d.label || `Microphone (${d.deviceId.slice(0, 8)})`
          select.appendChild(opt)
        }
        // Best-effort: preselect anything that looks like a virtual cable
        const guess = devices.find((d) => /cable|virtual|stereo mix|voicemeeter/i.test(d.label))
        if (guess) select.value = guess.deviceId
        else if (settings.netflixAudioDeviceId) select.value = settings.netflixAudioDeviceId
      }

      panel.querySelector('.znam-nf-device-cancel')!.addEventListener('click', () => panel.remove())
      panel.querySelector('.znam-nf-device-use')!.addEventListener('click', async () => {
        const deviceId = select.value
        if (!deviceId) return
        settings = await persistSettings({ netflixAudioDeviceId: deviceId })
        panel.remove()
        startCaptureWith(deviceId)
      })
    }

    async function persistSettings(patch: Partial<Settings>): Promise<Settings> {
      const next = { ...settings, ...patch }
      await saveSettings(next)
      return next
    }

    badge.addEventListener('click', () => {
      console.log('[znam ASR] badge click; transcribing=', transcribing, 'savedDevice=', settings.netflixAudioDeviceId || '(none)')
      if (transcribing) { stopTranscribing(); return }
      if (settings.netflixAudioDeviceId) startCaptureWith(settings.netflixAudioDeviceId)
      else openDevicePicker()
    })
    badge.addEventListener('contextmenu', (e) => {
      e.preventDefault()
      openDevicePicker()
    })

    // ── Navigation (Netflix is a pushState SPA; poll the URL) ──

    let lastHref = location.href
    setInterval(() => {
      if (location.href === lastHref) return
      lastHref = location.href
      // New title/episode: stop the old session cleanly.
      stopTranscribing()
      removePanel()
      activeCues.length = 0
      tokenInfo.clear()
      lemmaStatus.clear()
      interacted.clear()
      libraryLemmaCounts = {}
      nativeCache.clear()
      seq = 0
    }, 1000)

    window.addEventListener('pagehide', () => {
      stopTranscribing()
      asrPort?.disconnect()
    })

    browser.runtime.onMessage.addListener((message: any, _sender, sendResponse) => {
      if (message?.type === 'SETTINGS_UPDATED') {
        settings = message.payload
        tooltip.setPrimaryTranslation(settings.primaryTranslation)
        applySubtitleMode()
        sendResponse({ ok: true })
      }
      return false
    })
  },
})
