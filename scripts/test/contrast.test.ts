import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * WCAG contrast, asserted against the real stylesheet.
 *
 * A near-monochrome palette is exactly where contrast quietly fails: every
 * step of a neutral ramp looks fine next to its neighbours, and the failure
 * only shows up as "why is this label hard to read" three themes later. Four
 * themes × a dozen foreground/background pairs is too much to check by eye, and
 * eyeballing it is what let the previous palette ship `--muted` at 3.4:1.
 *
 * These parse entrypoints/app/style.css directly rather than duplicating the
 * token values, so editing a theme is what runs the check.
 */

const CSS = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'entrypoints', 'app', 'style.css'),
  'utf-8',
)

const THEMES = ['midnight', 'daylight', 'nord', 'sepia'] as const

/** Every `--token: value` declaration inside one block. */
function declarations(selector: string): Map<string, string> {
  const out = new Map<string, string>()
  // Blocks are flat (no nesting inside :root / [data-theme]), so the first `}`
  // genuinely ends the block.
  let from = 0
  for (;;) {
    const at = CSS.indexOf(selector, from)
    if (at < 0) break
    from = at + selector.length
    const open = CSS.indexOf('{', at)
    const close = CSS.indexOf('}', open)
    if (open < 0 || close < 0) break
    for (const line of CSS.slice(open + 1, close).split('\n')) {
      const m = /^\s*(--[\w-]+)\s*:\s*([^;]+);/.exec(line)
      if (m) out.set(m[1], m[2].trim())
    }
  }
  return out
}

const ROOT = declarations(':root')

/**
 * Resolve a token for one theme: the theme's own value if it sets one,
 * otherwise `:root`'s, following `var(--x)` indirection.
 */
function resolve(theme: string, token: string): string {
  const themed = declarations(`[data-theme="${theme}"]`)
  const seen = new Set<string>()
  let value: string | undefined = themed.get(token) ?? ROOT.get(token)
  while (value?.startsWith('var(')) {
    const inner = /var\((--[\w-]+)/.exec(value)?.[1]
    if (!inner || seen.has(inner)) break
    seen.add(inner)
    value = themed.get(inner) ?? ROOT.get(inner)
  }
  assert.ok(value, `${theme}: token ${token} is not defined`)
  return value!.trim()
}

/** #rgb / #rrggbb / #rrggbbaa → [r, g, b], alpha dropped. */
function rgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h
  assert.ok(/^[0-9a-fA-F]{6,8}$/.test(full), `not a hex colour: ${hex}`)
  return [0, 2, 4].map(i => parseInt(full.slice(i, i + 2), 16)) as [number, number, number]
}

