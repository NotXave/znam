import type { Attempt, GameState, Rank } from './types'

/**
 * XP, combos, streaks and ranks. All pure — the UI reads these numbers, it does
 * not compute them.
 */

export const BASE_XP = 10
export const LESSON_XP = 50
export const SESSION_XP = 100
/** Combo caps here so a hot streak feels great without trivializing the rest. */
export const MAX_COMBO_BONUS = 10
export const MAX_FREEZES = 2

export const RANKS: Rank[] = [
  { id: 'nowicjusz', titlePl: 'Nowicjusz', minXp: 0 },
  { id: 'uczen', titlePl: 'Uczeń', minXp: 500 },
  { id: 'znawca', titlePl: 'Znawca', minXp: 2000 },
  { id: 'mistrz', titlePl: 'Mistrz', minXp: 6000 },
  { id: 'legenda', titlePl: 'Legenda', minXp: 15000 },
]

export function rankFor(xp: number): Rank {
  let out = RANKS[0]
  for (const r of RANKS) if (xp >= r.minXp) out = r
  return out
}

export function nextRank(xp: number): Rank | undefined {
  return RANKS.find(r => r.minXp > xp)
}

/** 1.0 … 2.0, rising with the current combo. */
export function comboMultiplier(combo: number): number {
  return 1 + Math.min(combo, MAX_COMBO_BONUS) * 0.1
}

export interface XpBreakdown {
  items: number
  lesson: number
  session: number
  total: number
  maxCombo: number
}

/**
 * Replay a session's attempts to compute XP and the best combo reached.
 * Boss items are worth double; near misses still earn, at half rate — the
 * learner got the grammar right, they just fought the keyboard.
 */
export function scoreSession(
  attempts: Attempt[],
  opts: { lessonShown: boolean; completed: boolean },
): XpBreakdown {
  let combo = 0
  let maxCombo = 0
  let items = 0

  for (const a of attempts) {
    if (!a.correct) {
      combo = 0
      continue
    }
    combo++
    maxCombo = Math.max(maxCombo, combo)
    const bossFactor = a.phase === 'boss' ? 2 : 1
    const missFactor = a.nearMiss ? 0.5 : 1
    items += Math.round(BASE_XP * comboMultiplier(combo) * bossFactor * missFactor)
  }

  const lesson = opts.lessonShown ? LESSON_XP : 0
  const session = opts.completed ? SESSION_XP : 0
  return { items, lesson, session, total: items + lesson + session, maxCombo }
}

/** Days between two YYYY-MM-DD keys. */
export function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00`)
  const b = Date.parse(`${to}T00:00:00`)
  if (Number.isNaN(a) || Number.isNaN(b)) return 0
  return Math.round((b - a) / 86_400_000)
}

export interface StreakUpdate {
  state: GameState
  /** True when a freeze was spent to save the streak. */
  freezeUsed: boolean
  /** True when the streak was broken despite (or without) a freeze. */
  broken: boolean
}

/**
 * Advance the streak for a qualifying session on `today`.
 *
 * A single missed day is absorbed by a freeze if one is banked. Forgiveness is
 * the point: a 40-day streak that dies to one bad Tuesday takes the learner's
 * motivation with it, and that is the failure mode this feature exists to avoid.
 */
export function advanceStreak(prev: GameState, today: string): StreakUpdate {
  if (prev.lastDay === today) {
    return { state: prev, freezeUsed: false, broken: false }
  }

  const gap = prev.lastDay ? daysBetween(prev.lastDay, today) : 1
  let streak: number
  let freezes = prev.freezes
  let freezeUsed = false
  let broken = false

  if (!prev.lastDay || gap === 1) {
    streak = prev.streak + 1
  } else if (gap === 2 && freezes > 0) {
    freezes--
    freezeUsed = true
    streak = prev.streak + 1
  } else {
    streak = 1
    broken = true
  }

  // One freeze banked per completed week, capped.
  if (streak > 0 && streak % 7 === 0 && freezes < MAX_FREEZES) freezes++

  return {
    state: { ...prev, streak, lastDay: today, freezes },
    freezeUsed,
    broken,
  }
}

// ── Achievements ────────────────────────────────────────────

export interface Achievement {
  id: string
  titleDe: string
  descDe: string
}

export const ACHIEVEMENTS: Achievement[] = [
  { id: 'first-session', titleDe: 'Pierwszy krok', descDe: 'Deine erste Trainingseinheit.' },
  { id: 'perfect', titleDe: 'Bez błędu', descDe: 'Eine Einheit ohne einen einzigen Fehler.' },
  { id: 'combo-10', titleDe: 'Seria', descDe: '10 richtige Antworten am Stück.' },
  { id: 'streak-7', titleDe: 'Tydzień', descDe: 'Sieben Tage in Folge.' },
  { id: 'streak-30', titleDe: 'Miesiąc', descDe: 'Dreißig Tage in Folge.' },
  { id: 'boss-clear', titleDe: 'Pogromca', descDe: 'Eine Boss-Runde fehlerfrei bestanden.' },
]

/** Which achievements this session newly unlocked. */
export function newAchievements(
  prev: GameState,
  attempts: Attempt[],
  maxCombo: number,
  streak: number,
): string[] {
  const have = new Set(prev.achievements)
  const out: string[] = []
  const add = (id: string) => {
    if (!have.has(id)) out.push(id)
  }

  if (attempts.length > 0) add('first-session')
  if (attempts.length >= 5 && attempts.every(a => a.correct)) add('perfect')
  if (maxCombo >= 10) add('combo-10')
  if (streak >= 7) add('streak-7')
  if (streak >= 30) add('streak-30')

  const boss = attempts.filter(a => a.phase === 'boss')
  if (boss.length > 0 && boss.every(a => a.correct)) add('boss-clear')

  return out
}

// ── Żubr, the coach ─────────────────────────────────────────

/**
 * The mascot's one-liners. A small authored pool per state, sampled randomly,
 * so feedback has a voice without becoming a catchphrase you learn to ignore.
 */
export const ZUBR_LINES = {
  correct: ['Brawo!', 'Dokładnie!', 'Świetnie!', 'Genau so.', 'Tak jest!'],
  nearMiss: ['Fast! Nur die Häkchen.', 'Grammatik stimmt — Tastatur nicht.', 'Prawie!'],
  wrong: ['Nie ma problemu — nochmal.', 'Nicht ganz.', 'Das war der Klassiker.', 'Spokojnie.'],
  bossHit: ['Trafiony!', 'Volltreffer!', 'Jeszcze raz!'],
  sessionEnd: ['Do jutra!', 'Bis morgen — dobranoc!', 'Koniec. Dobra robota.'],
}

export function zubrLine(
  kind: keyof typeof ZUBR_LINES,
  random: () => number = Math.random,
): string {
  const pool = ZUBR_LINES[kind]
  return pool[Math.floor(random() * pool.length)]
}

export function newGameState(lang: string): GameState {
  return { lang, xp: 0, streak: 0, lastDay: '', freezes: 0, achievements: [] }
}
