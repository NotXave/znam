/**
 * Answer grading. Deliberately forgiving about typing, ruthless about grammar:
 * a missing ogonek is a keyboard problem, a wrong case ending is the thing we
 * are actually here to fix.
 */

const DIACRITICS: Record<string, string> = {
  ą: 'a', ć: 'c', ę: 'e', ł: 'l', ń: 'n', ó: 'o', ś: 's', ź: 'z', ż: 'z',
}

export function stripDiacritics(s: string): string {
  return s.replace(/[ąćęłńóśźż]/g, ch => DIACRITICS[ch] ?? ch)
}

export function normalize(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ').replace(/[.,!?;:]+$/, '')
}

/** Classic Levenshtein, capped early — inputs here are single words. */
export function editDistance(a: string, b: string): number {
  if (a === b) return 0
  if (a.length === 0) return b.length
  if (b.length === 0) return a.length

  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const curr = [i]
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost)
    }
    prev = curr
  }
  return prev[b.length]
}

export type GradeVerdict = 'correct' | 'diacritics' | 'typo' | 'wrong'

export interface GradeResult {
  verdict: GradeVerdict
  /** True for anything the session counts as correct. */
  correct: boolean
  /** True when it was only *just* correct — replayed later in the session. */
  nearMiss: boolean
  /** German nudge shown alongside the result, when there is something to say. */
  noteDe?: string
}

/**
 * Grade a free-text answer.
 *
 * A one-character edit only counts as a typo on words longer than 5 characters:
 * on short Polish words a single character IS the case ending (kot / kota,
 * okno / oknem), so forgiving it there would forgive the actual mistake.
 */
export function grade(input: string, answer: string, alsoAccept: string[] = []): GradeResult {
  const given = normalize(input)
  const want = normalize(answer)
  const accepted = [want, ...alsoAccept.map(normalize)]

  if (given.length === 0) return { verdict: 'wrong', correct: false, nearMiss: false }

  for (const target of accepted) {
    if (given === target) return { verdict: 'correct', correct: true, nearMiss: false }
  }

  for (const target of accepted) {
    if (stripDiacritics(given) === stripDiacritics(target)) {
      return {
        verdict: 'diacritics',
        correct: true,
        nearMiss: true,
        noteDe: `Fast! Achte auf die Häkchen: ${target}`,
      }
    }
  }

  for (const target of accepted) {
    if (target.length > 5 && editDistance(given, target) === 1) {
      return {
        verdict: 'typo',
        correct: true,
        nearMiss: true,
        noteDe: `Tippfehler — gemeint war ${target}.`,
      }
    }
  }

  return { verdict: 'wrong', correct: false, nearMiss: false }
}

/** Multiple-choice grading: exact identity, no forgiveness needed. */
export function gradeChoice(chosen: string, answer: string): GradeResult {
  const correct = normalize(chosen) === normalize(answer)
  return { verdict: correct ? 'correct' : 'wrong', correct, nearMiss: false }
}
