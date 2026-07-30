import { ACHIEVEMENTS, type Achievement } from './gamify'

/**
 * The badge shelf.
 *
 * The game already unlocked achievements and then did nothing with them — they
 * flashed once on a summary screen and were never seen again. A shelf is the
 * point of an achievement: something to look at, with the next tier visible so
 * it reads as a ladder rather than a scoreboard.
 *
 * Tiered badges are DERIVED from totals rather than stored as flags. That
 * matters for two reasons. A derived badge is always correct — no migration, no
 * drift if the underlying counters are ever recomputed — and it can show
 * progress toward the next tier, which a boolean cannot. The one-off
 * achievements stay stored, because "a session without a single mistake" is a
 * moment that happened and cannot be recovered from any total.
 *
 * Pure, like the rest of utils/grammar/.
 */

export type BadgeFamily = 'streak' | 'items' | 'concepts' | 'words' | 'minutes'

export interface BadgeTier {
  /** Value at which this tier is earned. */
  at: number
  /** Polish, matching the ranks and the existing achievements. */
  titleDe: string
}

export interface BadgeFamilySpec {
  family: BadgeFamily
  /**
   * Icon name from entrypoints/app/icons.ts. A plain string on purpose: this
   * module must not import from entrypoints, or it stops being testable under
   * `node --test`.
   */
  icon: string
  labelDe: string
  /** Ascending. */
  tiers: BadgeTier[]
}

/**
 * Five families, three tiers each.
 *
 * Three rather than five because a ladder you can see the top of is motivating
 * and one you cannot is wallpaper. The top tier of each is deliberately a real
 * commitment — 100 days, 5000 items, all 41 concepts — so the shelf is not
 * finished in a fortnight.
 */
export const BADGE_FAMILIES: BadgeFamilySpec[] = [
  {
    family: 'streak',
    icon: 'flame',
    labelDe: 'Tage in Folge',
    tiers: [
      { at: 7, titleDe: 'Tydzień' },
      { at: 30, titleDe: 'Miesiąc' },
      { at: 100, titleDe: 'Setka' },
    ],
  },
  {
    family: 'items',
    icon: 'bolt',
    labelDe: 'Aufgaben gelöst',
    tiers: [
      { at: 100, titleDe: 'Uczeń' },
      { at: 1000, titleDe: 'Rzemieślnik' },
      { at: 5000, titleDe: 'Mistrz' },
    ],
  },
  {
    family: 'concepts',
    icon: 'grammar',
    labelDe: 'Themen gemeistert',
    tiers: [
      { at: 5, titleDe: 'Fundament' },
      { at: 15, titleDe: 'Konstrukcja' },
      { at: 41, titleDe: 'Cała gramatyka' },
    ],
  },
  {
    family: 'words',
    icon: 'book',
    labelDe: 'Wörter im Training',
    tiers: [
      { at: 50, titleDe: 'Słownik' },
      { at: 250, titleDe: 'Biblioteka' },
      { at: 1000, titleDe: 'Tysiąc słów' },
    ],
  },
  {
    family: 'minutes',
    icon: 'clock',
    labelDe: 'Minuten geübt',
    tiers: [
      { at: 60, titleDe: 'Godzina' },
      { at: 600, titleDe: 'Dziesięć godzin' },
      { at: 3000, titleDe: 'Pięćdziesiąt godzin' },
    ],
  },
]

export interface BadgeTotals {
  /** Longest streak reached, not the current one — a badge is not lost. */
  bestStreak: number
  items: number
  /** Concepts at mastery >= 0.85 with an interval of three weeks or more. */
  conceptsMastered: number
  /** Vocabulary cards that exist at all — every one has been drilled once. */
  words: number
  minutes: number
}

export interface Badge {
  family: BadgeFamily
  icon: string
  labelDe: string
  /** 0 when none of the tiers is earned yet. */
  tier: number
  tiers: number
  /** The earned tier's name, or the next one's when nothing is earned yet. */
  titleDe: string
  earned: boolean
  value: number
  /** Undefined once the top tier is reached. */
  nextAt?: number
  /** 0..1 toward the next tier; 1 when the family is complete. */
  fraction: number
}

function valueFor(family: BadgeFamily, t: BadgeTotals): number {
  switch (family) {
    case 'streak': return t.bestStreak
    case 'items': return t.items
    case 'concepts': return t.conceptsMastered
    case 'words': return t.words
    case 'minutes': return t.minutes
  }
}

/**
 * One badge per family, showing the highest tier earned and the distance to the
 * next.
 *
 * Progress is measured from the LAST earned threshold rather than from zero, so
 * a bar at 90 % means "nearly the next tier" rather than "nearly 5000 items"
 * — the second reading makes every bar look empty for months.
 */
export function badges(totals: BadgeTotals): Badge[] {
  return BADGE_FAMILIES.map((spec) => {
    const value = valueFor(spec.family, totals)
    let tier = 0
    for (const t of spec.tiers) if (value >= t.at) tier++

    const earned = tier > 0
    const next = spec.tiers[tier]
    const floor = tier > 0 ? spec.tiers[tier - 1].at : 0
    const fraction = next
      ? Math.max(0, Math.min(1, (value - floor) / (next.at - floor)))
      : 1

    return {
      family: spec.family,
      icon: spec.icon,
      labelDe: spec.labelDe,
      tier,
      tiers: spec.tiers.length,
      titleDe: earned ? spec.tiers[tier - 1].titleDe : spec.tiers[0].titleDe,
      earned,
      value,
      nextAt: next?.at,
      fraction,
    }
  })
}

/**
 * The one-off achievements, as a stable list with an earned flag.
 *
 * `streak-7` and `streak-30` are excluded: the streak FAMILY covers the same
 * ground with a visible next tier, and showing both would put the same
 * accomplishment on the shelf twice. They stay in ACHIEVEMENTS so existing
 * stored ids remain meaningful and the summary can still announce them.
 */
const STREAK_ACHIEVEMENTS = new Set(['streak-7', 'streak-30'])

export interface MomentBadge extends Achievement {
  earned: boolean
}

export function moments(unlocked: string[]): MomentBadge[] {
  const have = new Set(unlocked)
  return ACHIEVEMENTS
    .filter(a => !STREAK_ACHIEVEMENTS.has(a.id))
    .map(a => ({ ...a, earned: have.has(a.id) }))
}

/** Everything the shelf renders, plus a one-line summary for its header. */
export interface Shelf {
  tiered: Badge[]
  moments: MomentBadge[]
  /** Tiers earned across all families. */
  earned: number
  /** Tiers available. */
  total: number
}

export function shelf(totals: BadgeTotals, unlocked: string[]): Shelf {
  const tiered = badges(totals)
  const m = moments(unlocked)
  return {
    tiered,
    moments: m,
    earned: tiered.reduce((n, b) => n + b.tier, 0) + m.filter(x => x.earned).length,
    total: tiered.reduce((n, b) => n + b.tiers, 0) + m.length,
  }
}
