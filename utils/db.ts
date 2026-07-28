import type { LibraryEntry, WordRecord } from './types'
import type { ConceptProgress, SessionDay } from './grammar/types'

const DB_NAME = 'znam'
/** v2 added the grammar-game stores: morph, grammar, drills, sessions. */
const DB_VERSION = 2

let dbPromise: Promise<IDBDatabase> | null = null

export function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION)
      req.onupgradeneeded = () => {
        const db = req.result
        if (!db.objectStoreNames.contains('words')) {
          db.createObjectStore('words', { keyPath: ['lang', 'lemma'] })
        }
        if (!db.objectStoreNames.contains('lemmas')) {
          db.createObjectStore('lemmas', { keyPath: ['lang', 'form'] })
        }
        if (!db.objectStoreNames.contains('freq')) {
          const freq = db.createObjectStore('freq', { keyPath: ['lang', 'lemma'] })
          freq.createIndex('byRank', ['lang', 'rank'], { unique: false })
        }
        if (!db.objectStoreNames.contains('library')) {
          const lib = db.createObjectStore('library', { keyPath: 'id' })
          lib.createIndex('byLang', 'lang', { unique: false })
        }
        if (!db.objectStoreNames.contains('videos')) {
          db.createObjectStore('videos', { keyPath: 'videoId' })
        }
        // ── v2: grammar game ──
        // Every store is guarded, so upgrading from v1 is purely additive and
        // no existing data is touched.
        if (!db.objectStoreNames.contains('morph')) {
          const morph = db.createObjectStore('morph', { keyPath: ['lang', 'lemma', 'tag'] })
          morph.createIndex('byLemma', ['lang', 'lemma'], { unique: false })
          morph.createIndex('byForm', ['lang', 'form'], { unique: false })
        }
        if (!db.objectStoreNames.contains('grammar')) {
          const grammar = db.createObjectStore('grammar', { keyPath: ['lang', 'conceptId'] })
          grammar.createIndex('byDue', ['lang', 'due'], { unique: false })
        }
        if (!db.objectStoreNames.contains('drills')) {
          const drills = db.createObjectStore('drills', { keyPath: 'id', autoIncrement: true })
          drills.createIndex('byDay', 'date', { unique: false })
          drills.createIndex('byConcept', ['lang', 'conceptId'], { unique: false })
        }
        if (!db.objectStoreNames.contains('sessions')) {
          db.createObjectStore('sessions', { keyPath: ['lang', 'date'] })
        }
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
    dbPromise.catch(() => { dbPromise = null })
  }
  return dbPromise
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  })
}

function reqResult<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

// ── words ───────────────────────────────────────────────────

export async function getAllWords(lang: string): Promise<WordRecord[]> {
  const db = await openDb()
  const range = IDBKeyRange.bound([lang, ''], [lang, '￿'])
  return reqResult(db.transaction('words').objectStore('words').getAll(range))
}

/** Every word across every language — for the full backup export. */
export async function getAllWordsEveryLang(): Promise<WordRecord[]> {
  const db = await openDb()
  return reqResult(db.transaction('words').objectStore('words').getAll())
}

export async function getWord(lang: string, lemma: string): Promise<WordRecord | undefined> {
  const db = await openDb()
  return reqResult(db.transaction('words').objectStore('words').get([lang, lemma]))
}

export async function putWords(records: WordRecord[]): Promise<void> {
  if (records.length === 0) return
  const db = await openDb()
  const tx = db.transaction('words', 'readwrite')
  const store = tx.objectStore('words')
  for (const rec of records) store.put(rec)
  await txDone(tx)
}

/**
 * Write in chunks, reporting progress. Calibration can produce tens of
 * thousands of records, and a single transaction that size gives no feedback
 * and aborts atomically if the quota is hit.
 */
export async function putWordsChunked(
  records: WordRecord[],
  chunk = 2000,
  onProgress?: (done: number, total: number) => void,
): Promise<void> {
  for (let i = 0; i < records.length; i += chunk) {
    await putWords(records.slice(i, i + chunk))
    onProgress?.(Math.min(i + chunk, records.length), records.length)
  }
}

