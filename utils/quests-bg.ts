import type { GameMode } from './grammar-bg'
import { getAllConceptProgress, getSessionDays, getVocabCards } from './db'
import { getGameState, saveGameStateFor } from './grammar-bg'
import {
  applyContribution,
  currentQuests,
  emptyApplyState,
  questViews,
  type QuestApplyState,
  type QuestContext,
  type QuestView,
  type QuestWeek,
  type SessionContribution,
} from './grammar/quests'

/**
 * Storage and orchestration for weekly quests.
 *
 * The quest logic itself is pure and lives in grammar/quests.ts; this is the
 * part that reads IndexedDB and browser.storage.local.
 *
 * Quests live in storage.local rather than in a `quests` object store. Three
 * small objects per week do not justify an IndexedDB migration, and — more to
 * the point — a quest spans BOTH trainers ("an drei Tagen Grammatik und
 * Vokabeln"), which the per-mode game state cannot represent. One record per
 * language is the right shape.
 */

const QUESTS_KEY = 'grammarQuests'

interface StoredQuests {
  week: QuestWeek
  apply: QuestApplyState
}

async function readAll(): Promise<Record<string, StoredQuests>> {
  const stored = await browser.storage.local.get(QUESTS_KEY)
  return (stored[QUESTS_KEY] as Record<string, StoredQuests>) ?? {}
}

async function writeOne(lang: string, value: StoredQuests): Promise<void> {
  const all = await readAll()
  all[lang] = value
  await browser.storage.local.set({ [QUESTS_KEY]: all })
}

/** The learner's state, as the quest picker wants to see it. */
async function questContext(lang: string): Promise<QuestContext> {
  const [progress, cards, grammar, vocab] = await Promise.all([
    getAllConceptProgress(lang),
    getVocabCards(lang).catch(() => []),
    getGameState(lang, 'grammar'),
    getGameState(lang, 'vocab'),
  ])
  return {
    progress,
    cards,
    // Both trainers' XP, since quests span both.
    xp: grammar.xp + vocab.xp,
    streak: Math.max(grammar.streak, vocab.streak),
  }
}

/**
 * This week's quests, rerolling and persisting if the week has turned.
 *
 * A reroll resets the accumulator too: last week's counted days and cases must
 * not carry into a fresh set, or the first session of a new week would arrive
 * with three quests already half done.
 */
export async function ensureQuests(lang: string, now = Date.now()): Promise<StoredQuests> {
  const all = await readAll()
  const stored = all[lang]
  const { week, rerolled } = currentQuests(stored?.week, await questContext(lang), now)
  if (!rerolled && stored) return stored
  const fresh: StoredQuests = { week, apply: emptyApplyState() }
  await writeOne(lang, fresh)
  return fresh
}

export interface QuestResult {
  /** Quests finished by this session, ready for the summary. */
  completed: QuestView[]
  /** Bonus XP earned from them. */
  xp: number
  /** The week's quests after the update. */
  quests: QuestView[]
}

/**
 * Fold one finished session into the week's quests.
 *
 * `bothModes` cannot be decided from the session alone — it is true only when
 * the OTHER trainer was also completed today — so it is resolved here, where
 * both game states are visible.
 */
export async function recordSession(
  lang: string,
  mode: GameMode,
  contribution: SessionContribution,
  dayKey: string,
  now = Date.now(),
): Promise<QuestResult> {
  const stored = await ensureQuests(lang, now)
  const other = await getGameState(lang, mode === 'grammar' ? 'vocab' : 'grammar')
  const withBoth: SessionContribution = {
    ...contribution,
    bothModes: contribution.activeDay && other.lastDay === dayKey,
  }

  const result = applyContribution(stored.week.quests, stored.apply, withBoth, dayKey, now)
  const next: StoredQuests = {
    week: { ...stored.week, quests: result.quests },
    apply: result.state,
  }
  await writeOne(lang, next)

  // Quest XP goes on the trainer that finished them, so the rank bar moves in
  // the place the learner is looking.
  if (result.xp > 0) {
    const game = await getGameState(lang, mode)
    await saveGameStateFor(lang, mode, { ...game, xp: game.xp + result.xp })
  }

  const views = questViews(result.quests)
  return {
    completed: views.filter(v => result.completed.includes(v.id)),
    xp: result.xp,
    quests: views,
  }
}

/** For the home screen. */
export async function questsView(lang: string, now = Date.now()): Promise<QuestView[]> {
  const stored = await ensureQuests(lang, now)
  return questViews(stored.week.quests)
}

/** Days for the goal ring and the week comparison. */
export async function activityDays(lang: string) {
  return getSessionDays(lang)
}
