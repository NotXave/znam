import type { Concept } from './types'

/**
 * The concept graph. A concept unlocks once every id in `requires` is mastered
 * (see isUnlocked below), which is what keeps the learner from meeting the
 * genitive before they can reliably tell a masculine noun from a neuter one.
 *
 * Tier 1 is fully authored; tiers 2–4 are declared here so the map screen shows
 * the whole road ahead, and are filled in with lessons/templates as the
 * curriculum is written out.
 */
export const CONCEPTS: Concept[] = [
  // ── Tier 1 — the ground floor ──
  {
    id: 'gender.basic',
    tier: 1,
    group: 'gender',
    titleDe: 'Die drei Geschlechter',
    requires: [],
  },
  {
    id: 'case.nom.sg',
    tier: 1,
    group: 'case',
    titleDe: 'Nominativ Singular — die Wörterbuchform',
    requires: ['gender.basic'],
  },
  {
    id: 'case.acc.sg',
    tier: 1,
    group: 'case',
    titleDe: 'Akkusativ Singular — das direkte Objekt',
    requires: ['case.nom.sg'],
  },
  {
    id: 'case.ins.sg',
    tier: 1,
    group: 'case',
    titleDe: 'Instrumental Singular — „womit?" und „ich bin …"',
    requires: ['case.acc.sg'],
  },

  // ── Tier 2 — where Polish gets serious ──
  {
    id: 'case.gen.sg',
    tier: 2,
    group: 'case',
    titleDe: 'Genitiv Singular — Verneinung, Mengen, Präpositionen',
    requires: ['case.acc.sg'],
  },
  {
    id: 'case.loc.sg',
    tier: 2,
    group: 'case',
    titleDe: 'Lokativ Singular — „wo?"',
    requires: ['case.ins.sg'],
  },
  {
    id: 'case.dat.sg',
    tier: 2,
    group: 'case',
    titleDe: 'Dativ Singular — das indirekte Objekt',
    requires: ['case.gen.sg'],
  },
  {
    id: 'verb.present',
    tier: 2,
    group: 'verb',
    titleDe: 'Präsens — die vier Konjugationen',
    requires: ['case.nom.sg'],
  },
  {
    id: 'verb.past',
    tier: 2,
    group: 'verb',
    titleDe: 'Vergangenheit — das Verb kennt dein Geschlecht',
    requires: ['verb.present'],
  },

  // ── Tier 3 — the plural and the aspect wall ──
  {
    id: 'case.nom.pl',
    tier: 3,
    group: 'number',
    titleDe: 'Nominativ Plural — und die männlich-personale Form',
    requires: ['case.nom.sg', 'gender.basic'],
  },
  {
    id: 'case.gen.pl',
    tier: 3,
    group: 'number',
    titleDe: 'Genitiv Plural — die Nullendung',
    requires: ['case.gen.sg', 'case.nom.pl'],
  },
  {
    id: 'aspect.intro',
    tier: 3,
    group: 'aspect',
    titleDe: 'Aspekt — vollendet oder nicht',
    requires: ['verb.past'],
  },
  {
    id: 'prep.case',
    tier: 3,
    group: 'prep',
    titleDe: 'Präpositionen und ihre Fälle',
    requires: ['case.loc.sg', 'case.gen.sg'],
  },

  // ── Tier 4 — the long tail ──
  {
    id: 'verb.future',
    tier: 4,
    group: 'verb',
    titleDe: 'Futur — zusammengesetzt und einfach',
    requires: ['aspect.intro'],
  },
  {
    id: 'case.voc.sg',
    tier: 4,
    group: 'case',
    titleDe: 'Vokativ — jemanden ansprechen',
    requires: ['case.loc.sg'],
  },
  {
    id: 'numerals.basic',
    tier: 4,
    group: 'syntax',
    titleDe: 'Zahlen — und was sie mit dem Substantiv anstellen',
    requires: ['case.gen.pl'],
  },
]

export const CONCEPT_BY_ID = new Map(CONCEPTS.map(c => [c.id, c]))

/** Mastery/interval thresholds above which a concept counts as "done". */
export const MASTERY_THRESHOLD = 0.85
export const INTERVAL_THRESHOLD_DAYS = 21

export interface MasteryLookup {
  (conceptId: string): { mastery: number; intervalDays: number } | undefined
}

/** A concept is mastered when it is both accurate AND durable. */
export function isMastered(conceptId: string, lookup: MasteryLookup): boolean {
  const p = lookup(conceptId)
  if (!p) return false
  return p.mastery >= MASTERY_THRESHOLD && p.intervalDays >= INTERVAL_THRESHOLD_DAYS
}

/** Unlocked = every prerequisite mastered. Concepts with no prereqs start open. */
export function isUnlocked(conceptId: string, lookup: MasteryLookup): boolean {
  const concept = CONCEPT_BY_ID.get(conceptId)
  if (!concept) return false
  return concept.requires.every(req => isMastered(req, lookup))
}

/**
 * The next concept to teach: lowest tier first, then declaration order, among
 * those that are unlocked and not yet introduced. Returns undefined when the
 * learner has opened everything currently authored.
 */
export function nextNewConcept(
  lookup: MasteryLookup,
  introduced: Set<string>,
  authored: Set<string>,
): string | undefined {
  const candidates = CONCEPTS.filter(
    c => authored.has(c.id) && !introduced.has(c.id) && isUnlocked(c.id, lookup),
  )
  candidates.sort((a, b) => a.tier - b.tier)
  return candidates[0]?.id
}
