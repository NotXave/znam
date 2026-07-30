import { getLemmasAtRanks, countFreqRows, getKnownLemmas } from './db'
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

/**
 * The recognised-vocabulary set, cached for the length of a quiz.
 *
 * ~12 k strings for Polish, read once rather than on each of the 25 items.
 * An empty set means no list is installed, which must disable the filter — see
 * `isRealWord`.
 */
let knownCache: { lang: string; set: Set<string> } | null = null

async function knownFor(lang: string): Promise<Set<string>> {
  if (knownCache?.lang === lang) return knownCache.set
  let set = new Set<string>()
  try {
    set = await getKnownLemmas(lang)
  } catch {
    // store missing (pre-v4 database) — degrade to no filtering
  }
  knownCache = { lang, set }
  return set
}

/** Reset between quizzes so a language reinstall is picked up. */
export function invalidateKnownCache(): void {
  knownCache = null
}

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

  const item = await pickLemmaNear(lang, Math.min(target, maxRank), usedLemmas, await knownFor(lang))
  if (!item) return { done: true, estimate: summarize(post, maxRank) }
  return { done: false, item, asked, max: MAX_ITEMS }
}

/**
 * A lemma at or near `rank` that hasn't been shown yet. Widening rings rather
 * than a single lookup, so a collision doesn't abort the quiz.
 *
 * Returns undefined rather than repeating a word: asking the same lemma twice
 * gives no new information and reads as a bug to the learner.
 *
 * `known` filters out what the frequency list can't: OpenSubtitles ranks `boho`
 * at 157 and `liam` at 4000, and asking whether you know a character's name
 * measures nothing at all. An EMPTY set means no word list is installed, and
 * then the filter is skipped rather than emptying the pool.
 */
export async function pickLemmaNear(
  lang: string,
  rank: number,
  used: string[],
  known: Set<string> = new Set(),
): Promise<CalibrationSample | undefined> {
  const usedSet = new Set(used)
  const filtering = known.size > 0
  const acceptable = (lemma: string) => !usedSet.has(lemma) && (!filtering || known.has(lemma))

  // Two rings. The first is tight, so the item sits near the rank the posterior
  // actually asked for; the second is a long reach used only when the first
  // finds nothing, which the ~10 % rejection rate in the top band makes rare.
  for (const offsets of [
    [0, 3, -3, 8, -8, 20, -20, 50, -50, 120, -120, 300, -300],
    [600, -600, 1200, -1200, 2500, -2500, 5000, -5000],
  ]) {
    const wanted = offsets
      .map(o => Math.max(1, rank + o))
      .filter((r, i, arr) => arr.indexOf(r) === i)
    const rows = await getLemmasAtRanks(lang, wanted)
    const hit = rows.find(r => acceptable(r.lemma))
    if (hit) return { lemma: hit.lemma, rank: hit.rank }
  }

  // Deliberately no fall-back to a rejected lemma. Ending the quiz one item
  // early costs a little precision; asking "do you know *hombre*?" and folding
  // the answer into the estimate costs correctness.
  return undefined
}
