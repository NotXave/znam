import type { DictEntry, LearningLevel, Message, ReversoResult, WordStatus } from '../utils/types'

interface LookupData {
  word: string
  googleText: string
  googleAlternatives: string[]
  deeplText: string
  deeplAlternatives: string[]
  definitions: DictEntry[]
  reverso: ReversoResult
  isPhrase: boolean
  pendingSources: number
}

interface LookupTarget {
  from: string
  to: string
  context: string
}

/** Reader-side view of the word-knowledge store (backed by ANALYZE_TOKENS results). */
export interface WordStatusApi {
  lemmaFor(span: HTMLElement): string
  statusFor(lemma: string): WordStatus | 'unknown' | 'name'
  levelFor(lemma: string): LearningLevel | undefined
  set(
    lemma: string,
    status: WordStatus | 'unknown',
    extras?: { translation?: string; context?: string; level?: LearningLevel },
  ): void
  /** Persist a chosen translation without touching status/level. */
  setTranslation(lemma: string, translation: string): void
  /** Count that the user looked this word up (a "hard word" signal). */
  recordLookup(lemma: string): void
  /** The translation the user previously saved for this word, if any. */
  getSavedTranslation(lemma: string): Promise<string | undefined>
}

const BLOCK_SELECTOR = 'p,li,blockquote,h1,h2,h3,h4,h5,h6,td,dd,figcaption,article,div'

function contextForSpan(span: HTMLElement): string {
  const block = span.closest(BLOCK_SELECTOR)
  const text = (block?.textContent || '').replace(/\s+/g, ' ').trim()
  return text.length > 300 ? '' : text
}

function targetForSpan(span: HTMLElement): LookupTarget {
  const layer = span.closest('[data-from]') as HTMLElement | null
  return {
    from: layer?.dataset.from || 'en',
    to: layer?.dataset.to || 'en',
    context: contextForSpan(span),
  }
}

export class ReaderTooltip {
  private tooltip: HTMLElement | null = null
  private primaryTranslation: 'google' | 'reverso' | 'deepl' = 'google'
  private lookupSeq = 0
  private ddOpen = false
  private activeWord = ''
  private activeLemma = ''
  private openedAtScrollY = 0
  private lastClickedSpan: HTMLElement | null = null
  /** Translation the user manually picked — kept across later re-renders. */
  private pickedTranslation: string | null = null

  constructor(
    private sendMessage: (msg: Message) => Promise<any>,
    private statusApi: WordStatusApi,
  ) {}

  setPrimaryTranslation(source: 'google' | 'reverso' | 'deepl') {
    this.primaryTranslation = source
  }

  private static hasSelection(): boolean {
    const sel = window.getSelection()
    return !!sel && !sel.isCollapsed && sel.toString().trim().length > 0
  }

