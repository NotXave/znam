import type { Lesson } from '../types'

/**
 * The case lessons — singular and plural.
 *
 * `bridgeDe` is the field that earns its keep: almost every Polish case has a
 * German handle to grab it by, and naming that handle explicitly is worth more
 * than any amount of drilling.
 */
export const CASE_LESSONS: Lesson[] = [
  {
    conceptId: 'case.nom.sg',
    hookDe:
      'Der Nominativ ist die Form, die im Wörterbuch steht — und die einzige, die dir geschenkt wird.',
    ruleDe:
      'Der Nominativ antwortet auf kto? co? („wer? was?") und markiert das Subjekt des Satzes. ' +
      'Nach dem Verb być („sein") steht die Ergänzung dagegen im Instrumental — dazu später mehr.',
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
      'Polnisch hat keine Artikel. „Kot" heißt je nach Kontext „eine Katze", „die Katze" oder einfach ' +
      '„Katze". Such nicht nach einem Wort für der/die/das — es existiert nicht.',
    mnemonicDe: 'Nominativ = Name. Die Form, mit der sich das Wort vorstellt.',
  },
  {
    conceptId: 'case.acc.sg',
    hookDe:
      'Der Akkusativ ist der Fall des direkten Objekts — und der erste, bei dem das Geschlecht wirklich zubeißt.',
    ruleDe:
      'Der Akkusativ antwortet auf kogo? co? Weibliche Wörter auf -a bekommen -ę. ' +
      'Sächliche Wörter ändern sich überhaupt nicht. Männliche Wörter ändern sich nur, wenn sie belebt ' +
      'sind — dann sehen sie aus wie der Genitiv.',
    tableHead: ['Geschlecht', 'Nominativ', 'Akkusativ'],
    table: [
      ['weiblich', 'kobieta', 'kobietę'],
      ['sächlich', 'okno', 'okno (unverändert)'],
      ['männlich unbelebt', 'dom', 'dom (unverändert)'],
      ['männlich belebt', 'kot', 'kota'],
    ],
    bridgeDe:
      'Wie der deutsche Akkusativ: „Ich sehe den Hund." Auch im Deutschen ändert sich nur das ' +
      'Maskulinum (der → den) — Polnisch macht denselben Witz, nur entlang der Grenze belebt/unbelebt ' +
      'statt am Artikel.',
    trapDe:
      'Widzę kot ist falsch. Eine Katze lebt, also: widzę kota. Bei unbelebten Dingen passiert dagegen ' +
      'nichts: widzę dom, nicht „widzę domu".',
    mnemonicDe: 'Was atmet, wird im Akkusativ zum Genitiv. Was nicht atmet, bleibt liegen, wie es ist.',
  },
  {
    conceptId: 'case.ins.sg',
    hookDe:
      'Der Instrumental ist der angenehmste Fall des Polnischen: fast immer -em oder -ą, und er sagt dir, ' +
      'womit du etwas tust — oder wer du bist.',
    ruleDe:
      'Der Instrumental antwortet auf kim? czym? („mit wem? womit?"). Männliche und sächliche Wörter ' +
      'bekommen -em, weibliche Wörter auf -a bekommen -ą. Er steht außerdem obligatorisch nach być bei ' +
      'Berufen und Identitäten.',
    tableHead: ['Geschlecht', 'Nominativ', 'Instrumental'],
    table: [
      ['männlich', 'nauczyciel', 'nauczycielem'],
      ['sächlich', 'okno', 'oknem'],
      ['weiblich', 'kobieta', 'kobietą'],
      ['nach „z" (mit)', 'kot', 'z kotem'],
    ],
    bridgeDe:
      'Der deutsche Instrumental steckt im Dativ: „mit dem Auto", „mit einem Messer". Wo du im Deutschen ' +
      '„mit + Dativ" sagst, sagt Polnisch z + Instrumental.',
    trapDe:
      'Jestem nauczyciel ist falsch. Bei Berufen verlangt być den Instrumental: jestem nauczycielem. ' +
      'Deutsche sagen hier fast immer den Nominativ, weil es im Deutschen „ich bin Lehrer" heißt.',
    mnemonicDe:
      'Werkzeug und Beruf sind dasselbe: beides ist das, womit du arbeitest. Also beides Instrumental.',
  },
  {
    conceptId: 'case.gen.sg',
    hookDe: 'Ohne Genitiv kein Bier. Wörtlich: nie ma piwa.',
    ruleDe:
      'Der Genitiv antwortet auf kogo? czego? Er steht nach Verneinung, nach Mengenangaben und nach ' +
      'Präpositionen wie do, od, bez, dla. Männliche und sächliche Wörter bekommen -a oder -u, ' +
      'weibliche -y oder -i.',
    tableHead: ['Geschlecht', 'Nominativ', 'Genitiv'],
    table: [
      ['sächlich', 'kino', 'kina'],
      ['männlich', 'dom', 'domu'],
      ['männlich belebt', 'kot', 'kota'],
      ['weiblich', 'kobieta', 'kobiety'],
    ],
    bridgeDe:
      'Wie im Deutschen „wegen des Kinos" oder „ein Glas Wassers" — nur dass Polnisch den Genitiv ' +
      'ungleich häufiger braucht. Wo der deutsche Genitiv am Aussterben ist, lebt der polnische auf.',
    trapDe:
      'Ob -a oder -u kommt, ist bei männlichen Wörtern schlicht Vokabelwissen. Belebtes nimmt fast immer ' +
      '-a (kota, psa), Abstraktes oft -u (domu, czasu). Da hilft nur Häufigkeit.',
    mnemonicDe:
      'Der Genitiv ist der Kasus der Abwesenheit: kein Bier, kein Geld, kein Problem — nie ma piwa.',
  },
  {
    conceptId: 'case.gen.negation',
    hookDe: 'Verneine einen Satz, und das Objekt wechselt den Fall. Kein Scherz.',
    ruleDe:
      'Ein Akkusativobjekt wird bei Verneinung zum Genitiv. Mam czas → nie mam czasu. ' +
      'Das gilt ausnahmslos, für jedes verneinte direkte Objekt.',
    tableHead: ['Positiv (Akkusativ)', 'Verneint (Genitiv)', 'Deutsch'],
    table: [
      ['Mam czas.', 'Nie mam czasu.', 'Ich habe keine Zeit.'],
      ['Widzę kota.', 'Nie widzę kota.', 'Ich sehe die Katze nicht.'],
      ['Piję wodę.', 'Nie piję wody.', 'Ich trinke kein Wasser.'],
      ['Mam psa.', 'Nie mam psa.', 'Ich habe keinen Hund.'],
    ],
    bridgeDe:
      'Das Deutsche kennt eine Spur davon: „Ich habe kein Geld" — „kein" ist ein eigenes Wort für ' +
      'genau diesen Fall. Polnisch erledigt es stattdessen über die Endung.',
    trapDe:
      'Nie mam czas klingt für deutsche Ohren völlig in Ordnung und ist trotzdem falsch. Das ist einer ' +
      'der Fehler, an denen man Deutsche sofort erkennt.',
    mnemonicDe: 'Kein X → X verschwindet in den Genitiv. Weg ist weg.',
  },
  {
    conceptId: 'case.loc.sg',
    hookDe: 'Der Lokativ kommt nie allein — er steht immer hinter einer Präposition.',
    ruleDe:
      'Der Lokativ antwortet auf o kim? o czym? („über wen? worüber?") und gdzie? („wo?"). ' +
      'Er erscheint ausschließlich nach w, na, o, przy, po. Die Endung ist -e oder -u, und das -e ' +
      'löst oft einen Konsonantenwechsel aus.',
    tableHead: ['Nominativ', 'Lokativ', 'Wechsel'],
    table: [
      ['dom', 'w domu', '— (-u)'],
      ['stół', 'na stole', 'ó → o'],
      ['miasto', 'w mieście', 'st → ść'],
      ['książka', 'o książce', 'k → c'],
    ],
    bridgeDe:
      'Deutsch trennt Ort und Richtung über den Fall: „in dem Haus" (Dativ) vs. „in das Haus" ' +
      '(Akkusativ). Polnisch macht genau dasselbe, nur heißt der Ortsfall hier Lokativ.',
    trapDe:
      'Die Konsonantenwechsel wirken willkürlich, folgen aber festen Regeln: -st- wird -ść-, -k- wird ' +
      '-c-, -g- wird -dz-. Sie kommen im Lokativ und im Dativ vor, sonst nirgends.',
    mnemonicDe: 'Lokativ = Lokal. Der Fall, in dem du dich aufhältst — und nie ohne Begleitung.',
  },
  {
    conceptId: 'case.dat.sg',
    hookDe: 'Wem gibst du das Buch? Der Dativ beantwortet genau diese Frage — wie im Deutschen.',
    ruleDe:
      'Der Dativ antwortet auf komu? czemu? und markiert den Empfänger. Männlich meist -owi, ' +
      'sächlich -u, weiblich -e oder -i. Verben wie dawać, pomagać und dziękować verlangen ihn.',
    tableHead: ['Geschlecht', 'Nominativ', 'Dativ'],
    table: [
      ['männlich', 'brat', 'bratu / bratowi'],
      ['männlich', 'nauczyciel', 'nauczycielowi'],
      ['sächlich', 'dziecko', 'dziecku'],
      ['weiblich', 'kobieta', 'kobiecie'],
    ],
    bridgeDe:
      'Der direkteste Treffer im ganzen Kursus: „Ich gebe dem Bruder das Buch" ist Wort für Wort ' +
      'Daję bratu książkę. Wenn du im Deutschen einen Dativ setzt, setzt du im Polnischen fast immer auch einen.',
    trapDe:
      'Dziękuję ci — nicht „dziękuję cię". Danken geht im Polnischen auf den Dativ, genau wie im ' +
      'Deutschen. Bei pomagać (helfen) gilt dasselbe.',
    mnemonicDe: 'Dativ = der Empfänger. Wer das Paket bekommt, steht im Dativ.',
  },
  {
    conceptId: 'case.voc',
    hookDe:
      'Ein eigener Fall, nur um jemanden anzusprechen. Im Alltag verschwindet er langsam — bei Namen ' +
      'lebt er weiter.',
    ruleDe:
      'Der Vokativ ist die Anrede. Weibliche Namen auf -a bekommen -o oder -u, männliche meist -e ' +
      'oder -u. In lockerer Sprache benutzen viele einfach den Nominativ — außer in festen Wendungen.',
    tableHead: ['Nominativ', 'Vokativ', 'Situation'],
    table: [
      ['Anna', 'Aniu!', 'vertraut'],
      ['pan doktor', 'panie doktorze!', 'höflich'],
      ['mama', 'mamo!', 'Familie'],
      ['Bóg', 'Boże!', 'Ausruf'],
    ],
    bridgeDe:
      'Deutsch hatte das auch einmal — „Herr Doktor!" ist ein Rest davon. Heute markiert das Deutsche ' +
      'die Anrede nur noch durch Kommas und Betonung.',
    trapDe:
      'Panie doktorze und nicht „pan doktor", wenn du jemanden direkt ansprichst. Bei Fremden und im ' +
      'Beruf wirkt der Nominativ unhöflich.',
    mnemonicDe: 'Vokativ = vokal. Der Fall, den man ruft.',
  },

  // ── Plural ───────────────────────────────────────────────
  {
    conceptId: 'case.nom.pl',
    hookDe:
      'Der Plural teilt Polen in zwei Lager: Männergruppen — und alles andere auf der Welt.',
    ruleDe:
      'Polnisch unterscheidet im Plural männlich-personal (Gruppen, in denen mindestens ein Mann ist) ' +
      'von allem Übrigen. Männlich-personal bekommt -i/-y/-owie, alles andere -y/-i/-e.',
    tableHead: ['Typ', 'Singular', 'Plural'],
    table: [
      ['männlich-personal', 'student', 'studenci'],
      ['männlich-personal', 'Polak', 'Polacy'],
      ['männlich unbelebt', 'stół', 'stoły'],
      ['weiblich', 'kobieta', 'kobiety'],
      ['sächlich', 'okno', 'okna'],
    ],
    bridgeDe:
      'Deutsch hat nichts Vergleichbares — „die Studenten" und „die Tische" verhalten sich gleich. ' +
      'Diese Unterscheidung musst du wirklich neu lernen; sie zieht sich danach durch Adjektive und ' +
      'die Vergangenheit.',
    trapDe:
      'Eine Gruppe aus neunundneunzig Frauen und einem Mann ist männlich-personal. Eine Gruppe aus ' +
      'ausschließlich Frauen ist es nicht. Das ist grammatisch, nicht gerecht.',
    mnemonicDe:
      'Ist ein Mann dabei, hat das Wort seinen eigenen Plural. Sonst zählt es zu „allem anderen".',
  },
  {
    conceptId: 'case.acc.pl',
    hookDe: 'Im Plural wird der Akkusativ endlich einfach — mit genau einer Ausnahme.',
    ruleDe:
      'Für alles außer männlich-personal ist der Akkusativ Plural gleich dem Nominativ Plural. ' +
      'Männlich-personale Wörter nehmen stattdessen den Genitiv Plural.',
    tableHead: ['Typ', 'Nominativ Pl.', 'Akkusativ Pl.'],
    table: [
      ['weiblich', 'kobiety', 'kobiety'],
      ['sächlich', 'okna', 'okna'],
      ['männlich unbelebt', 'stoły', 'stoły'],
      ['männlich-personal', 'studenci', 'studentów'],
    ],
    bridgeDe:
      'Dieselbe Logik wie im Singular, nur eine Stufe höher: was „zählt" (Menschen), verhält sich ' +
      'anders als der Rest — im Singular die Belebtheit, im Plural die Personalität.',
    trapDe:
      'Widzę studenci ist falsch. Menschen im Plural: Widzę studentów — die Form sieht aus wie der Genitiv.',
    mnemonicDe: 'Männer im Plural stehlen sich wieder den Genitiv. Wie im Singular, nur größer.',
  },
  {
    conceptId: 'case.gen.pl',
    hookDe: 'Der einzige Fall im Polnischen, dessen Endung das Fehlen einer Endung ist.',
    ruleDe:
      'Weibliche und sächliche Wörter verlieren im Genitiv Plural einfach ihren Endvokal — übrig ' +
      'bleibt der nackte Stamm. Männliche Wörter bekommen -ów oder -i/-y.',
    tableHead: ['Geschlecht', 'Nominativ Pl.', 'Genitiv Pl.'],
    table: [
      ['weiblich', 'kobiety', 'kobiet'],
      ['sächlich', 'okna', 'okien'],
      ['sächlich', 'miasta', 'miast'],
      ['männlich', 'stoły', 'stołów'],
    ],
    bridgeDe:
      'Im Deutschen gibt es das nicht — dort wird der Plural länger, nie kürzer. Hier musst du dich ' +
      'daran gewöhnen, dass Wegnehmen eine Endung sein kann.',
    trapDe:
      'Wird der Stamm dabei unaussprechbar, schiebt Polnisch ein -e- ein: okno → okien, nicht „okn". ' +
      'Das ist keine Ausnahme, sondern reine Aussprechbarkeit.',
    mnemonicDe: 'Genitiv Plural = das Wort auf Diät. Der letzte Vokal fällt weg.',
  },
  {
    conceptId: 'case.ins.pl',
    hookDe: 'Nach den Grausamkeiten des Genitiv Plural ein Geschenk: eine Endung für alles.',
    ruleDe: 'Der Instrumental Plural ist -ami. Für jedes Geschlecht. Fast ohne Ausnahme.',
    tableHead: ['Geschlecht', 'Nominativ Pl.', 'Instrumental Pl.'],
    table: [
      ['männlich', 'stoły', 'stołami'],
      ['weiblich', 'kobiety', 'kobietami'],
      ['sächlich', 'okna', 'oknami'],
      ['(Ausnahme)', 'ludzie', 'ludźmi'],
    ],
    bridgeDe:
      'Wie im Singular: wo Deutsch „mit + Dativ" sagt, sagt Polnisch z + Instrumental. ' +
      'Z przyjaciółmi = mit Freunden.',
    trapDe:
      'Ein paar häufige Wörter nehmen -mi statt -ami: ludźmi, dziećmi, pieniędzmi. Genau die drei ' +
      'wirst du dauernd brauchen.',
    mnemonicDe: 'Plural + Werkzeug = -ami. Einmal merken, immer richtig.',
  },
  {
    conceptId: 'case.loc.pl',
    hookDe: 'Noch ein Geschenk: der Lokativ Plural ist immer -ach.',
    ruleDe: 'Der Lokativ Plural endet auf -ach, für alle Geschlechter, ohne Konsonantenwechsel.',
    tableHead: ['Geschlecht', 'Nominativ Pl.', 'Lokativ Pl.'],
    table: [
      ['männlich', 'domy', 'w domach'],
      ['weiblich', 'książki', 'o książkach'],
      ['sächlich', 'miasta', 'w miastach'],
      ['männlich-personal', 'studenci', 'o studentach'],
    ],
    bridgeDe:
      'Der ganze Ärger des Lokativ Singular — mieście, stole, książce — fällt im Plural weg. ' +
      'Eine Endung, keine Wechsel.',
    trapDe:
      'Weil der Singular so unregelmäßig ist, misstrauen viele auch dem Plural. Unnötig: hier gibt es ' +
      'wirklich nichts zu merken außer -ach.',
    mnemonicDe: 'Lokativ Plural: -ach. Wie ein erleichtertes „ach, endlich einfach".',
  },
  {
    conceptId: 'case.dat.pl',
    hookDe: 'Und zum Abschluss der Plural-Trilogie: -om.',
    ruleDe: 'Der Dativ Plural endet auf -om. Alle Geschlechter, keine Ausnahmen von Belang.',
    tableHead: ['Geschlecht', 'Nominativ Pl.', 'Dativ Pl.'],
    table: [
      ['männlich', 'studenci', 'studentom'],
      ['weiblich', 'kobiety', 'kobietom'],
      ['sächlich', 'dzieci', 'dzieciom'],
      ['Beispiel', '—', 'Daję prezenty dzieciom.'],
    ],
    bridgeDe:
      'Wieder deckungsgleich mit dem Deutschen: „Ich gebe den Kindern Geschenke" — ' +
      'Daję prezenty dzieciom. Empfänger im Plural, Dativ hier wie dort.',
    trapDe:
      'Die drei Plural-Endungen liegen klanglich nah beieinander: -om (Dativ), -ami (Instrumental), ' +
      '-ach (Lokativ). Wer sie verwechselt, verwechselt meist -om und -ami.',
    mnemonicDe: 'DatOM — das O steckt schon im Namen.',
  },
]
