import type { ConceptProgress } from './types'
import type { VocabCard } from './vocab'
import { LEECH_LAPSES } from './vocab'
import { CASE_ORDER, weekKey } from './stats'

/**
 * Weekly quests: three per week, chosen from the learner's own state.
 *
 * A daily streak answers "did you show up". It does not answer "did you do the
 * thing you have been avoiding", and the thing people avoid is exactly what
 * they need — the genitive plural, the words they keep looking up, the boss
 * round. A quest names it.
 *
 * Three, not a wall of them: the point is that all three are achievable in a
 * normal week, so the set has to be small enough that finishing it is the
 * expected outcome rather than a completionist's project.
 *
 * All pure. Progress is accumulated by the background from session attempts and
 * stored in browser.storage.local next to GameState — three small objects per
 * week do not justify an IndexedDB migration, and quests need to span both
 * trainers, which the per-mode game state does not.
 */

/** How many run at once. */
export const QUEST_COUNT = 3

export type QuestMetric =
  /** Distinct case concepts drilled. */
  | 'cases'
  /** Distinct case concepts drilled in the PLURAL. */
  | 'plurals'
  /** Vocabulary cards answered right that were leeches at the start. */
  | 'leeches'
  /** Items answered right in a boss round. */
  | 'boss'
  /** Słówka items answered by typing Polish from German. */
  | 'produce'
  /** Verb-prefix items answered right. */
  | 'prefix'
  /** Days with any activity. */
  | 'days'
  /** Items answered right, either trainer. */
  | 'correct'
  /** Best combo reached. */
  | 'combo'
  /** Sessions completed — two in one day count twice, unlike `days`. */
  | 'sessions'
  /** Concepts met for the first time. */
  | 'introduced'
  /** Days on which BOTH trainers were done. */
  | 'bothModes'

export interface QuestSpec {
  id: string
  metric: QuestMetric
  target: number
  titleDe: string
  /** One line saying why this is worth doing. */
  descDe: string
  xp: number
  /**
   * When this quest is worth offering, given the learner's state. A quest for
   * something they cannot reach yet is noise.
   */
  relevant: (ctx: QuestContext) => boolean
}

export interface QuestContext {
  /** Concept progress, for "has this unlocked yet". */
  progress: Pick<ConceptProgress, 'conceptId' | 'seen' | 'mastery' | 'lapses'>[]
  cards: Pick<VocabCard, 'lemma' | 'lapses' | 'due'>[]
  /** Total XP, as a rough proxy for how far in they are. */
  xp: number
  /** Longest daily streak so far. */
  streak: number
}

const seenCount = (ctx: QuestContext, prefix: string) =>
  ctx.progress.filter(p => p.conceptId.startsWith(prefix) && p.seen > 0).length

const leeches = (ctx: QuestContext) => ctx.cards.filter(c => c.lapses >= LEECH_LAPSES).length

/**
 * The catalogue.
 *
 * Deliberately hand-written rather than generated: a quest is a sentence
 * addressed to the learner, and "Bring den Genitiv Plural auf 5 richtige" is
 * worth writing by hand. Targets are tuned to one ordinary week of the 15-minute
 * promise — roughly 5 sessions, ~200 items.
 */
