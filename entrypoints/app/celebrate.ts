import { getSettings } from '../../utils/settings'
import { icon, type IconName } from './icons'

/**
 * The celebratory layer: confetti, blips, screen shake.
 *
 * Zero assets and zero dependencies — confetti is CSS keyframes on plain divs,
 * and the sounds are synthesized with WebAudio oscillators. Everything here is
 * decoration: nothing it does is required to understand feedback, so it can be
 * switched off entirely without leaving the game unreadable.
 */

let motionOn = true
let soundOn = true

export async function loadCelebrationSettings(): Promise<void> {
  const s = await getSettings()
  motionOn = s.grammarMotion !== false
  soundOn = s.grammarSound !== false
}

/** The OS-level preference always wins over ours. */
function motionAllowed(): boolean {
  if (!motionOn) return false
  return !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}

// ── sound ───────────────────────────────────────────────────

let audio: AudioContext | null = null

function ctx(): AudioContext | null {
  if (!soundOn) return null
  try {
    // Created lazily: constructing an AudioContext before any user gesture is
    // blocked by the browser and logs a warning on every page load.
    audio ??= new AudioContext()
    return audio
  } catch {
    return null
  }
}

/** A short synthesized blip. No files, no network, no dependency. */
function blip(freq: number, ms: number, type: OscillatorType = 'sine', gain = 0.05): void {
  const ac = ctx()
  if (!ac) return
  try {
    const osc = ac.createOscillator()
    const vol = ac.createGain()
    osc.type = type
    osc.frequency.value = freq
    vol.gain.setValueAtTime(gain, ac.currentTime)
    // Ramp to near-zero rather than stopping abruptly, which clicks.
    vol.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + ms / 1000)
    osc.connect(vol).connect(ac.destination)
    osc.start()
    osc.stop(ac.currentTime + ms / 1000)
  } catch {
    // audio unavailable — silence is an acceptable outcome
  }
}

export const sounds = {
  correct: () => { blip(660, 120); setTimeout(() => blip(880, 140), 90) },
  wrong: () => blip(200, 220, 'sawtooth', 0.035),
  combo: () => { blip(880, 90); setTimeout(() => blip(1175, 110), 70) },
  bossHit: () => blip(320, 160, 'square', 0.04),
  levelUp: () => {
    ;[523, 659, 784, 1047].forEach((f, i) => setTimeout(() => blip(f, 180), i * 90))
  },
  finish: () => {
    ;[523, 659, 784].forEach((f, i) => setTimeout(() => blip(f, 220), i * 120))
  },
}

// ── confetti ────────────────────────────────────────────────

/**
 * Confetti colours come from the theme rather than being hardcoded, so a burst
 * in Sepia is not a burst of Midnight's palette landing on a cream page.
 */
function confettiColors(): string[] {
  const cs = getComputedStyle(document.documentElement)
  const v = (name: string, fallback: string) => cs.getPropertyValue(name).trim() || fallback
  return [
    v('--accent', '#c8963e'),
    v('--ok', '#5f9e57'),
    v('--boss', '#8b83c9'),
    v('--c-page', '#5b9bd8'),
    v('--ink-2', '#b3b9c2'),
  ]
}

/**
 * Drop a burst of confetti. Elements remove themselves when their animation
 * ends, so nothing accumulates in the DOM if this fires repeatedly.
 */
export function confetti(count = 40): void {
  if (!motionAllowed()) return
  const layer = document.createElement('div')
  layer.className = 'confetti-layer'
  const colors = confettiColors()

  for (let i = 0; i < count; i++) {
    const bit = document.createElement('i')
    bit.className = 'confetti-bit'
    bit.style.left = `${Math.random() * 100}%`
    bit.style.background = colors[i % colors.length]
    bit.style.animationDelay = `${Math.random() * 0.4}s`
    bit.style.animationDuration = `${1.6 + Math.random() * 1.2}s`
    bit.style.transform = `rotate(${Math.random() * 360}deg)`
    layer.appendChild(bit)
  }

  document.body.appendChild(layer)
  setTimeout(() => layer.remove(), 3400)
}

/** Shake an element — used when the boss takes a hit. */
export function shake(el: HTMLElement): void {
  if (!motionAllowed()) return
  el.classList.remove('shake')
  // Force a reflow so the animation restarts even on consecutive hits.
  void el.offsetWidth
  el.classList.add('shake')
  setTimeout(() => el.classList.remove('shake'), 400)
}

/** A brief full-width banner, for level-ups and achievements. */
export function banner(text: string, mark?: IconName): void {
  const el = document.createElement('div')
  el.className = 'celebrate-banner'
  // The label goes in via textContent so a rank title can never inject markup;
  // the icon is prepended separately.
  const label = document.createElement('span')
  label.textContent = text
  if (mark) el.innerHTML = icon(mark, 16)
  el.appendChild(label)
  document.body.appendChild(el)
  setTimeout(() => el.remove(), 2600)
}
