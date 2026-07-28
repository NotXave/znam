import type { Exercise, SessionPhase, SlotSpec, Template } from './types'
import { BLOCKED_LEMMAS, inSemanticClass } from './semantics'

/**
 * Exercise generation. Pure — it is handed a paradigm lookup and a vocabulary
 * ranking rather than reaching into IndexedDB itself, so it can be exercised
 * exhaustively under `node --test`.
 */

/** One lemma's full paradigm: tag → form. */
export type Paradigm = Map<string, string>

export interface GeneratorInput {
  /** Candidate lemmas, already ordered best-first (see rankLemmas). */
  lemmas: string[]
  /** Paradigm lookup; undefined when the lemma has no verified forms. */
  paradigmOf: (lemma: string) => Paradigm | undefined
  /** Deterministic 0..1 source, so a session can be reproduced in tests. */
  random: () => number
}

/** Mulberry32 — small, seedable, good enough for shuffling drills. */
export function makeRandom(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function shuffle<T>(items: T[], random: () => number): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

export interface VocabRank {
  /** Lemmas the learner is actively learning — best fillers. */
  learning: Set<string>
  /** Lemmas the learner already knows — safe fillers. */
  known: Set<string>
  /** Lemmas explicitly ignored — never used. */
  ignored: Set<string>
  /** lemma → frequency rank, for the fallback tier. */
  rank: Map<string, number>
}

/** How far down the frequency list we will reach for a word never met before. */
export const UNKNOWN_RANK_LIMIT = 3000

/**
 * Order candidate lemmas so drills land on words the learner actually has.
 * Learning words first (grammar practice doubles as vocab review), then known
 * words (cognitive load stays on the grammar), then common-enough new words.
 * Ignored words, and words known to be rare, are dropped — an exercise must
 * test grammar, not vocabulary.
 *
 * A lemma with NO rank at all is kept, at lowest priority: candidates come from
 * the morph table, which is already frequency-filtered when it is built, so an
 * unranked entry means "the frequency list isn't installed", not "rare word".
 * Dropping those would make the whole game silently unplayable without the
 * separate reader dictionaries.
 */
export function rankLemmas(candidates: string[], vocab: VocabRank): string[] {
  const tier = (lemma: string): number => {
    if (vocab.ignored.has(lemma)) return -1
    if (BLOCKED_LEMMAS.has(lemma)) return -1
    if (vocab.learning.has(lemma)) return 0
    if (vocab.known.has(lemma)) return 1
    const r = vocab.rank.get(lemma)
    if (r == null) return 3
    return r <= UNKNOWN_RANK_LIMIT ? 2 : -1
  }
  return candidates
    .map(lemma => ({ lemma, t: tier(lemma) }))
    .filter(x => x.t >= 0)
    .sort((a, b) => a.t - b.t || (vocab.rank.get(a.lemma) ?? 1e9) - (vocab.rank.get(b.lemma) ?? 1e9))
    .map(x => x.lemma)
}

/** Does this lemma satisfy the slot (tag, gender, meaning)? */
function slotFits(lemma: string, paradigm: Paradigm, spec: SlotSpec): boolean {
  if (!paradigm.has(spec.tag)) return false
  if (spec.oneOf && !spec.oneOf.includes(lemma)) return false
  if (!inSemanticClass(lemma, spec.semantic)) return false
  if (spec.gender) {
    // Gender is inferred from the paradigm: a noun carrying a feminine-marked
    // tag anywhere is feminine. Adjective tags carry gender explicitly.
    const hasGender = [...paradigm.keys()].some(t => t.split('.').includes(spec.gender!))
    const anyGendered = [...paradigm.keys()].some(t =>
      ['m', 'f', 'n'].some(g => t.split('.').includes(g)),
    )
    if (anyGendered && !hasGender) return false
    if (!anyGendered) return guessGender(paradigm) === spec.gender
  }
  return true
}

/**
 * Nouns in the table are not tagged for gender (their gender is inherent, not
 * inflectional), so infer it from the nominative singular the same way the
 * gender.basic lesson teaches it.
 */
export function guessGender(paradigm: Paradigm): 'm' | 'f' | 'n' | undefined {
  const nom = paradigm.get('sg.nom')
  if (!nom) return undefined
  if (/[oeę]$/.test(nom)) return 'n'
  if (/a$/.test(nom)) return 'f'
  return 'm'
}

/**
 * Build wrong answers from the answer lemma's OWN paradigm.
 *
 * This is the pedagogical core of the whole game: a case drill only teaches if
 * the wrong options are wrong in an interesting way. Offering "kinu / kinem /
 * kinie" against "kina" forces a real decision about case; offering three
 * unrelated words tests nothing.
 */
export function buildDistractors(
  paradigm: Paradigm,
  answer: string,
  fromTags: string[],
  count: number,
  random: () => number,
): string[] {
  const seen = new Set([answer])
  const out: string[] = []
  for (const tag of fromTags) {
    const form = paradigm.get(tag)
    if (!form || seen.has(form)) continue
    seen.add(form)
    out.push(form)
  }
  // Top up from anywhere else in the paradigm if the preferred tags collided.
  if (out.length < count) {
    for (const form of paradigm.values()) {
      if (out.length >= count) break
      if (seen.has(form)) continue
      seen.add(form)
      out.push(form)
    }
  }
  return shuffle(out.slice(0, count), random)
}

/** German gender labels — the answer options for a gender-sort item. */
export const GENDER_LABEL_DE: Record<'m' | 'f' | 'n', string> = {
  m: 'männlich',
  f: 'weiblich',
  n: 'sächlich',
}

let exerciseSeq = 0

/**
 * Realize one template into a concrete exercise.
 * Returns undefined when no candidate lemma satisfies every slot — the caller
 * moves on to another template rather than emitting a guessed form.
 */
export function generate(
  template: Template,
  conceptId: string,
  phase: SessionPhase,
  input: GeneratorInput,
): Exercise | undefined {
  const answerSpec = template.slots[template.answerSlot]
  if (!answerSpec) return undefined

  for (const lemma of input.lemmas) {
    const paradigm = input.paradigmOf(lemma)
    if (!paradigm || !slotFits(lemma, paradigm, answerSpec)) continue

    const base = paradigm.get('sg.nom') ?? lemma

    // gender-sort asks about the WORD, not about a form: the question is the
    // noun itself and the options are the three genders.
    if (template.kind === 'gender-sort') {
      const gender = guessGender(paradigm)
      if (!gender) continue
      return {
        id: `ex${++exerciseSeq}`,
        templateId: template.id,
        conceptId,
        kind: template.kind,
        promptDe: template.promptDe,
        text: base,
        cue: '',
        answer: GENDER_LABEL_DE[gender],
        options: shuffle(Object.values(GENDER_LABEL_DE), input.random),
        hintDe: template.hintDe,
        alsoAccept: template.alsoAccept ?? [],
        phase,
      }
    }

    const answer = paradigm.get(answerSpec.tag)!

    // Fill every non-answer slot; bail if any of them cannot be satisfied.
    let text = template.frame
    let ok = true
    for (const [name, spec] of Object.entries(template.slots)) {
      if (name === template.answerSlot) continue
      const form = paradigm.get(spec.tag)
      if (!form) { ok = false; break }
      text = text.replace(`{${name}}`, form)
    }
    if (!ok) continue

    // A transform item has no carrier sentence — showing a bare '___' would
    // leave nothing on screen, so the base form itself is the question.
    text = template.kind === 'transform'
      ? base
      : text.replace(`{${template.answerSlot}}`, '___')

    const options = template.distractors
      ? shuffle(
          [
            answer,
            ...buildDistractors(
              paradigm,
              answer,
              template.distractors.fromTags,
              template.distractors.count,
              input.random,
            ),
          ],
          input.random,
        )
      : []

    return {
      id: `ex${++exerciseSeq}`,
      templateId: template.id,
      conceptId,
      kind: template.kind,
      promptDe: template.promptDe,
      text,
      cue: template.kind === 'transform' ? '' : base,
      answer,
      options,
      hintDe: template.hintDe,
      alsoAccept: template.alsoAccept ?? [],
      phase,
    }
  }
  return undefined
}

/** Reset the exercise id counter — tests rely on stable ids. */
export function resetExerciseIds(): void {
  exerciseSeq = 0
}
