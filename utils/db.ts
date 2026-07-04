import type { LibraryEntry, WordRecord } from './types'

const DB_NAME = 'znam'
const DB_VERSION = 1

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
