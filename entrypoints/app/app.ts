import type {
  LanguageState,
  LibraryEntry,
  Message,
  SetupEvent,
  WordRecord,
  WordStatus,
} from '../../utils/types'
import { getSettings, saveSettings } from '../../utils/settings'
import { difficultyLabel, rescoreLemmaCounts } from '../../utils/scoring'
import { parseVocabFile, wordsToAnki, wordsToCsv } from '../../utils/csv-import'
import type { CalibrationSample } from '../../utils/calibration'

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T

function send(msg: Message): Promise<any> {
  return browser.runtime.sendMessage(msg)
}

let lang = 'pl'

const LANGUAGES: [string, string][] = [
  ['pl', 'Polish'], ['en', 'English'], ['de', 'German'], ['ja', 'Japanese'],
  ['es', 'Spanish'], ['fr', 'French'], ['it', 'Italian'], ['pt', 'Portuguese'],
  ['nl', 'Dutch'], ['sv', 'Swedish'], ['cs', 'Czech'], ['sk', 'Slovak'],
  ['uk', 'Ukrainian'], ['ru', 'Russian'], ['ro', 'Romanian'], ['hu', 'Hungarian'],
  ['bg', 'Bulgarian'], ['el', 'Greek'], ['tr', 'Turkish'], ['ko', 'Korean'],
]

// ── Tabs ────────────────────────────────────────────────────

const refreshers: Record<string, () => void> = {
  library: renderLibrary,
  words: renderWords,
  languages: renderLanguageState,
  import: () => {},
  calibrate: () => {},
}

function switchTab(name: string) {
  document.querySelectorAll('nav button').forEach(b =>
    b.classList.toggle('active', (b as HTMLElement).dataset.tab === name),
  )
  document.querySelectorAll('.tab').forEach(t =>
    t.classList.toggle('active', t.id === `tab-${name}`),
  )
  refreshers[name]?.()
}

// ── Library ─────────────────────────────────────────────────

async function renderLibrary() {
  const list = $('library-list')
  const [entries, words] = await Promise.all([
    send({ type: 'GET_LIBRARY', payload: { lang } }) as Promise<LibraryEntry[]>,
    send({ type: 'GET_WORDS', payload: { lang } }) as Promise<WordRecord[]>,
  ])
  if (!Array.isArray(entries)) return

  // Live rescoring against current knowledge — no refetching pages
  const statusMap = new Map<string, WordStatus>()
  for (const w of words ?? []) statusMap.set(w.lemma, w.status)
  const scored = entries.map(e => {
    const r = rescoreLemmaCounts(e.lemmaCounts || {}, l => statusMap.get(l))
    return { ...e, score: r.countableTokens > 0 ? r.score : e.score, unknownLemmas: r.unknownLemmas }
  })

  const pinnedOnly = $<HTMLInputElement>('lib-pinned-only').checked
  const sort = $<HTMLSelectElement>('lib-sort').value
  let items = pinnedOnly ? scored.filter(e => e.pinned) : scored
  if (sort === 'score-desc') items.sort((a, b) => b.score - a.score)
  else if (sort === 'score-asc') items.sort((a, b) => a.score - b.score)
  else if (sort === 'date') items.sort((a, b) => b.updatedAt - a.updatedAt)
  else if (sort === 'sweet') {
    const key = (e: LibraryEntry) => {
      if (e.score >= 0.9 && e.score <= 0.98) return 2 + e.score
      return e.score > 0.98 ? 1 : e.score
    }
    items.sort((a, b) => key(b) - key(a))
  }

  list.innerHTML = ''
  if (items.length === 0) {
    list.innerHTML = '<div class="hint">Nothing here yet — activate the reader on a page and it will show up.</div>'
    return
  }
  for (const e of items) {
    const pct = Math.round(e.score * 100)
    const label = difficultyLabel(e.score)
    const item = document.createElement('div')
    item.className = 'item'
    item.innerHTML = `
      <span class="score-pill score-${label.replace(' ', '-').replace('sweet-spot', 'sweet')}" title="${label}">${pct}%</span>
      <div class="grow">
        <a href="${e.url}" target="_blank" rel="noopener"></a>
        <div class="meta">${e.kind === 'youtube' ? '▶ ' : ''}${e.unknownLemmas} unknown words · ${e.countableTokens.toLocaleString()} tokens · ${new Date(e.updatedAt).toLocaleDateString()}</div>
      </div>
      <button class="pin" title="Pin to reading list">${e.pinned ? '★' : '☆'}</button>
      <button class="del" title="Remove">✕</button>
    `
    ;(item.querySelector('a') as HTMLElement).textContent = e.title
    item.querySelector('.pin')!.addEventListener('click', async () => {
      await send({ type: 'SET_LIBRARY_PINNED', payload: { id: e.id, pinned: !e.pinned } })
      renderLibrary()
    })
    item.querySelector('.del')!.addEventListener('click', async () => {
      await send({ type: 'DELETE_LIBRARY_ENTRY', payload: { id: e.id } })
      renderLibrary()
    })
    list.appendChild(item)
  }
}