export const QUESTS: QuestSpec[] = [
  {
    id: 'cases.tour',
    metric: 'cases',
    target: 5,
    titleDe: 'Rundreise durch die Fälle',
    descDe: 'Übe fünf verschiedene Fälle mindestens einmal.',
    xp: 150,
    relevant: ctx => seenCount(ctx, 'case.') >= 3,
  },
  {
    id: 'cases.all',
    metric: 'cases',
    target: 7,
    titleDe: 'Alle sieben Fälle',
    descDe: 'Jeder Fall einmal — auch der Vokativ.',
    xp: 250,
    relevant: ctx => seenCount(ctx, 'case.') >= 8,
  },
  {
    id: 'plural.push',
    metric: 'plurals',
    target: 3,
    titleDe: 'Der Plural tut weh',
    descDe: 'Drei verschiedene Fälle im Plural. Da liegt die eigentliche Arbeit.',
    xp: 200,
    relevant: ctx => seenCount(ctx, 'case.') >= 6,
  },
  {
    id: 'leeches.clear',
    metric: 'leeches',
    target: 3,
    titleDe: 'Drei Dauerbrenner erledigen',
    descDe: 'Drei Wörter richtig, die dir immer wieder durchgehen.',
    xp: 200,
    relevant: ctx => leeches(ctx) >= 3,
  },
  {
    id: 'boss.clean',
    metric: 'boss',
    target: 6,
    titleDe: 'Boss ohne Schaden',
    descDe: 'Sechs richtige Antworten in Boss-Runden.',
    xp: 200,
    relevant: ctx => ctx.progress.some(p => p.seen >= 5 && p.mastery < 0.7),
  },
  {
    id: 'produce.20',
    metric: 'produce',
    target: 20,
    titleDe: '20-mal selbst getippt',
    descDe: 'Deutsch → Polnisch, ohne Auswahl. Erkennen ist leicht, Produzieren zählt.',
    xp: 200,
    relevant: ctx => ctx.cards.length >= 10,
  },
  {
    id: 'prefix.15',
    metric: 'prefix',
    target: 15,
    titleDe: 'Präfixe sitzen lassen',
    descDe: 'Fünfzehn richtige Präfix-Aufgaben. pod·pisać ist unter·schreiben.',
    xp: 200,
    relevant: ctx => seenCount(ctx, 'prefix.') > 0,
  },
  {
    // One of the always-relevant quests. A brand-new learner has met no cases,
    // has no cards and no leeches, so without a few of these the panel would
    // show two quests out of three on day one.
    id: 'sessions.4',
    metric: 'sessions',
    target: 4,
    titleDe: 'Vier Einheiten',
    descDe: 'Vier Trainingseinheiten diese Woche. Zwei am selben Tag zählen doppelt.',
    xp: 150,
    relevant: () => true,
  },
  {
    id: 'topics.2',
    metric: 'introduced',
    target: 2,
    titleDe: 'Zwei neue Themen',
    descDe: 'Lerne zwei Themen, die du noch nie gesehen hast.',
    xp: 150,
    relevant: () => true,
  },
  {
    id: 'days.5',
    metric: 'days',
    target: 5,
    titleDe: 'Fünf Tage diese Woche',
    descDe: 'Kurz reicht. Fünf von sieben.',
    xp: 150,
    relevant: () => true,
  },
  {
    id: 'correct.150',
    metric: 'correct',
    target: 150,
    titleDe: '150 richtige Antworten',
    descDe: 'Über die ganze Woche, beide Modi zusammen.',
    xp: 150,
    relevant: () => true,
  },
  {
    id: 'combo.12',
    metric: 'combo',
    target: 12,
    titleDe: 'Zwölf in Serie',
    descDe: 'Eine Serie von zwölf richtigen Antworten ohne Fehler.',
    xp: 150,
    relevant: ctx => ctx.xp >= 500,
  },
  {
    id: 'both.3',
    metric: 'bothModes',
    target: 3,
    titleDe: 'Dreimal beides',
    descDe: 'An drei Tagen Grammatik UND Vokabeln.',
    xp: 250,
    relevant: ctx => ctx.cards.length >= 10 && ctx.streak >= 2,
  },
]

export const QUEST_BY_ID = new Map(QUESTS.map(q => [q.id, q]))

export interface Quest {
  id: string
  metric: QuestMetric
  target: number
  progress: number
  /** Set once when the target is first reached, so XP is awarded exactly once. */
  doneAt?: number
}

export interface QuestWeek {
  /** From stats.weekKey — quests and "this week" must agree. */
  week: string
  quests: Quest[]
}

