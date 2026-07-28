import type { SetupEvent } from './types'
import type { ConceptProgress, GameState, SessionPlan, SessionResult } from './grammar/types'
import {
  getAllConceptProgress,
  getAllWords,
  getFreqRanks,
  getSessionDays,
  putConceptProgress,
  putDrillRows,
  putSessionDay,
  type DrillRow,
} from './db'
import { installMorph, loadParadigms, morphInstalled, usableLemmas } from './grammar/morph'
import { buildPlan } from './grammar/plan'
import { applySession } from './grammar/srs'
import { advanceStreak, newAchievements, newGameState, rankFor, scoreSession } from './grammar/gamify'
import { CONCEPTS } from './grammar/curriculum'
import { AUTHORED_CONCEPTS } from './grammar/lessons.de'
import { dayKey } from './grammar/session'
import type { VocabRank } from './grammar/generator'

/**
 * Background-side glue for the grammar game: it owns IndexedDB and the game
 * state, so the app page only ever exchanges plain JSON with it.
 *
 * Exercises are generated here in ONE pass per session (~60 small objects)
 * rather than per item — the drill UI must never wait on a message round-trip
 * between questions.
 */

const GAME_KEY = 'grammarGame'

/**
 * Trening and Słówka keep SEPARATE streaks, so their state is namespaced by
 * mode. The grammar entry keeps the bare language key it has always used, so
 * existing streaks survive the upgrade untouched.
 */
export type GameMode = 'grammar' | 'vocab'

const gameKeyFor = (lang: string, mode: GameMode) => (mode === 'grammar' ? lang : `${lang}:${mode}`)

// ── game state (browser.storage.local, alongside settings) ──

export async function getGameState(lang: string, mode: GameMode = 'grammar'): Promise<GameState> {
  const stored = await browser.storage.local.get(GAME_KEY)
  const all = (stored[GAME_KEY] as Record<string, GameState>) ?? {}
  return all[gameKeyFor(lang, mode)] ?? newGameState(lang)
}

export async function saveGameStateFor(
  lang: string,
  mode: GameMode,
  state: GameState,
): Promise<void> {
  const stored = await browser.storage.local.get(GAME_KEY)
  const all = (stored[GAME_KEY] as Record<string, GameState>) ?? {}
  all[gameKeyFor(lang, mode)] = state
  await browser.storage.local.set({ [GAME_KEY]: all })
}

async function saveGameState(state: GameState): Promise<void> {
  await saveGameStateFor(state.lang, 'grammar', state)
}

// ── morph install (port 'grammar-setup') ────────────────────

/** Bundled artifact if present, otherwise the repo copy. */
const DATA_BASE = 'https://raw.githubusercontent.com/NotXave/znam/main/public/data'

async function loadMorphTsv(lang: string): Promise<string> {
  try {
    // Cast: WXT types getURL against literal public paths, ours is dynamic
    const resp = await fetch(browser.runtime.getURL(`/data/${lang}.morph.tsv` as any))
    if (resp.ok) return await resp.text()
  } catch {
    // not bundled for this language
  }
  const resp = await fetch(`${DATA_BASE}/${lang}.morph.tsv`)
  if (!resp.ok) throw new Error(`Keine Grammatikdaten für "${lang}" (HTTP ${resp.status})`)
  return await resp.text()
}

export function handleGrammarSetupPort(port: any): void {
  const post = (event: SetupEvent) => {
    try { port.postMessage(event) } catch { /* port closed */ }
  }

  port.onMessage.addListener(async (msg: { type: string; lang: string }) => {
    if (msg.type !== 'SETUP_GRAMMAR') return
    try {
      post({ type: 'PROGRESS', step: 'download', pct: 0, detail: 'Formentabelle wird geladen' })
      const tsv = await loadMorphTsv(msg.lang)
      post({ type: 'PROGRESS', step: 'parse', pct: 100, detail: 'Wird gespeichert' })
      const rows = await installMorph(msg.lang, tsv, (pct, detail) => {
        post({ type: 'PROGRESS', step: 'store', pct, detail })
      })
      post({
        type: 'DONE',
        state: { lang: msg.lang, dictReady: true, dictForms: rows, freqReady: true, freqLemmas: 0, counts: { learning: 0, known: 0, ignored: 0 } },
      })
    } catch (err: any) {
      post({ type: 'ERROR', error: err.message || String(err) })
    }
  })
}

// ── message handlers ────────────────────────────────────────

export interface GrammarState {
  installed: boolean
  forms: number
  concepts: number
  authored: number
}

export async function grammarState(lang: string): Promise<GrammarState> {
  const forms = await morphInstalled(lang)
  return {
    installed: forms > 0,
    forms,
    concepts: CONCEPTS.length,
    authored: AUTHORED_CONCEPTS.size,
  }
}

