import type { Concept, ConceptProgress, SessionDay } from './types'
import type { VocabCard } from './vocab'

/**
 * Derived views of the learner's own data: what to do today, what is coming
 * back, what actually changed, and how this week compares to their best one.
 *
 * All pure, so it is testable under `node --test` like the rest of
 * utils/grammar/. Nothing here reads IndexedDB or the DOM — the background
 * hands it rows and the app page renders what comes back.
 *
 * The theme running through it: the game already told you your XP and your
 * accuracy, which are numbers about the session. These are numbers about YOU —
 * how far through today you are, which corner of the case table is still soft,
 * what tomorrow costs, and what moved since yesterday.
 */

const DAY_MS = 86_400_000

// ── daily goal ──────────────────────────────────────────────

export interface DailyGoal {
  minutes: number
  items: number
}

/** 15 minutes is the promise the feature makes; 40 items is a comparable day. */
export const DEFAULT_GOAL: DailyGoal = { minutes: 15, items: 40 }

export interface GoalProgress {
  /** 0..1, the ring fill. */
  fraction: number
  met: boolean
  minutesDone: number
  itemsDone: number
  /** Which measure is closer to done — the one the ring is currently tracking. */
  leading: 'minutes' | 'items'
  /** German, ready to render under the ring. */
  labelDe: string
}

/**
 * Progress toward today's goal, on whichever measure is further along.
 *
 * Two measures rather than one because they fail in opposite directions. Time
 * alone rewards leaving the tab open; items alone rewards racing through
 * multiple-choice. Taking the better of the two means a slow careful session
 * and a fast confident one both finish the day.
 *
 * This replaces the countdown clock on the home screen. A number you fill is a
 * different proposition from a number running out, and the whole point of the
 * feature is coming back tomorrow.
 */
export function goalProgress(
  today: Pick<SessionDay, 'seconds' | 'items'> | undefined,
  goal: DailyGoal = DEFAULT_GOAL,
): GoalProgress {
  const minutesDone = Math.floor((today?.seconds ?? 0) / 60)
  const itemsDone = today?.items ?? 0
  const byMinutes = goal.minutes > 0 ? minutesDone / goal.minutes : 0
  const byItems = goal.items > 0 ? itemsDone / goal.items : 0
  const leading: 'minutes' | 'items' = byMinutes >= byItems ? 'minutes' : 'items'
  const fraction = Math.min(1, Math.max(byMinutes, byItems))
  const met = fraction >= 1

  let labelDe: string
  if (met) {
    labelDe = 'Tagesziel erreicht'
  } else if (minutesDone === 0 && itemsDone === 0) {
    labelDe = `${goal.minutes} Minuten heute`
  } else if (leading === 'minutes') {
    const left = Math.max(1, goal.minutes - minutesDone)
    labelDe = `noch ${left} ${left === 1 ? 'Minute' : 'Minuten'}`
  } else {
    const left = Math.max(1, goal.items - itemsDone)
    labelDe = `noch ${left} ${left === 1 ? 'Aufgabe' : 'Aufgaben'}`
  }

  return { fraction, met, minutesDone, itemsDone, leading, labelDe }
}

// ── case mastery grid ───────────────────────────────────────

export const CASE_ORDER = ['nom', 'gen', 'dat', 'acc', 'ins', 'loc', 'voc'] as const
export type CaseId = typeof CASE_ORDER[number]

/** The German names, since the whole game teaches in German. */
export const CASE_LABEL_DE: Record<CaseId, string> = {
  nom: 'Nominativ',
  gen: 'Genitiv',
  dat: 'Dativ',
  acc: 'Akkusativ',
  ins: 'Instrumental',
  loc: 'Lokativ',
  voc: 'Vokativ',
}

/** Short forms, for the grid's row headers. */
export const CASE_SHORT_DE: Record<CaseId, string> = {
  nom: 'Nom', gen: 'Gen', dat: 'Dat', acc: 'Akk', ins: 'Inst', loc: 'Lok', voc: 'Vok',
}

export type CellState = 'absent' | 'new' | 'shaky' | 'learning' | 'solid'

export interface MasteryCell {
  case: CaseId
  number: 'sg' | 'pl'
  /** Undefined when the curriculum has no concept for this slot. */
  conceptId?: string
  mastery: number
  seen: number
  state: CellState
}

/**
 * The 7 × 2 case-by-number matrix, as a heat grid.
 *
 * Polish learners think in exactly this grid — it is how every textbook lays
 * the language out — and "I still cannot do the genitive plural" is the single
 * most useful thing the game knows about you. The concept map already showed
 * all 41 topics as a flat list, which buries it.
 *
 * The vocative has no plural of its own worth drilling (it copies the
 * nominative), so that cell comes back `absent` rather than empty-looking.
 */
