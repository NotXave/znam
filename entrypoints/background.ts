import type { LearningLevel, Message, TokenInfo, WordRecord, WordStatus } from '../utils/types'
import { translate } from '../utils/translate'
import { translateDeepL } from '../utils/deepl'
import { lookupWiktionary } from '../utils/dictionary'
import { lookupReverso } from '../utils/reverso'
import { getSettings } from '../utils/settings'
import { lemmatizeBatch } from '../utils/lemmatizer'
import { isCapitalized } from '../utils/tokenizer'
import {
  deleteLibraryEntry,
  deleteWord,
  getAllWords,
  getLibrary,
  getLibraryEntry,
  getWord,
  putLibraryEntry,
  putWords,
} from '../utils/db'
import { handleSetupPort, languageState, setCalibratedAt } from '../utils/language-setup'
import { calibrationLemmas, calibrationSample, estimateKnownRank } from '../utils/calibration'
import { getFreqRanks, getVideoScores, putVideoScore } from '../utils/db'
import { scoreTokens } from '../utils/scoring'
import { tokenize } from '../utils/tokenizer'
import { fetchCaptionText, fetchVideoInfo, pickTrack } from '../utils/youtube-captions'
import type { LibraryEntry } from '../utils/types'

function urlId(url: string): string {
  let h = 5381
  for (let i = 0; i < url.length; i++) h = ((h << 5) + h + url.charCodeAt(i)) >>> 0
  return h.toString(36)
}

// ── In-memory word-status cache (rebuildable from IDB) ──────

interface StatusEntry {
  status: WordStatus
  level?: LearningLevel
}

const statusMaps = new Map<string, Map<string, StatusEntry>>()
const statusLoads = new Map<string, Promise<void>>()

async function statusMapFor(lang: string): Promise<Map<string, StatusEntry>> {
  if (!statusMaps.has(lang)) {
    if (!statusLoads.has(lang)) {
      statusLoads.set(lang, (async () => {
        const map = new Map<string, StatusEntry>()
        for (const rec of await getAllWords(lang)) map.set(rec.lemma, { status: rec.status, level: rec.level })
        statusMaps.set(lang, map)
      })())
    }
    await statusLoads.get(lang)
  }
  return statusMaps.get(lang)!
}

// ── Token analysis ──────────────────────────────────────────

async function analyzeTokens(lang: string, tokens: string[]): Promise<Record<string, TokenInfo>> {
  const statuses = await statusMapFor(lang)
  const tokenSet = new Set(tokens)
  const lowerSet = new Set(tokens.map(t => t.toLowerCase()))
  const lemmaMap = await lemmatizeBatch(lang, [...lowerSet])

  // Frequency ranks for the distinct resolved lemmas (for weighted scoring)
  const lemmaSet = new Set<string>()
  for (const lower of lowerSet) lemmaSet.add(lemmaMap.get(lower) ?? lower)
  const ranks = await getFreqRanks(lang, [...lemmaSet])

  const out: Record<string, TokenInfo> = {}
  for (const token of tokens) {
    const lower = token.toLowerCase()
    const dictLemma = lemmaMap.get(lower) ?? null
    const lemma = dictLemma ?? lower
    const rank = ranks.get(lemma)
    const entry = statuses.get(lemma)
    if (entry) {
      out[token] = { lemma, status: entry.status, level: entry.level, rank }
      continue
    }
    // Proper-noun heuristic: capitalized, unknown to the dictionary, and the
    // page never shows it lowercased → almost certainly a name.
    if (!dictLemma && isCapitalized(token) && !tokenSet.has(lower)) {
      out[token] = { lemma, status: 'name', rank }
      continue
    }
    out[token] = { lemma, status: 'unknown', rank }
  }
  return out
}

// ── Auto level progression ──────────────────────────────────

// Exposures (seen while reading, not looked up) needed to advance a level.
const EXPOSURE_THRESHOLD = 4

async function recordExposures(lang: string, lemmas: string[]): Promise<{ advanced: number }> {
  const statuses = await statusMapFor(lang)
  const now = Date.now()
  const updates: WordRecord[] = []
  let advanced = 0
  for (const lemma of new Set(lemmas)) {
    const entry = statuses.get(lemma)
    if (!entry || entry.status !== 'learning') continue // only learning words progress
    const rec = await getWord(lang, lemma)
    if (!rec) continue
    const level = (rec.level ?? 1) as LearningLevel
    const exposures = (rec.exposures ?? 0) + 1
    if (exposures >= EXPOSURE_THRESHOLD && level < 5) {
      const next = (level + 1) as LearningLevel
      updates.push({ ...rec, level: next, exposures: 0, updatedAt: now })
      statuses.set(lemma, { status: 'learning', level: next })
      advanced++
    } else {
      updates.push({ ...rec, exposures, updatedAt: now })
    }
  }
  await putWords(updates)
  return { advanced }
}

