/**
 * Hand-authored closed-class paradigms.
 *
 * UniMorph carries no pronouns, numerals or prepositions at all, so these would
 * be missing regardless — but hand-authoring is the right call here even where
 * data exists, because prepositions need CASE GOVERNMENT (do → Genitiv), and no
 * morphology dump records that. Preposition→case is also one of the highest-value
 * things the game teaches, so it deserves curated data.
 */

export type Case = 'nom' | 'gen' | 'dat' | 'acc' | 'ins' | 'loc' | 'voc'

export interface Preposition {
  pl: string
  de: string
  /** Cases this preposition can govern. Several are genuinely ambiguous. */
  governs: Case[]
  /** Disambiguating note, shown as feedback when more than one case is listed. */
  noteDe?: string
}

export const PREPOSITIONS: Preposition[] = [
  { pl: 'do', de: 'zu / nach / in', governs: ['gen'] },
  { pl: 'od', de: 'von / seit', governs: ['gen'] },
  { pl: 'bez', de: 'ohne', governs: ['gen'] },
  { pl: 'dla', de: 'für', governs: ['gen'] },
  { pl: 'obok', de: 'neben', governs: ['gen'] },
  { pl: 'u', de: 'bei', governs: ['gen'] },
  { pl: 'przez', de: 'durch / über', governs: ['acc'] },
  { pl: 'ku', de: 'in Richtung', governs: ['dat'] },
  { pl: 'przeciw', de: 'gegen', governs: ['dat'] },
  {
    pl: 'z',
    de: 'mit / aus',
    governs: ['ins', 'gen'],
    noteDe: '„mit" → Instrumental (z kotem), „aus" → Genitiv (z domu).',
  },
  { pl: 'nad', de: 'über', governs: ['ins'], noteDe: 'Mit Bewegung stattdessen Akkusativ.' },
  { pl: 'pod', de: 'unter', governs: ['ins'], noteDe: 'Mit Bewegung stattdessen Akkusativ.' },
  { pl: 'przed', de: 'vor', governs: ['ins'] },
  { pl: 'między', de: 'zwischen', governs: ['ins'] },
  {
    pl: 'w',
    de: 'in',
    governs: ['loc'],
    noteDe: 'Ort → Lokativ (w domu). Richtung → Akkusativ (w góry).',
  },
  {
    pl: 'na',
    de: 'auf / nach',
    governs: ['loc', 'acc'],
    noteDe: 'Ort → Lokativ (na stole). Richtung → Akkusativ (na stół).',
  },
  { pl: 'o', de: 'über (Thema)', governs: ['loc'] },
  { pl: 'przy', de: 'bei / an', governs: ['loc'] },
]

/** Personal pronouns, nominative through instrumental. */
export const PERSONAL_PRONOUNS: Record<string, Record<string, string>> = {
  ja: { nom: 'ja', gen: 'mnie', dat: 'mi', acc: 'mnie', ins: 'mną', loc: 'mnie' },
  ty: { nom: 'ty', gen: 'ciebie', dat: 'ci', acc: 'ciebie', ins: 'tobą', loc: 'tobie' },
  on: { nom: 'on', gen: 'jego', dat: 'jemu', acc: 'jego', ins: 'nim', loc: 'nim' },
  ona: { nom: 'ona', gen: 'jej', dat: 'jej', acc: 'ją', ins: 'nią', loc: 'niej' },
  ono: { nom: 'ono', gen: 'jego', dat: 'jemu', acc: 'je', ins: 'nim', loc: 'nim' },
  my: { nom: 'my', gen: 'nas', dat: 'nam', acc: 'nas', ins: 'nami', loc: 'nas' },
  wy: { nom: 'wy', gen: 'was', dat: 'wam', acc: 'was', ins: 'wami', loc: 'was' },
  oni: { nom: 'oni', gen: 'ich', dat: 'im', acc: 'ich', ins: 'nimi', loc: 'nich' },
  one: { nom: 'one', gen: 'ich', dat: 'im', acc: 'je', ins: 'nimi', loc: 'nich' },
}

/** być — irregular, ubiquitous, and needed from the very first lesson. */
export const BYC = {
  pres: { p1sg: 'jestem', p2sg: 'jesteś', p3sg: 'jest', p1pl: 'jesteśmy', p2pl: 'jesteście', p3pl: 'są' },
  past: {
    p1sgM: 'byłem', p1sgF: 'byłam', p2sgM: 'byłeś', p2sgF: 'byłaś',
    p3sgM: 'był', p3sgF: 'była', p3sgN: 'było',
    p1plM: 'byliśmy', p1plF: 'byłyśmy', p3plM: 'byli', p3plF: 'były',
  },
  fut: { p1sg: 'będę', p2sg: 'będziesz', p3sg: 'będzie', p1pl: 'będziemy', p2pl: 'będziecie', p3pl: 'będą' },
}

/** Cardinal numerals 1–10 in the nominative, with their gender variants. */
export const NUMERALS: { n: number; forms: Record<string, string> }[] = [
  { n: 1, forms: { m: 'jeden', f: 'jedna', n: 'jedno' } },
  { n: 2, forms: { m: 'dwa', f: 'dwie', n: 'dwa' } },
  { n: 3, forms: { m: 'trzy', f: 'trzy', n: 'trzy' } },
  { n: 4, forms: { m: 'cztery', f: 'cztery', n: 'cztery' } },
  { n: 5, forms: { m: 'pięć', f: 'pięć', n: 'pięć' } },
  { n: 6, forms: { m: 'sześć', f: 'sześć', n: 'sześć' } },
  { n: 7, forms: { m: 'siedem', f: 'siedem', n: 'siedem' } },
  { n: 8, forms: { m: 'osiem', f: 'osiem', n: 'osiem' } },
  { n: 9, forms: { m: 'dziewięć', f: 'dziewięć', n: 'dziewięć' } },
  { n: 10, forms: { m: 'dziesięć', f: 'dziesięć', n: 'dziesięć' } },
]

export const CASE_NAMES_DE: Record<Case, string> = {
  nom: 'Nominativ',
  gen: 'Genitiv',
  dat: 'Dativ',
  acc: 'Akkusativ',
  ins: 'Instrumental',
  loc: 'Lokativ',
  voc: 'Vokativ',
}