export function caseMasteryGrid(
  concepts: Pick<Concept, 'id'>[],
  progress: Pick<ConceptProgress, 'conceptId' | 'mastery' | 'seen'>[],
): MasteryCell[] {
  const known = new Set(concepts.map(c => c.id))
  const byId = new Map(progress.map(p => [p.conceptId, p]))
  const out: MasteryCell[] = []

  for (const c of CASE_ORDER) {
    for (const n of ['sg', 'pl'] as const) {
      // The vocative is taught as one concept rather than two, because its
      // plural is identical to the nominative plural and there is nothing to
      // drill. Its singular cell therefore points at the unsuffixed id.
      const conceptId = c === 'voc' && n === 'sg' ? 'case.voc' : `case.${c}.${n}`
      if (!known.has(conceptId)) {
        out.push({ case: c, number: n, mastery: 0, seen: 0, state: 'absent' })
        continue
      }
      const p = byId.get(conceptId)
      out.push({
        case: c,
        number: n,
        conceptId,
        mastery: p?.mastery ?? 0,
        seen: p?.seen ?? 0,
        state: cellState(p?.mastery ?? 0, p?.seen ?? 0),
      })
    }
  }
  return out
}

/**
 * Mastery alone is not enough to colour a cell: a concept answered right twice
 * sits at 1.0 and is not solid. `seen` is what separates confident from lucky.
 */
function cellState(mastery: number, seen: number): CellState {
  if (seen === 0) return 'new'
  if (mastery < 0.5) return 'shaky'
  if (mastery >= 0.85 && seen >= 8) return 'solid'
  return 'learning'
}

/** The weakest cell that has actually been attempted — what to drill next. */
export function weakestCase(grid: MasteryCell[]): MasteryCell | undefined {
  const tried = grid.filter(c => c.state !== 'absent' && c.seen > 0)
  if (tried.length === 0) return undefined
  return tried.reduce((worst, c) => (c.mastery < worst.mastery ? c : worst))
}

// ── review forecast ─────────────────────────────────────────

export interface ForecastDay {
  /** YYYY-MM-DD. */
  date: string
  concepts: number
  cards: number
  /** True for the first entry, which includes everything already overdue. */
  today: boolean
}

/**
 * How much comes back due over the next fortnight.
 *
 * Both trainers already store a `due` timestamp per concept and per card; until
 * now nothing showed it, so a session that scheduled 30 cards for Thursday
 * looked exactly like one that scheduled none. Seeing the wave arrive is also
 * the honest way to explain why some days are heavier than others.
 *
 * Everything overdue lands on the first day rather than in the past, because
 * that is where the work actually is.
 */
export function reviewForecast(
  concepts: Pick<ConceptProgress, 'due'>[],
  cards: Pick<VocabCard, 'due'>[],
  now: number,
  days = 14,
): ForecastDay[] {
  const startOfToday = new Date(now)
  startOfToday.setHours(0, 0, 0, 0)
  const base = startOfToday.getTime()

  const out: ForecastDay[] = []
  for (let i = 0; i < days; i++) {
    out.push({
      date: dayString(base + i * DAY_MS),
      concepts: 0,
      cards: 0,
      today: i === 0,
    })
  }

  const bucket = (due: number) => {
    if (due < base + DAY_MS) return 0 // overdue or due today
    const i = Math.floor((due - base) / DAY_MS)
    return i < days ? i : -1 // beyond the window
  }
  for (const c of concepts) {
    const i = bucket(c.due)
    if (i >= 0) out[i].concepts++
  }
  for (const c of cards) {
    const i = bucket(c.due)
    if (i >= 0) out[i].cards++
  }
  return out
}

