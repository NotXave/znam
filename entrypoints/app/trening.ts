import type { Message } from '../../utils/types'
import type { Exercise, SessionPlan, SessionResult, Attempt } from '../../utils/grammar/types'
import type { SetupEvent } from '../../utils/types'
import { grade, gradeChoice } from '../../utils/grammar/grading'
import { comboMultiplier, rankFor, nextRank, zubrLine, ACHIEVEMENTS, RANKS } from '../../utils/grammar/gamify'
import {
  commitAnswer,
  nextExercise,
  progress as sessionProgress,
  qualifiesForStreak,
  secondsRemaining,
  startSession,
  type SessionState,
} from '../../utils/grammar/session'
import { getSettings } from '../../utils/settings'
import { CONCEPT_BY_ID } from '../../utils/grammar/curriculum'
import { initSlowka, setSlowkaLang, startSlowka } from './slowka'
import { banner, confetti, loadCelebrationSettings, shake, sounds } from './celebrate'
import { icon, zubrSays } from './icons'

/**
 * The Trening tab: a 15-minute daily Polish grammar game.
 *
 * All the thinking (what to teach, how to schedule it, what counts as correct)
 * lives in utils/grammar/. This file is the screen state machine and the DOM —
 * deliberately thin, and free of any rules it could get wrong on its own.
 */

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T
const send = (msg: Message): Promise<any> => browser.runtime.sendMessage(msg)

type Screen = 'setup' | 'home' | 'lesson' | 'drill' | 'summary'
const SCREENS: Screen[] = ['setup', 'home', 'lesson', 'drill', 'summary']

const PHASE_LABEL: Record<string, string> = {
  warmup: 'Aufwärmen',
  lesson: 'Neues Thema',
  drill: 'Training',
  boss: 'Boss',
}

let lang = 'pl'
let state: SessionState | null = null
let current: Exercise | null = null
let attempts: Attempt[] = []
let combo = 0
let itemStartedAt = 0
let answered = false
let ticker: number | undefined
/** Items graded as near-miss get one more showing before the session ends. */
let replayQueue: Exercise[] = []
/** Boss round: how many hits are left, and how many it started with. */
let bossHp = 0
let bossMaxHp = 0
/** Rank at session start, so a level-up can be announced at the end. */
let rankAtStart = ''

export function setTreningLang(next: string): void {
  lang = next
  setSlowkaLang(next)
}

function showScreen(name: Screen): void {
  for (const s of SCREENS) {
    const el = document.getElementById(`tr-${s}`)
    if (el) el.hidden = s !== name
  }
}

// ── Home ────────────────────────────────────────────────────

