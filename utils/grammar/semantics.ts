/**
 * Semantic classes for slot filling.
 *
 * Grammar alone is not enough to keep a generated sentence sane. "Jestem
 * tematem" (I am a topic) and "Idę z klatką" (I go with a cage) are both
 * perfectly inflected and completely absurd — `npm run audit:grammar` surfaced
 * exactly these, which is what the audit exists for.
 *
 * So frames that make a semantic demand declare it, and the generator draws
 * only from the matching list. The lists are curated against the lemmas that
 * actually exist in public/data/pl.morph.tsv — `npm test` fails if one drifts
 * out of the table.
 */

export type SemanticClass = 'person' | 'companion' | 'concrete' | 'place'

/** People and roles — anything you can plausibly *be* or be introduced as. */
const PERSON = [
  'amerykanin', 'babcia', 'bohater', 'brat', 'burmistrz', 'chłopak', 'chłopiec',
  'córka', 'człowiek', 'detektyw', 'doktor', 'dyrektor', 'dziadek', 'dziecko',
  'dziewczyna', 'dziewczynka', 'facet', 'generał', 'gliniarz', 'gość', 'kapitan',
  'kierowca', 'kobieta', 'kolega', 'kumpel', 'książę', 'księżniczka', 'lekarz',
  'mama', 'matka', 'mistrz', 'mąż', 'mężczyzna', 'muzyk', 'nauczyciel', 'oficer',
  'ojciec', 'osoba', 'pacjent', 'pan', 'pani', 'partner', 'pielęgniarka',
  'policjant', 'pracownik', 'prawnik', 'prezydent', 'profesor', 'prokurator',
  'przyjaciel', 'przyjaciółka', 'pułkownik', 'siostra', 'strażnik', 'syn',
  'szef', 'tata', 'trener', 'wampir', 'właściciel', 'wujek', 'więzień',
  'świadek', 'złodziej', 'żołnierz',
]

/** Someone (or something) you can walk around with. */
const COMPANION = [...PERSON, 'pies', 'kot', 'kotek', 'ptak']

/** Things you can own, carry, see or point at. */
const CONCRETE = [
  'auto', 'autobus', 'bilet', 'biurko', 'butelka', 'ciasto', 'dokument', 'dom',
  'gazeta', 'herbata', 'jajo', 'kamera', 'kamień', 'karta', 'kawa', 'klucz',
  'komputer', 'komórka', 'koszula', 'kurczak', 'kwiat', 'lekarstwo',
  'mapa', 'maszyna', 'miecz', 'mięso', 'narzędzie', 'nóż', 'obiad', 'okno',
  'papier', 'piwo', 'pizza', 'piłka', 'pistolet', 'pociąg', 'prysznic',
  'rachunek', 'samochód', 'samolot', 'silnik', 'statek', 'stół', 'taksówka',
  'telefon', 'torba', 'ubranie', 'wino', 'wóz', 'zdjęcie', 'zegarek', 'złoto',
  'łódź', 'łóżko', 'ściana', 'ząb',
]

/** Somewhere you can go to, or be in. */
const PLACE = [
  'bank', 'biuro', 'budynek', 'centrum', 'dom', 'hotel', 'korytarz', 'kuchnia',
  'kościół', 'laboratorium', 'liceum', 'lotnisko', 'magazyn', 'miasto',
  'mieszkanie', 'most', 'obóz', 'park', 'plaża', 'pokój', 'restauracja',
  'sklep', 'stacja', 'szkoła', 'szpital', 'sypialnia', 'toaleta', 'tunel',
  'ulica', 'więzienie', 'wioska', 'wyspa', 'łazienka',
]

export const SEMANTIC_SETS: Record<SemanticClass, Set<string>> = {
  person: new Set(PERSON),
  companion: new Set(COMPANION),
  concrete: new Set(CONCRETE),
  place: new Set(PLACE),
}

/**
 * Lemmas kept out of drills entirely.
 *
 * The frequency list is built from film subtitles, so it carries a certain
 * amount of profanity at surprisingly high rank. None of it belongs in a
 * lesson the learner did not ask for.
 */
export const BLOCKED_LEMMAS = new Set([
  'kurwa', 'dziwka', 'gówno', 'dupek', 'suka', 'sukinsyn', 'kupa', 'tyłek',
  'drań', 'głupiec', 'dolec', 'beza', 'boja', 'alba', 'oda', 'obój', 'por',
  'miał', 'lewa', 'tama', 'wacha', 'henr', 'ił', 'oś', 'wieko', 'pełnia',
])

export function inSemanticClass(lemma: string, cls: SemanticClass | undefined): boolean {
  if (!cls) return true
  return SEMANTIC_SETS[cls].has(lemma)
}
