import type { Lesson } from './types'
import { CASE_LESSONS } from './lessons/cases'
import { VERB_LESSONS } from './lessons/verbs'
import { MISC_LESSONS } from './lessons/misc'

/**
 * German micro-lessons, split by group so ~40 of them stay navigable.
 *
 * Every lesson has the same five prose fields — hook, rule, bridge, trap,
 * mnemonic — plus a small pattern table. The uniformity is what makes writing
 * this many of them tractable, and `bridgeDe` is the reason they are written in
 * German at all: nearly every Polish structure has a German handle to grab it
 * by, and naming that handle is worth more than extra drilling.
 */
export const LESSONS: Lesson[] = [
  ...MISC_LESSONS,
  ...CASE_LESSONS,
  ...VERB_LESSONS,
]

export const LESSON_BY_CONCEPT = new Map(LESSONS.map(l => [l.conceptId, l]))

/** Concepts that actually have a lesson written — the game only teaches these. */
export const AUTHORED_CONCEPTS = new Set(LESSONS.map(l => l.conceptId))