// ── Stats ───────────────────────────────────────────────────

async function computeStats(lang: string) {
  const words = await getAllWords(lang)
  const library = await getLibrary(lang)
  const now = Date.now()
  const DAY = 86400000

  const counts = { known: 0, learning: 0, ignored: 0 }
  const levels = [0, 0, 0, 0, 0] // learning stages 1..5
  let addedThisWeek = 0
  // words first tracked per day, last 30 days
  const daily: Record<string, number> = {}
  for (const w of words) {
    counts[w.status]++
    if (w.status === 'learning') levels[(w.level ?? 1) - 1]++
    if (now - w.createdAt < 7 * DAY) addedThisWeek++
    if (now - w.createdAt < 30 * DAY) {
      const day = new Date(w.createdAt).toISOString().slice(0, 10)
      daily[day] = (daily[day] || 0) + 1
    }
  }

  const readThisWeek = library.filter(e => now - e.updatedAt < 7 * DAY)
  const sweetSpot = library.filter(e => e.score >= 0.9 && e.score <= 0.98).length
  const avgScore = library.length
    ? library.reduce((s, e) => s + e.score, 0) / library.length
    : 0

  return {
    counts,
    levels,
    addedThisWeek,
    daily,
    totalWords: words.length,
    library: {
      total: library.length,
      pages: library.filter(e => e.kind === 'page').length,
      videos: library.filter(e => e.kind === 'youtube').length,
      readThisWeek: readThisWeek.length,
      sweetSpot,
      avgScore,
    },
  }
}

// Serialize single-word read-modify-write ops so the concurrent set() +
// recordLookup on a fresh word click don't clobber each other's fields.
let wordWriteChain: Promise<unknown> = Promise.resolve()
function serializeWordWrite<T>(fn: () => Promise<T>): Promise<T> {
  const run = wordWriteChain.then(fn, fn)
  wordWriteChain = run.catch(() => {})
  return run
}

function setWordStatus(payload: Extract<Message, { type: 'SET_WORD_STATUS' }>['payload']): Promise<{ ok: true }> {
  return serializeWordWrite(() => setWordStatusImpl(payload))
}

async function setWordStatusImpl(payload: Extract<Message, { type: 'SET_WORD_STATUS' }>['payload']): Promise<{ ok: true }> {
  const { lang, lemma, status } = payload
  const statuses = await statusMapFor(lang)
  if (status === 'unknown') {
    statuses.delete(lemma)
    await deleteWord(lang, lemma)
    return { ok: true }
  }
  const existing = await getWord(lang, lemma)
  const now = Date.now()
  const level = status === 'learning' ? (payload.level ?? existing?.level ?? 1) : undefined
  const rec: WordRecord = {
    lang,
    lemma,
    status,
    level,
    exposures: existing?.exposures,
    lookups: existing?.lookups,
    translation: payload.translation || existing?.translation,
    context: payload.context || existing?.context,
    source: payload.source,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  }
  statuses.set(lemma, { status, level })
  await putWords([rec])
  return { ok: true }
}

/**
 * Persist a chosen translation without changing status/level. If the word
 * isn't tracked yet (e.g. the alternative was picked before auto-save landed),
 * create it as learning-1 — same intent as clicking the word.
 */
function setWordTranslation(payload: { lang: string; lemma: string; translation: string }): Promise<{ ok: true }> {
  return serializeWordWrite(() => setWordTranslationImpl(payload))
}

async function setWordTranslationImpl(payload: { lang: string; lemma: string; translation: string }): Promise<{ ok: true }> {
  const { lang, lemma, translation } = payload
  const statuses = await statusMapFor(lang)
  const existing = await getWord(lang, lemma)
  const now = Date.now()
  const status = existing?.status ?? 'learning'
  const level = status === 'learning' ? (existing?.level ?? 1) : undefined
  await putWords([{
    lang, lemma, status, level, translation,
    exposures: existing?.exposures,
    lookups: existing?.lookups,
    context: existing?.context,
    source: existing?.source ?? 'click',
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  }])
  if (!statuses.has(lemma)) statuses.set(lemma, { status, level })
  return { ok: true }
}