/**
 * Pick this week's three.
 *
 * Relevance is filtered first, then the order is shuffled and the first three
 * taken — so a learner with lots of applicable quests gets variety week to week
 * rather than the same three forever, and a beginner with few gets the ones that
 * apply. Four quests are unconditionally relevant (`sessions.4`, `topics.2`,
 * `days.5`, `correct.150`), which is what guarantees the set is never short —
 * and gives a day-one learner variety rather than the same three forever.
 */
export function generateQuests(
  ctx: QuestContext,
  week: string,
  random: () => number = Math.random,
): QuestWeek {
  const pool = QUESTS.filter(q => q.relevant(ctx))
  // Fisher–Yates on a copy: shuffling the module-level array would make the
  // catalogue order depend on how many times this has run.
  const shuffled = [...pool]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  return {
    week,
    quests: shuffled.slice(0, QUEST_COUNT).map(q => ({
      id: q.id, metric: q.metric, target: q.target, progress: 0,
    })),
  }
}

/**
 * The week's quests, rerolling if the stored set belongs to a past week.
 *
 * Returns the same object when the week has not turned, so the caller can tell
 * whether it needs to persist anything.
 */
export function currentQuests(
  stored: QuestWeek | undefined,
  ctx: QuestContext,
  now: number,
  random: () => number = Math.random,
): { week: QuestWeek; rerolled: boolean } {
  const key = weekKey(now)
  if (stored?.week === key) return { week: stored, rerolled: false }
  return { week: generateQuests(ctx, key, random), rerolled: true }
}

/**
 * What one session contributed, in quest terms.
 *
 * Counted per metric rather than per quest, so a session is measured once and
 * then applied to whichever quests happen to be active. Distinct-thing metrics
 * (cases, plurals, leeches) carry sets rather than counts, because two attempts
 * at the genitive singular are one case, not two.
 */
export interface SessionContribution {
  cases: Set<string>
  plurals: Set<string>
  leeches: Set<string>
  boss: number
  produce: number
  prefix: number
  correct: number
  combo: number
  sessions: number
  introduced: number
  /** True if this session alone qualifies the day as active. */
  activeDay: boolean
  /** True if BOTH trainers were completed today. */
  bothModes: boolean
}

export function emptyContribution(): SessionContribution {
  return {
    cases: new Set(), plurals: new Set(), leeches: new Set(),
    boss: 0, produce: 0, prefix: 0, correct: 0, combo: 0,
    sessions: 0, introduced: 0,
    activeDay: false, bothModes: false,
  }
}

export interface GrammarAttemptLike {
  conceptId: string
  correct: boolean
  phase?: string
}

/** Contribution from a Trening session. */
export function grammarContribution(
  attempts: GrammarAttemptLike[],
  maxCombo: number,
  introduced = 0,
): SessionContribution {
  const c = emptyContribution()
  c.combo = maxCombo
  c.activeDay = attempts.length > 0
  c.sessions = attempts.length > 0 ? 1 : 0
  c.introduced = introduced
  for (const a of attempts) {
    if (!a.correct) continue
    c.correct++
    if (a.phase === 'boss') c.boss++
    const parts = a.conceptId.split('.')
    if (parts[0] === 'case' && CASE_ORDER.includes(parts[1] as any)) {
      c.cases.add(parts[1])
      if (parts[2] === 'pl') c.plurals.add(parts[1])
    }
    if (parts[0] === 'prefix') c.prefix++
  }
  return c
}

export interface VocabAttemptLike {
  lemma: string
  correct: boolean
  kind?: string
}

/**
 * Contribution from a Słówka session.
 *
 * `leechesBefore` is the set as it stood BEFORE the session, because a card
 * stops being a leech the moment it is answered right — reading the set
 * afterwards would count nothing.
 */