// ── Words ───────────────────────────────────────────────────

async function renderWords() {
  const list = $('word-list')
  const search = $<HTMLInputElement>('word-search').value.trim().toLowerCase()
  const filter = $<HTMLSelectElement>('word-filter').value as WordStatus | ''
  const words: WordRecord[] = await send({ type: 'GET_WORDS', payload: { lang } })
  if (!Array.isArray(words)) return

  let items = words
  if (filter) items = items.filter(w => w.status === filter)
  if (search) items = items.filter(w => w.lemma.includes(search) || (w.translation || '').toLowerCase().includes(search))
  items.sort((a, b) => b.updatedAt - a.updatedAt)

  $('word-count').textContent =
    `${words.filter(w => w.status === 'known').length.toLocaleString()} known · ` +
    `${words.filter(w => w.status === 'learning').length.toLocaleString()} learning · ` +
    `${words.filter(w => w.status === 'ignored').length.toLocaleString()} ignored` +
    (items.length !== words.length ? ` — showing ${items.length.toLocaleString()}` : '')

  list.innerHTML = ''
  const frag = document.createDocumentFragment()
  for (const w of items.slice(0, 500)) {
    const item = document.createElement('div')
    item.className = 'item'
    item.innerHTML = `
      <div class="grow">
        <b></b> <span class="status-${w.status}">${w.status}</span>
        <div class="meta"></div>
      </div>
      <div class="word-status">
        <button data-s="learning" ${w.status === 'learning' ? 'class="active"' : ''}>Learning</button>
        <button data-s="known" ${w.status === 'known' ? 'class="active"' : ''}>Known</button>
        <button data-s="ignored" ${w.status === 'ignored' ? 'class="active"' : ''}>Ignore</button>
        <button data-s="unknown" title="Forget">✕</button>
      </div>
    `
    ;(item.querySelector('b') as HTMLElement).textContent = w.lemma
    ;(item.querySelector('.meta') as HTMLElement).textContent =
      [w.translation, w.context].filter(Boolean).join(' — ').slice(0, 120)
    item.querySelector('.word-status')!.addEventListener('click', async (e) => {
      const btn = (e.target as HTMLElement).closest('button')
      if (!btn) return
      await send({
        type: 'SET_WORD_STATUS',
        payload: { lang, lemma: w.lemma, status: btn.dataset.s as any, source: 'manual' },
      })
      renderWords()
    })
    frag.appendChild(item)
  }
  list.appendChild(frag)
  if (items.length > 500) {
    const more = document.createElement('div')
    more.className = 'hint'
    more.textContent = `…and ${items.length - 500} more (narrow with search)`
    list.appendChild(more)
  }
}

function download(filename: string, text: string) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }))
  a.download = filename
  a.click()
  URL.revokeObjectURL(a.href)
}

// ── Languages ───────────────────────────────────────────────

