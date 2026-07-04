import type { ScoreResult, TokenInfo } from './types'

export interface PageScore extends ScoreResult {
  /** lemma → token count over countable tokens (persisted for rescoring). */
  lemmaCounts: Record<string, number>
}

/**
 * Token-based comprehensibility: known tokens / countable tokens.
 * Names and ignored lemmas are excluded from the denominator.
 */
export function scoreTokens(
  tokens: string[],
  infoFor: (token: string) => TokenInfo | undefined,
): PageScore {
  let known = 0
  let learning = 0
  let unknown = 0
  const lemmaCounts: Record<string, number> = {}
  const unknownLemmas = new Set<string>()

  for (const token of tokens) {
    const info = infoFor(token)
    if (!info || info.status === 'name' || info.status === 'ignored') continue
    lemmaCounts[info.lemma] = (lemmaCounts[info.lemma] || 0) + 1
    if (info.status === 'known') known++
    else if (info.status === 'learning') learning++
    else {
      unknown++
      unknownLemmas.add(info.lemma)
    }
  }

  const countable = known + learning + unknown
  return {
    score: countable > 0 ? known / countable : 0,
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

/** Rescore a stored lemmaCounts blob against the current word statuses. */
export function rescoreLemmaCounts(
  lemmaCounts: Record<string, number>,
  statusFor: (lemma: string) => 'learning' | 'known' | 'ignored' | undefined,
): { score: number; knownTokens: number; countableTokens: number; unknownLemmas: number } {
  let known = 0
  let countable = 0
  let unknownLemmas = 0
  for (const [lemma, count] of Object.entries(lemmaCounts)) {
    const status = statusFor(lemma)
    if (status === 'ignored') continue
    countable += count
    if (status === 'known') known += count
    else if (status !== 'learning') unknownLemmas++
  }
  return {
    score: countable > 0 ? known / countable : 0,
    knownTokens: known,
    countableTokens: countable,
    unknownLemmas,
  }
}