export function vocabContribution(
  attempts: VocabAttemptLike[],
  maxCombo: number,
  leechesBefore: Set<string>,
): SessionContribution {
  const c = emptyContribution()
  c.combo = maxCombo
  c.activeDay = attempts.length > 0
  c.sessions = attempts.length > 0 ? 1 : 0
  for (const a of attempts) {
    if (!a.correct) continue
    c.correct++
    if (a.kind === 'produce') c.produce++
    if (leechesBefore.has(a.lemma)) c.leeches.add(a.lemma)
  }
  return c
}

/**
 * Apply a contribution to the week's quests.
 *
 * `dayKey` is needed for the per-day metrics: a second session on the same day
 * must not count as a second day. `countedDays` holds the days already credited
 * per metric, and is persisted alongside the quests.
 */
export interface QuestApplyState {
  /** metric → the YYYY-MM-DD days already counted for it. */
  countedDays: Record<string, string[]>
  /** metric → distinct things already counted (cases, plurals, leeches). */
  countedThings: Record<string, string[]>
}

export function emptyApplyState(): QuestApplyState {
  return { countedDays: {}, countedThings: {} }
}

export interface QuestApplyResult {
  quests: Quest[]
  state: QuestApplyState
  /** Quests completed by this session, for the summary and the XP award. */
  completed: string[]
  xp: number
}

export function applyContribution(
  quests: Quest[],
  state: QuestApplyState,
  contribution: SessionContribution,
  dayKey: string,
  now: number,
): QuestApplyResult {
  const nextState: QuestApplyState = {
    countedDays: { ...state.countedDays },
    countedThings: { ...state.countedThings },
  }
  const completed: string[] = []
  let xp = 0

  const nextQuests = quests.map((q) => {
    if (q.doneAt) return q
    let progress = q.progress

    switch (q.metric) {
      case 'cases':
      case 'plurals':
      case 'leeches': {
        // Distinct things, so union with what has already been counted.
        const already = new Set(nextState.countedThings[q.metric] ?? [])
        const fresh = q.metric === 'cases' ? contribution.cases
          : q.metric === 'plurals' ? contribution.plurals
          : contribution.leeches
        for (const thing of fresh) already.add(thing)
        nextState.countedThings[q.metric] = [...already]
        progress = already.size
        break
      }
      case 'days':
      case 'bothModes': {
        // Per-DAY metrics, so a second session on the same date adds nothing.
        // Progress is derived from the counted-days set rather than from the
        // stored number: the set is the source of truth, which is what makes
        // this idempotent when a session is somehow applied twice.
        const qualifies = q.metric === 'days' ? contribution.activeDay : contribution.bothModes
        const already = new Set(nextState.countedDays[q.metric] ?? [])
        if (qualifies) already.add(dayKey)
        nextState.countedDays[q.metric] = [...already]
        progress = already.size
        break
      }
      case 'combo':
        // A best-of metric, not a running total.
        progress = Math.max(q.progress, contribution.combo)
        break
      default:
        progress = q.progress + contribution[q.metric]
    }

    if (progress >= q.target) {
      completed.push(q.id)
      xp += QUEST_BY_ID.get(q.id)?.xp ?? 0
      return { ...q, progress: q.target, doneAt: now }
    }
    return { ...q, progress }
  })

  return { quests: nextQuests, state: nextState, completed, xp }
}

/** A quest, with its authored German text, ready to render. */
export interface QuestView {
  id: string
  titleDe: string
  descDe: string
  progress: number
  target: number
  fraction: number
  done: boolean
  xp: number
}

export function questViews(quests: Quest[]): QuestView[] {
  return quests.flatMap((q) => {
    const spec = QUEST_BY_ID.get(q.id)
    // A stored quest whose spec was removed in an update is dropped rather than
    // rendered as a blank row.
    if (!spec) return []
    return [{
      id: q.id,
      titleDe: spec.titleDe,
      descDe: spec.descDe,
      progress: Math.min(q.progress, q.target),
      target: q.target,
      fraction: q.target > 0 ? Math.min(1, q.progress / q.target) : 0,
      done: !!q.doneAt,
      xp: spec.xp,
    }]
  })
}