/**
 * Delete every word written by one bulk run, identified by source + timestamp.
 * This is what makes a calibration reversible — previously the write was
 * permanent with no reverse anywhere in the codebase.
 */
export async function deleteWordsByRun(
  lang: string,
  source: WordRecord['source'],
  createdAt: number,
): Promise<number> {
  const words = await getAllWords(lang)
  const doomed = words.filter(w => w.source === source && w.createdAt === createdAt)
  if (doomed.length === 0) return 0
  const db = await openDb()
  const tx = db.transaction('words', 'readwrite')
  const store = tx.objectStore('words')
  for (const w of doomed) store.delete([w.lang, w.lemma])
  await txDone(tx)
  return doomed.length
}

export async function deleteWord(lang: string, lemma: string): Promise<void> {
  const db = await openDb()
  const tx = db.transaction('words', 'readwrite')
  tx.objectStore('words').delete([lang, lemma])
  await txDone(tx)
}

// ── lemmas (form → lemma dictionary) ────────────────────────

export async function getLemmaRows(lang: string, forms: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  if (forms.length === 0) return out
  const db = await openDb()
  const store = db.transaction('lemmas').objectStore('lemmas')
  await Promise.all(
    forms.map(async (form) => {
      const row = await reqResult<any>(store.get([lang, form]))
      if (row) out.set(form, row.lemma)
    }),
  )
  return out
}

export async function putLemmaRows(lang: string, rows: [string, string][]): Promise<void> {
  if (rows.length === 0) return
  const db = await openDb()
  const tx = db.transaction('lemmas', 'readwrite')
  const store = tx.objectStore('lemmas')
  for (const [form, lemma] of rows) store.put({ lang, form, lemma })
  await txDone(tx)
}

export async function countLemmaRows(lang: string): Promise<number> {
  const db = await openDb()
  const range = IDBKeyRange.bound([lang, ''], [lang, '￿'])
  return reqResult(db.transaction('lemmas').objectStore('lemmas').count(range))
}

export async function clearLanguageData(lang: string): Promise<void> {
  const db = await openDb()
  const tx = db.transaction(['lemmas', 'freq'], 'readwrite')
  const range = IDBKeyRange.bound([lang, ''], [lang, '￿'])
  tx.objectStore('lemmas').delete(range)
  tx.objectStore('freq').delete(range)
  await txDone(tx)
}

// ── freq (lemma frequency ranks) ────────────────────────────

export async function putFreqRows(lang: string, rows: { lemma: string; rank: number }[]): Promise<void> {
  if (rows.length === 0) return
  const db = await openDb()
  const tx = db.transaction('freq', 'readwrite')
  const store = tx.objectStore('freq')
  for (const { lemma, rank } of rows) store.put({ lang, lemma, rank })
  await txDone(tx)
}

export async function countFreqRows(lang: string): Promise<number> {
  const db = await openDb()
  const range = IDBKeyRange.bound([lang, ''], [lang, '￿'])
  return reqResult(db.transaction('freq').objectStore('freq').count(range))
}

/** Frequency rank for each requested lemma (absent = not ranked). */
export async function getFreqRanks(lang: string, lemmas: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>()
  if (lemmas.length === 0) return out
  const db = await openDb()
  const store = db.transaction('freq').objectStore('freq')
  await Promise.all(
    lemmas.map(async (lemma) => {
      const row = await reqResult<any>(store.get([lang, lemma]))
      if (row && typeof row.rank === 'number') out.set(lemma, row.rank)
    }),
  )
  return out
}

/** Lemmas at ranks 1..n (inclusive), ordered by rank. */
export async function getTopLemmas(lang: string, n: number): Promise<string[]> {
  const db = await openDb()
  const idx = db.transaction('freq').objectStore('freq').index('byRank')
  const range = IDBKeyRange.bound([lang, 1], [lang, n])
  const rows = await reqResult<any[]>(idx.getAll(range))
  return rows.map((r) => r.lemma)
}

