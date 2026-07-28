import type { Lesson } from './types'

/**
 * German micro-lessons. Five fixed prose fields per concept — hook, rule,
 * bridge, trap, mnemonic — plus a small pattern table.
 *
 * The `bridge` field is the reason this game is written in German rather than
 * English: almost every Polish case has a German handle to grab it by, and
 * naming that handle explicitly is worth more than any amount of drilling.
 */
export const LESSONS: Lesson[] = [
  {
    conceptId: 'gender.basic',
    hookDe:
      'Bevor du irgendetwas beugen kannst, musst du wissen, welches Geschlecht das Wort hat. ' +
      'Gute Nachricht: im Polnischen siehst du es fast immer am letzten Buchstaben.',
    ruleDe:
      'Endet ein Substantiv auf einen Konsonanten, ist es männlich. Endet es auf -a, ist es weiblich. ' +
      'Endet es auf -o, -e oder -ę, ist es sächlich. Es gibt Ausnahmen, aber diese Regel trägt dich sehr weit.',
    tableHead: ['Endung', 'Geschlecht', 'Beispiel'],
    table: [
      ['Konsonant', 'männlich (rodzaj męski)', 'kot, dom, student'],
      ['-a', 'weiblich (rodzaj żeński)', 'kobieta, książka, woda'],
      ['-o / -e / -ę', 'sächlich (rodzaj nijaki)', 'okno, morze, imię'],
    ],
    bridgeDe:
      'Anders als im Deutschen musst du das Geschlecht nicht auswendig lernen — du siehst es. ' +
      '„Das Mädchen" ist im Deutschen eine Gemeinheit; im Polnischen ist dziewczyna sichtbar weiblich.',
    trapDe:
      'Männer auf -a bleiben Männer: mężczyzna, kolega, tata sind männlich, obwohl sie auf -a enden. ' +
      'Sie werden aber wie weibliche Wörter gebeugt — der Klassiker unter den Stolperfallen.',
    mnemonicDe:
      'Konsonant = kantig = männlich. -a = rund = weiblich. -o = ein Mund, der „oh" sagt = sächlich.',
  },
  {
    conceptId: 'case.nom.sg',
    hookDe:
      'Der Nominativ ist die Form, die im Wörterbuch steht — und die einzige, die dir geschenkt wird.',
    ruleDe:
      'Der Nominativ antwortet auf kto? co? („wer? was?") und markiert das Subjekt des Satzes. ' +
      'Nach dem Verb być („sein") steht das Subjekt ebenfalls im Nominativ.',
    tableHead: ['Frage', 'Beispiel', 'Deutsch'],
    table: [
      ['kto? (wer?)', 'Kot śpi.', 'Die Katze schläft.'],
      ['co? (was?)', 'Dom jest duży.', 'Das Haus ist groß.'],
      ['kto to jest?', 'To jest student.', 'Das ist ein Student.'],
    ],
    bridgeDe:
      'Exakt wie im Deutschen: „Die Katze schläft" — die Katze ist Subjekt, also Nominativ. ' +
      'Wenn du im Deutschen den Nominativ triffst, triffst du ihn im Polnischen auch.',
    trapDe:
      'Polnisch hat keine Artikel. „Kot" heißt je nach Kontext „eine Katze", „die Katze" oder einfach „Katze". ' +
      'Such nicht nach einem Wort für „der/die/das" — es existiert nicht.',
    mnemonicDe:
      'Nominativ = Name. Die Form, mit der sich das Wort vorstellt.',
  },
  {
    conceptId: 'case.acc.sg',
    hookDe:
      'Der Akkusativ ist der Fall des direkten Objekts — und im Polnischen der erste, bei dem das Geschlecht wirklich zubeißt.',
    ruleDe:
      'Der Akkusativ antwortet auf kogo? co? Weibliche Wörter auf -a bekommen -ę. ' +
      'Sächliche Wörter ändern sich überhaupt nicht. Männliche Wörter ändern sich nur, wenn sie belebt sind — ' +
      'dann sehen sie aus wie der Genitiv.',
    tableHead: ['Geschlecht', 'Nominativ', 'Akkusativ'],
    table: [
      ['weiblich', 'kobieta', 'kobietę'],
      ['sächlich', 'okno', 'okno (unverändert)'],
      ['männlich unbelebt', 'dom', 'dom (unverändert)'],
      ['männlich belebt', 'kot', 'kota'],
    ],
    bridgeDe:
      'Wie der deutsche Akkusativ: „Ich sehe den Hund." Auch im Deutschen ändert sich nur das Maskulinum ' +
      '(der → den) — Polnisch macht denselben Witz, nur entlang der Grenze belebt/unbelebt statt am Artikel.',
    trapDe:
      'Widzę kot ist falsch. Eine Katze lebt, also: widzę kota. ' +
      'Bei unbelebten Dingen dagegen passiert nichts: widzę dom, nicht „widzę domu".',
    mnemonicDe:
      'Was atmet, wird im Akkusativ zum Genitiv. Was nicht atmet, bleibt liegen, wie es ist.',
  },
  {
    conceptId: 'case.ins.sg',
    hookDe:
      'Der Instrumental ist der angenehmste Fall des Polnischen: fast immer -em oder -ą, und er sagt dir, womit du etwas tust — oder wer du bist.',
    ruleDe:
      'Der Instrumental antwortet auf kim? czym? („mit wem? womit?"). ' +
      'Männliche und sächliche Wörter bekommen -em, weibliche Wörter auf -a bekommen -ą. ' +
      'Er steht außerdem obligatorisch nach być bei Berufen und Identitäten.',
    tableHead: ['Geschlecht', 'Nominativ', 'Instrumental'],
    table: [
      ['männlich', 'nauczyciel', 'nauczycielem'],
      ['sächlich', 'okno', 'oknem'],
      ['weiblich', 'kobieta', 'kobietą'],
      ['nach „z" (mit)', 'kot', 'z kotem'],
    ],
    bridgeDe:
      'Der deutsche Instrumental ist im Dativ versteckt: „mit dem Auto", „mit einem Messer". ' +
      'Wo du im Deutschen „mit + Dativ" sagst, sagt Polnisch z + Instrumental.',
    trapDe:
      'Jestem nauczyciel ist falsch. Bei Berufen verlangt być den Instrumental: jestem nauczycielem. ' +
      'Deutsche sagen hier fast immer den Nominativ, weil es im Deutschen „ich bin Lehrer" heißt.',
    mnemonicDe:
      'Werkzeug und Beruf sind dasselbe: beides ist das, womit du arbeitest. Also beides Instrumental.',
  },
]

export const LESSON_BY_CONCEPT = new Map(LESSONS.map(l => [l.conceptId, l]))

/** Concepts that actually have a lesson written — the game only teaches these. */
export const AUTHORED_CONCEPTS = new Set(LESSONS.map(l => l.conceptId))
