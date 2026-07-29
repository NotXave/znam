import type { LanguageState, SetupEvent, SetupRequest, WordStatus } from './types'
import {
  clearLanguageData,
  countFreqRows,
  countKnownRows,
  countLemmaRows,
  getAllWords,
  putFreqRows,
  putKnownLemmas,
  putLemmaRows,
} from './db'
import { invalidateLemmaCache } from './lemmatizer'

// Language-data artifacts are built offline by scripts/build-lang-data.mjs.
// pl/de/en ship inside the extension (public/data/); anything else is
// fetched from the repo.
const DATA_BASE = 'https://raw.githubusercontent.com/NotXave/znam/main/public/data'

const INSERT_BATCH = 5000

export async function languageState(lang: string): Promise<LanguageState> {
  const [dictForms, freqLemmas, knownLemmas, words] = await Promise.all([
    countLemmaRows(lang),
    countFreqRows(lang),
    countKnownRows(lang).catch(() => 0), // store absent on a pre-v4 database
    getAllWords(lang),
  ])
  const counts = { learning: 0, known: 0, ignored: 0 }
  for (const w of words) counts[w.status as WordStatus]++
  const { langMeta } = await browser.storage.local.get('langMeta')
  return {
    lang,
    dictReady: dictForms > 0,
    dictForms,
    freqReady: freqLemmas > 0,
    freqLemmas,
    knownLemmas,
    calibratedAt: (langMeta as any)?.[lang]?.calibratedAt,
    counts,
  }
}

export async function setCalibratedAt(lang: string): Promise<void> {
  const { langMeta } = await browser.storage.local.get('langMeta')
  const meta = (langMeta as any) ?? {}
  meta[lang] = { ...meta[lang], calibratedAt: Date.now() }
  await browser.storage.local.set({ langMeta: meta })
}

/** Parse a two-column TSV, skipping malformed lines and comments. */
function parseTsvPairs(text: string): [string, string][] {
  const out: [string, string][] = []
  for (const line of text.split('\n')) {
    if (!line || line.startsWith('#')) continue
    const tab = line.indexOf('\t')
    if (tab <= 0) continue
    const a = line.slice(0, tab).trim()
    const b = line.slice(tab + 1).trim()
    if (a && b) out.push([a, b])
  }
  return out
}

async function fetchWithProgress(
  url: string,
  label: string,
  post: (e: SetupEvent) => void,
): Promise<string> {
  const resp = await fetch(url)
  if (!resp.ok) throw new Error(`${label}: HTTP ${resp.status} for ${url}`)
  const total = Number(resp.headers.get('content-length')) || 0
  if (!resp.body) return await resp.text()

  const reader = resp.body.getReader()
  const chunks: Uint8Array[] = []
  let received = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    received += value.length
    const pct = total > 0 ? Math.round((received / total) * 100) : 0
    post({ type: 'PROGRESS', step: 'download', pct, detail: `${label} (${(received / 1e6).toFixed(1)} MB)` })
  }
  const buf = new Uint8Array(received)
  let off = 0
  for (const c of chunks) {
    buf.set(c, off)
    off += c.length
  }
  return new TextDecoder('utf-8').decode(buf)
}

/** Bundled artifact if the extension ships one, otherwise the repo download. */
async function loadArtifact(
  lang: string,
  kind: 'lemmas' | 'freq' | 'known',
  label: string,
  post: (e: SetupEvent) => void,
): Promise<string> {
  try {
    // Cast: WXT types getURL against literal public paths, ours is dynamic
    const resp = await fetch(browser.runtime.getURL(`/data/${lang}.${kind}.tsv` as any))
    if (resp.ok) {
      post({ type: 'PROGRESS', step: 'download', pct: 100, detail: `${label} (bundled)` })
      return await resp.text()
    }
  } catch {
    // not bundled for this language
  }
  return fetchWithProgress(`${DATA_BASE}/${lang}.${kind}.tsv`, label, post)
}

/**
 * The known-lemma list, or null when the language has none.
 *
 * Optional on purpose: it only exists for languages with a curated
 * morphological dictionary behind them, and a language without one must still
 * install cleanly. Absence disables the trainers' filter, it does not fail.
 */