/** The lemma closest to each requested rank (for calibration sampling). */
export async function getLemmasAtRanks(lang: string, ranks: number[]): Promise<{ lemma: string; rank: number }[]> {
  const db = await openDb()
  const idx = db.transaction('freq').objectStore('freq').index('byRank')
  const out: { lemma: string; rank: number }[] = []
  for (const rank of ranks) {
    const range = IDBKeyRange.bound([lang, rank], [lang, Infinity])
    const row = await reqResult<any>(idx.get(range))
    if (row) out.push({ lemma: row.lemma, rank: row.rank })
  }
  return out
}

// ── library ─────────────────────────────────────────────────

export async function getLibrary(lang?: string): Promise<LibraryEntry[]> {
  const db = await openDb()
  const store = db.transaction('library').objectStore('library')
  const rows = lang
    ? await reqResult<LibraryEntry[]>(store.index('byLang').getAll(lang))
    : await reqResult<LibraryEntry[]>(store.getAll())
  return rows
}

export async function getLibraryEntry(id: string): Promise<LibraryEntry | undefined> {
  const db = await openDb()
  return reqResult(db.transaction('library').objectStore('library').get(id))
}

export async function putLibraryEntry(entry: LibraryEntry): Promise<void> {
  const db = await openDb()
  const tx = db.transaction('library', 'readwrite')
  tx.objectStore('library').put(entry)
  await txDone(tx)
}

export async function deleteLibraryEntry(id: string): Promise<void> {
  const db = await openDb()
  const tx = db.transaction('library', 'readwrite')
  tx.objectStore('library').delete(id)
  await txDone(tx)
}

// ── videos (score cache) ────────────────────────────────────

export interface VideoScoreRow {
  videoId: string
  lang: string
  score: number | null // null = subtitles unavailable
  updatedAt: number
}

export async function getVideoScores(videoIds: string[]): Promise<Map<string, VideoScoreRow>> {
  const out = new Map<string, VideoScoreRow>()
  if (videoIds.length === 0) return out
  const db = await openDb()
  const store = db.transaction('videos').objectStore('videos')
  await Promise.all(
    videoIds.map(async (id) => {
      const row = await reqResult<VideoScoreRow | undefined>(store.get(id))
      if (row) out.set(id, row)
    }),
  )
  return out
}

export async function putVideoScore(row: VideoScoreRow): Promise<void> {
  const db = await openDb()
  const tx = db.transaction('videos', 'readwrite')
  tx.objectStore('videos').put(row)
  await txDone(tx)
}

// ── morph (tagged inflection table, for the grammar game) ───

export interface MorphRow {
  lang: string
  lemma: string
  /** Canonical dot-joined tag, e.g. 'sg.gen' or 'past.p1.sg.m'. */
  tag: string
  pos: 'N' | 'A' | 'V'
  form: string
}

export async function putMorphRows(rows: MorphRow[]): Promise<void> {
  if (rows.length === 0) return
  const db = await openDb()
  const tx = db.transaction('morph', 'readwrite')
  const store = tx.objectStore('morph')
  for (const row of rows) store.put(row)
  await txDone(tx)
}

export async function countMorphRows(lang: string): Promise<number> {
  const db = await openDb()
  const range = IDBKeyRange.bound([lang, '', ''], [lang, '￿', '￿'])
  return reqResult(db.transaction('morph').objectStore('morph').count(range))
}

/** The whole paradigm of one lemma. */
export async function getMorphForms(lang: string, lemma: string): Promise<MorphRow[]> {
  const db = await openDb()
  const idx = db.transaction('morph').objectStore('morph').index('byLemma')
  return reqResult(idx.getAll(IDBKeyRange.only([lang, lemma])))
}

/** One specific cell of the paradigm, or undefined if the lemma lacks it. */
export async function getMorphForm(
  lang: string,
  lemma: string,
  tag: string,
): Promise<MorphRow | undefined> {
  const db = await openDb()
  return reqResult(db.transaction('morph').objectStore('morph').get([lang, lemma, tag]))
}

