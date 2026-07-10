import type { LearningLevel, Message, OcrEvent, OcrRegion, OcrRequest, Settings, TokenInfo, WordStatus } from '../utils/types'
import { pickAdapter, registerAdapter } from '../sites/adapter'
import { mangadexAdapter } from '../sites/mangadex'
import { weebcentralAdapter } from '../sites/weebcentral'
import { MangaOverlay } from '../shared/manga-overlay'
import { ReaderTooltip, type WordStatusApi } from '../shared/tooltip'
import { getSettings, saveSettings } from '../utils/settings'

registerAdapter(mangadexAdapter)
registerAdapter(weebcentralAdapter)

const STYLE = `
.znam-manga-layer { position: absolute; pointer-events: none; z-index: 10; }
.znam-patch {
  position: absolute; pointer-events: auto; background: #fff; color: #111;
  border-radius: 6px; box-shadow: 0 1px 4px rgba(0,0,0,0.25);
  display: flex; flex-wrap: wrap; align-content: center; justify-content: center;
  text-align: center; overflow: hidden; padding: 1px;
  font-family: 'Comic Sans MS','Segoe UI',sans-serif; font-weight: 600; line-height: 1.15;
}
.znam-patch.znam-pending { background: rgba(255,255,255,0.55); }
.znam-patch.znam-pending::after {
  content: '…'; color: #888; font-size: 14px;
}
.znam-patch-text { display: inline; }
.znam-patch .ci-word { cursor: pointer; }
.znam-patch .ci-word:hover { text-decoration: underline; }
.znam-patch .ci-word.ci-unknown { background: rgba(96,145,255,0.28); border-radius: 2px; }
.znam-patch .ci-word.ci-l1 { background: rgba(193,75,75,0.34); border-radius: 2px; }
.znam-patch .ci-word.ci-l2 { background: rgba(193,119,75,0.32); border-radius: 2px; }
.znam-patch .ci-word.ci-l3 { background: rgba(255,213,0,0.30); border-radius: 2px; }
.znam-patch .ci-word.ci-l4 { background: rgba(143,163,46,0.30); border-radius: 2px; }
.znam-patch .ci-word.ci-l5 { background: rgba(93,158,74,0.26); border-radius: 2px; }
.znam-manga-badge {
  position: absolute; z-index: 11; background: rgba(26,26,46,0.9); color: #cfe3ff;
  font: 12px/1 sans-serif; padding: 4px 8px; border-radius: 8px; pointer-events: none;
}
#znam-manga-toggle {
  position: fixed; right: 16px; bottom: 16px; z-index: 2147483000;
  background: #1a1a2e; color: #cfe3ff; border: 0; border-radius: 10px;
  padding: 9px 13px; font: 600 13px/1 sans-serif; cursor: pointer;
  box-shadow: 0 4px 20px rgba(0,0,0,0.5);
}
#znam-manga-toggle:hover { background: #2d4a77; }
#znam-manga-toggle.on { background: #2d6e3e; color: #d7f5df; }
`

function send(msg: Message): Promise<any> {
  return browser.runtime.sendMessage(msg)
}

