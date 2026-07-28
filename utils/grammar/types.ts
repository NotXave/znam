import type { SemanticClass } from './semantics'

// ── Grammar game (Trening tab) ──────────────────────────────
// Everything here is plain data. The modules that consume these types
// (curriculum, generator, srs, session, grading, gamify) are pure functions
// with no browser APIs, so they can be unit-tested under `node --test`.

/** Broad area a concept belongs to — drives grouping and icon choice. */
export type ConceptGroup =
  | 'gender' | 'case' | 'verb' | 'aspect' | 'number' | 'prep' | 'syntax'

/** Rough CEFR-ish progression tier: 1 ≈ A1 … 4 ≈ B2. */
export type Tier = 1 | 2 | 3 | 4

export interface Concept {
  id: string
  tier: Tier
  group: ConceptGroup
  /** German title shown in the UI. */
  titleDe: string
  /** Concept ids that must be mastered before this unlocks. */
  requires: string[]
}

/**
 * A micro-lesson. The five prose fields are deliberately fixed so ~50 lessons
 * stay writable and every lesson looks the same to the reader.
 */
export interface Lesson {
  conceptId: string
  /** One playful sentence: why you should care. */
  hookDe: string
  /** The rule itself, kept to ≤ 3 sentences. */
  ruleDe: string
  /** Pattern rows rendered as a small grid, e.g. [['kot', 'kota'], …]. */
  table: string[][]
  /** Column headers for `table`. */
  tableHead: string[]
  /** The German parallel — the actual pedagogical lever. */
  bridgeDe: string
  /** The mistake German speakers reliably make. */
  trapDe: string
  /** Something absurd, and therefore sticky. */
  mnemonicDe: string
}

// ── Exercises ───────────────────────────────────────────────

export type ExerciseKind =
  | 'cloze'
  | 'transform'
  | 'conjugate'
  | 'gender-sort'
  | 'aspect-pick'
  | 'order'
  | 'match'
  | 'translate'

/** Which lemmas may fill a slot. */
export interface SlotSpec {
  pos: 'N' | 'A' | 'V'
  /** Tag the FILLED form must carry, e.g. 'sg.gen'. */
  tag: string
  /** Restrict to lemmas carrying this gender (nouns), e.g. 'n'. */
  gender?: 'm' | 'f' | 'n'
  /**
   * Restrict to a semantic class. Required whenever the frame only makes sense
   * for certain meanings — "Jestem ___" needs a person, not a topic.
   */
  semantic?: SemanticClass
  /** Restrict to an explicit lemma allowlist (used by closed-class frames). */
  oneOf?: string[]
}

export interface DistractorSpec {
  /** Tags from the answer lemma's own paradigm to offer as near misses. */
  fromTags: string[]
  /** How many wrong options to show (before dedupe). */
  count: number
}

export interface Template {
  id: string
  conceptIds: string[]
  kind: ExerciseKind
  /** Polish frame with {slot} placeholders; the answer slot renders as a gap. */
  frame: string
  /** German prompt/translation shown above the frame. */
  promptDe: string
  slots: Record<string, SlotSpec>
  /** Which slot the learner must produce. */
  answerSlot: string
  distractors?: DistractorSpec
  /** Extra spellings graded as correct. */
  alsoAccept?: string[]
  /** Shown when the learner asks for a hint (guided phase only). */
  hintDe?: string
}

/** A concrete, fully-realized question handed to the UI. */
export interface Exercise {
  id: string
  templateId: string
  conceptId: string
  kind: ExerciseKind
  /** German prompt line. */
  promptDe: string
  /** Polish sentence with the gap rendered as '___'. */
  text: string
  /** Dictionary form of the word being asked for, shown as a cue. */
  cue: string
  answer: string
  /** Present for multiple-choice kinds; empty for free-text. */
  options: string[]
  hintDe?: string
  alsoAccept: string[]
  /** Which SRS phase produced it — affects XP and whether hints are offered. */
  phase: SessionPhase
}

// ── Session ─────────────────────────────────────────────────

export type SessionPhase = 'warmup' | 'lesson' | 'drill' | 'boss'

export interface PhaseBudget {
  phase: SessionPhase
  seconds: number
}

export interface SessionPlan {
  lang: string
  /** YYYY-MM-DD in local time. */
  date: string
  /** Total budget in seconds. */
  totalSeconds: number
  budgets: PhaseBudget[]
  /** The new concept introduced today, if any. */
  newConceptId?: string
  lesson?: Lesson
  exercises: Exercise[]
  /** Concept ids this session touches — used when writing SRS results back. */
  conceptIds: string[]
}

export interface Attempt {
  exerciseId: string
  templateId: string
  conceptId: string
  correct: boolean
  /** Answer graded correct but with missing diacritics or a 1-char typo. */
  nearMiss: boolean
  answer: string
  ms: number
  phase: SessionPhase
}

export interface SessionResult {
  date: string
  seconds: number
  attempts: Attempt[]
  xp: number
  maxCombo: number
}

// ── Progress / SRS ──────────────────────────────────────────

export interface ConceptProgress {
  lang: string
  conceptId: string
  /** 0..1 EWMA of item correctness. */
  mastery: number
  /** SM-2 ease factor, clamped to [1.3, 2.8]. */
  ease: number
  /** 0 = never scheduled. */
  intervalDays: number
  /** Epoch ms when this concept is next due. */
  due: number
  lapses: number
  seen: number
  introducedAt?: number
}

/** One completed day, used for streaks and the activity heatmap. */
export interface SessionDay {
  lang: string
  /** YYYY-MM-DD. */
  date: string
  seconds: number
  items: number
  correct: number
  xp: number
}

// ── Gamification ────────────────────────────────────────────

export interface GameState {
  lang: string
  xp: number
  /** Consecutive qualifying days. */
  streak: number
  /** YYYY-MM-DD of the last qualifying day. */
  lastDay: string
  /** Unused streak freezes, max 2. */
  freezes: number
  achievements: string[]
}

export interface Rank {
  id: string
  titlePl: string
  minXp: number
}
