import type { SessionPhase } from './types'
import { BLOCKED_LEMMAS } from './semantics'
import { shuffle } from './generator'

/**
 * Słówka — the vocabulary trainer.
 *
 * znam already knows which words you keep forgetting: every tooltip lookup
 * increments `lookups` on the word, and until now that signal only fed a
 * read-only "Hardest words" table and an Anki export. This turns it into
 * practice.
 *
 * Pure logic only — card selection, scheduling and question construction. The
 * IndexedDB and translation side lives in utils/vocab-bg.ts.
 */

/** Per-word scheduling state. Same SM-2 shape as ConceptProgress, keyed by lemma. */
export interface VocabCard {
  lang: string
  lemma: string
  translation: string
  /** Sentence the word was met in, when the reader captured one. */
  context?: string
  mastery: number
  ease: number
  intervalDays: number
  due: number
  lapses: number
  seen: number
  createdAt: number
}

export type VocabKind = 'recognize' | 'produce' | 'context'

export interface VocabExercise {
  id: string
  lemma: string
  kind: VocabKind
  /** What the learner is shown. */
  prompt: string
  /** Secondary line — the sentence for `context`, otherwise empty. */
  sub: string
  answer: string
  options: string[]
  phase: SessionPhase
}

/** A word the trainer may draw on, before it becomes a card. */
export interface VocabCandidate {
  lemma: string
  rank: number
  translation?: string
  context?: string
  status?: 'learning' | 'known' | 'ignored'
  level?: number
  lookups?: number
}

// ── the pool ────────────────────────────────────────────────

export const DEFAULT_MAX_RANK = 3000
export const MIN_MAX_RANK = 1000
export const MAX_MAX_RANK = 5000

/**
 * Words eligible for drilling.
 *
 * The frequency ceiling is the whole point of the feature: past roughly rank
 * 3000 the OpenSubtitles list starts yielding slang and one-off oddities
 * (rank 3000 is *świr*, rank 8000 is *kaczek*), and drilling those is a waste
 * of a session. `ignored` words and the profanity blocklist are dropped too.
 *
 * `known` is the dictionary's separate judgement about what is a word at all.
 * A frequency ceiling alone does not get you there — OpenSubtitles ranks `boho`
 * at 157 and `marshall` at 3635, comfortably inside any sane ceiling. An EMPTY
 * set means no word list is installed and the filter is skipped, so an older
 * install degrades to the previous behaviour instead of an empty session.
 */
export function eligible(
  candidates: VocabCandidate[],
  maxRank: number,
  known?: Set<string>,
): VocabCandidate[] {
  const filtering = !!known && known.size > 0
  return candidates.filter(c =>
    c.rank > 0 &&
    c.rank <= maxRank &&
    c.status !== 'ignored' &&
    !BLOCKED_LEMMAS.has(c.lemma) &&
    c.lemma.length > 1 &&
    (!filtering || known!.has(c.lemma)),
  )
}

// ── selection ───────────────────────────────────────────────

/** Repeated failures — these come back regardless of the due date. */
export const LEECH_LAPSES = 3
/** `lookups` at or above this means "I keep having to check this word". */
export const STRUGGLE_LOOKUPS = 2

export interface SelectionInput {
  candidates: VocabCandidate[]
  cards: Map<string, VocabCard>
  maxRank: number
  now: number
  limit: number
  /** Recognised vocabulary; empty or omitted disables the filter. */
  known?: Set<string>
}

/**
 * Choose what to drill, worst-first.
 *
 * The ordering is the feature: this is a trainer for the words you get wrong,
 * not a march through the frequency list. Priority runs
 *   leeches → overdue cards → high-lookup words → low-level learning words →
 *   new in-band words as filler.
 */
export function selectCards(input: SelectionInput): VocabCandidate[] {
  const { candidates, cards, maxRank, now, limit, known } = input
  const pool = eligible(candidates, maxRank, known)

  const score = (c: VocabCandidate): number => {
    const card = cards.get(c.lemma)
    if (card) {
      if (card.lapses >= LEECH_LAPSES) return 0          // keeps beating you
      if (card.due <= now) return 1                       // due for review
      return 9                                            // scheduled later
    }
    if ((c.lookups ?? 0) >= STRUGGLE_LOOKUPS) return 2     // looked up repeatedly
    if (c.status === 'learning' && (c.level ?? 1) <= 2) return 3
    return 4                                               // new word, filler
  }

  return [...pool]
    .map(c => ({ c, s: score(c) }))
    .filter(x => x.s < 9)
    // A word that already carries a gloss needs no network to drill. Ordering
    // those first is not just a robustness trick: a stored gloss means the
    // learner looked the word up in the reader, which is precisely the signal
    // this trainer is built around. Without it a blocked network yields an
    // empty session even when dozens of usable words are already on hand.
    .sort((a, b) =>
      a.s - b.s ||
      Number(!!b.c.translation) - Number(!!a.c.translation) ||
      (b.c.lookups ?? 0) - (a.c.lookups ?? 0) ||
      a.c.rank - b.c.rank,
    )
    .slice(0, limit)
    .map(x => x.c)
}