export default defineContentScript({
  matches: [
    '*://mangadex.org/*', '*://*.mangadex.org/*',
    '*://weebcentral.com/*', '*://*.weebcentral.com/*',
  ],
  runAt: 'document_idle',

  async main() {
    const adapter = pickAdapter(new URL(location.href))
    if (!adapter) return

    let settings = await getSettings()
    const styleEl = document.createElement('style')
    styleEl.textContent = STYLE
    document.head.appendChild(styleEl)

    // ── Word tracking (translated target-language words) ────
    const tokenInfo = new Map<string, TokenInfo>()
    interface Live { status: WordStatus | 'unknown' | 'name'; level?: LearningLevel }
    const lemmaStatus = new Map<string, Live>()

    const statusApi: WordStatusApi = {
      lemmaFor: (span) => span.dataset.lemma || (span.dataset.word || '').toLowerCase(),
      statusFor: (lemma) => {
        const s = lemmaStatus.get(lemma)?.status
        return s === 'name' ? 'unknown' : (s ?? 'unknown')
      },
      levelFor: (lemma) => lemmaStatus.get(lemma)?.level,
      set: (lemma, status, extras) => {
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
        send({ type: 'SET_WORD_TRANSLATION', payload: { lang: settings.targetLanguage, lemma, translation } }).catch(() => {})
      },
      recordLookup: (lemma) => {
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
    async function analyzeAndPaint(spans: HTMLElement[]) {
      for (const s of spans) paintSpan(s)
      const pending = [...new Set(spans.map(s => s.dataset.word || '').filter(w => w && !tokenInfo.has(w)))]
      if (pending.length === 0) return
      const res: Record<string, TokenInfo> = await send({
        type: 'ANALYZE_TOKENS', payload: { lang: settings.targetLanguage, tokens: pending },
      }).catch(() => ({}))
      for (const [t, info] of Object.entries(res || {})) {
        tokenInfo.set(t, info)
        if (!lemmaStatus.has(info.lemma)) lemmaStatus.set(info.lemma, { status: info.status, level: info.level })
      }
      for (const s of spans) if (s.isConnected) paintSpan(s)
    }

    // ── OCR + translate pipeline ────────────────────────────
    const overlay = new MangaOverlay()
    overlay.onWords = analyzeAndPaint

    interface Tracked { img: HTMLImageElement; url: string; requested: boolean; regions: OcrRegion[] | null }
    const tracked = new Map<string, Tracked>()
    let seq = 0
    let port: ReturnType<typeof browser.runtime.connect> | null = null
    let stopAdapter: (() => void) | null = null
    let running = false

    const intersection = new IntersectionObserver(
      (entries) => { for (const e of entries) if (e.isIntersecting) requestOcr((e.target as HTMLElement).dataset.znamId || '') },
      { rootMargin: '800px' },
    )

    function ensurePort() {
      if (port) return port
      port = browser.runtime.connect({ name: 'ocr' })
      port.onMessage.addListener((event: OcrEvent) => onOcrEvent(event))
      port.onDisconnect.addListener(() => {
        port = null
        for (const t of tracked.values()) if (!t.regions) t.requested = false
      })
      return port
    }

    async function toDataUrl(url: string): Promise<string> {
      const blob = await (await fetch(url)).blob()
      return await new Promise((resolve, reject) => {
        const r = new FileReader()
        r.onload = () => resolve(r.result as string)
        r.onerror = () => reject(r.error)
        r.readAsDataURL(blob)
      })
    }

    function requestOcr(imageId: string) {
      if (!running) return
      const t = tracked.get(imageId)
      if (!t || t.requested) return
      t.requested = true
      const req: OcrRequest = { type: 'OCR_PAGE', imageId, url: t.url, lang: settings.mangaSource }
      ;(async () => {
        if (t.url.startsWith('blob:') || t.url.startsWith('data:')) {
          try { req.dataUrl = await toDataUrl(t.url) } catch { t.requested = false; return }
        }
        showBadge(t, imageId)
        ensurePort().postMessage(req)
      })()
    }

    function showBadge(t: Tracked, imageId: string) {
      const parent = t.img.parentElement
      if (!parent) return
      if (getComputedStyle(parent).position === 'static') parent.style.position = 'relative'
      const b = document.createElement('div')
      b.className = 'znam-manga-badge'
      b.dataset.for = imageId
      b.textContent = '⏳ OCR…'
      b.style.left = `${t.img.offsetLeft + 8}px`
      b.style.top = `${t.img.offsetTop + 8}px`
      parent.appendChild(b)
    }
    function clearBadge(imageId: string) {
      document.querySelector(`.znam-manga-badge[data-for="${imageId}"]`)?.remove()
    }

    async function onOcrEvent(event: OcrEvent) {
      clearBadge(event.imageId)
      const t = tracked.get(event.imageId)
      if (!t) return
      if (event.type === 'UNSUPPORTED') {
        console.info(`[znam] manga: OCR language "${event.lang}" not supported (Japanese needs a server)`)
        return
      }
      if (event.type === 'OCR_ERROR') { console.warn('[znam] manga OCR error', event.error); return }
      // REGIONS
      t.regions = event.regions
      if (!running || event.regions.length === 0) return
      const from = settings.mangaSource === 'auto' ? 'auto' : settings.mangaSource
      const to = settings.targetLanguage
      overlay.renderFullLayer(t.img, event.imageId, event.regions, { from: to, to: settings.nativeLanguage })
      const texts = event.regions.map(r => r.text)
      const translated: string[] = await send({ type: 'TRANSLATE_BATCH', payload: { texts, from, to } }).catch(() => [])
      if (!Array.isArray(translated)) return
      event.regions.forEach((r, i) => {
        const text = translated[i] || r.text
        if (text) overlay.fillPatch(event.imageId, r.id, text)
      })
    }

    function track(img: HTMLImageElement) {
      const imageId = `img${seq++}`
      img.dataset.znamId = imageId
      tracked.set(imageId, { img, url: adapter!.getImageUrl(img), requested: false, regions: null })
      intersection.observe(img)
    }

    function startPipeline() {
      if (running) return
      running = true
      stopAdapter = adapter!.observe((imgs) => { for (const img of imgs) track(img) })
    }
    function stopPipeline() {
      running = false
      stopAdapter?.(); stopAdapter = null
      intersection.disconnect()
      overlay.removeAll()
      port?.disconnect(); port = null
      tracked.clear()
      document.querySelectorAll('.znam-manga-badge').forEach(b => b.remove())
    }

    // ── Toggle button ───────────────────────────────────────
    const toggle = document.createElement('button')
    toggle.id = 'znam-manga-toggle'
    const renderToggle = () => {
      toggle.textContent = running ? '📖 Manga: on' : '📖 Manga: off'
      toggle.classList.toggle('on', running)
    }
    toggle.addEventListener('click', async () => {
      if (running) stopPipeline()
      else startPipeline()
      renderToggle()
      settings = { ...settings, mangaEnabled: running }
      saveSettings(settings).catch(() => {})
    })
    document.body.appendChild(toggle)

    browser.runtime.onMessage.addListener((message: any) => {
      if (message?.type === 'SETTINGS_UPDATED') {
        settings = message.payload
        tooltip.setPrimaryTranslation(settings.primaryTranslation)
      }
    })

    if (settings.mangaEnabled) startPipeline()
    renderToggle()
  },
})
