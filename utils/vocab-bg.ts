import {
  getAllWords,
  getFreqRanks,
  getKnownLemmas,
  getSessionDays,
  getTopLemmas,
  getVocabCards,
  putSessionDay,
  putVocabCards,
  putWords,
} from './db'
import { translateBatch } from './translate'
import { getGameState, saveGameStateFor } from './grammar-bg'
import { review, newProgress } from './grammar/srs'
import { dayKey } from './grammar/session'
import { advanceStreak, scoreSession } from './grammar/gamify'
import {
  DEFAULT_MAX_RANK,
  buildVocabExercise,
  kindFor,
  selectCards,
  type VocabCandidate,
  type VocabCard,
  type VocabExercise,
} from './grammar/vocab'
import type { WordRecord } from './types'

/**
 * Background side of the Słówka vocabulary trainer.
 *
 * Owns IndexedDB and the translation fetch; the page only ever sees plain JSON.
 */

/** ~8 s per card, same working assumption as the grammar session. */
const CARDS_PER_MINUTE = 7

export interface VocabPlan {
  lang: string
  date: string
  totalSeconds: number
  exercises: VocabExercise[]
}

export interface VocabResult {
  date: string
  seconds: number
  attempts: { lemma: string; correct: boolean; nearMiss: boolean; ms: number }[]
  maxCombo: number
}

// ── candidates ──────────────────────────────────────────────

/**
 * Everything the trainer could possibly drill: the learner's own words, plus
 * enough of the top frequency list to fill a session for a beginner who has
 * barely any words yet.
 */
async function gatherCandidates(lang: string, maxRank: number): Promise<VocabCandidate[]> {
  const words = await getAllWords(lang)
  const byLemma = new Map(words.map(w => [w.lemma, w]))

  // The in-band slice of the frequency list, in rank order.
  const topLemmas = await getTopLemmas(lang, maxRank)
  const ranks = await getFreqRanks(lang, [...new Set([...topLemmas, ...byLemma.keys()])])

  const out: VocabCandidate[] = []
  const seen = new Set<string>()
  const push = (lemma: string) => {
    if (seen.has(lemma)) return
    seen.add(lemma)
    const w = byLemma.get(lemma)
    out.push({
      lemma,
      rank: ranks.get(lemma) ?? 0,
      translation: w?.translation,
      context: w?.context,
      status: w?.status,
      level: w?.level,
      lookups: w?.lookups,
    })
  }

  for (const lemma of byLemma.keys()) push(lemma)
  for (const lemma of topLemmas) push(lemma)
  return out
}

// ── translations ────────────────────────────────────────────

/**
 * Give up on fetching glosses after this long.
 *
 * Without a budget, a blocked or slow network turns session start into a
 * five-minute hang: the batch endpoint times out, the code falls back to one
 * request per word, and each of those times out in turn. Measured at 317 s
 * before this cap existed.
 */
const TRANSLATE_BUDGET_MS = 8000

/**
 * Fill in missing German glosses, then persist them.
 *
 * TRANSLATE_BATCH cannot be reused here: it tries DeepL first, which is
 * serialized at >=1.2 s per chunk and would take minutes for a session's worth
 * of words. This calls Google's batch endpoint directly (350 ms throttle).
 *
 * Chunks are small on purpose. The batch endpoint occasionally mangles the
 * separator and the fallback is one request per word, so a small chunk keeps
 * the blast radius of a bad response down.
 */
