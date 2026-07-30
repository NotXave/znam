import type { Message } from '../../utils/types'
import type { VocabExercise } from '../../utils/grammar/vocab'
import { grade, gradeChoice } from '../../utils/grammar/grading'
import { comboMultiplier, zubrLine } from '../../utils/grammar/gamify'
import { confetti, sounds } from './celebrate'
import { icon, zubrSays } from './icons'

/**
 * Słówka — the vocabulary trainer's runtime.
 *
 * A deliberately simpler loop than Trening: no lesson, no boss, no phases. One
 * flat queue of cards, a clock, and a summary. The interesting logic (which
 * words, in what order, with which distractors) lives in utils/grammar/vocab.ts
 * and utils/vocab-bg.ts.
 */

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T
const send = (msg: Message): Promise<any> => browser.runtime.sendMessage(msg)

const KIND_LABEL: Record<string, string> = {
  recognize: 'Was heißt das?',
  produce: 'Wie heißt das auf Polnisch?',
  context: 'Ergänze den Satz',
}

let lang = 'pl'
let queue: VocabExercise[] = []
let index = 0
let attempts: { lemma: string; correct: boolean; nearMiss: boolean; ms: number; kind: string }[] = []
let combo = 0
let maxCombo = 0
let startedAt = 0
let totalSeconds = 600
let itemStartedAt = 0
let answered = false
let ticker: number | undefined

export function setSlowkaLang(next: string): void {
  lang = next
}

const esc = (s: string): string =>
  String(s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  )

/** Home / drill / summary live alongside the Trening screens. */
function show(name: 'vocab' | 'sl-summary' | 'home'): void {
  $('tr-home').hidden = name !== 'home'
  $('tr-vocab').hidden = name !== 'vocab'
  $('sl-summary').hidden = name !== 'sl-summary'
  if (name !== 'home') {
    $('tr-lesson').hidden = true
    $('tr-drill').hidden = true
    $('tr-summary').hidden = true
  }
}

export async function startSlowka(onDone: () => void): Promise<void> {
  const btn = $<HTMLButtonElement>('sl-start')
  btn.disabled = true
  const view = await send({ type: 'VOCAB_PROGRESS', payload: { lang } })
  const minutes = view?.minutes ?? 10
  const plan = await send({ type: 'VOCAB_SESSION_START', payload: { lang, minutes } })
  btn.disabled = false

  if (!plan || plan.error) {
    $('tr-today').textContent = plan?.error ?? 'Słówka konnte nicht gestartet werden.'
    return
  }

  queue = plan.exercises
  index = 0
  attempts = []
  combo = 0
  maxCombo = 0
  totalSeconds = plan.totalSeconds
  startedAt = Date.now()
  finishCallback = onDone

  show('vocab')
  startTicker()
  next()
}

let finishCallback: () => void = () => {}

function next(): void {
  // Bounded by TIME as well as by the queue, same promise as Trening.
  const elapsed = (Date.now() - startedAt) / 1000
  if (index >= queue.length || elapsed >= totalSeconds) {
    void finish()
    return
  }
  answered = false
  itemStartedAt = Date.now()
  render(queue[index])
}

function render(ex: VocabExercise): void {
  $('sl-kind').textContent = KIND_LABEL[ex.kind] ?? ''
  $('sl-prompt').textContent = ex.prompt
  $('sl-sub').textContent = ex.sub
  $('sl-feedback').hidden = true

  const options = $('sl-options')
  const freetext = $('sl-freetext')

  if (ex.options.length > 0) {
    options.hidden = false
    freetext.hidden = true
    options.innerHTML = ex.options
      .map(o => `<button class="tr-option" data-value="${esc(o)}">${esc(o)}</button>`)
      .join('')
    for (const btn of options.querySelectorAll<HTMLButtonElement>('.tr-option')) {
      btn.addEventListener('click', () => answer(btn.dataset.value ?? '', btn))
    }
  } else {
    options.hidden = true
    options.innerHTML = ''
    freetext.hidden = false
    const input = $<HTMLInputElement>('sl-input')
    input.value = ''
    input.disabled = false
    input.focus()
  }
  updateProgress()
}

function answer(value: string, btn?: HTMLButtonElement): void {
  const ex = queue[index]
  if (!ex || answered) return
  answered = true

  const result = ex.options.length > 0
    ? gradeChoice(value, ex.answer)
    : grade(value, ex.answer)

  attempts.push({
    lemma: ex.lemma,
    correct: result.correct,
    nearMiss: result.nearMiss,
    ms: Date.now() - itemStartedAt,
    kind: ex.kind,
  })

  if (result.correct) {
    combo++
    maxCombo = Math.max(maxCombo, combo)
    if (combo >= 5 && combo % 5 === 0) sounds.combo()
    else sounds.correct()
  } else {
    combo = 0
    sounds.wrong()
  }
  const comboEl = $('sl-combo')
  comboEl.hidden = combo < 2
  $('sl-combo-n').textContent = String(combo)
  comboEl.classList.toggle('tr-combo-hot', comboMultiplier(combo) >= 1.5)

  if (ex.options.length > 0) {
    for (const b of $('sl-options').querySelectorAll<HTMLButtonElement>('.tr-option')) {
      b.disabled = true
      if (b.dataset.value === ex.answer) b.classList.add('tr-option-right')
      else if (b === btn) b.classList.add('tr-option-wrong')
    }
  } else {
    $<HTMLInputElement>('sl-input').disabled = true
  }

  const line = $('sl-feedback-line')
  line.className = `tr-feedback-line ${result.correct ? 'tr-ok' : 'tr-bad'}`
  const voice = zubrLine(result.correct ? (result.nearMiss ? 'nearMiss' : 'correct') : 'wrong')
  line.innerHTML = result.correct
    ? zubrSays(voice)
    : zubrSays(`${voice} <span class="tr-answer">→ ${esc(ex.answer)}</span>`)
  $('sl-feedback-note').textContent = result.noteDe ?? ''
  $('sl-feedback').hidden = false
  $<HTMLButtonElement>('sl-next').focus()

  index++
  updateProgress()
}