/** Relative luminance, WCAG 2.1 §relative-luminance. */
function luminance(hex: string): number {
  const [r, g, b] = rgb(hex).map((c) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrast(fg: string, bg: string): number {
  const a = luminance(fg)
  const b = luminance(bg)
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}

/**
 * Every pair that carries text, with the ratio it has to clear.
 *
 * 4.5 is AA for body text; 3.0 is AA for large text (>= 18.66 px bold or 24 px)
 * and the threshold for a graphical object such as an icon or a chart mark.
 */
const TEXT_PAIRS: [fg: string, bg: string, min: number, what: string][] = [
  ['--ink', '--bg', 4.5, 'body text on the page'],
  ['--ink', '--card', 4.5, 'body text on a card'],
  ['--ink', '--raised', 4.5, 'body text on a raised surface'],
  ['--ink-2', '--card', 4.5, 'secondary text on a card'],
  ['--muted', '--card', 4.5, 'hints and labels — set at 11–12 px, so AA applies'],
  ['--muted', '--bg', 4.5, 'hints on the page'],
  ['--accent-ink', '--card', 4.5, 'accent text on a card'],
  ['--on-accent', '--accent', 4.5, 'the primary button label'],
  ['--ok', '--card', 3.0, 'the correct-answer marker'],
  ['--bad', '--card', 3.0, 'the wrong-answer marker'],
  ['--on-ok', '--ok', 4.5, 'the label on a correct option, which is filled'],
  ['--on-bad', '--bad', 4.5, 'the label on a wrong option, which is filled'],
  ['--viz-tick', '--card', 3.0, 'chart axis labels'],
]

/** Non-text marks: icons, borders, chart series. 3.0 is the AA threshold. */
const MARK_PAIRS: [fg: string, bg: string, min: number, what: string][] = [
  ['--accent', '--card', 3.0, 'accent icons and the XP bar'],
  ['--accent', '--bg', 3.0, 'accent marks on the page'],
  ['--boss', '--card', 3.0, 'the boss-round marker'],
  ['--c-page', '--card', 3.0, 'the Pages chart series'],
  ['--c-youtube', '--card', 3.0, 'the YouTube chart series'],
  ['--c-netflix', '--card', 3.0, 'the Netflix chart series'],
  ['--heat-4', '--card', 3.0, 'the darkest heatmap step'],
]

for (const theme of THEMES) {
  test(`${theme}: text contrast`, () => {
    for (const [fg, bg, min, what] of TEXT_PAIRS) {
      const ratio = contrast(resolve(theme, fg), resolve(theme, bg))
      assert.ok(
        ratio >= min,
        `${theme}: ${fg} on ${bg} is ${ratio.toFixed(2)}:1, needs ${min}:1 — ${what}`,
      )
    }
  })

  test(`${theme}: non-text contrast`, () => {
    for (const [fg, bg, min, what] of MARK_PAIRS) {
      const ratio = contrast(resolve(theme, fg), resolve(theme, bg))
      assert.ok(
        ratio >= min,
        `${theme}: ${fg} on ${bg} is ${ratio.toFixed(2)}:1, needs ${min}:1 — ${what}`,
      )
    }
  })

  test(`${theme}: hairlines are visible but not loud`, () => {
    // The whole elevation system is one border, so it has to be reliably
    // visible — and it must not read as a rule, which happened when a dark
    // theme's line was lighter than its own secondary text.
    const line = contrast(resolve(theme, '--line'), resolve(theme, '--card'))
    assert.ok(line >= 1.12, `${theme}: --line on --card is only ${line.toFixed(2)}:1 — invisible`)
    assert.ok(line <= 2.2, `${theme}: --line on --card is ${line.toFixed(2)}:1 — too heavy for a hairline`)
  })
}

test('every theme defines the whole token set', () => {
  // A theme that silently inherits `:root`'s Midnight values for one token is
  // the other way this palette breaks — it looks fine in Midnight and wrong
  // everywhere else.
  const themeOwned = [
    '--n-0', '--n-1', '--n-2', '--n-3', '--n-4', '--n-5', '--n-6', '--n-7', '--n-8', '--n-9',
    '--accent', '--accent-ink', '--on-accent', '--accent-soft',
    '--c-page', '--c-youtube', '--c-netflix',
    '--heat-1', '--heat-2', '--heat-3', '--heat-4',
    '--ok', '--bad', '--on-ok', '--on-bad', '--boss', '--shadow-pop',
  ]
  for (const theme of THEMES.filter(t => t !== 'midnight')) {
    const own = declarations(`[data-theme="${theme}"]`)
    for (const token of themeOwned) {
      assert.ok(own.has(token), `${theme} does not set ${token} — it would inherit Midnight's`)
    }
  }
})

test('surfaces are ordered, so a card always reads as a layer', () => {
  for (const theme of THEMES) {
    const [bg, card, raised] = ['--bg', '--card', '--raised'].map(t => luminance(resolve(theme, t)))
    const dark = bg < 0.2
    // Dark themes lift each layer; light themes are the other way round for
    // `raised`, which is a recessed tone on white rather than a lifted one.
    assert.ok(dark ? card > bg : card >= bg, `${theme}: --card does not separate from --bg`)
    assert.ok(Math.abs(card - raised) > 0.002, `${theme}: --raised is indistinguishable from --card`)
  }
})

test('the theme-invariant learning ramp carries its own labels', () => {
  // These five colours are the same in every theme because they mean something
  // (stage 1 = shakiest, stage 5 = nearly known), so they are checked once
  // rather than per theme. The ink flips partway up the ramp — see the comment
  // on .word-status in style.css.
  const RAMP: [fill: string, ink: string, stage: number][] = [
    ['#c14b4b', '#ffffff', 1],
    ['#c1774b', '#14140f', 2],
    ['#b8a12e', '#14140f', 3],
    ['#8fa32e', '#14140f', 4],
    ['#5d9e4a', '#14140f', 5],
  ]
  for (const [fill, ink, stage] of RAMP) {
    const ratio = contrast(ink, fill)
    assert.ok(ratio >= 4.5, `stage ${stage}: ${ink} on ${fill} is ${ratio.toFixed(2)}:1`)
  }
  // And the fills must stay distinguishable from each other, or the ramp stops
  // conveying an order.
  for (let i = 1; i < RAMP.length; i++) {
    const step = Math.abs(luminance(RAMP[i][0]) - luminance(RAMP[i - 1][0]))
    assert.ok(step > 0.004, `stages ${i} and ${i + 1} are the same weight`)
  }
})