export async function renderTrening(): Promise<void> {
  stopTicker()
  const view = await send({ type: 'GRAMMAR_PROGRESS', payload: { lang } })

  if (!view?.state?.installed) {
    showScreen('setup')
    return
  }
  showScreen('home')

  const { game, concepts, days } = view
  const rank = rankFor(game.xp)
  const upcoming = nextRank(game.xp)

  // A chip reading "0" is noise. On day one there is no streak to show yet.
  $('tr-streak').hidden = game.streak === 0
  $('tr-streak').querySelector('.tr-streak-n')!.textContent = `${game.streak} ${game.streak === 1 ? 'Tag' : 'Tage'}`
  $('tr-rank-title').textContent = rank.titlePl
  $('tr-rank-xp').textContent = upcoming
    ? `${game.xp} / ${upcoming.minXp} XP`
    : `${game.xp} XP — maximaler Rang`
  const pct = upcoming
    ? Math.round(((game.xp - rank.minXp) / (upcoming.minXp - rank.minXp)) * 100)
    : 100
  $('tr-xp-fill').style.width = `${Math.max(2, Math.min(100, pct))}%`

  const today = new Date().toISOString().slice(0, 10)
  const doneToday = days.some((d: any) => d.date === today)
  $('tr-greeting').textContent = doneToday ? 'Już zrobione!' : 'Dzień dobry!'
  const dueCount = concepts.filter((c: any) => c.authored && c.due > 0 && c.due <= Date.now()).length
  const started = concepts.filter((c: any) => c.seen > 0).length
  $('tr-today').textContent = doneToday
    ? 'Heute schon trainiert — noch eine Runde geht trotzdem.'
    : started === 0
      ? 'Erste Einheit: wir fangen ganz vorne an.'
      : `${dueCount} ${dueCount === 1 ? 'Thema' : 'Themen'} zur Wiederholung fällig.`

  const totalSeconds = days.reduce((n: number, d: any) => n + d.seconds, 0)
  const totalItems = days.reduce((n: number, d: any) => n + d.items, 0)
  const totalCorrect = days.reduce((n: number, d: any) => n + d.correct, 0)
  const mastered = concepts.filter((c: any) => c.mastery >= 0.85 && c.intervalDays >= 21).length

  $('tr-tiles').innerHTML = [
    tile(String(game.streak), 'Tage in Folge'),
    tile(String(game.xp), 'XP gesamt'),
    tile(`${mastered}/${concepts.filter((c: any) => c.authored).length}`, 'Themen sitzen'),
    tile(
      totalItems > 0 ? `${Math.round((totalCorrect / totalItems) * 100)}%` : '—',
      'Trefferquote',
    ),
    tile(`${Math.round(totalSeconds / 60)}`, 'Minuten geübt'),
  ].join('')

  // Both modes carry their own streak; the home screen shows them together so
  // the split reads as two doors into one habit rather than two separate chores.
  const vocab = await send({ type: 'VOCAB_PROGRESS', payload: { lang } })
  const streakChip = (n: number) => (n > 0 ? `${icon('flame', 12)} ${n} Tage` : '')
  $('tr-streak-grammar').innerHTML = streakChip(game.streak)
  $('tr-streak-vocab').innerHTML = streakChip(vocab?.streak ?? 0)

  const perfect = $('tr-perfect-day')
  const bothToday = game.lastDay === today && vocab?.streak > 0 && doneToday
  perfect.hidden = !bothToday
  perfect.className = bothToday ? 'tr-perfect' : 'hint'
  if (bothToday) perfect.innerHTML = `${icon('spark', 14)} Perfekter Tag — beides erledigt.`

  $('tr-map').innerHTML = renderMap(concepts)
  $('tr-activity').innerHTML = renderActivity(days)
}

function tile(num: string, label: string): string {
  return `<div class="stat-tile"><div class="num">${num}</div><div class="lbl">${esc(label)}</div></div>`
}

function renderMap(concepts: any[]): string {
  const tiers = [1, 2, 3, 4]
  return tiers
    .map((tier) => {
      const inTier = concepts.filter(c => c.tier === tier)
      if (inTier.length === 0) return ''
      const nodes = inTier
        .map((c) => {
          const mastered = c.mastery >= 0.85 && c.intervalDays >= 21
          const cls = !c.authored
            ? 'tr-node-soon'
            : mastered
              ? 'tr-node-done'
              : c.seen > 0
                ? 'tr-node-active'
                : 'tr-node-locked'
          const fill = Math.round(c.mastery * 100)
          const note = !c.authored
            ? 'kommt noch'
            : c.seen === 0
              ? 'noch nicht begonnen'
              : `${fill}% sicher`
          return `<div class="tr-node ${cls}" title="${esc(note)}">
            <div class="tr-node-bar"><div style="width:${fill}%"></div></div>
            <span>${esc(c.titleDe)}</span>
          </div>`
        })
        .join('')
      return `<div class="tr-tier"><div class="tr-tier-label">Stufe ${tier}</div><div class="tr-tier-nodes">${nodes}</div></div>`
    })
    .join('')
}

function renderActivity(days: any[]): string {
  const byDate = new Map(days.map((d: any) => [d.date, d]))
  const cells: string[] = []
  const now = new Date()
  for (let i = 55; i >= 0; i--) {
    const d = new Date(now)
    d.setDate(d.getDate() - i)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    const row = byDate.get(key)
    const mins = row ? row.seconds / 60 : 0
    const level = mins === 0 ? 0 : mins < 5 ? 1 : mins < 12 ? 2 : mins < 20 ? 3 : 4
    cells.push(
      `<i class="tr-cell tr-cell-${level}" title="${key}${row ? ` · ${Math.round(mins)} Min` : ''}"></i>`,
    )
  }
  return `<div class="tr-heat">${cells.join('')}</div>`
}

// ── Setup ───────────────────────────────────────────────────