async function ensureTranslations(
  lang: string,
  nativeLang: string,
  cards: VocabCandidate[],
): Promise<void> {
  const missing = cards.filter(c => !c.translation).slice(0, 60)
  if (missing.length === 0) return

  const CHUNK = 25
  const now = Date.now()
  const deadline = now + TRANSLATE_BUDGET_MS
  const records: WordRecord[] = []

  for (let i = 0; i < missing.length; i += CHUNK) {
    if (Date.now() > deadline) break
    const batch = missing.slice(i, i + CHUNK)
    let out: string[] = []
    try {
      out = await Promise.race([
        translateBatch(batch.map(c => c.lemma), lang, nativeLang),
        new Promise<string[]>((_, reject) =>
          setTimeout(() => reject(new Error('translate budget')), Math.max(500, deadline - Date.now())),
        ),
      ])
    } catch {
      break // offline or throttled — use whatever glosses we already have
    }
    batch.forEach((c, j) => {
      const t = (out[j] ?? '').trim()
      if (!t || t.toLowerCase() === c.lemma.toLowerCase()) return
      c.translation = t
      // Persist, so the gloss is never fetched twice. Both translation caches
      // are in-memory and die with the service worker.
      records.push({
        lang, lemma: c.lemma,
        status: c.status ?? 'learning',
        level: (c.level as any) ?? 1,
        translation: t,
        context: c.context,
        lookups: c.lookups,
        source: 'manual',
        createdAt: now, updatedAt: now,
      })
    })
  }

  // Never overwrite an existing record's status — only add the gloss.
  const existing = new Map((await getAllWords(lang)).map(w => [w.lemma, w]))
  const merged = records.map((r) => {
    const prev = existing.get(r.lemma)
    return prev ? { ...prev, translation: r.translation, updatedAt: now } : r
  })
  await putWords(merged)
}

// ── session ─────────────────────────────────────────────────

export async function startVocabSession(
  lang: string,
  minutes: number,
): Promise<VocabPlan | { error: string }> {
  const settings = await browser.storage.local.get('settings')
  const maxRank = (settings.settings as any)?.vocabMaxRank ?? DEFAULT_MAX_RANK
  const nativeLang = (settings.settings as any)?.nativeLanguage ?? 'de'

  const candidates = await gatherCandidates(lang, maxRank)
  if (candidates.length === 0) {
    return { error: 'Keine Wörter verfügbar — bitte zuerst die Sprachdaten installieren.' }
  }

  const cards = new Map((await getVocabCards(lang)).map(c => [c.lemma, c]))
  const want = Math.max(6, Math.round(minutes * CARDS_PER_MINUTE))
  // Missing store (pre-v4 database) or no list for this language → empty set,
  // which selectCards reads as "do not filter".
  const known = await getKnownLemmas(lang).catch(() => new Set<string>())

  const picked = selectCards({
    candidates, cards, maxRank, now: Date.now(), limit: want, known,
  })
  if (picked.length === 0) {
    return { error: 'Nichts fällig — alles wiederholt. Bis morgen!' }
  }

  // Only reach for the network when the words already on hand can't fill a
  // session. Everything with a stored gloss is drillable offline.
  const MIN_OFFLINE = Math.min(want, 6)
  if (picked.filter(c => c.translation).length < MIN_OFFLINE) {
    await ensureTranslations(lang, nativeLang, picked)
  }

  const usable = picked.filter(c => c.translation)
  if (usable.length === 0) {
    return {
      error:
        'Noch keine Übersetzungen gespeichert. Klick beim Lesen ein paar Wörter an — ' +
        'die merkt sich znam, und Słówka übt sie dann auch offline.',
    }
  }

  const random = Math.random
  const exercises: VocabExercise[] = []
  usable.forEach((c, i) => {
    const kind = kindFor(i, !!c.context)
    const ex =
      buildVocabExercise(c, kind, usable, 'drill', random) ??
      buildVocabExercise(c, 'recognize', usable, 'drill', random)
    if (ex) exercises.push(ex)
  })

  if (exercises.length === 0) {
    return { error: 'Konnte keine Übungen bauen — zu wenige Wörter im Bereich.' }
  }

  return {
    lang,
    date: dayKey(Date.now()),
    totalSeconds: minutes * 60,
    exercises,
  }
}

export interface VocabSummary {
  xp: number
  xpTotal: number
  streak: number
  correct: number
  total: number
  maxCombo: number
  perfectDay: boolean
  dueTomorrow: number
}