  attach() {
    // Capture-phase mousedown: keep page handlers from hijacking clicks
    // and drag-selections that start on a word.
    document.addEventListener('mousedown', (e) => {
      if ((e.target as HTMLElement).closest?.('.ci-word')) {
        e.stopPropagation()
      }
    }, true)

    document.addEventListener('click', (e) => {
      if (this.tooltip?.contains(e.target as Node)) return
      const span = (e.target as HTMLElement).closest?.('.ci-word') as HTMLElement | null
      if (!span) return
      if (ReaderTooltip.hasSelection()) return // selection in progress → handled on mouseup
      e.preventDefault()
      e.stopPropagation()

      // Shift-click: phrase from the previously clicked word to this one —
      // works even where the site blocks drag-selection (video captions).
      if (e.shiftKey && this.lastClickedSpan && this.lastClickedSpan !== span && this.lastClickedSpan.isConnected) {
        const all = Array.from(document.querySelectorAll('.ci-word')) as HTMLElement[]
        let a = all.indexOf(this.lastClickedSpan)
        let b = all.indexOf(span)
        if (a >= 0 && b >= 0) {
          if (a > b) [a, b] = [b, a]
          const phrase = all.slice(a, b + 1)
            .map(w => (w.getAttribute('data-word') || w.textContent || '').trim())
            .filter(Boolean)
            .join(' ')
          if (phrase && phrase.length <= 300) {
            const rect = span.getBoundingClientRect()
            this.startLookup(phrase, rect.left, rect.bottom + 4, true, targetForSpan(span))
            return
          }
        }
      }

      const word = span.getAttribute('data-word') || span.textContent
      if (!word || !word.trim()) return
      this.lastClickedSpan = span
      const rect = span.getBoundingClientRect()
      this.startLookup(word.trim(), rect.left, rect.bottom + 4, false, targetForSpan(span), span)
    }, true)

    // Click outside tooltip (and not on a word) → close tooltip
    document.addEventListener('click', (e) => {
      if (!this.tooltip) return
      const t = e.target as HTMLElement
      if (this.tooltip.contains(t)) return
      if (t.closest?.('.ci-word')) return
      if (ReaderTooltip.hasSelection()) return
      this.closeTooltip()
    }, true)

    // Multi-word selection → snap to whole words, translate the phrase
    document.addEventListener('mouseup', () => {
      setTimeout(() => {
        const sel = window.getSelection()
        if (!sel || sel.isCollapsed || sel.rangeCount === 0) return
        const range = sel.getRangeAt(0)
        const words = (Array.from(document.querySelectorAll('.ci-word')) as HTMLElement[])
          .filter(w => range.intersectsNode(w))
        if (words.length === 0) return

        if (words.length === 1) {
          // Partial drag inside a single word → treat as a normal word click
          sel.removeAllRanges()
          const w = words[0]
          const word = (w.getAttribute('data-word') || w.textContent || '').trim()
          if (!word || (word === this.activeWord && this.tooltip)) return
          const rect = w.getBoundingClientRect()
          this.startLookup(word, rect.left, rect.bottom + 4, false, targetForSpan(w), w)
          return
        }

        // Snap the visible selection to whole-word boundaries
        try {
          range.setStartBefore(words[0])
          range.setEndAfter(words[words.length - 1])
          sel.removeAllRanges()
          sel.addRange(range)
        } catch {}

        const text = words
          .map(w => (w.getAttribute('data-word') || w.textContent || '').trim())
          .filter(Boolean)
          .join(' ')
        if (!text || text.length > 300) return
        const rect = range.getBoundingClientRect()
        this.startLookup(text, rect.left, rect.bottom + 4, true, targetForSpan(words[0]))
      }, 0)
    })

    // Escape always closes — clicking outside is blocked while a text
    // selection lingers, which can otherwise leave the tooltip stuck.
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.tooltip) {
        window.getSelection()?.removeAllRanges()
        this.closeTooltip()
      }
    })

    // Reading on — scrolling away dismisses the tooltip
    window.addEventListener('scroll', () => {
      if (this.tooltip && Math.abs(window.scrollY - this.openedAtScrollY) > 80) {
        this.closeTooltip()
      }
    }, { passive: true })

    // Right-click on a word → translate its sentence/block
    document.addEventListener('contextmenu', (e) => {
      const span = (e.target as HTMLElement).closest?.('.ci-word') as HTMLElement | null
      if (!span) return
      const target = targetForSpan(span)
      if (!target.context || !target.context.trim()) return
      e.preventDefault()
      e.stopPropagation()
      const rect = span.getBoundingClientRect()
      this.startLookup(target.context.trim(), rect.left, rect.bottom + 4, true, target)
    }, true)
  }

  private closeTooltip() {
    this.tooltip?.remove()
    this.tooltip = null
    this.activeWord = ''
    this.activeLemma = ''
    this.lookupSeq++ // invalidate in-flight lookups
  }

  private msgWithTimeout(msg: Message, ms = 8000): Promise<any> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => { resolve('') }, ms)
      this.sendMessage(msg).then((r: any) => { clearTimeout(timer); resolve(r) }).catch(() => { clearTimeout(timer); resolve('') })
    })
  }

  private chooseTranslation(data: LookupData): string {
    const reversoText = data.reverso.translations[0] || ''
    if (this.primaryTranslation === 'reverso' && reversoText) return reversoText
    if (this.primaryTranslation === 'deepl' && data.deeplText) return data.deeplText
    return data.googleText || data.deeplText || reversoText
  }

  // Progressive lookup: render as soon as the first source answers,
  // update the tooltip as the remaining sources arrive.
  private startLookup(text: string, x: number, y: number, isPhrase: boolean, target: LookupTarget, span?: HTMLElement) {
    const seq = ++this.lookupSeq
    this.activeWord = text
    // Single word → its lemma. Short phrase (2–4 words) → saveable as a
    // multi-word vocab item keyed by the phrase itself. Longer selections
    // (e.g. a right-clicked sentence) aren't saved, only translated.
    if (isPhrase) {
      const normalized = text.toLowerCase().replace(/\s+/g, ' ').trim()
      const wordCount = normalized.split(' ').length
      this.activeLemma = wordCount >= 2 && wordCount <= 4 && normalized.length <= 40 ? normalized : ''
    } else {
      this.activeLemma = span ? this.statusApi.lemmaFor(span) : ''
    }
    this.ddOpen = false
    this.pickedTranslation = null
    this.openedAtScrollY = window.scrollY

    const label = isPhrase && text.length > 60 ? text.slice(0, 60) + '…' : text
    this.showLoadingTooltip(label, x, y)

    const { from, to, context } = target

    // Clicking a word you don't know is itself the "I'm learning this" signal —
    // color it immediately (level 1) instead of waiting for the translation.
    const wasUnknown = !!this.activeLemma && this.statusApi.statusFor(this.activeLemma) === 'unknown'
    if (wasUnknown) {
      this.statusApi.set(this.activeLemma, 'learning', { level: 1, context })
    }
    // Every single-word lookup counts — even re-checking a word you "know"
    if (this.activeLemma) this.statusApi.recordLookup(this.activeLemma)

    // Always query DeepL too, so its translation is available to compare and
    // pick in the dropdown (throttled + cached in the background).
    const data: LookupData = {
      word: label,
      googleText: '',
      googleAlternatives: [],
      deeplText: '',
      deeplAlternatives: [],
      definitions: [],
      reverso: { translations: [], examples: [] },
      isPhrase,
      pendingSources: (isPhrase ? 2 : 3) + 1,
    }

    let translationSaved = false
    const render = () => {
      if (seq !== this.lookupSeq) return
      // A saved/picked translation stays the current one across every render
      // (fresh sources fill the dropdown but never override the user's choice).
      const translation = this.pickedTranslation || this.chooseTranslation(data)
      if (!translation && data.pendingSources > 0) return // nothing to show yet
      this.showTooltip(data, translation || '(no translation)', x, y)
      // Auto-save the primary only for a brand-new word with no saved choice
      if (translation && !translationSaved && wasUnknown && this.activeLemma && !this.pickedTranslation) {
        translationSaved = true
        this.statusApi.setTranslation(this.activeLemma, translation)
      }
    }

    // Restore a previously chosen translation for this word so reopening it
    // shows your pick, not the default source again.
    if (this.activeLemma) {
      this.statusApi.getSavedTranslation(this.activeLemma).then((saved) => {
        if (seq !== this.lookupSeq) return
        if (saved && !this.pickedTranslation) {
          this.pickedTranslation = saved
          render()
        }
      }).catch(() => {})
    }

    const done = () => {
      data.pendingSources--
      render()
    }

    this.msgWithTimeout({ type: 'TRANSLATE', payload: { text, from, to } }, 12000).then((r) => {
      if (r && typeof r === 'object') {
        data.googleText = (r as { text: string }).text || ''
        data.googleAlternatives = (r as { alternatives: string[] }).alternatives || []
      } else if (typeof r === 'string') {
        data.googleText = r
      }
      done()
    })

    this.msgWithTimeout({ type: 'REVERSO_LOOKUP', payload: { text, from, to } }, 8000).then((r) => {
      if (r && typeof r === 'object') data.reverso = r as ReversoResult
      done()
    })

    this.msgWithTimeout({ type: 'DEEPL_LOOKUP', payload: { text, from, to } }, 12000).then((r) => {
      if (r && typeof r === 'object') {
        data.deeplText = (r as { text: string }).text || ''
        data.deeplAlternatives = (r as { alternatives: string[] }).alternatives || []
      }
      done()
    })

    if (!isPhrase) {
      this.msgWithTimeout({ type: 'DICTIONARY_LOOKUP', payload: { word: text, lang: from } }, 8000).then((r) => {
        if (Array.isArray(r)) data.definitions = r
        done()
      })
    }
  }

  private tooltipBaseStyle(x: number, y: number, width: number) {
    // Flip above the click point when there is no room below
    const flip = y > window.innerHeight - 220
    return {
      position: 'fixed',
      top: flip ? '' : `${y + 6}px`,
      bottom: flip ? `${window.innerHeight - y + 30}px` : '',
      left: `${Math.max(4, Math.min(x, window.innerWidth - width))}px`,
      zIndex: '2147483647',
      background: '#1a1a2e',
      color: '#fff',
      padding: '10px 14px',
      borderRadius: '8px',
      boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
      fontFamily: 'sans-serif',
      fontSize: '13px',
      lineHeight: '1.5',
      textAlign: 'left' as const,
    }
  }

  // Reuse the tooltip element across updates — recreating it would replay
  // the fade-in animation on every progressive render (visible blinking).
  private ensureTooltip(): HTMLElement {
    // In fullscreen only the fullscreen element renders, so mount the tooltip
    // there (e.g. the YouTube player) — otherwise it would be invisible.
    const host = document.fullscreenElement || document.body
    if (!this.tooltip || !this.tooltip.isConnected || this.tooltip.parentElement !== host) {
      if (!this.tooltip) {
        this.tooltip = document.createElement('div')
        this.tooltip.id = 'ci-tooltip'
      }
      host.appendChild(this.tooltip)
    }
    return this.tooltip
  }

  private showLoadingTooltip(word: string, x: number, y: number) {
    const el = this.ensureTooltip()
    el.removeAttribute('style')
    Object.assign(el.style, this.tooltipBaseStyle(x, y, 180), { color: '#999' })
    el.textContent = `⏳ ${word}`
  }

  // Lute-style level colors: 1 = just met (red) … 5 = almost known (green)
  static readonly LEVEL_COLORS = ['#c14b4b', '#c1774b', '#b8a12e', '#8fa32e', '#5d9e4a']

  private savedFooterHtml(isPhrase: boolean): string {
    if (!this.activeLemma) {
      // A right-clicked sentence / long phrase isn't saved as a word
      return isPhrase
        ? `<div style="margin-top:6px;font-size:10px;color:#666;border-top:1px solid #1a1a30;padding-top:4px">Too long to save as a word</div>`
        : ''
    }
    const saved = this.statusApi.statusFor(this.activeLemma) !== 'unknown'
    return `<div style="margin-top:6px;font-size:10px;color:${saved ? '#5d9e4a' : '#666'};border-top:1px solid #1a1a30;padding-top:4px">${
      saved ? `✓ Saved to your ${isPhrase ? 'phrases' : 'words'}` : 'Removed from your words'
    }</div>`
  }

  private statusRowHtml(): string {
    if (!this.activeLemma) return ''
    const status = this.statusApi.statusFor(this.activeLemma)
    const level = this.statusApi.levelFor(this.activeLemma) ?? 1
    const btn = (action: string, label: string, active: boolean, bg?: string, title = '') =>
      `<span class="ci-status-btn" data-action="${action}" title="${title}" style="cursor:pointer;padding:2px 7px;border-radius:4px;font-size:11px;background:${active ? (bg || '#2d4a77') : '#242440'};color:${active ? '#fff' : '#aaa'}">${label}</span>`
    const levels = [1, 2, 3, 4, 5]
      .map(l => btn(`level-${l}`, String(l), status === 'learning' && level === l,
        ReaderTooltip.LEVEL_COLORS[l - 1], `Learning stage ${l}`))
      .join('')
    return `
      <div class="ci-status-row" style="display:flex;gap:4px;margin-top:6px;border-top:1px solid #1a1a30;padding-top:6px;align-items:center;flex-wrap:wrap">
        ${levels}
        <span style="color:#333">|</span>
        ${btn('known', '✓ Known', status === 'known', '#2d6e3e')}
        ${btn('ignored', 'Ignore', status === 'ignored')}
        ${btn('unknown', 'Reset', status === 'unknown' || status === 'name')}
      </div>
    `
  }

  private showTooltip(data: LookupData, translation: string, x: number, y: number) {
    this.tooltip = this.ensureTooltip()
    this.tooltip.removeAttribute('style')

    const esc = (s: string) => this.esc(s)

    const dropdownItems: string[] = []

    const deeplItems = data.deeplAlternatives.length > 0
      ? data.deeplAlternatives
      : (data.deeplText ? [data.deeplText] : [])
    if (deeplItems.length > 0) {
      dropdownItems.push(`<div class="ci-dd-source">DeepL</div>`)
      deeplItems.forEach((alt) => {
        const checked = alt === translation ? '#8ab4f8' : 'transparent'
        dropdownItems.push(`<div class="ci-dd-item" data-value="${esc(alt)}"><span class="ci-check" style="color:${checked}">✓</span>${esc(alt)}</div>`)
      })
    }

    const googleItems = data.googleAlternatives.length > 0
      ? data.googleAlternatives
      : (data.googleText ? [data.googleText] : [])
    if (googleItems.length > 0) {
      dropdownItems.push(`<div class="ci-dd-source">Google Translate</div>`)
      googleItems.forEach((alt) => {
        const checked = alt === translation ? '#8ab4f8' : 'transparent'
        dropdownItems.push(`<div class="ci-dd-item" data-value="${esc(alt)}"><span class="ci-check" style="color:${checked}">✓</span>${esc(alt)}</div>`)
      })
    }

    if (data.reverso.translations.length > 0) {
      dropdownItems.push(`<div class="ci-dd-source">Reverso Context</div>`)
      data.reverso.translations.slice(0, 6).forEach((t) => {
        const checked = t === translation ? '#8ab4f8' : 'transparent'
        dropdownItems.push(`<div class="ci-dd-item" data-value="${esc(t)}"><span class="ci-check" style="color:${checked}">✓</span>${esc(t)}</div>`)
      })
    }

    if (data.reverso.examples.length > 0) {
      dropdownItems.push(`<div class="ci-dd-source">Examples (Reverso)</div>`)
      data.reverso.examples.slice(0, 4).forEach((ex) => {
        dropdownItems.push(`<div class="ci-dd-example"><span style="color:#ddd">${esc(ex.source)}</span><br/><span style="color:#8ab4f8">${esc(ex.target)}</span></div>`)
      })
    }

    if (data.definitions.length > 0) {
      dropdownItems.push(`<div class="ci-dd-source">Wiktionary</div>`)
      data.definitions.slice(0, 3).forEach((d) => {
        const pos = d.partOfSpeech ? `<span style="color:#aaa;font-size:11px;display:block">${esc(d.partOfSpeech)}</span>` : ''
        const defs = d.definitions.slice(0, 3).map((def) => `<div style="font-size:12px;padding-left:4px">${esc(def)}</div>`).join('')
        dropdownItems.push(`<div style="padding:3px 4px;border-top:1px solid #1a1a30">${pos}${defs}</div>`)
      })
    }

    const stillLoading = data.pendingSources > 0
    if (stillLoading) {
      dropdownItems.push(`<div style="padding:4px;color:#666;font-size:11px;text-align:center">⏳ Loading more sources…</div>`)
    }

    const dropdownContent = dropdownItems.length > 0
      ? dropdownItems.join('')
      : '<div style="padding:8px 4px;color:#666;font-size:12px;text-align:center">No additional meanings found</div>'

    const hasDropdown = dropdownItems.length > 0

    Object.assign(this.tooltip.style, this.tooltipBaseStyle(x, y, 380), {
      maxWidth: '380px',
      minWidth: '180px',
    })

    this.tooltip.innerHTML = `
      <div style="display:flex;align-items:baseline;gap:8px;margin-bottom:2px">
        <span style="font-size:${data.isPhrase ? 13 : 16}px;font-weight:600;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(data.word)}</span>
        <span class="ci-dd-toggle" style="cursor:${hasDropdown ? 'pointer' : 'default'};color:#8ab4f8;font-size:14px;display:inline-flex;align-items:center;gap:4px">
          <span class="ci-dd-current">${esc(translation)}</span>
          <span class="ci-dd-arrow" style="font-size:10px;transition:transform 0.15s">${hasDropdown ? '▶' : ''}</span>
        </span>
        <span class="ci-tooltip-close" style="margin-left:auto;cursor:pointer;color:#555;font-size:12px;padding-left:6px">✕</span>
      </div>
      <div class="ci-dd-body" style="display:${this.ddOpen ? 'block' : 'none'};margin-top:4px;max-height:300px;overflow-y:auto;padding:4px;background:#16162a;border-radius:6px">
        ${dropdownContent}
      </div>
      ${this.statusRowHtml()}
      ${this.savedFooterHtml(data.isPhrase)}
    `

    const toggle = this.tooltip.querySelector('.ci-dd-toggle') as HTMLElement | null
    const arrow = this.tooltip.querySelector('.ci-dd-arrow') as HTMLElement | null
    const body = this.tooltip.querySelector('.ci-dd-body') as HTMLElement | null

    if (arrow && this.ddOpen) arrow.style.transform = 'rotate(90deg)'

    if (toggle && body && arrow) {
      toggle.addEventListener('click', (e) => {
        e.stopPropagation()
        this.ddOpen = !this.ddOpen
        body.style.display = this.ddOpen ? 'block' : 'none'
        arrow.style.transform = this.ddOpen ? 'rotate(90deg)' : 'rotate(0deg)'
      })
    }

    if (body) {
      body.addEventListener('click', (e) => {
        const item = (e.target as HTMLElement).closest('.ci-dd-item') as HTMLElement | null
        if (!item) return
        e.stopPropagation()
        const val = item.getAttribute('data-value') || ''
        const current = this.tooltip?.querySelector('.ci-dd-current')
        if (current) current.textContent = val
        body.querySelectorAll('.ci-check').forEach(el => {
          (el as HTMLElement).style.color = 'transparent'
        })
        const activeCheck = item.querySelector('.ci-check') as HTMLElement | null
        if (activeCheck) activeCheck.style.color = '#8ab4f8'
        // Remember the pick so later re-renders don't revert it
        if (val) this.pickedTranslation = val
        // Persist the chosen translation for this word (words only, not phrases)
        if (this.activeLemma && val) this.statusApi.setTranslation(this.activeLemma, val)
        this.ddOpen = false
        body.style.display = 'none'
        if (arrow) arrow.style.transform = 'rotate(0deg)'
      })
    }

    const statusRow = this.tooltip.querySelector('.ci-status-row') as HTMLElement | null
    if (statusRow) {
      statusRow.addEventListener('click', (e) => {
        const btn = (e.target as HTMLElement).closest('.ci-status-btn') as HTMLElement | null
        if (!btn || !this.activeLemma) return
        e.stopPropagation()
        const action = btn.getAttribute('data-action') || ''
        const currentTranslation = this.tooltip?.querySelector('.ci-dd-current')?.textContent || ''
        const levelMatch = action.match(/^level-([1-5])$/)
        if (levelMatch) {
          this.statusApi.set(this.activeLemma, 'learning', {
            translation: currentTranslation,
            level: Number(levelMatch[1]) as LearningLevel,
          })
        } else {
          this.statusApi.set(this.activeLemma, action as WordStatus | 'unknown', { translation: currentTranslation })
        }
        // Full re-render updates the active status button
        this.showTooltip(data, currentTranslation || translation, x, y)
      })
    }

    this.tooltip.querySelector('.ci-tooltip-close')?.addEventListener('click', () => {
      this.closeTooltip()
    })
  }

  private esc(s: string): string {
    if (!s) return ''
    const div = document.createElement('div')
    div.textContent = s
    return div.innerHTML
  }
}
