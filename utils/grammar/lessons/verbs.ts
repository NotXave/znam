import type { Lesson } from '../types'

export const VERB_LESSONS: Lesson[] = [
  {
    conceptId: 'verb.byc',
    hookDe: 'Ein Verb, das du in jedem zweiten Satz brauchst — und das sich an keine Regel hält.',
    ruleDe:
      'być heißt „sein" und ist völlig unregelmäßig. Lern die sechs Präsensformen als Block; ' +
      'sie tragen dich durch die ersten Wochen.',
    tableHead: ['Person', 'Polnisch', 'Deutsch'],
    table: [
      ['ja', 'jestem', 'ich bin'],
      ['ty', 'jesteś', 'du bist'],
      ['on/ona/ono', 'jest', 'er/sie/es ist'],
      ['my', 'jesteśmy', 'wir sind'],
      ['wy', 'jesteście', 'ihr seid'],
      ['oni/one', 'są', 'sie sind'],
    ],
    bridgeDe:
      'Genau wie „sein" im Deutschen: das häufigste Verb ist auch das unregelmäßigste. ' +
      'Beide Sprachen haben es zu oft benutzt, um es glatt zu schleifen.',
    trapDe:
      'Nach być steht der Beruf im Instrumental, nicht im Nominativ: jestem nauczycielem. ' +
      'Bei Adjektiven dagegen bleibt es beim Nominativ: jestem zmęczony.',
    mnemonicDe: 'jest-em, jest-eś, jest — der Stamm „jest" mit angeklebten Personen.',
  },
  {
    conceptId: 'verb.present',
    hookDe:
      'Vier Konjugationen klingen nach viel. In Wahrheit unterscheiden sie sich nur in ein, zwei Buchstaben.',
    ruleDe:
      'Polnische Verben verteilen sich auf vier Präsensmuster, benannt nach der 1. und 2. Person ' +
      'Singular: -ę/-esz, -ę/-isz, -am/-asz und -em/-esz. Die 1. Person Singular endet fast immer ' +
      'auf -ę oder -m.',
    tableHead: ['Muster', 'ja', 'ty', 'on/ona'],
    table: [
      ['-am/-asz (czytać)', 'czytam', 'czytasz', 'czyta'],
      ['-ę/-isz (robić)', 'robię', 'robisz', 'robi'],
      ['-ę/-esz (pisać)', 'piszę', 'piszesz', 'pisze'],
      ['-em/-esz (rozumieć)', 'rozumiem', 'rozumiesz', 'rozumie'],
    ],
    bridgeDe:
      'Deutsch hat starke und schwache Verben; Polnisch hat vier Muster. In beiden Fällen musst du zum ' +
      'Verb das Muster mitlernen — die Endungen selbst sind dann regelmäßig.',
    trapDe:
      'pisać wird zu piszę, nicht „pisam": der Stamm ändert sich mit. Solche Wechsel (s → sz, t → cz) ' +
      'treten quer durch das Präsens auf.',
    mnemonicDe:
      'Merk dir immer zwei Formen, ja und ty. Aus denen folgt der ganze Rest.',
  },
  {
    conceptId: 'verb.past',
    hookDe:
      'In der Vergangenheit verrät dein Verb, welches Geschlecht du hast. Daran führt kein Weg vorbei.',
    ruleDe:
      'Die Vergangenheit wird vom Infinitivstamm mit -ł- gebildet, gefolgt von Geschlechts- und ' +
      'Personenendung. Männlich -łem, weiblich -łam, im Plural entscheidet wieder männlich-personal.',
    tableHead: ['Person', 'männlich', 'weiblich'],
    table: [
      ['ja', 'robiłem', 'robiłam'],
      ['ty', 'robiłeś', 'robiłaś'],
      ['on / ona', 'robił', 'robiła'],
      ['my', 'robiliśmy', 'robiłyśmy'],
      ['oni / one', 'robili', 'robiły'],
    ],
    bridgeDe:
      'Deutsch markiert im Perfekt die Person („ich habe / du hast"), aber nie das Geschlecht. ' +
      'Polnisch macht es umgekehrt herum: Geschlecht und Person stecken beide in der Verbendung.',
    trapDe:
      'Eine Frau, die byłem sagt, hat sich gerade als Mann bezeichnet. Das ist der Fehler, den ' +
      'Deutschsprachige am häufigsten machen — im Deutschen gibt es dafür schlicht keinen Schalter.',
    mnemonicDe: 'Das -ł- ist das Vergangenheitszeichen. Danach kommt, wer du bist.',
  },
  {
    conceptId: 'verb.future.compound',
    hookDe: 'Das unvollendete Futur ist gebaut wie das deutsche „werden" — nur mit zwei erlaubten Varianten.',
    ruleDe:
      'Für unvollendete Verben: być im Futur (będę, będziesz, …) plus entweder der Infinitiv oder die ' +
      '-ł-Form. Beide sind korrekt und austauschbar.',
    tableHead: ['Variante', 'Beispiel', 'Deutsch'],
    table: [
      ['+ Infinitiv', 'będę robić', 'ich werde machen'],
      ['+ ł-Form (m)', 'będę robił', 'ich werde machen'],
      ['+ ł-Form (f)', 'będę robiła', 'ich werde machen'],
      ['2. Person', 'będziesz czytać', 'du wirst lesen'],
    ],
    bridgeDe:
      'Praktisch identisch mit „ich werde arbeiten": Hilfsverb plus Vollverb. Wenn du das Deutsche ' +
      'kannst, kannst du diese Zeit sofort.',
    trapDe:
      'Das geht nur mit unvollendeten Verben. „Będę zrobić" ist falsch — vollendete Verben bilden ihr ' +
      'Futur ganz anders (nächstes Thema).',
    mnemonicDe: 'będę + Verb = werden + Verb. Eins zu eins.',
  },
  {
    conceptId: 'verb.future.simple',
    hookDe: 'Der Trick, der Anfänger umhaut: bei vollendeten Verben ist das Präsens schon die Zukunft.',
    ruleDe:
      'Ein vollendetes Verb hat kein Präsens — die Handlung ist ja abgeschlossen. Die Präsensformen ' +
      'eines vollendeten Verbs bezeichnen deshalb die Zukunft.',
    tableHead: ['Verb', 'Form', 'Bedeutung'],
    table: [
      ['robić (unv.)', 'robię', 'ich mache (jetzt)'],
      ['zrobić (voll.)', 'zrobię', 'ich werde machen'],
      ['pisać (unv.)', 'piszę', 'ich schreibe'],
      ['napisać (voll.)', 'napiszę', 'ich werde schreiben'],
    ],
    bridgeDe:
      'Deutsch kann das andeutungsweise auch: „Ich schreibe dir morgen" ist Präsensform mit ' +
      'Zukunftsbedeutung. Polnisch hat daraus ein festes System gemacht.',
    trapDe:
      'Zrobię heißt niemals „ich mache gerade". Wer die Gegenwart meint, braucht das unvollendete ' +
      'Verb: robię.',
    mnemonicDe:
      'Vollendet + Präsensendung = Zukunft. Was fertig ist, kann nicht gerade laufen.',
  },
  {
    conceptId: 'verb.imperative',
    hookDe: 'Befehle sind im Polnischen kürzer als alles andere — oft ist es nur der nackte Stamm.',
    ruleDe:
      'Den Imperativ bildest du aus der 3. Person Singular Präsens, indem du die Endung streichst. ' +
      'Für „wir" hängst du -my an, für höfliches „Sie" nimmst du proszę plus Infinitiv.',
    tableHead: ['Verb', '3. Person', 'Imperativ'],
    table: [
      ['robić', 'robi', 'rób!'],
      ['pisać', 'pisze', 'pisz!'],
      ['czytać', 'czyta', 'czytaj!'],
      ['(wir)', '—', 'róbmy!'],
    ],
    bridgeDe:
      'Wie im Deutschen: „mach!", „schreib!" — auch dort bleibt der Stamm allein stehen. ' +
      'Und wie im Deutschen wirkt der bloße Imperativ gegenüber Fremden zu direkt.',
    trapDe:
      'Zu Fremden sagt man nicht rób!, sondern proszę zrobić oder niech pan zrobi. Der direkte ' +
      'Imperativ ist Freunden und Familie vorbehalten.',
    mnemonicDe: 'Nimm die er/sie-Form und schneide die Endung ab.',
  },
  {
    conceptId: 'verb.conditional',
    hookDe: 'Ein Anhängsel namens -by, und aus „ich mache" wird „ich würde machen".',
    ruleDe:
      'Der Konditional besteht aus der -ł-Form plus by plus Personenendung: robiłbym, robiłabym. ' +
      'Das by kann sogar vom Verb weg an die Satzspitze wandern.',
    tableHead: ['Person', 'männlich', 'weiblich'],
    table: [
      ['ja', 'robiłbym', 'robiłabym'],
      ['ty', 'robiłbyś', 'robiłabyś'],
      ['on / ona', 'robiłby', 'robiłaby'],
      ['my', 'robilibyśmy', 'robiłybyśmy'],
    ],
    bridgeDe:
      'Das deutsche „würde + Infinitiv" in einem Wort. Chciałbym = „ich würde wollen" = „ich hätte ' +
      'gern" — die höflichste Formel der Sprache.',
    trapDe:
      'Auch hier steckt das Geschlecht drin: chciałbym (Mann) vs. chciałabym (Frau). Derselbe ' +
      'Stolperstein wie in der Vergangenheit.',
    mnemonicDe: 'Vergangenheit + by = Konjunktiv. „Ich hätte gemacht" wörtlich gebaut.',
  },
  {
    conceptId: 'verb.motion',
    hookDe:
      'Polnisch unterscheidet, ob du gerade unterwegs bist oder es gewohnheitsmäßig tust — und benutzt ' +
      'dafür zwei verschiedene Verben.',
    ruleDe:
      'Bewegungsverben treten paarweise auf: eines für die konkrete Fahrt gerade jetzt, eines für ' +
      'wiederholte oder allgemeine Bewegung. iść/chodzić zu Fuß, jechać/jeździć mit einem Fahrzeug.',
    tableHead: ['Konkret (jetzt)', 'Wiederholt', 'Deutsch'],
    table: [
      ['idę do szkoły', 'chodzę do szkoły', 'ich gehe / ich gehe regelmäßig'],
      ['jadę do Polski', 'jeżdżę do Polski', 'ich fahre / ich fahre öfter'],
      ['niosę torbę', 'noszę torbę', 'ich trage gerade / ich trage üblicherweise'],
      ['lecę', 'latam', 'ich fliege / ich fliege oft'],
    ],
    bridgeDe:
      'Deutsch drückt das über Adverbien aus: „ich gehe gerade" gegen „ich gehe immer". ' +
      'Polnisch steckt den Unterschied ins Verb selbst — und lässt das Adverb weg.',
    trapDe:
      'Chodzę do szkoły heißt „ich gehe zur Schule" im Sinne von „ich bin Schüler". Wer gerade ' +
      'unterwegs ist, sagt idę. Die Verwechslung ändert die Aussage komplett.',
    mnemonicDe: 'Kurzes Verb = gerade jetzt. Längeres Verb = immer wieder.',
  },

  // ── prefixes ─────────────────────────────────────────────
  {
    conceptId: 'prefix.system',
    hookDe:
      'Das Beste zuerst: dieses System kennst du schon. pod·pisać ist unter·schreiben. ' +
      'Buchstabe für Buchstabe.',
    ruleDe:
      'Polnische Verben werden mit Vorsilben gebaut, und fast jede hat ein deutsches Gegenstück. ' +
      'Wer die fünfzehn Vorsilben kennt, errät den Sinn hunderter Verben, ohne sie je gesehen zu haben.',
    tableHead: ['Polnisch', 'Deutsch', 'Beispiel'],
    table: [
      ['wy-', 'aus-, hinaus-', 'wyjść = ausgehen'],
      ['w-', 'ein-, hinein-', 'wejść = hineingehen'],
      ['przy-', 'an-', 'przyjechać = ankommen'],
      ['od-', 'ab-, weg-', 'odejść = weggehen'],
      ['pod-', 'unter-', 'podpisać = unterschreiben'],
      ['przed-', 'vor-', 'przedstawić = vorstellen'],
      ['prze-', 'über-, durch-', 'przejechać = durchfahren'],
      ['roz-', 'zer-, auseinander-', 'rozdać = austeilen'],
    ],
    bridgeDe:
      'Deutsch und Polnisch haben denselben Baukasten unabhängig voneinander gebaut. Als deutscher ' +
      'Muttersprachler beherrschst du die Logik bereits — dir fehlen nur die polnischen Etiketten.',
    trapDe:
      'Nicht jede Vorsilbe behält ihre wörtliche Bedeutung. Obchodzić heißt „herumgehen", aber auch ' +
      '„feiern". Das räumliche Bild ist der Ausgangspunkt, nicht die Garantie.',
    mnemonicDe: 'Übersetze die Vorsilbe, nicht das Verb. pod = unter, immer.',
  },
  {
    conceptId: 'prefix.families',
    hookDe:
      'Ein Stamm, zehn Wörter. Wer pisać kann, hat podpisać, zapisać, wypisać und przepisać fast gratis dazu.',
    ruleDe:
      'Ein Grundverb plus die Vorsilben ergibt eine ganze Wortfamilie. Statt zehn Vokabeln lernst du ' +
      'einen Stamm und wendest die Vorsilbenbedeutungen an.',
    tableHead: ['Verb', 'Deutsch', 'Vorsilbe'],
    table: [
      ['pisać', 'schreiben', '—'],
      ['podpisać', 'unterschreiben', 'pod = unter'],
      ['zapisać', 'aufschreiben', 'za = fest/fertig'],
      ['wypisać', 'ausschreiben', 'wy = aus'],
      ['przepisać', 'abschreiben', 'prze = über/um'],
      ['wpisać', 'eintragen', 'w = ein'],
      ['dopisać', 'hinzuschreiben', 'do = hinzu'],
    ],
    bridgeDe:
      'Das Deutsche macht es genauso: schreiben, unterschreiben, aufschreiben, abschreiben, ' +
      'einschreiben. Dieselbe Familie, dieselben Vorsilben, dieselbe Logik.',
    trapDe:
      'Manche Mitglieder haben sich verselbständigt. Zapisać się heißt „sich anmelden" — nicht mehr ' +
      'direkt aus „auf" und „schreiben" ableitbar.',
    mnemonicDe: 'Lern Stämme, nicht Wörter. Die Vorsilben erledigen den Rest.',
  },
  {
    conceptId: 'prefix.aspect',
    hookDe: 'Hier treffen sich Vorsilben und Aspekt — und plötzlich ergibt beides Sinn.',
    ruleDe:
      'Eine Vorsilbe macht ein unvollendetes Verb vollendet. Manche Vorsilben tun fast nur das und ' +
      'ändern die Bedeutung kaum: po-, z-/s-, na-, za-, u-.',
    tableHead: ['Unvollendet', 'Vollendet', 'Vorsilbe'],
    table: [
      ['robić', 'zrobić', 'z-'],
      ['pisać', 'napisać', 'na-'],
      ['czekać', 'poczekać', 'po-'],
      ['płacić', 'zapłacić', 'za-'],
      ['gotować', 'ugotować', 'u-'],
    ],
    bridgeDe:
      'Auch Deutsch hat abschließende Vorsilben: „essen" gegen „aufessen", „lesen" gegen „durchlesen". ' +
      'Nur ist es dort optional, während Polnisch es für nahezu jedes Verb durchzieht.',
    trapDe:
      'Welche Vorsilbe ein Verb zum Perfektiv macht, ist nicht vorhersagbar — es ist zrobić, aber ' +
      'napisać, und nicht umgekehrt. Das Paar lernt man zusammen.',
    mnemonicDe:
      'Vorsilbe drauf = Sache erledigt. Welche Vorsilbe, verrät nur das Wörterbuch.',
  },

  // ── aspect ───────────────────────────────────────────────
  {
    conceptId: 'aspect.intro',
    hookDe:
      'Die eine Sache, für die Deutsch keine Grammatik hat: Ist die Handlung ein Vorgang — oder ein Ergebnis?',
    ruleDe:
      'Jedes polnische Verb ist entweder unvollendet (Prozess, Gewohnheit, Verlauf) oder vollendet ' +
      '(einmalig, abgeschlossen, mit Ergebnis). Du entscheidest das bei jedem Satz neu.',
    tableHead: ['Unvollendet', 'Vollendet', 'Unterschied'],
    table: [
      ['Czytałem książkę.', 'Przeczytałem książkę.', 'las darin / las sie zu Ende'],
      ['Robiłem obiad.', 'Zrobiłem obiad.', 'war am Kochen / Essen ist fertig'],
      ['Pisałem list.', 'Napisałem list.', 'schrieb daran / Brief ist geschrieben'],
    ],
    bridgeDe:
      'Deutsch behilft sich mit Wörtern: „ich las" gegen „ich las zu Ende", „gerade" gegen „fertig". ' +
      'Polnisch trifft dieselbe Entscheidung, aber über die Verbwahl — und du musst sie immer treffen.',
    trapDe:
      'Es gibt keine neutrale Option. Wer sich nicht entscheidet, hat sich trotzdem entschieden, ' +
      'weil jedes Verb schon einen Aspekt hat.',
    mnemonicDe: 'Film oder Foto? Der Verlauf ist unvollendet, das Ergebnis vollendet.',
  },
  {
    conceptId: 'aspect.pairs',
    hookDe:
      'Aspektpaare sehen sich meist ähnlich — bis zu den paar Paaren, die überhaupt nichts gemeinsam haben.',
    ruleDe:
      'Die meisten Paare entstehen durch eine Vorsilbe (robić → zrobić). Andere ändern den Stamm ' +
      '(dawać → dać), und ein paar sind komplett verschieden (brać → wziąć).',
    tableHead: ['Typ', 'Unvollendet', 'Vollendet'],
    table: [
      ['Vorsilbe', 'pisać', 'napisać'],
      ['Stammwechsel', 'dawać', 'dać'],
      ['Stammwechsel', 'kupować', 'kupić'],
      ['völlig anders', 'brać', 'wziąć'],
      ['völlig anders', 'mówić', 'powiedzieć'],
    ],
    bridgeDe:
      'Vergleichbar mit den starken Verben im Deutschen: „gehen/ging/gegangen" folgt keiner Regel, ' +
      'die man herleiten könnte. Man lernt sie als Set — hier eben als Paar.',
    trapDe:
      'Brać und wziąć sehen aus wie zwei unabhängige Vokabeln und sind trotzdem ein Paar. Wörterbücher ' +
      'notieren das; im Text sieht man es nicht.',
    mnemonicDe: 'Lern Verben immer zu zweit. Ein Verb allein ist ein halbes Verb.',
  },
]
