import { Readability } from '@mozilla/readability'
import { ReaderTooltip, type WordStatusApi } from '../shared/tooltip'
import { collectTextNodes, unwrapAll, wrapTextNode } from '../shared/word-wrapper'
import { tokenize } from '../utils/tokenizer'
import { difficultyLabel, scoreTokens, type PageScore } from '../utils/scoring'
import type { LearningLevel, Message, Settings, TokenInfo, WordStatus } from '../utils/types'

const ANALYZE_CHUNK = 500
const WRAP_BATCH = 200

const STYLE = `
.ci-word { cursor: pointer; }
.ci-word:hover { text-decoration: underline dotted; }
.ci-word.ci-unknown { background: rgba(96, 145, 255, 0.20); border-radius: 2px; box-decoration-break: clone; }
.ci-word.ci-l1 { background: rgba(193, 75, 75, 0.30); border-radius: 2px; box-decoration-break: clone; }
.ci-word.ci-l2 { background: rgba(193, 119, 75, 0.28); border-radius: 2px; box-decoration-break: clone; }
.ci-word.ci-l3 { background: rgba(255, 213, 0, 0.28); border-radius: 2px; box-decoration-break: clone; }
.ci-word.ci-l4 { background: rgba(143, 163, 46, 0.26); border-radius: 2px; box-decoration-break: clone; }
.ci-word.ci-l5 { background: rgba(93, 158, 74, 0.22); border-radius: 2px; box-decoration-break: clone; }
#ci-badge {
  position: fixed; right: 16px; bottom: 16px; z-index: 2147483646;
  background: #1a1a2e; color: #fff; border-radius: 10px; padding: 10px 14px;
  font: 13px/1.5 sans-serif; box-shadow: 0 4px 20px rgba(0,0,0,0.5);
  display: flex; align-items: center; gap: 10px; max-width: 340px;
}
#ci-badge .ci-score { font-size: 18px; font-weight: 700; }
#ci-badge .ci-label { color: #8ab4f8; }
#ci-badge .ci-detail { color: #999; font-size: 11px; }
#ci-badge button {
  background: #242440; color: #cfe3ff; border: 0; border-radius: 6px;
  padding: 4px 8px; font-size: 11px; cursor: pointer;
}
#ci-badge button:hover { background: #2d4a77; }
#ci-badge .ci-close { background: none; color: #555; padding: 2px 4px; }
`