export async function endVocabSession(
  lang: string,
  result: VocabResult,
): Promise<VocabSummary> {
  const now = Date.now()
  const today = dayKey(now)

  // ── SRS, one card per word ──
  const existing = new Map((await getVocabCards(lang)).map(c => [c.lemma, c]))
  const byLemma = new Map<string, { n: number; ok: number }>()
  for (const a of result.attempts) {
    const t = byLemma.get(a.lemma) ?? { n: 0, ok: 0 }
    t.n++
    if (a.correct) t.ok++
    byLemma.set(a.lemma, t)
  }

  const updated: VocabCard[] = []
  for (const [lemma, { n, ok }] of byLemma) {
    const prev = existing.get(lemma)
    // Reuse the concept scheduler unchanged — the SM-2 maths is identical, only
    // the key differs (concept id → lemma).
    const base = prev
      ? { ...newProgress(lang, lemma, now), ...prev, conceptId: lemma }
      : { ...newProgress(lang, lemma, now), conceptId: lemma }
    const next = review(base as any, n > 0 ? ok / n : 0, now)
    updated.push({
      lang, lemma,
      translation: prev?.translation ?? '',
      context: prev?.context,
      mastery: next.mastery,
      ease: next.ease,
      intervalDays: next.intervalDays,
      due: next.due,
      lapses: next.lapses,
      seen: next.seen,
      createdAt: prev?.createdAt ?? now,
    })
  }
  await putVocabCards(updated)

  // ── XP and its own streak ──
  const correct = result.attempts.filter(a => a.correct).length
  const xp = scoreSession(
    result.attempts.map(a => ({
      exerciseId: '', templateId: '', conceptId: a.lemma,
      correct: a.correct, nearMiss: a.nearMiss, answer: '', ms: a.ms,
      phase: 'drill' as const,
    })),
    { lessonShown: false, completed: result.attempts.length >= 5 },
  )

  let game = await getGameState(lang, 'vocab')
  const streakUpdate = advanceStreak(game, today)
  game = { ...streakUpdate.state, xp: streakUpdate.state.xp + xp.total }
  await saveGameStateFor(lang, 'vocab', game)

  // ── the day, for the heatmap ──
  const days = await getSessionDays(lang)
  const prior = days.find(d => d.date === today)
  await putSessionDay({
    lang, date: today,
    seconds: (prior?.seconds ?? 0) + result.seconds,
    items: (prior?.items ?? 0) + result.attempts.length,
    correct: (prior?.correct ?? 0) + correct,
    xp: (prior?.xp ?? 0) + xp.total,
  })

  // Both modes finished today → the bonus that makes two streaks feel like one
  // habit rather than two chores.
  const grammarState = await getGameState(lang, 'grammar')
  const perfectDay = grammarState.lastDay === today

  const dueTomorrow = updated.filter(c => c.due <= now + 86_400_000).length

  return {
    xp: xp.total + (perfectDay ? 50 : 0),
    xpTotal: game.xp,
    streak: game.streak,
    correct,
    total: result.attempts.length,
    maxCombo: xp.maxCombo,
    perfectDay,
    dueTomorrow,
  }
}

export interface VocabProgressView {
  streak: number
  xp: number
  cards: number
  dueNow: number
  maxRank: number
  minutes: number
}

export async function vocabProgress(lang: string): Promise<VocabProgressView> {
  const [game, cards, settings] = await Promise.all([
    getGameState(lang, 'vocab'),
    getVocabCards(lang),
    browser.storage.local.get('settings'),
  ])
  const now = Date.now()
  return {
    streak: game.streak,
    xp: game.xp,
    cards: cards.length,
    dueNow: cards.filter(c => c.due <= now).length,
    maxRank: (settings.settings as any)?.vocabMaxRank ?? DEFAULT_MAX_RANK,
    minutes: (settings.settings as any)?.vocabDailyMinutes ?? 10,
  }
}