async function loadKnownArtifact(
  lang: string,
  post: (e: SetupEvent) => void,
): Promise<string | null> {
  try {
    return await loadArtifact(lang, 'known', 'Wortliste', post)
  } catch {
    return null
  }
}

/** Parse a one-column list, skipping blanks and comments. */
function parseTsvLines(text: string): string[] {
  const out: string[] = []
  for (const line of text.split('\n')) {
    const s = line.trim()
    if (s && !s.startsWith('#')) out.push(s)
  }
  return out
}

async function installLanguageData(
  lang: string,
  lemmasTsv: string,
  freqTsv: string,
  knownTsv: string | null,
  post: (e: SetupEvent) => void,
): Promise<void> {
  post({ type: 'PROGRESS', step: 'parse', pct: 0, detail: 'Parsing dictionaries' })
  const lemmaRows = parseTsvPairs(lemmasTsv) // form \t lemma
  const freqRows = parseTsvPairs(freqTsv).map(([lemma, rank]) => ({
    lemma,
    rank: Number(rank),
  })).filter(r => Number.isFinite(r.rank))
  const knownRows = knownTsv ? parseTsvLines(knownTsv) : []
  post({ type: 'PROGRESS', step: 'parse', pct: 100, detail: `${lemmaRows.length} forms, ${freqRows.length} lemmas` })

  // Replace any previous data for this language
  await clearLanguageData(lang)

  const totalBatches =
    Math.ceil(lemmaRows.length / INSERT_BATCH) +
    Math.ceil(freqRows.length / INSERT_BATCH) +
    Math.ceil(knownRows.length / INSERT_BATCH)
  let doneBatches = 0
  const progress = (detail: string) => {
    doneBatches++
    post({
      type: 'PROGRESS',
      step: 'store',
      pct: Math.round((doneBatches / Math.max(1, totalBatches)) * 100),
      detail,
    })
  }

  for (let i = 0; i < lemmaRows.length; i += INSERT_BATCH) {
    await putLemmaRows(lang, lemmaRows.slice(i, i + INSERT_BATCH))
    progress(`Storing word forms (${Math.min(i + INSERT_BATCH, lemmaRows.length)}/${lemmaRows.length})`)
  }
  for (let i = 0; i < freqRows.length; i += INSERT_BATCH) {
    await putFreqRows(lang, freqRows.slice(i, i + INSERT_BATCH))
    progress(`Storing frequency ranks (${Math.min(i + INSERT_BATCH, freqRows.length)}/${freqRows.length})`)
  }
  for (let i = 0; i < knownRows.length; i += INSERT_BATCH) {
    await putKnownLemmas(lang, knownRows.slice(i, i + INSERT_BATCH))
    progress(`Storing word list (${Math.min(i + INSERT_BATCH, knownRows.length)}/${knownRows.length})`)
  }

  invalidateLemmaCache(lang)
}

export function handleSetupPort(port: any, onInstalled?: (lang: string) => void): void {
  const post = (event: SetupEvent) => {
    try { port.postMessage(event) } catch { /* port closed */ }
  }

  port.onMessage.addListener(async (msg: SetupRequest) => {
    try {
      if (msg.type === 'SETUP_LANGUAGE') {
        const lemmasTsv = await loadArtifact(msg.lang, 'lemmas', 'Lemma dictionary', post)
        const freqTsv = await loadArtifact(msg.lang, 'freq', 'Frequency list', post)
        const knownTsv = await loadKnownArtifact(msg.lang, post)
        await installLanguageData(msg.lang, lemmasTsv, freqTsv, knownTsv, post)
        onInstalled?.(msg.lang)
        post({ type: 'DONE', state: await languageState(msg.lang) })
      } else if (msg.type === 'SETUP_LANGUAGE_LOCAL') {
        // Still try for the word list: for a bundled language it comes from
        // inside the extension, so a local install stays offline and keeps the
        // filter. For anything else this returns null and the filter is skipped.
        const knownTsv = await loadKnownArtifact(msg.lang, post)
        await installLanguageData(msg.lang, msg.lemmasTsv, msg.freqTsv, knownTsv, post)
        onInstalled?.(msg.lang)
        post({ type: 'DONE', state: await languageState(msg.lang) })
      }
    } catch (err: any) {
      post({ type: 'ERROR', error: err.message || String(err) })
    }
  })
}
