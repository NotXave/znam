/**
 * Polish verb prefixes — hand-verified.
 *
 * This is the single highest-leverage thing a German speaker can learn about
 * Polish verbs, and almost nobody is told it transfers: the two languages built
 * the same machine. `pod·pisać` is `unter·schreiben`, morpheme for morpheme.
 * `wy·jść` is `aus·gehen`. `przy·jechać` is `an·kommen`.
 *
 * Candidates are mined by scripts/build-prefix-families.mjs, but every entry
 * here is checked by hand. The miner cannot tell a real derivation from a
 * coincidence — it happily proposes `posiadać` under `siadać` (to own vs to sit
 * down) — and a wrong gloss teaches a wrong word.
 */

export interface Prefix {
  /** The prefix itself, without a hyphen. */
  id: string
  /** German prefix(es) that do the same job. */
  deTwin: string
  /** One-line core meaning, in German. */
  meaningDe: string
  /** A pair where the parallel is exact enough to be worth showing. */
  exampleP1: string
  exampleDe: string
}

export const PREFIXES: Prefix[] = [
  {
    id: 'wy',
    deTwin: 'aus-, hinaus-',
    meaningDe: 'nach außen, heraus — und oft „bis zu Ende"',
    exampleP1: 'wyjść',
    exampleDe: 'ausgehen, hinausgehen',
  },
  {
    id: 'w',
    deTwin: 'ein-, hinein-',
    meaningDe: 'nach innen, hinein',
    exampleP1: 'wejść',
    exampleDe: 'eingehen, hineingehen',
  },
  {
    id: 'przy',
    deTwin: 'an-, herbei-',
    meaningDe: 'Annäherung, Ankunft — etwas kommt zu dir',
    exampleP1: 'przyjechać',
    exampleDe: 'ankommen',
  },
  {
    id: 'od',
    deTwin: 'ab-, weg-, ent-',
    meaningDe: 'Entfernung, weg von etwas — auch „zurück" (antworten)',
    exampleP1: 'odejść',
    exampleDe: 'weggehen',
  },
  {
    id: 'do',
    deTwin: 'hinzu-, heran-',
    meaningDe: 'bis zum Ziel, etwas ergänzen',
    exampleP1: 'dojechać',
    exampleDe: 'hinkommen, erreichen',
  },
  {
    id: 'prze',
    deTwin: 'über-, durch-, um-',
    meaningDe: 'hindurch, hinüber — oder „noch einmal, anders"',
    exampleP1: 'przepisać',
    exampleDe: 'abschreiben, umschreiben',
  },
  {
    id: 'pod',
    deTwin: 'unter-, heran-',
    meaningDe: 'darunter — oder eine vorsichtige Annäherung',
    exampleP1: 'podpisać',
    exampleDe: 'unterschreiben',
  },
  {
    id: 'nad',
    deTwin: 'über-, heran-',
    meaningDe: 'darüber, oberhalb — oder „herannahen"',
    exampleP1: 'nadchodzić',
    exampleDe: 'herannahen',
  },
  {
    id: 'roz',
    deTwin: 'zer-, auseinander-',
    meaningDe: 'auseinander, in alle Richtungen',
    exampleP1: 'rozdać',
    exampleDe: 'austeilen, verteilen',
  },
  {
    id: 'za',
    deTwin: 'zu-, ver-, be-',
    meaningDe: 'hinter etwas, Beginn einer Handlung, oder Abschluss',
    exampleP1: 'zapisać',
    exampleDe: 'aufschreiben, notieren',
  },
  {
    id: 'na',
    deTwin: 'auf-, an-',
    meaningDe: 'auf eine Oberfläche — oder eine Menge von etwas',
    exampleP1: 'napisać',
    exampleDe: 'schreiben (fertig)',
  },
  {
    id: 'po',
    deTwin: '— (oft nur vollendend)',
    meaningDe: 'macht das Verb vollendet, oder „ein bisschen, eine Weile"',
    exampleP1: 'poczekać',
    exampleDe: 'eine Weile warten',
  },
  {
    id: 'u',
    deTwin: 'ent-, weg-',
    meaningDe: 'Vollendung, oder etwas entfernen',
    exampleP1: 'uciec',
    exampleDe: 'entkommen, fliehen',
  },
  {
    id: 'z',
    deTwin: 'zusammen-, herunter-',
    meaningDe: 'zusammen, herab — sehr oft einfach vollendend',
    exampleP1: 'zrobić',
    exampleDe: 'machen (fertig)',
  },
  {
    id: 'ob',
    deTwin: 'um-, be-',
    meaningDe: 'herum, rundherum',
    exampleP1: 'obejść',
    exampleDe: 'herumgehen',
  },
  {
    // Spelling variant of z-, used before voiceless consonants.
    id: 's',
    deTwin: 'herunter-, zusammen-',
    meaningDe: 'Schreibvariante von z- vor stimmlosen Lauten: herab, zusammen',
    exampleP1: 'schodzić',
    exampleDe: 'hinuntergehen',
  },
  {
    // Spelling variant of z-, used before awkward consonant clusters.
    id: 'ze',
    deTwin: 'zusammen-',
    meaningDe: 'Schreibvariante von z- vor Konsonantenhäufung: zusammen',
    exampleP1: 'zebrać',
    exampleDe: 'sammeln, einsammeln',
  },
  {
    id: 'przed',
    deTwin: 'vor-',
    meaningDe: 'davor — noch so ein exaktes Gegenstück zum Deutschen',
    exampleP1: 'przedstawić',
    exampleDe: 'vorstellen, darstellen',
  },
]

