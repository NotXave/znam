/**
 * Inline SVG icons.
 *
 * These replace the emoji the app used to lean on. Emoji were the wrong tool
 * for three reasons: every platform draws them differently (🦬 is a different
 * animal on Windows than on Linux), they cannot take the theme's colour, and
 * they sit at a scale and weight nothing else in the interface shares — which
 * is most of what made the old screens read as assembled rather than designed.
 *
 * One system, strictly: a 24×24 grid, 1.5 px strokes, round caps and joins, no
 * fills except where a shape genuinely needs one. Everything is `currentColor`,
 * so an icon inherits its colour from the text beside it and re-colours with
 * the theme for free.
 *
 * No asset files and no icon dependency — the whole set is a few hundred bytes
 * of markup, consistent with the rest of this extension.
 */

export type IconName =
  | 'zubr'
  | 'flame'
  | 'freeze'
  | 'book'
  | 'grammar'
  | 'target'
  | 'trophy'
  | 'medal'
  | 'lesson'
  | 'boss'
  | 'spark'
  | 'check'
  | 'cross'
  | 'clock'
  | 'bolt'
  | 'arrow-right'
  | 'undo'
  | 'download'
  | 'moon'
  | 'sun'
  | 'lock'
  | 'mark'

/** Path/shape bodies, drawn on a 24×24 grid. `zubr` is defined separately. */
const BODY: Record<Exclude<IconName, 'zubr'>, string> = {
  // A flame as two nested strokes — the inner one is what keeps it from
  // reading as a leaf at 14 px.
  flame:
    '<path d="M12 3c3.4 3 5.5 5.6 5.5 8.6a5.5 5.5 0 0 1-11 0C6.5 9.4 8 7.3 10 5.6c0 1.7.6 2.8 1.6 3.3.7-2 .8-3.8.4-5.9Z"/>' +
    '<path d="M12 20a2.6 2.6 0 0 1-2.6-2.6c0-1.3.9-2.3 2.6-3.9 1.7 1.6 2.6 2.6 2.6 3.9A2.6 2.6 0 0 1 12 20Z"/>',
  // The banked streak freeze: a six-spoke crystal.
  freeze:
    '<path d="M12 3v18M4.2 7.5l15.6 9M19.8 7.5l-15.6 9"/>' +
    '<path d="M12 6.8 9.9 5M12 6.8 14.1 5M12 17.2 9.9 19M12 17.2 14.1 19"/>',
  // Słówka: an open book, spine implied by the centre stroke.
  book:
    '<path d="M12 6.2C10.3 4.9 8 4.3 4.5 4.3v13.4c3.5 0 5.8.6 7.5 2 1.7-1.4 4-2 7.5-2V4.3c-3.5 0-5.8.6-7.5 1.9Z"/>' +
    '<path d="M12 6.2v13.5"/>',
  // Trening: a paradigm table, which is literally what the game drills.
  grammar:
    '<rect x="4" y="4.5" width="16" height="15" rx="1.5"/>' +
    '<path d="M4 9.2h16M9.5 9.2v10.3M4 14.4h16"/>',
  target:
    '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/>',
  trophy:
    '<path d="M8 4.5h8v4.2a4 4 0 0 1-8 0V4.5Z"/>' +
    '<path d="M8 5.6H5.4v1.5A3 3 0 0 0 8 10M16 5.6h2.6v1.5a3 3 0 0 1-2.6 2.9"/>' +
    '<path d="M12 12.7v3.1M8.6 19.5h6.8l-.7-3.7H9.3l-.7 3.7Z"/>',
  // The ribbon needs its top bar. Without it the two straps read as ears and
  // the whole thing turns into an animal.
  medal:
    '<circle cx="12" cy="15" r="4.6"/>' +
    '<path d="M12 12.9l.85 1.75 1.9.28-1.4 1.35.35 1.9L12 17.3l-1.7.88.35-1.9-1.4-1.35 1.9-.28.85-1.75Z"/>' +
    '<path d="M6.4 4.5h11.2M9.2 10.9 7.6 4.5M14.8 10.9l1.6-6.4"/>',
  lesson:
    '<path d="M6 4.5h9.5L19 8v11.5H6V4.5Z"/><path d="M15 4.5V8h4"/><path d="M8.8 12h7M8.8 15.4h4.6"/>',
  // The boss round is your weakest topic, so it is a summit rather than a
  // monster: something to get over, not to fight.
  boss:
    '<path d="M3.5 19.5 9.6 7.8l3.2 5.6 1.8-2.6 5.9 8.7H3.5Z"/>' +
    '<path d="M9.6 7.8 8.2 5.2h3l-1.6 2.6"/>',
  spark:
    '<path d="M12 3.5l1.9 5.1 5.1 1.9-5.1 1.9L12 17.5l-1.9-5.1L5 10.5l5.1-1.9L12 3.5Z"/>' +
    '<path d="M18.8 16.4l.7 1.9 1.9.7-1.9.7-.7 1.9-.7-1.9-1.9-.7 1.9-.7.7-1.9Z"/>',
  check: '<path d="M4.8 12.6l4.6 4.6L19.2 7.4"/>',
  cross: '<path d="M6.2 6.2l11.6 11.6M17.8 6.2 6.2 17.8"/>',
  clock: '<circle cx="12" cy="12" r="8"/><path d="M12 7.6V12l3.2 2"/>',
  bolt: '<path d="M13.6 3 5.8 13.4h5l-.8 7.6 8-10.6h-5L13.6 3Z"/>',
  'arrow-right': '<path d="M4.5 12h14M13 6.5l5.5 5.5L13 17.5"/>',
  undo: '<path d="M4.5 9.5h9a5.5 5.5 0 0 1 0 11H8"/><path d="M8 5 4.5 9.5 8 14"/>',
  download: '<path d="M12 4v11M7.5 10.5 12 15l4.5-4.5"/><path d="M4.8 19.5h14.4"/>',
  moon: '<path d="M19 14.6A8 8 0 0 1 9.4 5a8 8 0 1 0 9.6 9.6Z"/>',
  sun:
    '<circle cx="12" cy="12" r="4.2"/>' +
    '<path d="M12 3v2.2M12 18.8V21M3 12h2.2M18.8 12H21M5.6 5.6l1.6 1.6M16.8 16.8l1.6 1.6M18.4 5.6l-1.6 1.6M7.2 16.8l-1.6 1.6"/>',
  lock: '<rect x="5.5" y="10.5" width="13" height="9" rx="1.5"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/>',
  // The wordmark: a page with its corner turned, which is what znam is about.
  mark: '<path d="M5 3.5h9L19.5 9v11.5H5V3.5Z"/><path d="M14 3.5V9h5.5"/><path d="M8.6 12.4h6.8M8.6 16h4.4"/>',
}