function updateProgress(): void {
  const elapsed = (Date.now() - startedAt) / 1000
  const byTime = elapsed / totalSeconds
  const byItems = queue.length ? index / queue.length : 0
  $('sl-progress-fill').style.width = `${Math.round(Math.min(1, Math.max(byTime, byItems)) * 100)}%`
  const left = Math.max(0, Math.round(totalSeconds - elapsed))
  $('sl-clock').textContent = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`
}

function startTicker(): void {
  stopTicker()
  ticker = window.setInterval(updateProgress, 500)
}

function stopTicker(): void {
  if (ticker !== undefined) {
    clearInterval(ticker)
    ticker = undefined
  }
}

async function finish(): Promise<void> {
  stopTicker()
  const seconds = Math.round((Date.now() - startedAt) / 1000)
  const summary = await send({
    type: 'VOCAB_SESSION_END',
    payload: { lang, result: { date: '', seconds, attempts, maxCombo } },
  })

  show('sl-summary')
  const acc = summary?.total > 0 ? Math.round((summary.correct / summary.total) * 100) : 0
  $('sl-summary-title').textContent = attempts.length > 0 ? 'Koniec!' : 'Bis zum nächsten Mal!'
  $('sl-summary-sub').innerHTML = zubrSays(zubrLine('sessionEnd'))
  $('sl-summary-tiles').innerHTML = [
    tile(`+${summary?.xp ?? 0}`, 'XP'),
    tile(`${summary?.correct ?? 0}/${summary?.total ?? 0}`, 'richtig'),
    tile(`${acc}%`, 'Trefferquote'),
    tile(`${summary?.maxCombo ?? 0}×`, 'beste Serie'),
    tile(`${Math.round(seconds / 60)}`, 'Minuten'),
  ].join('')

  if (attempts.length >= 5) {
    sounds.finish()
    if (summary?.perfectDay) confetti(70)
    else if (acc >= 0.8) confetti(40)
  }

  const notes: string[] = []
  if (summary?.streak) {
    const d = summary.streak === 1 ? 'Tag' : 'Tage'
    notes.push(`<div class="tr-streak-note">${icon('flame', 16)} ${summary.streak} ${d} Słówka in Folge!</div>`)
  }
  if (summary?.perfectDay) {
    notes.push(`<div class="tr-perfect">${icon('spark', 14)} Perfekter Tag — Grammatik <b>und</b> Vokabeln. +50 XP</div>`)
  }
  for (const q of summary?.questsCompleted ?? []) {
    notes.push(
      `<div class="tr-achievement">${icon('target', 16)}<span>` +
      `<b>${esc(q.titleDe)}</b> — Wochenziel erledigt. +${q.xp} XP</span></div>`,
    )
  }
  // What changed, the vocabulary version: which cards the scheduler now trusts
  // you with, and which came back closer.
  if (summary?.graduated > 0 || summary?.lapsed > 0) {
    const parts: string[] = []
    if (summary.graduated > 0) {
      parts.push(`<b>${summary.graduated}</b> ${summary.graduated === 1 ? 'Wort sitzt' : 'Wörter sitzen'} besser`)
    }
    if (summary.lapsed > 0) {
      parts.push(`<b>${summary.lapsed}</b> ${summary.lapsed === 1 ? 'kommt' : 'kommen'} früher zurück`)
    }
    notes.push(`<div class="hint">${parts.join(' · ')}</div>`)
  }
  if (summary?.dueTomorrow > 0) {
    const k = summary.dueTomorrow === 1 ? 'Karte kommt' : 'Karten kommen'
    notes.push(`<div class="hint">${summary.dueTomorrow} ${k} morgen zurück.</div>`)
  }
  $('sl-summary-notes').innerHTML = notes.join('')
}

function tile(num: string, label: string): string {
  return `<div class="stat-tile"><div class="num">${esc(num)}</div><div class="lbl">${esc(label)}</div></div>`
}

function quit(): void {
  if (attempts.length > 0) void finish()
  else {
    stopTicker()
    show('home')
    finishCallback()
  }
}

export function initSlowka(onHome: () => void): void {
  $('sl-next').addEventListener('click', next)
  $('sl-quit').addEventListener('click', quit)
  $('sl-submit').addEventListener('click', () => answer($<HTMLInputElement>('sl-input').value))
  $('sl-input').addEventListener('keydown', (e) => {
    if ((e as KeyboardEvent).key === 'Enter') answer($<HTMLInputElement>('sl-input').value)
  })
  $('sl-summary-done').addEventListener('click', () => {
    show('home')
    onHome()
  })

  document.addEventListener('keydown', (e) => {
    if ($('tr-vocab').hidden) return
    const key = (e as KeyboardEvent).key
    if (!answered && /^[1-4]$/.test(key)) {
      const btns = $('sl-options').querySelectorAll<HTMLButtonElement>('.tr-option')
      const btn = btns[Number(key) - 1]
      if (btn) {
        e.preventDefault()
        answer(btn.dataset.value ?? '', btn)
      }
    } else if (answered && key === 'Enter') {
      e.preventDefault()
      next()
    }
  })
}
