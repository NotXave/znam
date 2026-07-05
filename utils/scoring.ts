import type { LearningLevel, ScoreResult, TokenInfo, WordStatus } from './types'

export interface PageScore extends ScoreResult {
  /** lemma → token count over countable tokens (persisted for rescoring). */
  lemmaCounts: Record<string, number>
}

/**
 * How comprehensible a word is, 0..1. Known words count fully; learning words
 * count proportionally to their stage (L5 ≈ known, L1 ≈ just met) so progress
 * on words you're studying raises the score instead of leaving everything
 * stuck at "hard".
 */
export function comprehensionWeight(status: WordStatus | 'unknown' | 'name', level?: LearningLevel): number {
  if (status === 'known') return 1
  if (status === 'learning') return (level ?? 1) / 5
  return 0 // unknown
}

/**
 * How much a token matters to comprehension, by frequency rank. A frequent
 * word carries more of the meaning, so an unknown common word hurts the score
 * more than an unknown rare one. Unranked lemmas (rare words, names) get a low
 * weight so they barely dent the score.
 */
export function importanceWeight(rank?: number): number {
  if (rank == null) return 0.4
  if (rank <= 1000) return 1
  if (rank <= 5000) return 0.85
  if (rank <= 15000) return 0.65
  if (rank <= 40000) return 0.5
  return 0.4
}

/**
 * Comprehensibility = summed comprehension weight / countable tokens.
 * Names and ignored lemmas are excluded from the denominator.
 */
export function scoreTokens(
  tokens: string[],
  infoFor: (token: string) => TokenInfo | undefined,
): PageScore {
  let weighted = 0
  let weightTotal = 0
  let known = 0
  let learning = 0
  let unknown = 0
  const lemmaCounts: Record<string, number> = {}
  const unknownLemmas = new Set<string>()

  for (const token of tokens) {
    const info = infoFor(token)
    if (!info || info.status === 'name' || info.status === 'ignored') continue
    lemmaCounts[info.lemma] = (lemmaCounts[info.lemma] || 0) + 1
    // Frequency-weighted: rare unknown words dent the score less than common ones
    const w = importanceWeight(info.rank)
    weightTotal += w
    weighted += w * comprehensionWeight(info.status, info.level)
    if (info.status === 'known') known++
    else if (info.status === 'learning') learning++
    else {
      unknown++
      unknownLemmas.add(info.lemma)
    }
  }

  const countable = known + learning + unknown
  return {
    score: weightTotal > 0 ? weighted / weightTotal : 0,
    countableTokens: countable,
    knownTokens: known,
    learningTokens: learning,
    unknownTokens: unknown,
    uniqueUnknown: [...unknownLemmas].slice(0, 50),
    lemmaCounts,
  }
}

/** i+1 comfort label for a 0..1 score. */
export function difficultyLabel(score: number): 'hard' | 'challenging' | 'sweet spot' | 'easy' {
  if (score < 0.85) return 'hard'
  if (score < 0.9) return 'challenging'
  if (score <= 0.98) return 'sweet spot'
  return 'easy'
}

export interface LemmaStatus {
  status: WordStatus
  level?: LearningLevel
}

/** Rescore a stored lemmaCounts blob against the current word statuses. */
export function rescoreLemmaCounts(
  lemmaCounts: Record<string, number>,
  statusFor: (lemma: string) => LemmaStatus | undefined,
): { score: number; knownTokens: number; countableTokens: number; unknownLemmas: number } {
  let weighted = 0
  let known = 0
  let countable = 0
  let unknownLemmas = 0
  for (const [lemma, count] of Object.entries(lemmaCounts)) {
    const s = statusFor(lemma)
    if (s?.status === 'ignored') continue
    countable += count
    if (s?.status === 'known') {
      weighted += count
      known += count
    } else if (s?.status === 'learning') {
      weighted += count * comprehensionWeight('learning', s.level)
    } else {
      unknownLemmas++
    }
  }
  return {
    score: countable > 0 ? weighted / countable : 0,
    knownTokens: known,
    countableTokens: countable,
    unknownLemmas,
  }
}
