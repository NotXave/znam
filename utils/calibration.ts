import { getLemmasAtRanks, getTopLemmas } from './db'

export interface CalibrationSample {
  lemma: string
  rank: number
}

/** ~40 lemmas at log-spaced ranks between 25 and 50k. */
export async function calibrationSample(lang: string): Promise<CalibrationSample[]> {
  const ranks: number[] = []
  for (let r = 25; r <= 50000; r = Math.ceil(r * 1.22)) ranks.push(r)
  const rows = await getLemmasAtRanks(lang, ranks)
  // Dedupe (adjacent requested ranks can resolve to the same row)
  const seen = new Set<string>()
  return rows.filter(({ lemma }) => {
    if (seen.has(lemma)) return false
    seen.add(lemma)
    return true
  })
}

/**
 * Fit a logistic P(known | log10 rank) to quiz answers by grid search and
 * return the rank where P = 0.5 — "you know roughly the top N words".
 */
export function estimateKnownRank(answers: { rank: number; known: boolean }[]): number {
  if (answers.length === 0) return 0
  const knownCount = answers.filter(a => a.known).length
  if (knownCount === 0) return 0
  if (knownCount === answers.length) return answers[answers.length - 1].rank

  let bestMid = Math.log10(1000)
  let bestSlope = 2
  let bestLoss = Infinity
  for (let mid = 1; mid <= 4.8; mid += 0.05) {
    for (const slope of [1, 1.5, 2, 3, 4, 6]) {
      let loss = 0
      for (const { rank, known } of answers) {
        const p = 1 / (1 + Math.exp(slope * (Math.log10(rank) - mid)))
        const clamped = Math.min(1 - 1e-6, Math.max(1e-6, p))
        loss -= known ? Math.log(clamped) : Math.log(1 - clamped)
      }
      if (loss < bestLoss) {
        bestLoss = loss
        bestMid = mid
        bestSlope = slope
      }
    }
  }
  void bestSlope
  return Math.round(Math.pow(10, bestMid))
}

/** The top-N lemmas that calibration marks as known. */
export async function calibrationLemmas(lang: string, topN: number): Promise<string[]> {
  return getTopLemmas(lang, topN)
}