function dayString(t: number): string {
  const d = new Date(t)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

// ── session diff ────────────────────────────────────────────

export interface IntervalChange {
  conceptId: string
  fromDays: number
  toDays: number
  mastery: number
}

export interface SessionDiff {
  /** Scheduled further out than before — the intended outcome. */
  advanced: IntervalChange[]
  /** Scheduled sooner than before, because it went wrong. */
  slipped: IntervalChange[]
  /** Concepts met for the very first time. */
  introduced: string[]
  /** Touched but scheduled the same — worth nothing on screen. */
  unchanged: number
}

/**
 * What this session actually changed.
 *
 * The summary used to report XP and accuracy, which say how the session went
 * but not what it did. This reports the thing the SRS did on your behalf: which
 * topics moved further out, which came back closer, and what you met for the
 * first time. `conceptsAdvanced` in the old summary listed every touched
 * concept regardless of whether anything advanced, so a session where
 * everything went wrong still read as progress.
 */
export function sessionDiff(
  before: Pick<ConceptProgress, 'conceptId' | 'intervalDays' | 'seen'>[],
  after: Pick<ConceptProgress, 'conceptId' | 'intervalDays' | 'mastery' | 'seen'>[],
): SessionDiff {
  const prior = new Map(before.map(p => [p.conceptId, p]))
  const diff: SessionDiff = { advanced: [], slipped: [], introduced: [], unchanged: 0 }

  for (const now of after) {
    const was = prior.get(now.conceptId)
    // Unseen before but seen now: first meeting. A row that exists with seen 0
    // counts as unseen — the scheduler creates rows ahead of use.
    if (!was || was.seen === 0) {
      if (now.seen > 0) diff.introduced.push(now.conceptId)
      continue
    }
    const from = was.intervalDays
    const to = now.intervalDays
    const change: IntervalChange = {
      conceptId: now.conceptId, fromDays: from, toDays: to, mastery: now.mastery,
    }
    if (to > from) diff.advanced.push(change)
    else if (to < from) diff.slipped.push(change)
    else diff.unchanged++
  }

  // Biggest movements first, so a summary that shows only the top few shows the
  // ones worth reading.
  diff.advanced.sort((a, b) => b.toDays - b.fromDays - (a.toDays - a.fromDays))
  diff.slipped.sort((a, b) => a.fromDays - a.toDays - (b.fromDays - b.toDays))
  return diff
}

// ── self-competition ────────────────────────────────────────

export interface WeekTotals {
  /** ISO-ish week key, e.g. "2026-W31". Sortable as a string. */
  key: string
  items: number
  correct: number
  minutes: number
  xp: number
  /** Days in the week with any activity at all. */
  activeDays: number
}

/**
 * Monday-based week key.
 *
 * Monday rather than Sunday because that is the week Poland and Germany use,
 * and because the quests reroll on Monday — the two have to agree or "this
 * week" means two different things on the same screen.
 */
export function weekKey(date: string | number): string {
  const d = typeof date === 'number' ? new Date(date) : new Date(`${date}T00:00:00`)
  d.setHours(0, 0, 0, 0)
  // Shift to the Thursday of the same week: ISO week numbers are defined by
  // which year that Thursday falls in, which is what makes the turn of the year
  // work without a special case.
  const day = (d.getDay() + 6) % 7 // Monday = 0
  d.setDate(d.getDate() - day + 3)
  const thursday = d.getTime()
  const jan4 = new Date(d.getFullYear(), 0, 4)
  jan4.setHours(0, 0, 0, 0)
  const jan4Day = (jan4.getDay() + 6) % 7
  const week1Monday = jan4.getTime() - jan4Day * DAY_MS
  const week = Math.floor((thursday - week1Monday) / (7 * DAY_MS)) + 1
  return `${d.getFullYear()}-W${String(week).padStart(2, '0')}`
}

export function weekTotals(days: SessionDay[]): WeekTotals[] {
  const byWeek = new Map<string, WeekTotals>()
  for (const d of days) {
    const key = weekKey(d.date)
    const w = byWeek.get(key) ?? { key, items: 0, correct: 0, minutes: 0, xp: 0, activeDays: 0 }
    w.items += d.items
    w.correct += d.correct
    w.minutes += Math.round(d.seconds / 60)
    w.xp += d.xp
    if (d.items > 0 || d.seconds > 0) w.activeDays++
    byWeek.set(key, w)
  }
  return [...byWeek.values()].sort((a, b) => a.key.localeCompare(b.key))
}

/**
 * The longest run of consecutive active days in the record.
 *
 * Derived rather than stored: GameState only ever kept the CURRENT streak, and
 * adding a `bestStreak` field would need a migration and would still be wrong
 * for everyone's existing history. Reading it off the day rows is right
 * retroactively.
 *
 * A day with no items and no time is not active, so a row written by a session
 * that was quit immediately does not bridge a gap.
 */
export function longestStreak(days: Pick<SessionDay, 'date' | 'items' | 'seconds'>[]): number {
  const active = days
    .filter(d => d.items > 0 || d.seconds > 0)
    .map(d => d.date)
    .sort()
  let best = 0
  let run = 0
  let prev: string | undefined
  for (const date of active) {
    if (date === prev) continue // two sessions, one day
    run = prev && daysApart(prev, date) === 1 ? run + 1 : 1
    best = Math.max(best, run)
    prev = date
  }
  return best
}

/** Whole days between two YYYY-MM-DD dates. */
function daysApart(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`)
  const b = Date.parse(`${to}T00:00:00Z`)
  return Math.round((b - a) / DAY_MS)
}

export interface WeekCompare {
  current: WeekTotals
  /** The best previous week by XP, or undefined in the first week. */
  best?: WeekTotals
  /** True once the current week has beaten it. */
  ahead: boolean
  /** XP still needed to beat it; 0 once ahead. */
  toBeat: number
}

/**
 * This week against your own best week.
 *
 * No leaderboard: the opponent is last-month-you, which is the only comparison
 * that is both motivating and fair when nobody else is studying your exact 41
 * concepts. The current week is excluded from "best" so you are never chasing
 * yourself.
 */
export function weekCompare(days: SessionDay[], now: number): WeekCompare {
  const totals = weekTotals(days)
  const thisKey = weekKey(now)
  const current =
    totals.find(w => w.key === thisKey) ??
    { key: thisKey, items: 0, correct: 0, minutes: 0, xp: 0, activeDays: 0 }
  const past = totals.filter(w => w.key !== thisKey)
  const best = past.length > 0
    ? past.reduce((b, w) => (w.xp > b.xp ? w : b))
    : undefined
  const ahead = !!best && current.xp > best.xp
  return {
    current,
    best,
    ahead,
    toBeat: best ? Math.max(0, best.xp + 1 - current.xp) : 0,
  }
}