function sendMessage(msg: Message): Promise<any> {
  return browser.runtime.sendMessage(msg)
}

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_idle',

  main() {
    let active = false
    let activating = false
    let settings: Settings | null = null
    let styleEl: HTMLStyleElement | null = null
    let badge: HTMLElement | null = null
    let observer: MutationObserver | null = null
    let mutationTimer: ReturnType<typeof setTimeout> | null = null
    let wrapping = false

    // token (surface, case-preserved) → info from ANALYZE_TOKENS
    const tokenInfo = new Map<string, TokenInfo>()
    // lemma → current status + level (updated live on user actions)
    interface LiveStatus { status: WordStatus | 'unknown' | 'name'; level?: LearningLevel }
    const lemmaStatus = new Map<string, LiveStatus>()
    // Article tokens used for the page score (Readability when possible)
    let articleTokens: string[] = []
    let pageScore: PageScore | null = null
    // Auto level progression: learning words looked up here don't count as
    // passive exposures; sent once when leaving the page after real reading.
    let activatedAt = 0
    let exposuresSent = false
    const interactedLemmas = new Set<string>()

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
        interactedLemmas.add(lemma)
        lemmaStatus.set(lemma, { status, level: status === 'learning' ? (extras?.level ?? 1) : undefined })
        repaintLemma(lemma)
        refreshScore()
        sendMessage({
          type: 'SET_WORD_STATUS',
          payload: {
            lang: settings!.targetLanguage,
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
        interactedLemmas.add(lemma)
        sendMessage({
          type: 'SET_WORD_TRANSLATION',
          payload: { lang: settings.targetLanguage, lemma, translation },
        }).catch(() => {})
      },
      recordLookup(lemma) {
        if (!settings) return
        interactedLemmas.add(lemma)
        sendMessage({ type: 'RECORD_LOOKUP', payload: { lang: settings.targetLanguage, lemma } }).catch(() => {})
      },
      async getSavedTranslation(lemma) {
        if (!settings) return undefined
        const r = await sendMessage({ type: 'GET_WORD_TRANSLATION', payload: { lang: settings.targetLanguage, lemma } }).catch(() => null)
        return r && typeof r === 'object' ? r.translation : undefined
      },
    }

    // Record passive exposures: learning words present on the page that the
    // user did NOT look up — advances their level over repeated readings.
    function sendExposures() {
      if (!active || !settings || exposuresSent) return
      if (Date.now() - activatedAt < 15000) return // require real reading time
      const lemmas: string[] = []
      for (const [lemma, s] of lemmaStatus) {
        if (s.status === 'learning' && !interactedLemmas.has(lemma)) lemmas.push(lemma)
      }
      if (lemmas.length === 0) return
      exposuresSent = true
      sendMessage({ type: 'RECORD_EXPOSURES', payload: { lang: settings.targetLanguage, lemmas } }).catch(() => {})
    }

    const tooltip = new ReaderTooltip(sendMessage, statusApi)
    let tooltipAttached = false

    function statusOf(token: string): TokenInfo | undefined {
      const info = tokenInfo.get(token)
      if (!info) return undefined
      const live = lemmaStatus.get(info.lemma)
      if (!live || (live.status === info.status && live.level === info.level)) return info
      return { lemma: info.lemma, status: live.status, level: live.level, rank: info.rank }
    }

    const HIGHLIGHT_CLASSES = ['ci-unknown', 'ci-l1', 'ci-l2', 'ci-l3', 'ci-l4', 'ci-l5']

    function classFor(info: TokenInfo): string {
      if (info.status === 'unknown') return 'ci-unknown'
      if (info.status === 'learning') return `ci-l${info.level ?? 1}`
      return ''
    }

    function paintSpan(span: HTMLElement) {
      const info = statusOf(span.dataset.word || '')
      span.classList.remove(...HIGHLIGHT_CLASSES)
      if (!info) return
      span.dataset.lemma = info.lemma
      const cls = classFor(info)
      if (cls) span.classList.add(cls)
    }

    function repaintLemma(lemma: string) {
      const sel = `.ci-word[data-lemma="${CSS.escape(lemma)}"]`
      for (const span of document.querySelectorAll<HTMLElement>(sel)) paintSpan(span)
    }

    // ── Analysis pipeline ───────────────────────────────────

    let pendingTokens = new Set<string>()
    let analyzeScheduled = false

    function queueAnalysis(tokens: Iterable<string>, spans: HTMLElement[]) {
      for (const t of tokens) {
        if (!tokenInfo.has(t)) pendingTokens.add(t)
      }
      // Spans whose tokens are already analyzed can paint immediately
      for (const span of spans) {
        if (tokenInfo.has(span.dataset.word || '')) paintSpan(span)
      }
      if (!analyzeScheduled && pendingTokens.size > 0) {
        analyzeScheduled = true
        setTimeout(runAnalysis, 50)
      }
    }

    async function runAnalysis() {
      analyzeScheduled = false
      if (!active || !settings) return
      const batch = [...pendingTokens].slice(0, ANALYZE_CHUNK)
      if (batch.length === 0) return
      for (const t of batch) pendingTokens.delete(t)

      const result: Record<string, TokenInfo> = await sendMessage({
        type: 'ANALYZE_TOKENS',
        payload: { lang: settings.targetLanguage, tokens: batch },
      }).catch(() => ({}))
      if (!active) return

      const affectedLemmas = new Set<string>()
      for (const [token, info] of Object.entries(result || {})) {
        tokenInfo.set(token, info)
        if (!lemmaStatus.has(info.lemma)) lemmaStatus.set(info.lemma, { status: info.status, level: info.level })
        affectedLemmas.add(info.lemma)
      }
      // Paint every span whose token just got resolved (progressively)
      for (const span of document.querySelectorAll<HTMLElement>('.ci-word:not([data-lemma])')) {
        if (result[span.dataset.word || '']) paintSpan(span)
      }
      refreshScore()

      if (pendingTokens.size > 0) {
        analyzeScheduled = true
        setTimeout(runAnalysis, 50)
      }
    }

    // ── Wrapping ────────────────────────────────────────────

    function wrapUnder(root: Node, onDone?: () => void) {
      const nodes = collectTextNodes(root)
      let i = 0
      const step = () => {
        if (!active) return
        wrapping = true
        const spans: HTMLElement[] = []
        const tokens = new Set<string>()
        for (const end = Math.min(i + WRAP_BATCH, nodes.length); i < end; i++) {
          for (const span of wrapTextNode(nodes[i])) {
            spans.push(span)
            tokens.add(span.dataset.word || '')
          }
        }
        wrapping = false
        queueAnalysis(tokens, spans)
        if (i < nodes.length) {
          ;(window.requestIdleCallback || window.requestAnimationFrame)(step)
        } else {
          onDone?.()
        }
      }
      step()
    }

    function observeMutations() {
      observer = new MutationObserver((mutations) => {
        if (wrapping || !active) return
        const roots: Node[] = []
        for (const m of mutations) {
          for (const node of m.addedNodes) {
            if (node.nodeType === Node.ELEMENT_NODE || node.nodeType === Node.TEXT_NODE) {
              if ((node as HTMLElement).closest?.('#ci-tooltip, #ci-badge')) continue
              roots.push(node)
            }
          }
        }
        if (roots.length === 0) return
        if (mutationTimer) clearTimeout(mutationTimer)
        mutationTimer = setTimeout(() => {
          for (const root of roots) {
            if (root.isConnected) wrapUnder(root)
          }
        }, 300)
      })
      observer.observe(document.body, { childList: true, subtree: true })
    }

    // ── Scoring + badge ─────────────────────────────────────

    function extractArticleTokens(): string[] {
      try {
        const clone = document.cloneNode(true) as Document
        const article = new Readability(clone).parse()
        if (article?.textContent && article.textContent.trim().length > 200) {
          return tokenize(article.textContent)
        }
      } catch {}
      return tokenize(document.body.innerText || '')
    }

    function refreshScore() {
      if (articleTokens.length === 0) return
      pageScore = scoreTokens(articleTokens, statusOf)
      renderBadge()
    }

    function renderBadge() {
      if (!pageScore || !active) return
      if (!badge) {
        badge = document.createElement('div')
        badge.id = 'ci-badge'
        badge.className = 'ci-badge'
        document.body.appendChild(badge)
      }
      const analyzed = pageScore.countableTokens > 0
      const pct = Math.round(pageScore.score * 100)
      badge.innerHTML = analyzed
        ? `
          <span class="ci-score">${pct}%</span>
          <span>
            <span class="ci-label">${difficultyLabel(pageScore.score)}</span><br/>
            <span class="ci-detail">${pageScore.uniqueUnknown.length >= 50 ? '50+' : pageScore.uniqueUnknown.length} unknown · ${pageScore.learningTokens} learning</span>
          </span>
          <button class="ci-mark-read" title="Mark every remaining unknown word on this page as known">✓ Read</button>
          <button class="ci-close" title="Deactivate reader">✕</button>
        `
        : `<span class="ci-detail">Analyzing page…</span><button class="ci-close">✕</button>`

      badge.querySelector('.ci-mark-read')?.addEventListener('click', markPageRead)
      badge.querySelector('.ci-close')?.addEventListener('click', deactivate)
    }

    async function markPageRead() {
      if (!pageScore || !settings) return
      const unknown = new Set<string>()
      for (const token of articleTokens) {
        const info = statusOf(token)
        if (info && info.status === 'unknown') unknown.add(info.lemma)
      }
      if (unknown.size === 0) return
      if (!confirm(`Mark ${unknown.size} unknown words on this page as known?`)) return
      const resp = await sendMessage({
        type: 'MARK_PAGE_READ',
        payload: { lang: settings.targetLanguage, lemmas: [...unknown] },
      }).catch(() => null)
      if (!resp) return
      for (const lemma of unknown) {
        lemmaStatus.set(lemma, { status: 'known' })
        repaintLemma(lemma)
      }
      refreshScore()
    }

    async function saveLibraryEntry() {
      if (!pageScore || !settings || pageScore.countableTokens < 50) return
      const url = location.origin + location.pathname
      sendMessage({
        type: 'SAVE_LIBRARY_ENTRY',
        payload: {
          id: '', // background derives id from url
          url,
          title: document.title || url,
          lang: settings.targetLanguage,
          kind: 'page',
          score: pageScore.score,
          countableTokens: pageScore.countableTokens,
          knownTokens: pageScore.knownTokens,
          uniqueLemmas: Object.keys(pageScore.lemmaCounts).length,
          unknownLemmas: pageScore.uniqueUnknown.length,
          lemmaCounts: pageScore.lemmaCounts,
          excerpt: (document.body.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 200),
          pinned: false,
        },
      }).catch(() => {})
    }

    // ── Activation ──────────────────────────────────────────

    async function activate() {
      if (active || activating) return
      activating = true
      try {
        settings = await sendMessage({ type: 'GET_SETTINGS' })
        if (!settings) return
        active = true
        activatedAt = Date.now()
        exposuresSent = false
        interactedLemmas.clear()

        if (!styleEl) {
          styleEl = document.createElement('style')
          styleEl.textContent = STYLE
          document.head.appendChild(styleEl)
        }
        document.body.dataset.from = settings.targetLanguage
        document.body.dataset.to = settings.nativeLanguage

        if (!tooltipAttached) {
          tooltip.attach()
          tooltipAttached = true
        }
        tooltip.setPrimaryTranslation(settings.primaryTranslation)

        articleTokens = extractArticleTokens()
        // Article tokens may include text the wrapper never touches (e.g.
        // Readability pulled it from a hidden element) — queue them too.
        queueAnalysis(new Set(articleTokens), [])

        wrapUnder(document.body, () => {
          refreshScore()
          // Save to library once the first full analysis lands
          setTimeout(saveLibraryEntry, 4000)
        })
        observeMutations()
        renderBadge()
      } finally {
        activating = false
      }
    }

    function deactivate() {
      sendExposures()
      active = false
      observer?.disconnect()
      observer = null
      unwrapAll(document.body)
      badge?.remove()
      badge = null
      document.getElementById('ci-tooltip')?.remove()
      delete document.body.dataset.from
      delete document.body.dataset.to
      tokenInfo.clear()
      lemmaStatus.clear()
      articleTokens = []
      pageScore = null
      pendingTokens = new Set()
    }

    browser.runtime.onMessage.addListener((message: any, _sender, sendResponse) => {
      if (message?.type === 'TOGGLE_READER') {
        if (active) deactivate()
        else activate()
        sendResponse({ active })
      } else if (message?.type === 'GET_READER_STATE') {
        sendResponse({ active })
      } else if (message?.type === 'SETTINGS_UPDATED') {
        settings = message.payload
        if (active && settings) {
          document.body.dataset.from = settings.targetLanguage
          document.body.dataset.to = settings.nativeLanguage
          tooltip.setPrimaryTranslation(settings.primaryTranslation)
        }
        sendResponse({ ok: true })
      }
      return false
    })

    // Leaving the page counts the reading session's passive exposures
    window.addEventListener('pagehide', sendExposures)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') sendExposures()
    })

    // Auto-activate on allowlisted hosts
    sendMessage({ type: 'GET_SETTINGS' })
      .then((s: Settings) => {
        if (s?.autoHosts?.includes(location.hostname)) activate()
      })
      .catch(() => {})
  },
})
