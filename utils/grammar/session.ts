import type { Exercise, PhaseBudget, SessionPhase, SessionPlan } from './types'

/**
 * The 15-minute session engine.
 *
 * The defining constraint is that a session is bounded by TIME, not by item
 * count — "15 minutes a day" is the promise, so the engine closes a phase when
 * its seconds are spent and never cuts a learner off mid-question.
 */

/** Share of the total budget each phase gets. Sums to 1. */
export const PHASE_SHARES: { phase: SessionPhase; share: number }[] = [
  { phase: 'warmup', share: 2 / 15 },
  { phase: 'lesson', share: 3 / 15 },
  { phase: 'drill', share: 7 / 15 },
  { phase: 'boss', share: 2 / 15 },
  // The remaining 1/15 is the summary screen, which has no exercises.
]

export function phaseBudgets(totalSeconds: number): PhaseBudget[] {
  return PHASE_SHARES.map(({ phase, share }) => ({
    phase,
    seconds: Math.round(totalSeconds * share),
  }))
}

export interface SessionState {
  plan: SessionPlan
  /** Index into plan.exercises. */
  index: number
  /** Epoch ms when the session started. */
  startedAt: number
  /** Seconds consumed per phase so far. */
  spent: Record<SessionPhase, number>
}

export function startSession(plan: SessionPlan, now: number): SessionState {
  return {
    plan,
    index: 0,
    startedAt: now,
    spent: { warmup: 0, lesson: 0, drill: 0, boss: 0 },
  }
}

const budgetFor = (plan: SessionPlan, phase: SessionPhase): number =>
  plan.budgets.find(b => b.phase === phase)?.seconds ?? 0

/**
 * The next exercise to show, or undefined when the session is over.
 *
 * Two independent stop conditions:
 *  - the whole session's hard time cap has been reached, or
 *  - every remaining exercise belongs to a phase whose budget is spent.
 *
 * Because this is only ever consulted BETWEEN items, a question already on
 * screen always gets answered — the clock never yanks it away.
 */
export function nextExercise(state: SessionState, now: number): Exercise | undefined {
  const elapsed = (now - state.startedAt) / 1000
  if (elapsed >= state.plan.totalSeconds) return undefined

  while (state.index < state.plan.exercises.length) {
    const ex = state.plan.exercises[state.index]
    if (state.spent[ex.phase] < budgetFor(state.plan, ex.phase)) return ex
    // This phase is out of time — skip its remaining items.
    state.index++
  }
  return undefined
}

/** Record how long an answer took and advance. */
export function commitAnswer(state: SessionState, ms: number): void {
  const ex = state.plan.exercises[state.index]
  if (ex) state.spent[ex.phase] += ms / 1000
  state.index++
}

/** Whole-session progress, 0..1, for the ring in the UI. */
export function progress(state: SessionState, now: number): number {
  const byTime = (now - state.startedAt) / 1000 / state.plan.totalSeconds
  const byItems = state.plan.exercises.length
    ? state.index / state.plan.exercises.length
    : 0
  // Whichever is further along — a fast learner should see the ring move too.
  return Math.min(1, Math.max(byTime, byItems))
}

export function secondsRemaining(state: SessionState, now: number): number {
  return Math.max(0, state.plan.totalSeconds - (now - state.startedAt) / 1000)
}

/**
 * Did this session count toward the streak?
 * Generous on purpose: reaching the boss round, or putting in two thirds of the
 * time, or grinding out 30 items all qualify. Streaks should reward showing up.
 */
export function qualifiesForStreak(
  state: SessionState,
  now: number,
  itemsAnswered: number,
): boolean {
  const elapsed = (now - state.startedAt) / 1000
  if (elapsed >= state.plan.totalSeconds * (2 / 3)) return true
  if (itemsAnswered >= 30) return true
  const reachedBoss = state.plan.exercises
    .slice(0, state.index)
    .some(e => e.phase === 'boss')
  return reachedBoss
}

/** Local-time YYYY-MM-DD (never UTC — a streak is about the learner's day). */
export function dayKey(ts: number): string {
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
