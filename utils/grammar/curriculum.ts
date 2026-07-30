import type { Concept } from './types'

/**
 * The concept graph. A concept unlocks once every id in `requires` is mastered
 * (see isUnlocked below), which is what keeps the learner from meeting the
 * genitive before they can reliably tell a masculine noun from a neuter one.
 *
 * Every case appears in BOTH numbers. The plural is where Polish actually
 * hurts — the genitive plural's zero ending and the masculine-personal forms
 * have no German counterpart at all — so stopping at the singular would mean
 * teaching the easy half of the language and calling it done.
 */
export const CONCEPTS: Concept[] = [
  // ── Tier 1 — the ground floor ─────────────────────────────
  {
    id: 'gender.basic',
    tier: 1, group: 'gender',
    titleDe: 'Die drei Geschlechter',
    requires: [],
  },
  {
    id: 'gender.masc.animacy',
    tier: 1, group: 'gender',
    titleDe: 'Belebt oder nicht — die männliche Dreiteilung',
    requires: ['gender.basic'],
  },
  {
    id: 'case.nom.sg',
    tier: 1, group: 'case',
    titleDe: 'Nominativ Singular — die Wörterbuchform',
    requires: ['gender.basic'],
  },
  {
    id: 'case.acc.sg',
    tier: 1, group: 'case',
    titleDe: 'Akkusativ Singular — das direkte Objekt',
    requires: ['case.nom.sg', 'gender.masc.animacy'],
  },
  {
    id: 'case.ins.sg',
    tier: 1, group: 'case',
    titleDe: 'Instrumental Singular — „womit?" und „ich bin …"',
    requires: ['case.acc.sg'],
  },
  {
    id: 'verb.byc',
    tier: 1, group: 'verb',
    titleDe: 'być — das wichtigste unregelmäßige Verb',
    requires: ['case.nom.sg'],
  },
  {
    id: 'verb.present',
    tier: 1, group: 'verb',
    titleDe: 'Präsens — die vier Konjugationen',
    requires: ['verb.byc'],
  },
  {
    id: 'pron.personal',
    tier: 1, group: 'syntax',
    titleDe: 'Personalpronomen — und warum man sie meist weglässt',
    requires: ['verb.byc'],
  },

  // ── Tier 2 — where Polish gets serious ────────────────────
  {
    id: 'case.gen.sg',
    tier: 2, group: 'case',
    titleDe: 'Genitiv Singular — Verneinung, Mengen, Präpositionen',
    requires: ['case.acc.sg'],
  },
  {
    id: 'case.gen.negation',
    tier: 2, group: 'case',
    titleDe: 'Die Verneinung frisst den Akkusativ',
    requires: ['case.gen.sg'],
  },
  {
    id: 'case.loc.sg',
    tier: 2, group: 'case',
    titleDe: 'Lokativ Singular — „wo?" und die Konsonantenwechsel',
    requires: ['case.ins.sg'],
  },
  {
    id: 'case.dat.sg',
    tier: 2, group: 'case',
    titleDe: 'Dativ Singular — das indirekte Objekt',
    requires: ['case.gen.sg'],
  },
  {
    id: 'verb.past',
    tier: 2, group: 'verb',
    titleDe: 'Vergangenheit — das Verb kennt dein Geschlecht',
    requires: ['verb.present'],
  },
  {
    id: 'adj.agreement.sg',
    tier: 2, group: 'syntax',
    titleDe: 'Adjektive im Singular — sie machen alles mit',
    requires: ['case.acc.sg'],
  },
  {
    id: 'prep.gen',
    tier: 2, group: 'prep',
    titleDe: 'Präpositionen mit Genitiv — do, od, bez, dla',
    requires: ['case.gen.sg'],
  },
  {
    id: 'prep.loc',
    tier: 2, group: 'prep',
    titleDe: 'Präpositionen mit Lokativ — w, na, o, przy',
    requires: ['case.loc.sg'],
  },

  // ── Tier 3 — the plural, the prefixes, the aspect wall ────
  {
    id: 'case.nom.pl',
    tier: 3, group: 'number',
    titleDe: 'Nominativ Plural — und die männlich-personale Form',
    requires: ['case.nom.sg', 'gender.masc.animacy'],
  },
  {
    id: 'case.acc.pl',
    tier: 3, group: 'number',
    titleDe: 'Akkusativ Plural',
    requires: ['case.nom.pl', 'case.acc.sg'],
  },
  {
    id: 'case.gen.pl',
    tier: 3, group: 'number',
    titleDe: 'Genitiv Plural — die Endung, die keine ist',
    requires: ['case.gen.sg', 'case.nom.pl'],
  },
  {
    id: 'case.ins.pl',
    tier: 3, group: 'number',
    titleDe: 'Instrumental Plural — einmal -ami, fertig',
    requires: ['case.ins.sg', 'case.nom.pl'],
  },
  {
    id: 'case.loc.pl',
    tier: 3, group: 'number',
    titleDe: 'Lokativ Plural — einmal -ach, fertig',
    requires: ['case.loc.sg', 'case.nom.pl'],
  },
  {
    id: 'case.dat.pl',
    tier: 3, group: 'number',
    titleDe: 'Dativ Plural — einmal -om, fertig',
    requires: ['case.dat.sg', 'case.nom.pl'],
  },
  {
    id: 'adj.agreement.pl',
    tier: 3, group: 'syntax',
    titleDe: 'Adjektive im Plural',
    requires: ['adj.agreement.sg', 'case.nom.pl'],
  },
  {
    id: 'aspect.intro',
    tier: 3, group: 'aspect',
    titleDe: 'Aspekt — vollendet oder nicht',
    requires: ['verb.past'],
  },
  {
    id: 'aspect.pairs',
    tier: 3, group: 'aspect',
    titleDe: 'Aspektpaare erkennen',
    requires: ['aspect.intro'],
  },
  {
    id: 'prefix.system',
    tier: 3, group: 'verb',
    titleDe: 'Vorsilben — dasselbe System wie im Deutschen',
    requires: ['verb.present'],
  },
  {
    id: 'prefix.families',
    tier: 3, group: 'verb',
    titleDe: 'Verbfamilien — ein Stamm, zehn Wörter',
    requires: ['prefix.system'],
  },
  {
    id: 'prefix.aspect',
    tier: 3, group: 'aspect',
    titleDe: 'Vorsilben machen Verben vollendet',
    requires: ['prefix.system', 'aspect.intro'],
  },
  {
    id: 'prep.case',
    tier: 3, group: 'prep',
    titleDe: 'Präpositionen und ihre Fälle — die Übersicht',
    requires: ['prep.gen', 'prep.loc'],
  },
  {
    id: 'prep.motion',
    tier: 3, group: 'prep',
    titleDe: 'w und na: Ort oder Richtung?',
    requires: ['prep.loc', 'case.acc.sg'],
  },
  {
    id: 'verb.motion',
    tier: 3, group: 'verb',
    titleDe: 'Bewegungsverben — iść/chodzić, jechać/jeździć',
    requires: ['verb.present'],
  },

  // ── Tier 4 — the long tail ────────────────────────────────
  {
    id: 'verb.future.compound',
    tier: 4, group: 'verb',
    titleDe: 'Futur I — zusammengesetzt (unvollendet)',
    requires: ['aspect.intro', 'verb.byc'],
  },
  {
    id: 'verb.future.simple',
    tier: 4, group: 'verb',
    titleDe: 'Futur II — einfach (vollendet)',
    requires: ['verb.future.compound', 'aspect.pairs'],
  },
  {
    id: 'verb.imperative',
    tier: 4, group: 'verb',
    titleDe: 'Imperativ — Bitten und Befehle',
    requires: ['verb.present'],
  },
  {
    id: 'verb.conditional',
    tier: 4, group: 'verb',
    titleDe: 'Konditional — „würde" mit -by',
    requires: ['verb.past'],
  },
  {
    id: 'case.voc',
    tier: 4, group: 'case',
    titleDe: 'Vokativ — jemanden ansprechen',
    requires: ['case.loc.sg'],
  },
  {
    id: 'numerals.1to4',
    tier: 4, group: 'number',
    titleDe: 'Zahlen 1–4 — sie benehmen sich noch',
    requires: ['case.nom.pl'],
  },
  {
    id: 'numerals.5plus',
    tier: 4, group: 'number',
    titleDe: 'Zahlen ab 5 — und der Genitiv Plural',
    requires: ['numerals.1to4', 'case.gen.pl'],
  },
  {
    id: 'pron.possessive',
    tier: 4, group: 'syntax',
    titleDe: 'Possessivpronomen — mój, twój, nasz',
    requires: ['pron.personal', 'adj.agreement.sg'],
  },
  {
    id: 'adj.comparative',
    tier: 4, group: 'syntax',
    titleDe: 'Steigerung — größer, am größten',
    requires: ['adj.agreement.sg'],
  },
  {
    id: 'syntax.questions',
    tier: 4, group: 'syntax',
    titleDe: 'Fragen — czy und die Fragewörter',
    requires: ['pron.personal', 'verb.present'],
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
