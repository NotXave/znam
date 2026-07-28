import type { Exercise, Lesson, SessionPhase, SessionPlan } from './types'
import type { ConceptProgress } from './types'
import type { Paradigm, VocabRank } from './generator'
import { generate, makeRandom, rankLemmas, shuffle } from './generator'
import { AUTHORED_CONCEPTS, LESSON_BY_CONCEPT } from './lessons.de'
import { TEMPLATES_BY_CONCEPT } from './templates'
import { nextNewConcept } from './curriculum'
import { isLeech, selectDue } from './srs'
import { dayKey, phaseBudgets } from './session'

/**
 * Compose one day's session: pick what to teach and drill, then pre-generate
 * every exercise in one pass. Pure, so the whole composition is testable.
 */

export interface PlanInput {
  lang: string
  minutes: number
  now: number
  progress: ConceptProgress[]
  /** lemma → paradigm, for every usable lemma. */
  paradigms: Map<string, Paradigm>
  vocab: VocabRank
  /** How many new concepts may be introduced today. */
  newPerDay: number
  seed?: number
}

/** Roughly how many items fit in a phase, at ~8 s per item. */
const ITEMS_PER_SECOND = 1 / 8

function itemsFor(seconds: number): number {
  return Math.max(1, Math.round(seconds * ITEMS_PER_SECOND))
}

/**
 * How many of the best-ranked lemmas successive items rotate through.
 *
 * Rotating the WHOLE pool would give variety but throw away rankLemmas' work —
 * the learner's own vocabulary would stop being preferred at all. Rotating only
 * within the head keeps drills on words they actually know while still varying
 * which one, and the untouched tail remains available as fallback when a slot's
 * constraints cannot be met near the front.
 */
const ROTATION_WINDOW = 40

function rotatePool(pool: string[], random: () => number): string[] {
  if (pool.length <= 1) return pool
  const headSize = Math.min(ROTATION_WINDOW, pool.length)
  const head = pool.slice(0, headSize)
  const tail = pool.slice(headSize)
  const offset = Math.floor(random() * headSize)
  return [...head.slice(offset), ...head.slice(0, offset), ...tail]
}

/**
 * Generate up to `count` exercises for a concept, cycling its templates so a
 * phase never shows the same frame twice in a row.
 */
function generateForConcept(
  conceptId: string,
  phase: SessionPhase,
  count: number,
  input: PlanInput,
  random: () => number,
  lemmaPool: string[],
): Exercise[] {
  const templates = TEMPLATES_BY_CONCEPT.get(conceptId) ?? []
  if (templates.length === 0) return []

  const out: Exercise[] = []
  const paradigmOf = (lemma: string) => input.paradigms.get(lemma)

  for (let i = 0; out.length < count && i < count * templates.length; i++) {
    const template = templates[i % templates.length]
    const ex = generate(template, conceptId, phase, {
      lemmas: rotatePool(lemmaPool, random),
      paradigmOf,
      random,
    })
    if (ex) out.push(ex)
  }
  return out
}

/**
 * Build today's plan.
 *
 * Order of business: warm up on what is due, teach at most one new thing, drill
 * everything interleaved, then fight a boss on the weakest concept.
 */
export function buildPlan(input: PlanInput): SessionPlan {
  const random = makeRandom(input.seed ?? input.now)
  const totalSeconds = input.minutes * 60
  const budgets = phaseBudgets(totalSeconds)
  const secondsOf = (p: SessionPhase) => budgets.find(b => b.phase === p)?.seconds ?? 0

  const byId = new Map(input.progress.map(p => [p.conceptId, p]))
  const lookup = (id: string) => {
    const p = byId.get(id)
    return p ? { mastery: p.mastery, intervalDays: p.intervalDays } : undefined
  }

  const lemmaPool = rankLemmas([...input.paradigms.keys()], input.vocab)

  // What is due today, plus whatever we are introducing.
  const due = selectDue(input.progress, input.now, 8).map(p => p.conceptId)
  const introduced = new Set(input.progress.map(p => p.conceptId))
  const newConceptId =
    input.newPerDay > 0
      ? nextNewConcept(lookup, introduced, AUTHORED_CONCEPTS)
      : undefined

  const active = [...new Set([...due, ...(newConceptId ? [newConceptId] : [])])].filter(
    id => AUTHORED_CONCEPTS.has(id),
  )

  // A brand-new learner has nothing due — fall back to whatever is unlocked.
  const drillable = active.length > 0 ? active : newConceptId ? [newConceptId] : []

  const exercises: Exercise[] = []

  // ── warm-up: due concepts only, leeches first ──
  const warmupConcepts = due.length > 0 ? due : drillable
  if (warmupConcepts.length > 0) {
    const per = Math.max(1, Math.ceil(itemsFor(secondsOf('warmup')) / warmupConcepts.length))
    for (const cid of warmupConcepts) {
      exercises.push(...generateForConcept(cid, 'warmup', per, input, random, lemmaPool))
    }
  }

  // ── lesson: guided items on the new concept ──
  let lesson: Lesson | undefined
  if (newConceptId) {
    lesson = LESSON_BY_CONCEPT.get(newConceptId)
    exercises.push(
      ...generateForConcept(newConceptId, 'lesson', 3, input, random, lemmaPool),
    )
  }

  // ── drill: everything, interleaved ──
  if (drillable.length > 0) {
    const per = Math.max(1, Math.ceil(itemsFor(secondsOf('drill')) / drillable.length))
    const drills: Exercise[] = []
    for (const cid of drillable) {
      drills.push(...generateForConcept(cid, 'drill', per, input, random, lemmaPool))
    }
    // Interleaving beats blocking for grammar — shuffle across concepts.
    exercises.push(...shuffle(drills, random))
  }

  // ── boss: the weakest concept ──
  const weakest = [...input.progress]
    .filter(p => AUTHORED_CONCEPTS.has(p.conceptId))
    .sort((a, b) => (isLeech(b) ? 1 : 0) - (isLeech(a) ? 1 : 0) || a.mastery - b.mastery)[0]
  const bossConcept = weakest?.conceptId ?? drillable[0]
  if (bossConcept) {
    exercises.push(...generateForConcept(bossConcept, 'boss', 5, input, random, lemmaPool))
  }

  return {
    lang: input.lang,
    date: dayKey(input.now),
    totalSeconds,
    budgets,
    newConceptId,
    lesson,
    exercises,
    conceptIds: [...new Set(exercises.map(e => e.conceptId))],
  }
}
