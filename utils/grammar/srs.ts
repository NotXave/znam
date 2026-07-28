import type { Attempt, ConceptProgress } from './types'

/**
 * SM-2-lite over CONCEPTS rather than individual cards.
 *
 * Grammar is not a pile of independent facts: once the instrumental clicks, it
 * clicks for every noun at once. Scheduling ~50 concepts (instead of thousands
 * of cards) matches how the material is actually learned and keeps the whole
 * scheduler state small enough to reason about.
 */

export const MIN_EASE = 1.3
export const MAX_EASE = 2.8
export const START_EASE = 2.3
export const MAX_INTERVAL_DAYS = 180
/** Lapses at or above this mark a concept as a leech. */
export const LEECH_THRESHOLD = 4

const DAY_MS = 86_400_000

export function newProgress(lang: string, conceptId: string, now: number): ConceptProgress {
  return {
    lang,
    conceptId,
    mastery: 0,
    ease: START_EASE,
    intervalDays: 0,
    due: now,
    lapses: 0,
    seen: 0,
    introducedAt: now,
  }
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))

/** Map a 0..1 correct rate onto SM-2's 0..5 quality grade. */
export function gradeOf(correctRate: number): number {
  return Math.round(clamp(correctRate, 0, 1) * 5)
}

/**
 * Apply one session's worth of results for a single concept.
 * Pure: takes the old progress, returns a new one — never mutates.
 */
export function review(
  prev: ConceptProgress,
  correctRate: number,
  now: number,
): ConceptProgress {
  const q = gradeOf(correctRate)
  const lapsed = q < 3

  let ease = prev.ease + 0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)
  if (lapsed) ease -= 0.2
  ease = clamp(ease, MIN_EASE, MAX_EASE)

  let intervalDays: number
  if (lapsed) intervalDays = 1
  else if (prev.intervalDays === 0) intervalDays = 1
  else if (prev.intervalDays === 1) intervalDays = 3
  else intervalDays = Math.round(prev.intervalDays * ease)
  intervalDays = Math.min(intervalDays, MAX_INTERVAL_DAYS)

  return {
    ...prev,
    ease,
    intervalDays,
    due: now + intervalDays * DAY_MS,
    lapses: prev.lapses + (lapsed ? 1 : 0),
    seen: prev.seen + 1,
    // EWMA — one bad day dents mastery without erasing a month of good ones.
    mastery: clamp(0.7 * prev.mastery + 0.3 * clamp(correctRate, 0, 1), 0, 1),
  }
}

export function isLeech(p: ConceptProgress): boolean {
  return p.lapses >= LEECH_THRESHOLD
}

/** Per-concept correct rates from a flat list of attempts. */
export function correctRates(attempts: Attempt[]): Map<string, number> {
  const totals = new Map<string, { n: number; ok: number }>()
  for (const a of attempts) {
    const t = totals.get(a.conceptId) ?? { n: 0, ok: 0 }
    t.n++
    if (a.correct) t.ok++
    totals.set(a.conceptId, t)
  }
  const out = new Map<string, number>()
  for (const [cid, { n, ok }] of totals) out.set(cid, n > 0 ? ok / n : 0)
  return out
}

/**
 * Fold a whole session into updated progress rows. Concepts the session never
 * touched are left alone.
 */
export function applySession(
  existing: ConceptProgress[],
  attempts: Attempt[],
  lang: string,
  now: number,
): ConceptProgress[] {
  const byId = new Map(existing.map(p => [p.conceptId, p]))
  const rates = correctRates(attempts)
  const out: ConceptProgress[] = []
  for (const [conceptId, rate] of rates) {
    const prev = byId.get(conceptId) ?? newProgress(lang, conceptId, now)
    out.push(review(prev, rate, now))
  }
  return out
}

/**
 * Concepts to drill today, most overdue first, with leeches pulled to the front
 * regardless of due date — a concept you keep failing is the one you most need.
 */
export function selectDue(all: ConceptProgress[], now: number, limit: number): ConceptProgress[] {
  const due = all.filter(p => p.due <= now)
  due.sort((a, b) => {
    const aLeech = isLeech(a) ? 0 : 1
    const bLeech = isLeech(b) ? 0 : 1
    if (aLeech !== bLeech) return aLeech - bLeech
    return a.due - b.due
  })
  return due.slice(0, limit)
}