/** Increment a word's lookup counter (creating it as learning-1 if new). */
function recordLookup(lang: string, lemma: string): Promise<{ lookups: number }> {
  return serializeWordWrite(() => recordLookupImpl(lang, lemma))
}

async function recordLookupImpl(lang: string, lemma: string): Promise<{ lookups: number }> {
  const statuses = await statusMapFor(lang)
  const existing = await getWord(lang, lemma)
  const now = Date.now()
  const lookups = (existing?.lookups ?? 0) + 1
  if (existing) {
    await putWords([{ ...existing, lookups, updatedAt: now }])
  } else {
    await putWords([{
      lang, lemma, status: 'learning', level: 1, lookups,
      source: 'click', createdAt: now, updatedAt: now,
    }])
    statuses.set(lemma, { status: 'learning', level: 1 })
  }
  return { lookups }
}

async function markPageRead(lang: string, lemmas: string[]): Promise<{ promoted: number }> {
  const statuses = await statusMapFor(lang)
  const now = Date.now()
  const records: WordRecord[] = []
  for (const lemma of new Set(lemmas)) {
    if (statuses.has(lemma)) continue // learning stays learning, known stays known
    records.push({
      lang, lemma, status: 'known', source: 'page-read', createdAt: now, updatedAt: now,
    })
    statuses.set(lemma, { status: 'known' })
  }
  await putWords(records)
  return { promoted: records.length }
}

// ── YouTube search-result scoring ───────────────────────────

const VIDEO_CACHE_TTL = 7 * 24 * 3600 * 1000

async function scoreVideo(videoId: string, lang: string): Promise<number | null> {
  try {
    const video = await fetchVideoInfo(videoId)
    const track = pickTrack(video.tracks, lang)
    if (!track) return null
    const text = await fetchCaptionText(track.baseUrl)
    const tokens = tokenize(text)
    const info = await analyzeTokens(lang, [...new Set(tokens)])
    const score = scoreTokens(tokens, t => info[t])
    return score.countableTokens >= 30 ? score.score : null
  } catch {
    return null
  }
}

async function scoreVideos(lang: string, videoIds: string[]): Promise<Record<string, number | null>> {
  const out: Record<string, number | null> = {}
  const cached = await getVideoScores(videoIds)
  const stale: string[] = []
  for (const id of videoIds) {
    const row = cached.get(id)
    if (row && row.lang === lang && Date.now() - row.updatedAt < VIDEO_CACHE_TTL) out[id] = row.score
    else stale.push(id)
  }
  // Two workers — same politeness cap the manga OCR queue uses
  let next = 0
  await Promise.all(
    [0, 1].map(async () => {
      while (next < stale.length) {
        const id = stale[next++]
        const score = await scoreVideo(id, lang)
        out[id] = score
        await putVideoScore({ videoId: id, lang, score, updatedAt: Date.now() })
      }
    }),
  )
  return out
}

// ── Entry point ─────────────────────────────────────────────