/** The learner's vocabulary, shaped the way the generator wants it. */
async function vocabFor(lang: string, lemmas: string[]): Promise<VocabRank> {
  const words = await getAllWords(lang)
  const learning = new Set<string>()
  const known = new Set<string>()
  const ignored = new Set<string>()
  for (const w of words) {
    if (w.status === 'learning') learning.add(w.lemma)
    else if (w.status === 'known') known.add(w.lemma)
    else if (w.status === 'ignored') ignored.add(w.lemma)
  }
  const rank = await getFreqRanks(lang, lemmas)
  return { learning, known, ignored, rank }
}

export async function startGrammarSession(lang: string, minutes: number): Promise<SessionPlan | { error: string }> {
  const forms = await morphInstalled(lang)
  if (forms === 0) {
    return { error: 'Grammatikdaten sind für diese Sprache noch nicht installiert.' }
  }

  const now = Date.now()
  const lemmas = await usableLemmas(lang)
  const [paradigms, vocab, progress, settings] = await Promise.all([
    loadParadigms(lang, lemmas),
    vocabFor(lang, lemmas),
    getAllConceptProgress(lang),
    browser.storage.local.get('settings'),
  ])

  const newPerDay = (settings.settings as any)?.grammarNewPerDay ?? 1

  const plan = buildPlan({
    lang,
    minutes,
    now,
    progress,
    paradigms,
    vocab,
    newPerDay,
  })

  if (plan.exercises.length === 0) {
    return { error: 'Keine Übungen verfügbar — bitte zuerst die Sprachdaten installieren.' }
  }
  return plan
}

export interface SessionSummary {
  xp: number
  xpTotal: number
  streak: number
  freezeUsed: boolean
  streakBroken: boolean
  maxCombo: number
  achievements: string[]
  rankId: string
  correct: number
  total: number
  conceptsAdvanced: { conceptId: string; mastery: number; intervalDays: number }[]
}

export async function endGrammarSession(
  lang: string,
  result: SessionResult,
): Promise<SessionSummary> {
  const now = Date.now()
  const today = dayKey(now)
  const attempts = result.attempts

  // ── SRS ──
  const existing = await getAllConceptProgress(lang)
  const updated: ConceptProgress[] = applySession(existing, attempts, lang, now)
  await putConceptProgress(updated)

  // ── attempt log ──
  const drills: DrillRow[] = attempts.map(a => ({
    lang,
    date: today,
    conceptId: a.conceptId,
    templateId: a.templateId,
    correct: a.correct,
    ms: a.ms,
  }))
  await putDrillRows(drills)

  // ── XP, streak, achievements ──
  const correct = attempts.filter(a => a.correct).length
  const completed = result.seconds >= 60 && attempts.length > 0
  const xp = scoreSession(attempts, { lessonShown: !!result.attempts.some(a => a.phase === 'lesson'), completed })

  let game = await getGameState(lang)
  const streakUpdate = advanceStreak(game, today)
  game = streakUpdate.state
  const unlocked = newAchievements(game, attempts, xp.maxCombo, game.streak)
  game = {
    ...game,
    xp: game.xp + xp.total,
    achievements: [...game.achievements, ...unlocked],
  }
  await saveGameState(game)

  // ── daily record (streak + heatmap) ──
  const days = await getSessionDays(lang)
  const prior = days.find(d => d.date === today)
  await putSessionDay({
    lang,
    date: today,
    seconds: (prior?.seconds ?? 0) + result.seconds,
    items: (prior?.items ?? 0) + attempts.length,
    correct: (prior?.correct ?? 0) + correct,
    xp: (prior?.xp ?? 0) + xp.total,
  })

  return {
    xp: xp.total,
    xpTotal: game.xp,
    streak: game.streak,
    freezeUsed: streakUpdate.freezeUsed,
    streakBroken: streakUpdate.broken,
    maxCombo: xp.maxCombo,
    achievements: unlocked,
    rankId: rankFor(game.xp).id,
    correct,
    total: attempts.length,
    conceptsAdvanced: updated.map(u => ({
      conceptId: u.conceptId,
      mastery: u.mastery,
      intervalDays: u.intervalDays,
    })),
  }
}

export interface GrammarProgressView {
  game: GameState
  concepts: {
    id: string
    titleDe: string
    tier: number
    group: string
    authored: boolean
    mastery: number
    intervalDays: number
    due: number
    seen: number
    lapses: number
  }[]
  days: { date: string; seconds: number; items: number; correct: number; xp: number }[]
  state: GrammarState
}

export async function grammarProgress(lang: string): Promise<GrammarProgressView> {
  const [game, progress, days, state] = await Promise.all([
    getGameState(lang),
    getAllConceptProgress(lang),
    getSessionDays(lang),
    grammarState(lang),
  ])
  const byId = new Map(progress.map(p => [p.conceptId, p]))

  return {
    game,
    state,
    days,
    concepts: CONCEPTS.map(c => {
      const p = byId.get(c.id)
      return {
        id: c.id,
        titleDe: c.titleDe,
        tier: c.tier,
        group: c.group,
        authored: AUTHORED_CONCEPTS.has(c.id),
        mastery: p?.mastery ?? 0,
        intervalDays: p?.intervalDays ?? 0,
        due: p?.due ?? 0,
        seen: p?.seen ?? 0,
        lapses: p?.lapses ?? 0,
      }
    }),
  }
}