function installMorphData(): void {
  const port = browser.runtime.connect({ name: 'grammar-setup' })
  const bar = $('tr-setup-bar')
  const detail = $('tr-setup-detail')
  $('tr-setup-progress').hidden = false
  $<HTMLButtonElement>('tr-install').disabled = true

  port.onMessage.addListener((event: SetupEvent) => {
    if (event.type === 'PROGRESS') {
      bar.style.width = `${event.pct}%`
      detail.textContent = event.detail
    } else if (event.type === 'DONE') {
      detail.textContent = 'Fertig!'
      $<HTMLButtonElement>('tr-install').disabled = false
      port.disconnect()
      void renderTrening()
    } else if (event.type === 'ERROR') {
      detail.textContent = event.error
      $<HTMLButtonElement>('tr-install').disabled = false
      port.disconnect()
    }
  })
  port.postMessage({ type: 'SETUP_GRAMMAR', lang })
}

// ── Session ─────────────────────────────────────────────────

async function startTraining(): Promise<void> {
  const settings = await getSettings()
  const minutes = settings.grammarDailyMinutes || 15

  $<HTMLButtonElement>('tr-start').disabled = true
  const plan: SessionPlan | { error: string } = await send({
    type: 'GRAMMAR_SESSION_START',
    payload: { lang, minutes },
  })
  $<HTMLButtonElement>('tr-start').disabled = false

  if (!plan || 'error' in plan) {
    $('tr-today').textContent = (plan as any)?.error ?? 'Training konnte nicht gestartet werden.'
    return
  }

  state = startSession(plan, Date.now())
  attempts = []
  replayQueue = []
  combo = 0
  // The boss has one hit point per boss item, so clearing the round kills it.
  bossMaxHp = plan.exercises.filter(e => e.phase === 'boss').length
  bossHp = bossMaxHp
  rankAtStart = rankFor((await send({ type: 'GRAMMAR_PROGRESS', payload: { lang } }))?.game?.xp ?? 0).id

  if (plan.lesson) {
    showLesson(plan)
  } else {
    beginDrilling()
  }
}

function showLesson(plan: SessionPlan): void {
  const lesson = plan.lesson!
  showScreen('lesson')
  $('tr-lesson-title').textContent = titleOf(lesson.conceptId)
  $('tr-lesson-hook').textContent = lesson.hookDe
  $('tr-lesson-rule').textContent = lesson.ruleDe
  $('tr-lesson-bridge').textContent = lesson.bridgeDe
  $('tr-lesson-trap').textContent = lesson.trapDe
  $('tr-lesson-mnemonic').textContent = lesson.mnemonicDe

  const head = lesson.tableHead.map(h => `<th>${esc(h)}</th>`).join('')
  const rows = lesson.table
    .map(r => `<tr>${r.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`)
    .join('')
  $('tr-lesson-table').innerHTML = `<table class="tr-table"><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table>`
}

function beginDrilling(): void {
  showScreen('drill')
  startTicker()
  advance()
}

function advance(): void {
  if (!state) return
  const now = Date.now()
  let ex = nextExercise(state, now)

  // Near misses come back once before the session closes.
  if (!ex && replayQueue.length > 0) {
    ex = replayQueue.shift()!
  }

  if (!ex) {
    void finishSession()
    return
  }

  current = ex
  answered = false
  itemStartedAt = Date.now()
  renderExercise(ex)
}

