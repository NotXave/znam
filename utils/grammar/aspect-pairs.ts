/**
 * Polish aspect pairs — hand-verified.
 *
 * Nearly every Polish verb comes in two: an imperfective (the process) and a
 * perfective (the completed act). It is the distinction German has no direct
 * grammar for, and the README already flags it as a known limitation of the
 * reader, since *robić* and *zrobić* are separate lemmas that never share
 * knowledge.
 *
 * A prefix heuristic proposes candidates but cannot be trusted alone: it offers
 * `posiadać/siadać` (to own vs to sit down) and `pożyczyć/życzyć` (to lend vs
 * to wish) with the same confidence as the real pairs. Every entry below is
 * checked by hand.
 */

export interface AspectPair {
  /** Imperfective — the process, the habit, the ongoing action. */
  impf: string
  /** Perfective — the completed, one-off act. */
  perf: string
  /** German gloss, shared by both members. */
  de: string
  /**
   * True when the pair is built by prefixing (robić → zrobić) rather than by
   * a stem change (dawać → dać). Prefix pairs are where the aspect lesson and
   * the prefix lesson meet.
   */
  byPrefix: boolean
}

export const ASPECT_PAIRS: AspectPair[] = [
  // ── prefix pairs: the perfective just adds a prefix ──
  { impf: 'robić', perf: 'zrobić', de: 'machen, tun', byPrefix: true },
  { impf: 'pisać', perf: 'napisać', de: 'schreiben', byPrefix: true },
  { impf: 'czytać', perf: 'przeczytać', de: 'lesen', byPrefix: true },
  { impf: 'jeść', perf: 'zjeść', de: 'essen', byPrefix: true },
  { impf: 'pić', perf: 'wypić', de: 'trinken', byPrefix: true },
  { impf: 'widzieć', perf: 'zobaczyć', de: 'sehen', byPrefix: false },
  { impf: 'słuchać', perf: 'posłuchać', de: 'zuhören', byPrefix: true },
  { impf: 'czekać', perf: 'poczekać', de: 'warten', byPrefix: true },
  { impf: 'dziękować', perf: 'podziękować', de: 'danken', byPrefix: true },
  { impf: 'gotować', perf: 'ugotować', de: 'kochen', byPrefix: true },
  { impf: 'myć', perf: 'umyć', de: 'waschen', byPrefix: true },
  { impf: 'płacić', perf: 'zapłacić', de: 'bezahlen', byPrefix: true },
  { impf: 'pytać', perf: 'zapytać', de: 'fragen', byPrefix: true },
  { impf: 'dzwonić', perf: 'zadzwonić', de: 'anrufen', byPrefix: true },
  { impf: 'budować', perf: 'zbudować', de: 'bauen', byPrefix: true },
  { impf: 'liczyć', perf: 'policzyć', de: 'zählen, rechnen', byPrefix: true },
  { impf: 'próbować', perf: 'spróbować', de: 'versuchen, probieren', byPrefix: true },
  { impf: 'tracić', perf: 'stracić', de: 'verlieren', byPrefix: true },
  { impf: 'kończyć', perf: 'skończyć', de: 'beenden', byPrefix: true },
  { impf: 'ratować', perf: 'uratować', de: 'retten', byPrefix: true },
  { impf: 'tłumaczyć', perf: 'wytłumaczyć', de: 'erklären', byPrefix: true },
  { impf: 'rozumieć', perf: 'zrozumieć', de: 'verstehen', byPrefix: true },
  { impf: 'pamiętać', perf: 'zapamiętać', de: 'sich merken', byPrefix: true },
  { impf: 'chorować', perf: 'zachorować', de: 'krank sein / werden', byPrefix: true },
  { impf: 'ginąć', perf: 'zginąć', de: 'umkommen, verschwinden', byPrefix: true },
  { impf: 'trzymać', perf: 'potrzymać', de: 'halten', byPrefix: true },
  { impf: 'całować', perf: 'pocałować', de: 'küssen', byPrefix: true },
  { impf: 'martwić', perf: 'zmartwić', de: 'beunruhigen', byPrefix: true },
  { impf: 'palić', perf: 'zapalić', de: 'rauchen; anzünden', byPrefix: true },
  { impf: 'grać', perf: 'zagrać', de: 'spielen', byPrefix: true },
  { impf: 'śpiewać', perf: 'zaśpiewać', de: 'singen', byPrefix: true },
  { impf: 'tańczyć', perf: 'zatańczyć', de: 'tanzen', byPrefix: true },
  { impf: 'dziwić', perf: 'zdziwić', de: 'wundern', byPrefix: true },
  { impf: 'ufać', perf: 'zaufać', de: 'vertrauen', byPrefix: true },
  { impf: 'golić', perf: 'ogolić', de: 'rasieren', byPrefix: true },
  { impf: 'kraść', perf: 'ukraść', de: 'stehlen', byPrefix: true },
  { impf: 'ważyć', perf: 'zważyć', de: 'wiegen', byPrefix: true },

  // ── stem pairs: the two members differ inside the word ──
  { impf: 'dawać', perf: 'dać', de: 'geben', byPrefix: false },
  { impf: 'brać', perf: 'wziąć', de: 'nehmen', byPrefix: false },
  { impf: 'mówić', perf: 'powiedzieć', de: 'sagen', byPrefix: false },
  { impf: 'kupować', perf: 'kupić', de: 'kaufen', byPrefix: false },
  { impf: 'zaczynać', perf: 'zacząć', de: 'anfangen', byPrefix: false },
  { impf: 'spotykać', perf: 'spotkać', de: 'treffen', byPrefix: false },
  { impf: 'otwierać', perf: 'otworzyć', de: 'öffnen', byPrefix: false },
  { impf: 'zamykać', perf: 'zamknąć', de: 'schließen', byPrefix: false },
  { impf: 'wybierać', perf: 'wybrać', de: 'auswählen', byPrefix: false },
  { impf: 'pokazywać', perf: 'pokazać', de: 'zeigen', byPrefix: false },
  { impf: 'zapominać', perf: 'zapomnieć', de: 'vergessen', byPrefix: false },
  { impf: 'wstawać', perf: 'wstać', de: 'aufstehen', byPrefix: false },
  { impf: 'siadać', perf: 'usiąść', de: 'sich setzen', byPrefix: false },
  { impf: 'znajdować', perf: 'znaleźć', de: 'finden', byPrefix: false },
  { impf: 'zostawać', perf: 'zostać', de: 'bleiben, werden', byPrefix: false },
  { impf: 'padać', perf: 'paść', de: 'fallen', byPrefix: false },
  { impf: 'rzucać', perf: 'rzucić', de: 'werfen', byPrefix: false },
  { impf: 'wracać', perf: 'wrócić', de: 'zurückkommen', byPrefix: false },
  { impf: 'przychodzić', perf: 'przyjść', de: 'kommen', byPrefix: false },
  { impf: 'wychodzić', perf: 'wyjść', de: 'hinausgehen', byPrefix: false },
  { impf: 'odpowiadać', perf: 'odpowiedzieć', de: 'antworten', byPrefix: false },
  { impf: 'sprzedawać', perf: 'sprzedać', de: 'verkaufen', byPrefix: false },
  { impf: 'umierać', perf: 'umrzeć', de: 'sterben', byPrefix: false },
]

export const PAIR_BY_IMPF = new Map(ASPECT_PAIRS.map(p => [p.impf, p]))
export const PAIR_BY_PERF = new Map(ASPECT_PAIRS.map(p => [p.perf, p]))

/** The pair a verb belongs to, whichever member was given. */
export function aspectPairOf(verb: string): AspectPair | undefined {
  return PAIR_BY_IMPF.get(verb) ?? PAIR_BY_PERF.get(verb)
}

/** The other member of the pair. */
export function aspectPartner(verb: string): string | undefined {
  const pair = aspectPairOf(verb)
  if (!pair) return undefined
  return pair.impf === verb ? pair.perf : pair.impf
}