export default defineBackground(() => {
  browser.commands.onCommand.addListener(async (command) => {
    if (command !== 'toggle-reader') return
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true })
    if (tab?.id != null) {
      browser.tabs.sendMessage(tab.id, { type: 'TOGGLE_READER' }).catch(() => {})
    }
  })

  browser.runtime.onConnect.addListener((port) => {
    if (port.name === 'language-setup') {
      // Word records may have been re-keyed to lemmas — drop the memory cache
      handleSetupPort(port, (lang) => {
        statusMaps.delete(lang)
        statusLoads.delete(lang)
      })
    }
  })

  // sendResponse + `return true` instead of returning a promise:
  // Chrome's onMessage ignores promise return values.
  browser.runtime.onMessage.addListener((message: any, _sender, sendResponse) => {
    handleMessage(message).then(sendResponse)
    return true
  })

  async function handleMessage(message: Message): Promise<any> {
    try {
      switch (message.type) {
        case 'TRANSLATE': {
          const { text, from, to } = message.payload
          return await translate(text, from, to)
        }

        case 'REVERSO_LOOKUP': {
          const { text, from, to } = message.payload
          try {
            return await lookupReverso(text, from, to)
          } catch {
            return { translations: [], examples: [] }
          }
        }

        case 'DEEPL_LOOKUP': {
          const { text, from, to } = message.payload
          return await translateDeepL(text, from, to)
        }

        case 'DICTIONARY_LOOKUP': {
          const { word, lang } = message.payload
          try {
            return await lookupWiktionary(word, lang)
          } catch {
            return []
          }
        }

        case 'ANALYZE_TOKENS':
          return await analyzeTokens(message.payload.lang, message.payload.tokens)

        case 'SET_WORD_STATUS':
          return await setWordStatus(message.payload)

        case 'SET_WORD_TRANSLATION':
          return await setWordTranslation(message.payload)

        case 'RECORD_LOOKUP':
          return await recordLookup(message.payload.lang, message.payload.lemma)

        case 'RECORD_EXPOSURES':
          return await recordExposures(message.payload.lang, message.payload.lemmas)

        case 'GET_STATS':
          return await computeStats(message.payload.lang)

        case 'MARK_PAGE_READ':
          return await markPageRead(message.payload.lang, message.payload.lemmas)

        case 'GET_SETTINGS':
          return await getSettings()

        case 'GET_LANGUAGE_STATE':
          return await languageState(message.payload.lang)

        case 'GET_WORDS': {
          const words = await getAllWords(message.payload.lang)
          const status = message.payload.status
          return status ? words.filter(w => w.status === status) : words
        }

        case 'IMPORT_WORDS': {
          const { lang, entries, status } = message.payload
          const statuses = await statusMapFor(lang)
          const lowers = [...new Set(entries.map(e => e.lemmaOrForm.toLowerCase()))]
          const lemmaMap = await lemmatizeBatch(lang, lowers)
          const now = Date.now()
          const records: WordRecord[] = []
          for (const entry of entries) {
            const lower = entry.lemmaOrForm.toLowerCase()
            const lemma = lemmaMap.get(lower) ?? lower
            if (statuses.has(lemma)) continue // never downgrade existing knowledge
            const entryStatus = entry.status ?? status
            const entryLevel = entryStatus === 'learning' ? (entry.level ?? 1) : undefined
            statuses.set(lemma, { status: entryStatus, level: entryLevel })
            records.push({
              lang, lemma, status: entryStatus, level: entryLevel,
              translation: entry.translation,
              context: entry.context,
              source: 'import', createdAt: now, updatedAt: now,
            })
          }
          await putWords(records)
          return { imported: records.length, skipped: entries.length - records.length }
        }

        case 'SAVE_LIBRARY_ENTRY': {
          const payload = message.payload
          const id = payload.id || urlId(payload.url)
          const existing = await getLibraryEntry(id)
          const entry: LibraryEntry = {
            ...payload,
            id,
            pinned: existing?.pinned ?? payload.pinned,
            createdAt: existing?.createdAt ?? Date.now(),
            updatedAt: Date.now(),
          }
          await putLibraryEntry(entry)
          return { id }
        }

        case 'GET_LIBRARY':
          return await getLibrary(message.payload.lang)

        case 'SET_LIBRARY_PINNED': {
          const entry = await getLibraryEntry(message.payload.id)
          if (entry) {
            entry.pinned = message.payload.pinned
            await putLibraryEntry(entry)
          }
          return { ok: true }
        }

        case 'DELETE_LIBRARY_ENTRY':
          await deleteLibraryEntry(message.payload.id)
          return { ok: true }

        case 'CALIBRATION_SAMPLE':
          return await calibrationSample(message.payload.lang)

        case 'CALIBRATION_APPLY': {
          const { lang, topN } = message.payload
          const statuses = await statusMapFor(lang)
          const now = Date.now()
          const records: WordRecord[] = []
          for (const lemma of await calibrationLemmas(lang, topN)) {
            if (statuses.has(lemma)) continue // never downgrade
            statuses.set(lemma, { status: 'known' })
            records.push({ lang, lemma, status: 'known', source: 'calibration', createdAt: now, updatedAt: now })
          }
          await putWords(records)
          await setCalibratedAt(lang)
          return { added: records.length }
        }

        case 'CALIBRATION_ESTIMATE':
          return { topN: estimateKnownRank(message.payload.answers) }

        case 'SCORE_VIDEOS':
          return await scoreVideos(message.payload.lang, message.payload.videoIds)

        default:
          return { error: 'Unknown message type' }
      }
    } catch (err: any) {
      console.error('[znam bg]', err)
      return { error: err.message }
    }
  }
})