function renderExercise(ex: Exercise): void {
  $('tr-phase').textContent = PHASE_LABEL[ex.phase] ?? ''
  $('tr-stage').classList.toggle('tr-stage-boss', ex.phase === 'boss')
  $('tr-boss-bar').hidden = ex.phase !== 'boss'
  if (ex.phase === 'boss') drawBossHp()
  $('tr-prompt').textContent = ex.promptDe
  $('tr-sentence').textContent = ex.text
  // The cue names the dictionary form the gap is asking about; kinds whose
  // question IS the word itself (transform, gender-sort) have nothing to add.
  $('tr-cue').textContent = ex.cue ? `(${ex.cue})` : ''

  $('tr-feedback').hidden = true
  $('tr-hint').hidden = true
  $('tr-hint-btn').hidden = !(ex.hintDe && (ex.phase === 'lesson' || ex.phase === 'warmup'))

  const options = $('tr-options')
  const freetext = $('tr-freetext')
  const order = $('tr-order')

  options.hidden = true
  freetext.hidden = true
  order.hidden = true

  if (ex.kind === 'order') {
    order.hidden = false
    renderOrder(ex)
  } else if (ex.options.length > 0) {
    options.hidden = false
    options.innerHTML = ex.options
      .map(o => `<button class="tr-option" data-value="${esc(o)}">${esc(o)}</button>`)
      .join('')
    for (const btn of options.querySelectorAll<HTMLButtonElement>('.tr-option')) {
      btn.addEventListener('click', () => answerWith(btn.dataset.value ?? '', btn))
    }
  } else {
    options.innerHTML = ''
    freetext.hidden = false
    const input = $<HTMLInputElement>('tr-input')
    input.value = ''
    input.disabled = false
    input.focus()
  }
}

/** Words currently placed in the sentence being built. */
let orderBuilt: string[] = []

/**
 * order — tap words from the bank to build the sentence, tap a placed word to
 * take it back. Free-text would test typing; the point here is word ORDER.
 */
function renderOrder(ex: Exercise) {
  orderBuilt = []
  const bank = $('tr-order-bank')
  bank.innerHTML = ex.options
    .map((w, i) => `<button class="tr-word" data-i="${i}">${esc(w)}</button>`)
    .join('')
  for (const btn of bank.querySelectorAll<HTMLButtonElement>('.tr-word')) {
    btn.addEventListener('click', () => {
      if (answered) return
      orderBuilt.push(btn.textContent ?? '')
      btn.classList.add('tr-word-used')
      drawOrderBuilt()
    })
  }
  drawOrderBuilt()
}

function drawOrderBuilt() {
  const built = $('tr-order-built')
  built.innerHTML = orderBuilt
    .map((w, i) => `<button class="tr-word" data-i="${i}">${esc(w)}</button>`)
    .join('')
  for (const btn of built.querySelectorAll<HTMLButtonElement>('.tr-word')) {
    btn.addEventListener('click', () => {
      if (answered) return
      const i = Number(btn.dataset.i)
      const [word] = orderBuilt.splice(i, 1)
      // Return it to the first matching used slot in the bank.
      const slot = [...$('tr-order-bank').querySelectorAll<HTMLButtonElement>('.tr-word-used')]
        .find(b => b.textContent === word)
      slot?.classList.remove('tr-word-used')
      drawOrderBuilt()
    })
  }
  $<HTMLButtonElement>('tr-order-check').disabled = orderBuilt.length === 0
}

function answerWith(value: string, btn?: HTMLButtonElement): void {
  if (!current || !state || answered) return
  answered = true

  const ex = current
  // `order` has options, but they are the sentence's own words rather than
  // competing answers — so it grades as text, not as a choice.
  const result = ex.kind !== 'order' && ex.options.length > 0
    ? gradeChoice(value, ex.answer)
    : grade(value, ex.answer, ex.alsoAccept)

  const ms = Date.now() - itemStartedAt
  attempts.push({
    exerciseId: ex.id,
    templateId: ex.templateId,
    conceptId: ex.conceptId,
    correct: result.correct,
    nearMiss: result.nearMiss,
    answer: value,
    ms,
    phase: ex.phase,
  })

  if (result.correct) {
    combo++
    if (result.nearMiss && replayQueue.length < 5) replayQueue.push(ex)
    if (ex.phase === 'boss') {
      bossHp--
      drawBossHp()
      sounds.bossHit()
      shake($('tr-stage'))
      if (bossHp <= 0) confetti(30)
    } else if (combo >= 5 && combo % 5 === 0) {
      sounds.combo()
    } else {
      sounds.correct()
    }
  } else {
    combo = 0
    sounds.wrong()
  }
  updateCombo()

  // Mark up the chosen option and always reveal the right one.
  if (ex.kind !== 'order' && ex.options.length > 0) {
    for (const b of $('tr-options').querySelectorAll<HTMLButtonElement>('.tr-option')) {
      b.disabled = true
      if (b.dataset.value === ex.answer) b.classList.add('tr-option-right')
      else if (b === btn) b.classList.add('tr-option-wrong')
    }
  } else if (ex.kind === 'order') {
    $<HTMLButtonElement>('tr-order-check').disabled = true
  } else {
    $<HTMLInputElement>('tr-input').disabled = true
  }

  const line = $('tr-feedback-line')
  line.className = `tr-feedback-line ${result.correct ? 'tr-ok' : 'tr-bad'}`
  const voice = result.correct
    ? zubrLine(result.nearMiss ? 'nearMiss' : ex.phase === 'boss' ? 'bossHit' : 'correct')
    : zubrLine('wrong')
  // innerHTML rather than textContent because the mark is inline SVG. The
  // answer is escaped; the voice line is our own authored German.
  line.innerHTML = result.correct
    ? zubrSays(voice)
    : zubrSays(`${voice} <span class="tr-answer">→ ${esc(ex.answer)}</span>`)
  $('tr-feedback-note').textContent = result.noteDe ?? ''
  $('tr-feedback').hidden = false
  $('tr-hint-btn').hidden = true
  $<HTMLButtonElement>('tr-next').focus()

  commitAnswer(state, ms)
  updateProgress()
}

