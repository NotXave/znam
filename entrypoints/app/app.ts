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
import { parseVocabFile, wordsToAnki, wordsToCsv, type ParsedVocabFile } from '../../utils/csv-import'
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
  stats: renderStats,
  library: renderLibrary,
  words: renderWords,
  languages: renderLanguageState,
  import: () => {},
  calibrate: () => {},
}

interface Stats {
  counts: { known: number; learning: number; ignored: number }
  levels: number[]
  addedThisWeek: number
  daily: Record<string, number>
  totalWords: number
  youtube: { count: number; unlockAt: number; unlocked: boolean; estimate: number; watchedThisWeek: number }
  library: { total: number; pages: number; videos: number; readThisWeek: number; sweetSpot: number; avgScore: number }
}

const LEVEL_COLORS = ['#c14b4b', '#c1774b', '#b8a12e', '#8fa32e', '#5d9e4a']

function tile(num: string | number, label: string): string {
  return `<div class="stat-tile"><div class="num">${num}</div><div class="lbl">${label}</div></div>`
}

function bar(label: string, value: number, max: number, color: string): string {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0
  return `<div class="bar-row">
    <span class="bar-label">${label}</span>
    <span class="bar-track"><span class="bar-fill" style="width:${pct}%;background:${color}"></span></span>
    <span class="bar-num">${value.toLocaleString()}</span>
  </div>`
}