export const PREFIX_BY_ID = new Map(PREFIXES.map(p => [p.id, p]))

export interface FamilyMember {
  prefix: string
  verb: string
  /** German gloss — hand-written, since no dictionary in the repo supplies it. */
  de: string
}

export interface VerbFamily {
  base: string
  /** German gloss of the unprefixed base verb. */
  baseDe: string
  members: FamilyMember[]
}

/**
 * Curated families. Chosen for frequency and for how cleanly the prefix
 * meanings show through — these are the ones where the system is visible
 * rather than lexicalized beyond recognition.
 */
export const VERB_FAMILIES: VerbFamily[] = [
  {
    base: 'pisać',
    baseDe: 'schreiben',
    members: [
      { prefix: 'na', verb: 'napisać', de: 'schreiben (fertig)' },
      { prefix: 'pod', verb: 'podpisać', de: 'unterschreiben' },
      { prefix: 'za', verb: 'zapisać', de: 'aufschreiben, notieren' },
      { prefix: 'wy', verb: 'wypisać', de: 'ausschreiben, ausstellen' },
      { prefix: 'w', verb: 'wpisać', de: 'eintragen' },
      { prefix: 'prze', verb: 'przepisać', de: 'abschreiben, umschreiben' },
      { prefix: 'do', verb: 'dopisać', de: 'hinzuschreiben' },
      { prefix: 'od', verb: 'odpisać', de: 'zurückschreiben, antworten' },
      { prefix: 's', verb: 'spisać', de: 'auflisten, protokollieren' },
    ],
  },
  {
    base: 'jechać',
    baseDe: 'fahren',
    members: [
      { prefix: 'przy', verb: 'przyjechać', de: 'ankommen' },
      { prefix: 'po', verb: 'pojechać', de: 'losfahren, hinfahren' },
      { prefix: 'wy', verb: 'wyjechać', de: 'wegfahren, abreisen' },
      { prefix: 'prze', verb: 'przejechać', de: 'durchfahren, überfahren' },
      { prefix: 'od', verb: 'odjechać', de: 'abfahren' },
      { prefix: 'do', verb: 'dojechać', de: 'hinkommen, erreichen' },
      { prefix: 'w', verb: 'wjechać', de: 'hineinfahren' },
      { prefix: 'z', verb: 'zjechać', de: 'hinunterfahren' },
      { prefix: 'pod', verb: 'podjechać', de: 'heranfahren, vorfahren' },
    ],
  },
  {
    base: 'chodzić',
    baseDe: 'gehen (regelmäßig, hin und her)',
    members: [
      { prefix: 'wy', verb: 'wychodzić', de: 'hinausgehen' },
      { prefix: 'w', verb: 'wchodzić', de: 'hineingehen' },
      { prefix: 'przy', verb: 'przychodzić', de: 'kommen, ankommen' },
      { prefix: 'od', verb: 'odchodzić', de: 'weggehen' },
      { prefix: 'prze', verb: 'przechodzić', de: 'hinübergehen, durchgehen' },
      { prefix: 'do', verb: 'dochodzić', de: 'gelangen, erreichen' },
      { prefix: 'ob', verb: 'obchodzić', de: 'herumgehen; feiern' },
      { prefix: 'pod', verb: 'podchodzić', de: 'herantreten' },
      { prefix: 'nad', verb: 'nadchodzić', de: 'herannahen' },
    ],
  },
  {
    base: 'nieść',
    baseDe: 'tragen',
    members: [
      { prefix: 'przy', verb: 'przynieść', de: 'herbringen' },
      { prefix: 'prze', verb: 'przenieść', de: 'übertragen, versetzen' },
      { prefix: 'pod', verb: 'podnieść', de: 'anheben, hochheben' },
      { prefix: 'wy', verb: 'wynieść', de: 'hinaustragen' },
      { prefix: 'za', verb: 'zanieść', de: 'hinbringen' },
      { prefix: 'od', verb: 'odnieść', de: 'zurückbringen' },
      { prefix: 'w', verb: 'wnieść', de: 'hineintragen' },
      { prefix: 'z', verb: 'znieść', de: 'ertragen; abschaffen' },
    ],
  },
  {
    base: 'dać',
    baseDe: 'geben',
    members: [
      { prefix: 'od', verb: 'oddać', de: 'zurückgeben' },
      { prefix: 'po', verb: 'podać', de: 'reichen, angeben' },
      { prefix: 'wy', verb: 'wydać', de: 'ausgeben, herausgeben' },
      { prefix: 'do', verb: 'dodać', de: 'hinzufügen' },
      { prefix: 'za', verb: 'zadać', de: 'aufgeben (eine Aufgabe)' },
      { prefix: 'roz', verb: 'rozdać', de: 'austeilen, verteilen' },
    ],
  },
  {
    base: 'robić',
    baseDe: 'machen, tun',
    members: [
      { prefix: 'z', verb: 'zrobić', de: 'machen (fertig)' },
      { prefix: 'za', verb: 'zarobić', de: 'verdienen' },
      { prefix: 'prze', verb: 'przerobić', de: 'umarbeiten, durchnehmen' },
      { prefix: 'wy', verb: 'wyrobić', de: 'herstellen, erarbeiten' },
      { prefix: 'na', verb: 'narobić', de: 'anrichten, viel machen' },
      { prefix: 'do', verb: 'dorobić', de: 'dazuverdienen, nachmachen' },
    ],
  },
  {
    base: 'rzucić',
    baseDe: 'werfen',
    members: [
      { prefix: 'wy', verb: 'wyrzucić', de: 'hinauswerfen, wegwerfen' },
      { prefix: 'od', verb: 'odrzucić', de: 'ablehnen, zurückweisen' },
      { prefix: 'w', verb: 'wrzucić', de: 'hineinwerfen' },
      { prefix: 'po', verb: 'porzucić', de: 'verlassen, aufgeben' },
      { prefix: 'pod', verb: 'podrzucić', de: 'zuwerfen, unterschieben' },
      { prefix: 'z', verb: 'zrzucić', de: 'abwerfen' },
    ],
  },
  {
    base: 'prowadzić',
    baseDe: 'führen',
    members: [
      { prefix: 'w', verb: 'wprowadzić', de: 'einführen' },
      { prefix: 'wy', verb: 'wyprowadzić', de: 'hinausführen' },
      { prefix: 'prze', verb: 'przeprowadzić', de: 'durchführen' },
      { prefix: 'do', verb: 'doprowadzić', de: 'hinführen, bewirken' },
      { prefix: 's', verb: 'sprowadzić', de: 'herbeiholen, importieren' },
      { prefix: 'od', verb: 'odprowadzić', de: 'wegbringen, begleiten' },
      { prefix: 'przy', verb: 'przyprowadzić', de: 'herbringen (jemanden)' },
    ],
  },
  {
    base: 'mówić',
    baseDe: 'sprechen, sagen',
    members: [
      { prefix: 'za', verb: 'zamówić', de: 'bestellen' },
      { prefix: 'od', verb: 'odmówić', de: 'ablehnen, verweigern' },
      { prefix: 'u', verb: 'umówić', de: 'verabreden' },
      { prefix: 'na', verb: 'namówić', de: 'überreden' },
      { prefix: 'wy', verb: 'wymówić', de: 'aussprechen; kündigen' },
      { prefix: 'prze', verb: 'przemówić', de: 'eine Rede halten' },
    ],
  },
  {
    base: 'stawić',
    baseDe: 'stellen',
    members: [
      { prefix: 'po', verb: 'postawić', de: 'hinstellen' },
      { prefix: 'u', verb: 'ustawić', de: 'aufstellen, einstellen' },
      { prefix: 'wy', verb: 'wystawić', de: 'ausstellen' },
      { prefix: 'na', verb: 'nastawić', de: 'einstellen, aufsetzen' },
      { prefix: 'prze', verb: 'przestawić', de: 'umstellen' },
      { prefix: 'przed', verb: 'przedstawić', de: 'vorstellen, darstellen' },
    ],
  },
  {
    base: 'liczyć',
    baseDe: 'zählen, rechnen',
    members: [
      { prefix: 'po', verb: 'policzyć', de: 'zählen (fertig), berechnen' },
      { prefix: 'za', verb: 'zaliczyć', de: 'bestehen, anrechnen' },
      { prefix: 'prze', verb: 'przeliczyć', de: 'nachzählen, umrechnen' },
      { prefix: 'ob', verb: 'obliczyć', de: 'ausrechnen' },
      { prefix: 'roz', verb: 'rozliczyć', de: 'abrechnen' },
    ],
  },
  {
    base: 'brać',
    baseDe: 'nehmen',
    members: [
      { prefix: 'za', verb: 'zabrać', de: 'wegnehmen, mitnehmen' },
      { prefix: 'wy', verb: 'wybrać', de: 'auswählen' },
      { prefix: 'u', verb: 'ubrać', de: 'anziehen, kleiden' },
      { prefix: 'ze', verb: 'zebrać', de: 'sammeln, einsammeln' },
      { prefix: 'prze', verb: 'przebrać', de: 'umziehen, verkleiden' },
      { prefix: 'do', verb: 'dobrać', de: 'dazunehmen, auswählen' },
    ],
  },
]

export const FAMILY_BY_BASE = new Map(VERB_FAMILIES.map(f => [f.base, f]))

/** Every prefixed verb across all families, for quick lookup. */
export const PREFIXED_VERBS = new Map<string, { family: VerbFamily; member: FamilyMember }>()
for (const family of VERB_FAMILIES) {
  for (const member of family.members) PREFIXED_VERBS.set(member.verb, { family, member })
}