async function renderLanguageState() {
  const state: LanguageState = await send({ type: 'GET_LANGUAGE_STATE', payload: { lang } })
  if (!state || (state as any).error) return
  $('lang-state').innerHTML = `
    <h2>${LANGUAGES.find(([c]) => c === lang)?.[1] ?? lang}</h2>
    <div>Lemma dictionary: <b>${state.dictReady ? `${state.dictForms.toLocaleString()} forms` : 'not installed'}</b></div>
    <div>Frequency list: <b>${state.freqReady ? `${state.freqLemmas.toLocaleString()} lemmas` : 'not installed'}</b></div>
    <div>Words: <b class="status-known">${state.counts.known.toLocaleString()} known</b> ·
      <b class="status-learning">${state.counts.learning.toLocaleString()} learning</b> ·
      ${state.counts.ignored.toLocaleString()} ignored</div>
    ${state.calibratedAt ? `<div class="hint">Calibrated ${new Date(state.calibratedAt).toLocaleDateString()}</div>` : ''}
  `
}

function runSetup(request: any) {
  const progress = $('setup-progress')
  const bar = $('setup-bar')
  const detail = $('setup-detail')
  progress.hidden = false
  $<HTMLButtonElement>('setup-download').disabled = true
  $<HTMLButtonElement>('setup-local').disabled = true

  const port = browser.runtime.connect({ name: 'language-setup' })
  port.onMessage.addListener((event: SetupEvent) => {
    if (event.type === 'PROGRESS') {
      bar.style.width = `${event.pct}%`
      detail.textContent = `${event.step}: ${event.detail}`
    } else if (event.type === 'DONE') {
      bar.style.width = '100%'
      detail.textContent = `Done — ${event.state.dictForms.toLocaleString()} forms installed`
      finish()
    } else if (event.type === 'ERROR') {
      detail.textContent = `Error: ${event.error}`
      finish()
    }
  })
  port.onDisconnect.addListener(finish)
  port.postMessage(request)

  function finish() {
    $<HTMLButtonElement>('setup-download').disabled = false
    $<HTMLButtonElement>('setup-local').disabled = false
    renderLanguageState()
  }
}

// ── Calibration ─────────────────────────────────────────────

let calSamples: CalibrationSample[] = []
let calAnswers: { rank: number; known: boolean }[] = []

async function calStart() {
  calSamples = await send({ type: 'CALIBRATION_SAMPLE', payload: { lang } })
  if (!Array.isArray(calSamples) || calSamples.length < 10) {
    $('cal-intro').querySelector('.hint')!.textContent =
      'No frequency data for this language — install language data first (Languages tab).'
    return
  }
  calAnswers = []
  $('cal-intro').hidden = true
  $('cal-quiz').hidden = false
  $('cal-result').hidden = true
  calShowWord()
}

function calShowWord() {
  const i = calAnswers.length
  if (i >= calSamples.length) {
    calFinish()
    return
  }
  $('cal-word').textContent = calSamples[i].lemma
  $('cal-progress').textContent = `${i + 1} / ${calSamples.length}`
}

async function calAnswer(known: boolean) {
  calAnswers.push({ rank: calSamples[calAnswers.length].rank, known })
  if (calAnswers.length >= calSamples.length) await calFinish()
  else calShowWord()
}

async function calFinish() {
  const { topN } = await send({ type: 'CALIBRATION_ESTIMATE', payload: { answers: calAnswers } })
  $('cal-quiz').hidden = true
  $('cal-result').hidden = false
  const slider = $<HTMLInputElement>('cal-slider')
  slider.value = String(Math.max(100, Math.min(50000, topN)))
  calSyncSlider()
}

function calSyncSlider() {
  const n = Number($<HTMLInputElement>('cal-slider').value)
  $('cal-topn').textContent = n.toLocaleString()
  $('cal-topn2').textContent = n.toLocaleString()
}

// ── Wire-up ─────────────────────────────────────────────────