function drawBossHp(): void {
  const pct = bossMaxHp > 0 ? Math.max(0, (bossHp / bossMaxHp) * 100) : 0
  $('tr-boss-hp-fill').style.width = `${pct}%`
  $('tr-boss-hp-text').textContent = `${Math.max(0, bossHp)} / ${bossMaxHp}`
}

function updateCombo(): void {
  const el = $('tr-combo')
  el.hidden = combo < 2
  $('tr-combo-n').textContent = String(combo)
  el.classList.toggle('tr-combo-hot', comboMultiplier(combo) >= 1.5)
}

function updateProgress(): void {
  if (!state) return
  const now = Date.now()
  $('tr-progress-fill').style.width = `${Math.round(sessionProgress(state, now) * 100)}%`
  const left = Math.max(0, Math.round(secondsRemaining(state, now)))
  $('tr-clock').textContent = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`
}

/**
 * Drives the clock and progress bar only. It deliberately never ends the
 * session: running out of time while a question is on screen must not snatch it
 * away, so the session ends in advance(), between items.
 */
function startTicker(): void {
  stopTicker()
  ticker = window.setInterval(() => {
    if (!state) return stopTicker()
    updateProgress()
  }, 500)
}

function stopTicker(): void {
  if (ticker !== undefined) {
    clearInterval(ticker)
    ticker = undefined
  }
}

async function finishSession(): Promise<void> {
  if (!state) return
  stopTicker()
  const now = Date.now()
  const seconds = Math.round((now - state.startedAt) / 1000)
  const counted = qualifiesForStreak(state, now, attempts.length)

  // xp/maxCombo are recomputed authoritatively in the background from the
  // attempt list; these are carried only to keep the shape complete.
  const result: SessionResult = {
    date: state.plan.date,
    seconds,
    attempts,
    xp: 0,
    maxCombo: combo,
  }

  const summary = await send({ type: 'GRAMMAR_SESSION_END', payload: { lang, result } })
  renderSummary(summary, counted, seconds)

  // Celebrate only what is worth celebrating: a session with real work in it.
  if (attempts.length >= 5) {
    sounds.finish()
    const acc = summary?.total > 0 ? summary.correct / summary.total : 0
    if (acc >= 0.8 || summary?.achievements?.length) confetti(acc === 1 ? 70 : 40)
  }
  if (summary?.rankId && rankAtStart && summary.rankId !== rankAtStart) {
    sounds.levelUp()
    confetti(80)
    banner(`Neuer Rang: ${RANKS.find(r => r.id === summary.rankId)?.titlePl ?? ''}`, 'trophy')
  }
  state = null
  current = null
}

function renderSummary(summary: any, counted: boolean, seconds: number): void {
  showScreen('summary')
  $('tr-summary-title').textContent = summary?.total > 0 ? 'Koniec!' : 'Bis zum nächsten Mal!'
  $('tr-summary-sub').innerHTML = zubrSays(zubrLine('sessionEnd'))

  const acc = summary?.total > 0 ? Math.round((summary.correct / summary.total) * 100) : 0
  $('tr-summary-tiles').innerHTML = [
    tile(`+${summary?.xp ?? 0}`, 'XP verdient'),
    tile(`${summary?.correct ?? 0}/${summary?.total ?? 0}`, 'richtig'),
    tile(`${acc}%`, 'Trefferquote'),
    tile(`${summary?.maxCombo ?? 0}×`, 'beste Serie'),
    tile(`${Math.round(seconds / 60)}`, 'Minuten'),
  ].join('')

  const notes: string[] = []
  if (counted && summary?.streak) {
    const d = summary.streak === 1 ? 'Tag' : 'Tage'
    notes.push(`<div class="tr-streak-note">${icon('flame', 16)} ${summary.streak} ${d} in Folge!</div>`)
  }
  if (summary?.freezeUsed) {
    notes.push(`<div class="tr-streak-note">${icon('freeze', 16)} Ein Streak-Schutz hat gestern gerettet.</div>`)
  }
  if (summary?.streakBroken) {
    notes.push('<div class="hint">Die Serie ist gerissen — heute fängt eine neue an.</div>')
  }
  const unlocked: string[] = summary?.achievements ?? []
  for (const id of unlocked) {
    const a = ACHIEVEMENTS.find(x => x.id === id)
    if (a) notes.push(`<div class="tr-achievement">${icon('medal', 16)}<span><b>${esc(a.titleDe)}</b> — ${esc(a.descDe)}</span></div>`)
  }
  $('tr-summary-achievements').innerHTML = notes.join('')

  const advanced: any[] = summary?.conceptsAdvanced ?? []
  $('tr-summary-concepts').innerHTML = advanced.length
    ? `<h2 style="margin-top:14px">Nächste Wiederholung</h2>` +
      advanced
        .map(
          c =>
            `<div class="tr-advance"><span>${esc(titleOf(c.conceptId))}</span>` +
            `<span class="hint">in ${c.intervalDays} ${c.intervalDays === 1 ? 'Tag' : 'Tagen'} · ${Math.round(c.mastery * 100)}%</span></div>`,
        )
        .join('')
    : ''
}

function titleOf(conceptId: string): string {
  return CONCEPT_BY_ID.get(conceptId)?.titleDe ?? conceptId
}

function quitSession(): void {
  if (!state) return
  if (attempts.length > 0) {
    void finishSession()
  } else {
    stopTicker()
    state = null
    current = null
    void renderTrening()
  }
}

const esc = (s: string): string =>
  String(s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  )

// ── Wire-up ─────────────────────────────────────────────────

export function initTrening(): void {
  $('tr-install').addEventListener('click', installMorphData)
  $('tr-start').addEventListener('click', () => void startTraining())
  $('sl-start').addEventListener('click', () => void startSlowka(() => void renderTrening()))
  initSlowka(() => void renderTrening())
  void loadCelebrationSettings()
  $('tr-lesson-go').addEventListener('click', beginDrilling)
  $('tr-next').addEventListener('click', advance)
  $('tr-quit').addEventListener('click', quitSession)
  $('tr-summary-done').addEventListener('click', () => void renderTrening())

  $('tr-submit').addEventListener('click', () => {
    answerWith($<HTMLInputElement>('tr-input').value)
  })
  $('tr-order-check').addEventListener('click', () => {
    answerWith(orderBuilt.join(' '))
  })
  $('tr-input').addEventListener('keydown', (e) => {
    if ((e as KeyboardEvent).key === 'Enter') answerWith($<HTMLInputElement>('tr-input').value)
  })
  $('tr-hint-btn').addEventListener('click', () => {
    if (!current?.hintDe) return
    $('tr-hint').textContent = current.hintDe
    $('tr-hint').hidden = false
    $('tr-hint-btn').hidden = true
  })

  // Keyboard play: 1–4 pick an option, Enter advances after feedback.
  document.addEventListener('keydown', (e) => {
    if ($('tr-drill').hidden) return
    const key = (e as KeyboardEvent).key
    if (!answered && /^[1-4]$/.test(key)) {
      const btns = $('tr-options').querySelectorAll<HTMLButtonElement>('.tr-option')
      const btn = btns[Number(key) - 1]
      if (btn) {
        e.preventDefault()
        answerWith(btn.dataset.value ?? '', btn)
      }
    } else if (answered && key === 'Enter') {
      e.preventDefault()
      advance()
    }
  })
}