// ── question construction ───────────────────────────────────

let seq = 0
export function resetVocabIds(): void { seq = 0 }

/**
 * Distractor glosses drawn from a NEARBY frequency band.
 *
 * Options pulled from anywhere in the list are trivially rejectable — a
 * rank-50 word next to three rank-19000 words gives the answer away by
 * register alone. Neighbours keep the choice about meaning.
 */
export function nearbyGlosses(
  target: VocabCandidate,
  pool: VocabCandidate[],
  count: number,
  random: () => number,
): string[] {
  const withGloss = pool.filter(
    c => c.lemma !== target.lemma && c.translation && c.translation !== target.translation,
  )

  // "Nearby" has to be defined by rank RATIO, not by taking the N closest.
  // Taking a fixed count silently reaches across the whole list when the pool
  // is thin, which is exactly the giveaway this function exists to prevent.
  const band = (factor: number) => withGloss.filter(
    c => c.rank >= target.rank / factor && c.rank <= target.rank * factor,
  )
  let window = band(3)
  if (window.length < count) window = band(10)
  if (window.length < count) {
    window = [...withGloss].sort(
      (a, b) => Math.abs(a.rank - target.rank) - Math.abs(b.rank - target.rank),
    )
  }
  const picked: string[] = []
  const seen = new Set<string>([target.translation ?? ''])
  for (const c of shuffle(window, random)) {
    const g = c.translation!
    if (seen.has(g)) continue
    seen.add(g)
    picked.push(g)
    if (picked.length >= count) break
  }
  return picked
}

/**
 * Build one question. Returns undefined when the word lacks what the kind
 * needs — no gloss, or no captured sentence for a context item.
 */
export function buildVocabExercise(
  card: VocabCandidate,
  kind: VocabKind,
  pool: VocabCandidate[],
  phase: SessionPhase,
  random: () => number,
): VocabExercise | undefined {
  if (!card.translation) return undefined

  if (kind === 'recognize') {
    const distractors = nearbyGlosses(card, pool, 3, random)
    if (distractors.length < 2) return undefined
    return {
      id: `v${++seq}`,
      lemma: card.lemma,
      kind,
      prompt: card.lemma,
      sub: '',
      answer: card.translation,
      options: shuffle([card.translation, ...distractors], random),
      phase,
    }
  }

  if (kind === 'produce') {
    return {
      id: `v${++seq}`,
      lemma: card.lemma,
      kind,
      prompt: card.translation,
      sub: '',
      answer: card.lemma,
      options: [],
      phase,
    }
  }

  // context — reuse the sentence the reader captured when the word was clicked.
  if (!card.context) return undefined
  const blanked = blankWord(card.context, card.lemma)
  if (!blanked) return undefined
  return {
    id: `v${++seq}`,
    lemma: card.lemma,
    kind,
    prompt: blanked,
    sub: card.translation,
    answer: card.lemma,
    options: [],
    phase,
  }
}

/**
 * Replace the word in its captured sentence with a gap.
 *
 * The stored context contains an inflected form, not the lemma, so a plain
 * string replace usually fails. Matching on a stem prefix catches the ordinary
 * Polish case where only the ending differs.
 */
export function blankWord(sentence: string, lemma: string): string | undefined {
  const words = sentence.split(/(\s+)/)
  const stem = lemma.slice(0, Math.max(3, lemma.length - 2)).toLowerCase()
  let hit = false
  const out = words.map((w) => {
    if (hit || !/\p{L}/u.test(w)) return w
    const bare = w.replace(/^[^\p{L}]+|[^\p{L}]+$/gu, '').toLowerCase()
    if (bare.startsWith(stem)) {
      hit = true
      return w.replace(/\p{L}+/u, '___')
    }
    return w
  })
  return hit ? out.join('') : undefined
}

/** Cycle the kinds so a session mixes recognition and production. */
export function kindFor(index: number, hasContext: boolean): VocabKind {
  if (hasContext && index % 4 === 3) return 'context'
  return index % 2 === 0 ? 'recognize' : 'produce'
}
