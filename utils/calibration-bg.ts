import { getLemmasAtRanks, countFreqRows } from './db'
import {
  MAX_ITEMS,
  PSEUDO_SHARE,
  SEED_RANKS,
  fitPosterior,
  falseAlarmRate,
  jitterRank,
  nextTargetRank,
  shouldStop,
  summarize,
  type CalibrationAnswer,
  type CalibrationSample,
  type SizeEstimate,
} from './calibration'

/**
 * Background driver for the adaptive calibration quiz.
 *
 * Deliberately stateless: the page sends the answers so far, the background
 * refits the posterior and returns the next item. Refitting ~600 grid points
 * against at most 25 answers is trivial, and it means a reloaded page or a
 * restarted service worker cannot desynchronise from a half-finished quiz.
 */

let pseudoCache: string[] | null = null

async function loadPseudowords(lang: string): Promise<string[]> {
  if (pseudoCache) return pseudoCache
  try {
    // Cast: WXT types getURL against literal public paths, ours is dynamic
    const resp = await fetch(browser.runtime.getURL(`/data/${lang}.pseudo.tsv` as any))
    if (!resp.ok) return (pseudoCache = [])
    const text = await resp.text()
    pseudoCache = text.split('\n').map(s => s.trim()).filter(Boolean)
  } catch {
    pseudoCache = []
  }
  return pseudoCache
}

export type CalibrationStep =
  | { done: false; item: CalibrationSample; asked: number; max: number }
  | { done: true; estimate: SizeEstimate }

/**
 * The next question, or the finished estimate.
 *
 * Pseudowords are scattered through the run at roughly PSEUDO_SHARE, but never
 * as the very first item — opening a vocabulary test with a word that does not
 * exist reads as a bug rather than a measurement.
 */
export async function calibrationNext(
  lang: string,
  answers: CalibrationAnswer[],
  usedLemmas: string[] = [],
): Promise<CalibrationStep> {
  const maxRank = (await countFreqRows(lang)) || 50000
  const real = answers.filter(a => !a.pseudo)
  const f = falseAlarmRate(answers)
  const post = fitPosterior(answers, f)

  // Cap on total items shown, not just the scored ones.
  if (shouldStop(post, answers.length, real.length)) {
    return { done: true, estimate: summarize(post, maxRank) }
  }

  const asked = answers.length
  const pseudoSoFar = answers.filter(a => a.pseudo).length
  const wantPseudo =
    asked >= 2 && pseudoSoFar < Math.ceil((asked + 1) * PSEUDO_SHARE)

  if (wantPseudo) {
    const pool = await loadPseudowords(lang)
    if (pool.length > 0) {
      const used = new Set(usedLemmas)
      const fresh = pool.filter(w => !used.has(w))
      const pick = (fresh.length > 0 ? fresh : pool)[
        Math.floor(Math.random() * (fresh.length > 0 ? fresh.length : pool.length))
      ]
      // rank 0 marks it as "not a real word" for the fitter, which skips it.
      return { done: false, item: { lemma: pick, rank: 0, pseudo: true }, asked, max: MAX_ITEMS }
    }
  }

  // Seed with a coarse ladder, then let the posterior choose.
  const target =
    real.length < SEED_RANKS.length
      ? SEED_RANKS[real.length]
      : jitterRank(nextTargetRank(post, maxRank), Math.random)

  const item = await pickLemmaNear(lang, Math.min(target, maxRank), usedLemmas)
  if (!item) return { done: true, estimate: summarize(post, maxRank) }
  return { done: false, item, asked, max: MAX_ITEMS }
}

/**
 * A lemma at or near `rank` that hasn't been shown yet. Widening rings rather
 * than a single lookup, so a collision doesn't abort the quiz.
 *
 * Returns undefined rather than repeating a word: asking the same lemma twice
 * gives no new information and reads as a bug to the learner.
 */
async function pickLemmaNear(
  lang: string,
  rank: number,
  used: string[],
): Promise<CalibrationSample | undefined> {
  const usedSet = new Set(used)
  const offsets = [0, 3, -3, 8, -8, 20, -20, 50, -50, 120, -120, 300, -300]
  const wanted = offsets
    .map(o => Math.max(1, rank + o))
    .filter((r, i, arr) => arr.indexOf(r) === i)

  const rows = await getLemmasAtRanks(lang, wanted)
  for (const row of rows) {
    if (!usedSet.has(row.lemma)) return { lemma: row.lemma, rank: row.rank }
  }
  return undefined
}