/** Every lemma that has at least one form in the table (the "usable" set). */
export async function getMorphLemmas(lang: string): Promise<Set<string>> {
  const db = await openDb()
  const range = IDBKeyRange.bound([lang, '', ''], [lang, '￿', '￿'])
  const rows = await reqResult<MorphRow[]>(db.transaction('morph').objectStore('morph').getAll(range))
  return new Set(rows.map(r => r.lemma))
}

export async function clearMorph(lang: string): Promise<void> {
  const db = await openDb()
  const tx = db.transaction('morph', 'readwrite')
  tx.objectStore('morph').delete(IDBKeyRange.bound([lang, '', ''], [lang, '￿', '￿']))
  await txDone(tx)
}

// ── grammar (per-concept SRS progress) ──────────────────────

export async function getAllConceptProgress(lang: string): Promise<ConceptProgress[]> {
  const db = await openDb()
  const range = IDBKeyRange.bound([lang, ''], [lang, '￿'])
  return reqResult(db.transaction('grammar').objectStore('grammar').getAll(range))
}

/** Every language's concept progress — for the backup export. */
export async function getAllConceptProgressEveryLang(): Promise<ConceptProgress[]> {
  const db = await openDb()
  return reqResult(db.transaction('grammar').objectStore('grammar').getAll())
}

export async function getConceptProgress(
  lang: string,
  conceptId: string,
): Promise<ConceptProgress | undefined> {
  const db = await openDb()
  return reqResult(db.transaction('grammar').objectStore('grammar').get([lang, conceptId]))
}

export async function putConceptProgress(rows: ConceptProgress[]): Promise<void> {
  if (rows.length === 0) return
  const db = await openDb()
  const tx = db.transaction('grammar', 'readwrite')
  const store = tx.objectStore('grammar')
  for (const row of rows) store.put(row)
  await txDone(tx)
}

/** Concepts whose `due` has passed, soonest first. */
export async function getDueConcepts(lang: string, now: number): Promise<ConceptProgress[]> {
  const db = await openDb()
  const idx = db.transaction('grammar').objectStore('grammar').index('byDue')
  const rows = await reqResult<ConceptProgress[]>(
    idx.getAll(IDBKeyRange.bound([lang, -Infinity], [lang, now])),
  )
  return rows.sort((a, b) => a.due - b.due)
}

// ── drills (per-item attempt log) ───────────────────────────

export interface DrillRow {
  id?: number
  lang: string
  /** YYYY-MM-DD. */
  date: string
  conceptId: string
  templateId: string
  correct: boolean
  ms: number
}

export async function putDrillRows(rows: DrillRow[]): Promise<void> {
  if (rows.length === 0) return
  const db = await openDb()
  const tx = db.transaction('drills', 'readwrite')
  const store = tx.objectStore('drills')
  for (const row of rows) store.add(row)
  await txDone(tx)
}

export async function getDrillsSince(lang: string, sinceDate: string): Promise<DrillRow[]> {
  const db = await openDb()
  const rows = await reqResult<DrillRow[]>(db.transaction('drills').objectStore('drills').getAll())
  return rows.filter(r => r.lang === lang && r.date >= sinceDate)
}

/** Every drill row, for the backup export. */
export async function getAllDrills(): Promise<DrillRow[]> {
  const db = await openDb()
  return reqResult(db.transaction('drills').objectStore('drills').getAll())
}

// ── sessions (one row per completed day) ────────────────────

export async function getSessionDays(lang: string): Promise<SessionDay[]> {
  const db = await openDb()
  const range = IDBKeyRange.bound([lang, ''], [lang, '￿'])
  const rows = await reqResult<SessionDay[]>(
    db.transaction('sessions').objectStore('sessions').getAll(range),
  )
  return rows.sort((a, b) => a.date.localeCompare(b.date))
}

export async function getAllSessionDays(): Promise<SessionDay[]> {
  const db = await openDb()
  return reqResult(db.transaction('sessions').objectStore('sessions').getAll())
}

export async function putSessionDay(row: SessionDay): Promise<void> {
  const db = await openDb()
  const tx = db.transaction('sessions', 'readwrite')
  tx.objectStore('sessions').put(row)
  await txDone(tx)
}