/**
 * Żubr, drawn.
 *
 * The mascot needed to be a drawing rather than an emoji more than anything
 * else did: he appears beside every piece of feedback in the game, so a glyph
 * that renders as a generic quadruped on one platform and a cartoon on another
 * undermines the whole screen. Front view, so he reads at 20 px: horns out to
 * the sides, the heavy woolly forehead Polish bison are known for, a narrower
 * muzzle below it.
 */
const ZUBR =
  // The horns do the identifying. They leave the temples, sweep OUT past the
  // width of the skull, then hook upward — nothing else in the icon set is
  // wider than it is tall, which is what makes him recognisable at 14 px.
  '<path d="M7.6 9.4Q3.1 9 3.4 5.1"/>' +
  '<path d="M16.4 9.4Q20.9 9 20.6 5.1"/>' +
  // The woolly forehead: the widest part of the head, and the tallest.
  '<path d="M7.7 12.3C7.1 10.7 7 9 7.5 7.6 8.3 5.4 10 4.2 12 4.2s3.7 1.2 4.5 3.4c.5 1.4.4 3.1-.2 4.7"/>' +
  // cheeks narrowing into the muzzle
  '<path d="M7.7 12.3c.3 1 .8 1.6 1.5 1.9M16.3 12.3c-.3 1-.8 1.6-1.5 1.9"/>' +
  // A broad, boxy muzzle — narrower than the forehead but not by much, which
  // is what separates a bison from a goat.
  '<path d="M9.2 14.2h5.6v3.2a2.8 2.8 0 0 1-5.6 0Z"/>' +
  // the beard European bison are known for
  '<path d="M12 20.2v1.4"/>' +
  // eyes and nostrils, as dots
  '<path d="M9.3 10.3h.01M14.7 10.3h.01" stroke-width="2.2"/>' +
  '<path d="M11 16.4h.01M13 16.4h.01" stroke-width="1.7"/>'

function svg(body: string, size: number, extraClass = ''): string {
  return (
    `<svg class="ic${extraClass ? ' ' + extraClass : ''}" width="${size}" height="${size}" ` +
    'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" ' +
    'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' +
    `${body}</svg>`
  )
}

/**
 * An icon as a markup string.
 *
 * Returns a string rather than an element because every screen in this app is
 * built by assembling HTML — handing back a node would mean rewriting all of
 * them around it.
 *
 * Icons are decoration next to a label, never the label itself, so they are
 * `aria-hidden`: a screen reader should read "3 Tage Serie", not "flame 3 Tage
 * Serie".
 */
export function icon(name: IconName, size = 16, extraClass = ''): string {
  return name === 'zubr' ? zubr(size, extraClass) : svg(BODY[name], size, extraClass)
}

/**
 * Fill every `<i data-icon="…">` placeholder in the static markup.
 *
 * index.html is hand-written HTML with no build-time templating, so the icons
 * cannot be inlined there. A placeholder keeps the markup readable — `<i
 * data-icon="flame">` says what it is at a glance, which an inline 200-byte
 * path would not — and this runs once at startup.
 */
export function mountIcons(root: ParentNode = document): void {
  for (const el of root.querySelectorAll<HTMLElement>('[data-icon]')) {
    const name = el.dataset.icon as IconName
    if (!name) continue
    el.innerHTML = name === 'zubr'
      ? zubr(Number(el.dataset.size) || 22, '')
      : icon(name, Number(el.dataset.size) || 16)
  }
}

/** The mascot. `tr-zubr` sizes and colours him; `tr-zubr-big` is the hero. */
export function zubr(size = 22, extraClass = 'tr-zubr'): string {
  return svg(ZUBR, size, extraClass)
}

/**
 * Żubr with a line of his own dialogue.
 *
 * Used everywhere feedback is shown, so it exists to keep the mark and the
 * text from drifting apart across three call sites.
 */
export function zubrSays(line: string, size = 20): string {
  return `${zubr(size)}<span>${line}</span>`
}