async function init() {
  const langSel = $<HTMLSelectElement>('lang-select')
  for (const [code, name] of LANGUAGES) {
    const opt = document.createElement('option')
    opt.value = code
    opt.textContent = name
    langSel.appendChild(opt)
  }
  const settings = await getSettings()
  lang = settings.targetLanguage
  if (!LANGUAGES.some(([c]) => c === lang)) {
    const opt = document.createElement('option')
    opt.value = lang
    opt.textContent = lang
    langSel.appendChild(opt)
  }
  langSel.value = lang
  langSel.addEventListener('change', async () => {
    lang = langSel.value
    await saveSettings({ ...(await getSettings()), targetLanguage: lang })
    const activeTab = (document.querySelector('nav button.active') as HTMLElement)?.dataset.tab
    if (activeTab) refreshers[activeTab]?.()
  })

  document.querySelectorAll('nav button').forEach(b =>
    b.addEventListener('click', () => switchTab((b as HTMLElement).dataset.tab!)),
  )

  $('lib-pinned-only').addEventListener('change', renderLibrary)
  $('lib-sort').addEventListener('change', renderLibrary)

  $('word-search').addEventListener('input', renderWords)
  $('word-filter').addEventListener('change', renderWords)
  $('export-csv').addEventListener('click', async () => {
    const words: WordRecord[] = await send({ type: 'GET_WORDS', payload: { lang } })
    download(`znam-${lang}-words.csv`, wordsToCsv(words))
  })
  $('export-anki').addEventListener('click', async () => {
    const words: WordRecord[] = await send({ type: 'GET_WORDS', payload: { lang, status: 'learning' } })
    download(`znam-${lang}-anki.txt`, wordsToAnki(words))
  })

  $('setup-download').addEventListener('click', () =>
    runSetup({ type: 'SETUP_LANGUAGE', lang }),
  )
  $('setup-local').addEventListener('click', async () => {
    const lemmasFile = $<HTMLInputElement>('local-lemmas').files?.[0]
    const freqFile = $<HTMLInputElement>('local-freq').files?.[0]
    if (!lemmasFile || !freqFile) return
    runSetup({
      type: 'SETUP_LANGUAGE_LOCAL',
      lang,
      lemmasTsv: await lemmasFile.text(),
      freqTsv: await freqFile.text(),
    })
  })

  $('import-run').addEventListener('click', async () => {
    const file = $<HTMLInputElement>('import-file').files?.[0]
    const result = $('import-result')
    if (!file) {
      result.textContent = 'Pick a CSV file first.'
      return
    }
    const { format, entries, skippedPhrases } = parseVocabFile(await file.text())
    // Rows may carry a language as a code ("pl") or a full name ("Polish",
    // Lute does this); import matching rows or rows without a language.
    const langName = (LANGUAGES.find(([c]) => c === lang)?.[1] || '').toLowerCase()
    const matchesLang = (l: string) => {
      const v = l.trim().toLowerCase()
      return v === lang.toLowerCase() || v === langName
    }
    const anyLang = $<HTMLInputElement>('import-any-lang').checked
    const relevant = anyLang ? entries : entries.filter(e => !e.language || matchesLang(e.language))
    if (relevant.length === 0) {
      const seen = [...new Set(entries.map(e => e.language).filter(Boolean))].join(', ')
      result.textContent = `Detected ${format} format, but no rows for "${lang}"` +
        (seen ? ` — the file contains: ${seen}.` : ` (${entries.length} rows, none matched).`)
      return
    }
    const status = $<HTMLSelectElement>('import-status').value as WordStatus
    const resp = await send({ type: 'IMPORT_WORDS', payload: { lang, entries: relevant, status } })
    const parts = [
      `Detected ${format} format.`,
      `Imported ${resp.imported}, skipped ${resp.skipped} already-tracked words.`,
    ]
    if (skippedPhrases > 0) parts.push(`${skippedPhrases} multi-word terms skipped.`)
    if (relevant.length < entries.length) parts.push(`${entries.length - relevant.length} rows in other languages skipped.`)
    result.textContent = parts.join(' ')
  })

  $('cal-start').addEventListener('click', calStart)
  $('cal-know').addEventListener('click', () => calAnswer(true))
  $('cal-dont').addEventListener('click', () => calAnswer(false))
  $('cal-slider').addEventListener('input', calSyncSlider)
  $('cal-apply').addEventListener('click', async () => {
    const topN = Number($<HTMLInputElement>('cal-slider').value)
    const resp = await send({ type: 'CALIBRATION_APPLY', payload: { lang, topN } })
    $('cal-applied').textContent = `Marked ${resp.added.toLocaleString()} new words as known.`
    renderLanguageState()
  })

  renderLibrary()
}

init()