async function renderStats() {
  const s: Stats = await send({ type: 'GET_STATS', payload: { lang } })
  if (!s || (s as any).error) return

  document.getElementById('stats-tiles')!.innerHTML =
    tile(s.counts.known.toLocaleString(), 'Words known') +
    tile(s.counts.learning.toLocaleString(), 'Learning') +
    tile('+' + s.addedThisWeek.toLocaleString(), 'New this week') +
    tile(Math.round(s.library.avgScore * 100) + '%', 'Avg comprehensibility')

  const statusMax = Math.max(1, s.counts.known, s.counts.learning, s.counts.ignored)
  document.getElementById('stats-status')!.innerHTML =
    bar('Known', s.counts.known, statusMax, '#5d9e4a') +
    bar('Learning', s.counts.learning, statusMax, '#b8a12e') +
    bar('Ignored', s.counts.ignored, statusMax, '#555')

  const levelMax = Math.max(1, ...s.levels)
  document.getElementById('stats-levels')!.innerHTML =
    s.levels.map((n, i) => bar(`Stage ${i + 1}`, n, levelMax, LEVEL_COLORS[i])).join('')

  // Daily new-words chart over the last 30 days
  const days: { date: string; count: number }[] = []
  for (let i = 29; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10)
    days.push({ date: d, count: s.daily[d] || 0 })
  }
  const dayMax = Math.max(1, ...days.map(d => d.count))
  document.getElementById('stats-daily')!.innerHTML = days
    .map(d => `<div class="day" style="height:${Math.round((d.count / dayMax) * 100)}%" title="${d.date}: ${d.count} new"></div>`)
    .join('')

  const yt = s.youtube
  const ytEl = document.getElementById('stats-youtube')!
  if (yt.unlocked) {
    const pct = Math.round(yt.estimate * 100)
    const label = difficultyLabel(yt.estimate)
    ytEl.innerHTML = `
      <div style="display:flex;align-items:center;gap:14px">
        <span class="score-pill score-${label.replace(' ', '-').replace('sweet-spot', 'sweet')}" style="font-size:20px;min-width:70px">${pct}%</span>
        <div>
          <div>You understand roughly <b>${pct}%</b> of the ${LANGUAGES.find(([c]) => c === lang)?.[1] ?? lang} YouTube videos you watch — <span class="ci-label">${label}</span>.</div>
          <div class="hint">Estimated live from ${yt.count.toLocaleString()} watched videos${yt.watchedThisWeek ? ` · ${yt.watchedThisWeek} this week` : ''}. Updates as your vocabulary grows.</div>
        </div>
      </div>`
  } else {
    const left = yt.unlockAt - yt.count
    const pctBar = Math.round((yt.count / yt.unlockAt) * 100)
    ytEl.innerHTML = `
      <div>🔒 Watch <b>${left}</b> more ${lang} YouTube video${left === 1 ? '' : 's'} to unlock your comprehension estimate.</div>
      <div class="bar-row" style="margin-top:8px">
        <span class="bar-track"><span class="bar-fill" style="width:${pctBar}%;background:#2d4a77"></span></span>
        <span class="bar-num">${yt.count}/${yt.unlockAt}</span>
      </div>
      <div class="hint">Open ${lang} videos or Shorts (with subtitles) — each one watched counts.</div>`
  }

  const lib = s.library
  document.getElementById('stats-reading')!.innerHTML = `
    <div class="bar-row"><span class="bar-label">In library</span><span>${lib.total.toLocaleString()} items — ${lib.pages} pages, ${lib.videos} videos</span></div>
    <div class="bar-row"><span class="bar-label">This week</span><span>${lib.readThisWeek} read</span></div>
    <div class="bar-row"><span class="bar-label">Sweet spot</span><span>${lib.sweetSpot} at 90–98% comprehensible</span></div>
  `
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
  const statusMap = new Map<string, { status: WordStatus; level?: typeof words[number]['level'] }>()
  for (const w of words ?? []) statusMap.set(w.lemma, { status: w.status, level: w.level })
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
  else if (sort === 'channel') {
    // Group by channel (A–Z); items without one (web pages) go last, most
    // comprehensible first within each channel.
    items.sort((a, b) => {
      const ca = a.channel || '￿'
      const cb = b.channel || '￿'
      return ca.localeCompare(cb) || b.score - a.score
    })
  }
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
        <div class="meta"><span class="ci-channel"></span>${e.unknownLemmas} unknown words · ${e.countableTokens.toLocaleString()} tokens · ${new Date(e.updatedAt).toLocaleDateString()}</div>
      </div>
      <button class="pin" title="Pin to reading list">${e.pinned ? '★' : '☆'}</button>
      <button class="del" title="Remove">✕</button>
    `
    ;(item.querySelector('a') as HTMLElement).textContent = e.title
    ;(item.querySelector('.ci-channel') as HTMLElement).textContent =
      e.kind === 'youtube' ? `▶ ${e.channel ? e.channel + ' · ' : ''}` : ''
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

  const sort = $<HTMLSelectElement>('word-sort').value
  let items = words
  if (filter) items = items.filter(w => w.status === filter)
  if (search) items = items.filter(w => w.lemma.includes(search) || (w.translation || '').toLowerCase().includes(search))
  if (sort === 'lookups') items.sort((a, b) => (b.lookups ?? 0) - (a.lookups ?? 0) || b.updatedAt - a.updatedAt)
  else if (sort === 'alpha') items.sort((a, b) => a.lemma.localeCompare(b.lemma))
  else items.sort((a, b) => b.updatedAt - a.updatedAt)

  const min = Math.max(1, Number($<HTMLInputElement>('freq-threshold').value) || 1)
  const freqN = words.filter(w => (w.lookups ?? 0) >= min).length
  $('freq-count').textContent = freqN ? `${freqN} words` : 'no words yet'

  $('word-count').textContent =
    `${words.filter(w => w.status === 'known').length.toLocaleString()} known · ` +
    `${words.filter(w => w.status === 'learning').length.toLocaleString()} learning · ` +
    `${words.filter(w => w.status === 'ignored').length.toLocaleString()} ignored` +
    (items.length !== words.length ? ` — showing ${items.length.toLocaleString()}` : '')

  list.innerHTML = ''
  const frag = document.createDocumentFragment()
  for (const w of items.slice(0, 500)) {
    const level = w.level ?? 1
    const statusLabel = w.status === 'learning' ? `learning ${level}` : w.status
    const levelButtons = [1, 2, 3, 4, 5]
      .map(l =>
        `<button data-s="learning" data-l="${l}" class="lvl-${l}${w.status === 'learning' && level === l ? ' active' : ''}" title="Learning stage ${l}">${l}</button>`,
      )
      .join('')
    const lookups = w.lookups ?? 0
    const lookupBadge = lookups > 0 ? ` <span class="hint" title="times you looked it up">· ${lookups}× looked up</span>` : ''
    const item = document.createElement('div')
    item.className = 'item'
    item.innerHTML = `
      <div class="grow">
        <b></b> <span class="status-${w.status}">${statusLabel}</span>${lookupBadge}
        <div class="meta"></div>
      </div>
      <div class="word-status">
        ${levelButtons}
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
        payload: {
          lang,
          lemma: w.lemma,
          status: btn.dataset.s as any,
          level: btn.dataset.l ? (Number(btn.dataset.l) as any) : undefined,
          source: 'manual',
        },
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

  // Refresh the current tab when you come back to this page (e.g. after
  // watching a video in another tab) so scores reflect the words you learned.
  const refreshActiveTab = () => {
    const t = (document.querySelector('nav button.active') as HTMLElement | null)?.dataset.tab
    if (t) refreshers[t]?.()
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') refreshActiveTab()
  })
  window.addEventListener('focus', refreshActiveTab)

  $('lib-pinned-only').addEventListener('change', renderLibrary)
  $('lib-sort').addEventListener('change', renderLibrary)

  $('word-search').addEventListener('input', renderWords)
  $('word-filter').addEventListener('change', renderWords)
  $('word-sort').addEventListener('change', renderWords)
  $('export-csv').addEventListener('click', async () => {
    const words: WordRecord[] = await send({ type: 'GET_WORDS', payload: { lang } })
    download(`znam-${lang}-words.csv`, wordsToCsv(words))
  })
  $('export-anki').addEventListener('click', async () => {
    const words: WordRecord[] = await send({ type: 'GET_WORDS', payload: { lang, status: 'learning' } })
    download(`znam-${lang}-anki.txt`, wordsToAnki(words))
  })

  // Export the most-looked-up words (≥ threshold), hardest first
  async function frequentWords(): Promise<WordRecord[]> {
    const min = Math.max(1, Number($<HTMLInputElement>('freq-threshold').value) || 1)
    const words: WordRecord[] = await send({ type: 'GET_WORDS', payload: { lang } })
    return words
      .filter(w => (w.lookups ?? 0) >= min)
      .sort((a, b) => (b.lookups ?? 0) - (a.lookups ?? 0))
  }
  async function updateFreqCount() {
    const words = await frequentWords()
    $('freq-count').textContent = words.length ? `${words.length} words` : 'no words yet'
  }
  $('freq-threshold').addEventListener('input', updateFreqCount)
  $('export-freq-csv').addEventListener('click', async () => {
    const words = await frequentWords()
    if (words.length) download(`znam-${lang}-frequent.csv`, wordsToCsv(words))
  })
  $('export-freq-anki').addEventListener('click', async () => {
    const words = await frequentWords()
    if (words.length) download(`znam-${lang}-frequent-anki.txt`, wordsToAnki(words))
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

  let parsedImport: ParsedVocabFile | null = null

  function importEntries() {
    if (!parsedImport) return []
    const swap = $<HTMLInputElement>('import-swap').checked
    return swap
      ? parsedImport.entries
          .filter(e => e.translation)
          .map(e => ({ ...e, lemmaOrForm: e.translation!, translation: e.lemmaOrForm }))
      : parsedImport.entries
  }

  function renderImportPreview() {
    const preview = $('import-preview')
    if (!parsedImport) {
      preview.hidden = true
      return
    }
    const { skippedPhrases } = parsedImport
    const format = parsedImport.format === 'lute-db' ? 'Lute database' : parsedImport.format
    const entries = importEntries()
    const sample = entries
      .slice(0, 8)
      .map(e => {
        const status = e.status === 'learning' && e.level ? `learning ${e.level}` : e.status
        return `${e.lemmaOrForm} → ${e.translation || '—'}${status ? ` (${status})` : ''}`
      })
      .join('<br/>')
    preview.hidden = false
    preview.innerHTML =
      `Detected <b>${format}</b> format, ${entries.length} single words` +
      (skippedPhrases ? `, ${skippedPhrases} multi-word terms will be skipped` : '') +
      `.<br/><br/>${sample || '(nothing parseable)'}${entries.length > 8 ? '<br/>…' : ''}`
    $('import-swap-row').hidden = false
  }

  $('import-file').addEventListener('change', async () => {
    const file = $<HTMLInputElement>('import-file').files?.[0]
    $('import-result').textContent = ''
    if (!file) {
      parsedImport = null
      renderImportPreview()
      return
    }
    // Lute SQLite database → read via sql.js; everything else → text parse
    if (/\.(db|sqlite\d?)$/i.test(file.name)) {
      $('import-result').textContent = 'Reading Lute database…'
      try {
        const { parseLuteDb } = await import('../../utils/lute-db')
        const lute = await parseLuteDb(await file.arrayBuffer())
        parsedImport = { format: 'lute-db', entries: lute.entries, skippedPhrases: lute.skippedPhrases }
        $('import-result').textContent = lute.languages.length
          ? `Languages in this database: ${lute.languages.join(', ')}.`
          : ''
      } catch (err: any) {
        parsedImport = null
        $('import-result').textContent = `Could not read database: ${err?.message || err}`
      }
    } else {
      parsedImport = parseVocabFile(await file.text())
    }
    renderImportPreview()
  })
  $('import-swap').addEventListener('change', renderImportPreview)

  $('import-run').addEventListener('click', async () => {
    const result = $('import-result')
    if (!parsedImport) {
      result.textContent = 'Pick a file first.'
      return
    }
    const { skippedPhrases } = parsedImport
    const format = parsedImport.format === 'lute-db' ? 'Lute database' : parsedImport.format
    const entries = importEntries()
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

  renderStats()
}

init()
