import type { Lesson } from '../types'

/** Gender, adjectives, prepositions, numerals, pronouns and sentence syntax. */
export const MISC_LESSONS: Lesson[] = [
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
    conceptId: 'gender.masc.animacy',
    hookDe:
      'Männlich reicht dem Polnischen nicht. Es will wissen, ob das Wort ein Mensch ist, ein Tier — oder ein Ding.',
    ruleDe:
      'Männliche Substantive zerfallen in drei Klassen: personal (Menschen), belebt (Tiere) und ' +
      'unbelebt (Dinge). Der Unterschied zeigt sich im Akkusativ und im Nominativ Plural.',
    tableHead: ['Klasse', 'Beispiel', 'Akkusativ Sg.', 'Nominativ Pl.'],
    table: [
      ['personal', 'student', 'studenta', 'studenci'],
      ['belebt (Tier)', 'kot', 'kota', 'koty'],
      ['unbelebt', 'stół', 'stół', 'stoły'],
    ],
    bridgeDe:
      'Deutsch kennt nur „der/den" und macht keinen Unterschied zwischen Mann, Katze und Tisch. ' +
      'Diese Dreiteilung ist wirklich neu — sie erklärt aber, warum der Akkusativ mal etwas tut und mal nicht.',
    trapDe:
      'Ein paar Wörter für Dinge werden im Alltag wie Belebtes behandelt: mam maila, gram w tenisa. ' +
      'Grammatisch unlogisch, umgangssprachlich normal.',
    mnemonicDe: 'Mensch, Tier, Ding — drei Stufen. Je lebendiger, desto mehr verändert sich das Wort.',
  },
  {
    conceptId: 'adj.agreement.sg',
    hookDe: 'Adjektive haben keine eigene Meinung. Sie übernehmen Geschlecht, Zahl und Fall vom Substantiv.',
    ruleDe:
      'Ein Adjektiv richtet sich nach seinem Substantiv. Im Nominativ Singular: männlich -y/-i, ' +
      'weiblich -a, sächlich -e.',
    tableHead: ['Geschlecht', 'Adjektiv + Substantiv', 'Deutsch'],
    table: [
      ['männlich', 'duży dom', 'ein großes Haus'],
      ['weiblich', 'duża kobieta', 'eine große Frau'],
      ['sächlich', 'duże okno', 'ein großes Fenster'],
      ['Akkusativ f.', 'widzę dużą kobietę', 'ich sehe die große Frau'],
    ],
    bridgeDe:
      'Genau wie die deutsche Adjektivdeklination: „ein großer Hund", „eine große Katze". ' +
      'Du machst diese Angleichung im Deutschen längst automatisch — hier gilt sie nur konsequenter.',
    trapDe:
      'Bewegt sich das Substantiv in einen anderen Fall, muss das Adjektiv mit. ' +
      'Nicht „widzę duży kobietę", sondern widzę dużą kobietę.',
    mnemonicDe: 'Das Adjektiv ist ein Echo. Es wiederholt, was das Substantiv vorgibt.',
  },
  {
    conceptId: 'adj.agreement.pl',
    hookDe: 'Im Plural fragt das Adjektiv als Erstes: sind da Männer dabei?',
    ruleDe:
      'Im Plural gibt es nur zwei Adjektivformen: männlich-personal (-i/-y) und alles andere (-e). ' +
      'Das ist dieselbe Zweiteilung wie beim Substantiv.',
    tableHead: ['Typ', 'Beispiel', 'Deutsch'],
    table: [
      ['männlich-personal', 'dobrzy studenci', 'gute Studenten'],
      ['alles andere', 'dobre książki', 'gute Bücher'],
      ['alles andere', 'dobre koty', 'gute Katzen'],
      ['alles andere', 'dobre okna', 'gute Fenster'],
    ],
    bridgeDe:
      'Deutsch hat im Plural nur eine Form: „gute Studenten", „gute Bücher". Polnisch spaltet auch hier ' +
      'nach männlich-personal — dieselbe Grenze, an die du dich beim Substantiv schon gewöhnt hast.',
    trapDe:
      'Dobrzy statt dobre erfordert einen Konsonantenwechsel: dobry → dobrzy. Genau dieselben Wechsel ' +
      'wie beim Substantiv im Nominativ Plural.',
    mnemonicDe: 'Männergruppe = -i. Alles andere = -e. Nur zwei Möglichkeiten.',
  },
  {
    conceptId: 'adj.comparative',
    hookDe: 'Steigern geht fast wie im Deutschen — bis auf die üblichen vier, die aus der Reihe tanzen.',
    ruleDe:
      'Der Komparativ hängt -szy oder -ejszy an, der Superlativ setzt naj- davor. ' +
      'Alternativ geht immer bardziej („mehr") plus Adjektiv.',
    tableHead: ['Grundform', 'Komparativ', 'Superlativ'],
    table: [
      ['duży (groß)', 'większy', 'największy'],
      ['dobry (gut)', 'lepszy', 'najlepszy'],
      ['zły (schlecht)', 'gorszy', 'najgorszy'],
      ['mały (klein)', 'mniejszy', 'najmniejszy'],
      ['ciekawy', 'ciekawszy', 'najciekawszy'],
    ],
    bridgeDe:
      'Dieselbe Konstruktion wie „groß, größer, am größten" — und dieselben Verben stolpern: ' +
      'gut/besser/am besten ist dobry/lepszy/najlepszy. Unregelmäßig in beiden Sprachen, an derselben Stelle.',
    trapDe:
      'Beim Vergleich steht niż oder od: większy niż dom oder większy od domu. Nach od folgt der Genitiv.',
    mnemonicDe: 'naj- ist das deutsche „am …-sten". Vorne dran, fertig.',
  },
  {
    conceptId: 'prep.gen',
    hookDe: 'Vier Präpositionen, ein Fall — und du deckst die halbe Alltagssprache ab.',
    ruleDe:
      'do, od, bez, dla, u und obok verlangen ausnahmslos den Genitiv. Kein Sonderfall, keine zweite Lesart.',
    tableHead: ['Präposition', 'Deutsch', 'Beispiel'],
    table: [
      ['do', 'zu, nach, in', 'idę do domu'],
      ['od', 'von, seit', 'list od brata'],
      ['bez', 'ohne', 'kawa bez cukru'],
      ['dla', 'für', 'prezent dla mamy'],
      ['u', 'bei', 'jestem u lekarza'],
    ],
    bridgeDe:
      'Deutsch verteilt diese Bedeutungen auf Dativ und Akkusativ („zu dem", „ohne den"). ' +
      'Polnisch schickt sie alle in denselben Fall — hier ist es sogar einfacher.',
    trapDe:
      'Do heißt „nach" bei Orten, zu denen man hineingeht: do Polski, do domu. Für Veranstaltungen und ' +
      'offene Flächen nimmt man na: na koncert, na plażę.',
    mnemonicDe: 'do, od, bez, dla — vier kurze Wörter, ein Fall.',
  },
  {
    conceptId: 'prep.loc',
    hookDe: 'Der Lokativ existiert nur nach diesen Präpositionen. Sonst siehst du ihn nie.',
    ruleDe:
      'w, na, o, przy und po verlangen den Lokativ — sofern es um einen Ort oder ein Thema geht, ' +
      'nicht um eine Richtung.',
    tableHead: ['Präposition', 'Deutsch', 'Beispiel'],
    table: [
      ['w', 'in', 'w domu'],
      ['na', 'auf, an', 'na stole'],
      ['o', 'über (Thema)', 'mówię o pracy'],
      ['przy', 'bei, an', 'przy oknie'],
      ['po', 'nach', 'po pracy'],
    ],
    bridgeDe:
      'Wie das deutsche „in dem Haus" — Ort, also Dativ. Polnisch benutzt dafür einen eigenen Fall, ' +
      'aber die Unterscheidung, die du triffst, ist dieselbe.',
    trapDe:
      'O plus Lokativ heißt „über" im Sinne von „zum Thema": książka o Polsce. Für „über" im räumlichen ' +
      'Sinn nimmt man nad.',
    mnemonicDe: 'w, na, o, przy, po — die fünf Wächter des Lokativs.',
  },
  {
    conceptId: 'prep.case',
    hookDe: 'Jede Präposition regiert einen Fall. Das ist kein Detail, sondern der halbe Satzbau.',
    ruleDe:
      'Präpositionen bestimmen den Fall des folgenden Substantivs. Die Zuordnung muss man lernen — ' +
      'aber sie ist fest und lohnt sich sofort.',
    tableHead: ['Fall', 'Präpositionen'],
    table: [
      ['Genitiv', 'do, od, bez, dla, u, obok'],
      ['Akkusativ', 'przez, na (Richtung), w (Richtung)'],
      ['Dativ', 'ku, przeciw, dzięki'],
      ['Instrumental', 'z (mit), nad, pod, przed, między'],
      ['Lokativ', 'w, na, o, przy, po'],
    ],
    bridgeDe:
      'Genau wie im Deutschen: „mit" verlangt Dativ, „ohne" Akkusativ, „wegen" Genitiv. ' +
      'Du kennst das Prinzip — nur die Liste ist neu.',
    trapDe:
      'Z ist doppeldeutig: „mit" plus Instrumental (z kotem), aber „aus" plus Genitiv (z domu). ' +
      'Erst der Sinn entscheidet, dann der Fall.',
    mnemonicDe: 'Lern Präposition und Fall als Paar. Nie einzeln.',
  },
  {
    conceptId: 'prep.motion',
    hookDe: 'w und na können zwei Fälle regieren. Welchen, entscheidet: stehst du da, oder gehst du hin?',
    ruleDe:
      'Ort (wo?) verlangt den Lokativ. Richtung (wohin?) verlangt den Akkusativ. Dieselbe Präposition, ' +
      'zwei Fälle, zwei Bedeutungen.',
    tableHead: ['Frage', 'Fall', 'Beispiel'],
    table: [
      ['gdzie? (wo)', 'Lokativ', 'jestem w domu'],
      ['dokąd? (wohin)', 'Akkusativ', 'idę w góry'],
      ['gdzie?', 'Lokativ', 'na stole'],
      ['dokąd?', 'Akkusativ', 'na stół'],
    ],
    bridgeDe:
      'Das ist eins zu eins der deutsche Wechselpräpositionen-Trick: „in dem Haus" gegen „in das Haus", ' +
      '„auf dem Tisch" gegen „auf den Tisch". Wenn du das im Deutschen kannst, kannst du es hier auch.',
    trapDe:
      'Die Frage ist nicht, ob Bewegung stattfindet, sondern ob sie die Grenze überquert. ' +
      'Spaceruję w parku (ich gehe im Park spazieren) ist Lokativ — die Bewegung bleibt drinnen.',
    mnemonicDe: 'Wo = Lokativ. Wohin = Akkusativ. Genau wie im Deutschen.',
  },
  {
    conceptId: 'numerals.1to4',
    hookDe: 'Die Zahlen eins bis vier verhalten sich noch wie vernünftige Wörter. Danach wird es seltsam.',
    ruleDe:
      'jeden richtet sich nach dem Geschlecht wie ein Adjektiv. dwa, trzy, cztery nehmen den ' +
      'Nominativ Plural. dwa hat außerdem eine eigene weibliche Form: dwie.',
    tableHead: ['Zahl', 'Beispiel', 'Deutsch'],
    table: [
      ['jeden', 'jeden dom / jedna kobieta', 'ein Haus / eine Frau'],
      ['dwa', 'dwa domy', 'zwei Häuser'],
      ['dwie', 'dwie kobiety', 'zwei Frauen'],
      ['trzy', 'trzy koty', 'drei Katzen'],
      ['cztery', 'cztery okna', 'vier Fenster'],
    ],
    bridgeDe:
      'Wie das deutsche „ein/eine", das sich anpasst, während „zwei/drei/vier" unverändert bleiben. ' +
      'Polnisch geht mit dwie/dwa nur einen Schritt weiter.',
    trapDe:
      'Dwie ist Pflicht bei weiblichen Substantiven: dwie kobiety, nie „dwa kobiety". ' +
      'Bei Männergruppen kommt noch dwaj/dwóch dazu.',
    mnemonicDe: 'Bis vier benehmen sich die Zahlen. Ab fünf übernehmen sie das Kommando.',
  },
  {
    conceptId: 'numerals.5plus',
    hookDe: 'Ab fünf dreht Polnisch den Satz um: nicht die Zahl richtet sich nach dem Substantiv, sondern umgekehrt.',
    ruleDe:
      'Ab fünf steht das Substantiv im Genitiv Plural — und das Verb in der 3. Person Singular. ' +
      'Dasselbe gilt für alle Zahlen auf 5–9 und 0.',
    tableHead: ['Zahl', 'Beispiel', 'Wörtlich'],
    table: [
      ['cztery', 'cztery koty są', 'vier Katzen sind'],
      ['pięć', 'pięć kotów jest', 'fünf von Katzen ist'],
      ['dziesięć', 'dziesięć domów', 'zehn von Häusern'],
      ['dwadzieścia', 'dwadzieścia kobiet', 'zwanzig von Frauen'],
      ['dwadzieścia dwa', 'dwadzieścia dwa koty', '(endet auf 2 → wie oben)'],
    ],
    bridgeDe:
      'Deutsch kennt das aus Mengenangaben: „eine Menge Leute", „ein Dutzend Eier" — dort steht das ' +
      'Gezählte auch im Genitiv. Polnisch macht daraus die Grundregel für jede Zahl ab fünf.',
    trapDe:
      'Es zählt die letzte Ziffer, nicht die Größe: 22 endet auf 2 und verhält sich wie dwa ' +
      '(dwadzieścia dwa koty), 25 wie pięć (dwadzieścia pięć kotów).',
    mnemonicDe: 'Ab fünf wird gezählt, nicht beschrieben — und Gezähltes steht im Genitiv.',
  },
  {
    conceptId: 'pron.personal',
    hookDe: 'Die Personalpronomen lernst du — und lässt sie danach meistens weg.',
    ruleDe:
      'Weil die Verbendung die Person schon nennt, ist das Pronomen überflüssig. Man setzt es nur ' +
      'zur Betonung oder zum Kontrast.',
    tableHead: ['Nominativ', 'Akkusativ', 'Dativ'],
    table: [
      ['ja', 'mnie', 'mi'],
      ['ty', 'ciebie / cię', 'ci'],
      ['on', 'jego / go', 'jemu / mu'],
      ['ona', 'ją', 'jej'],
      ['my', 'nas', 'nam'],
      ['oni', 'ich', 'im'],
    ],
    bridgeDe:
      'Deutsch braucht das Pronomen immer: „ich mache" geht nicht ohne „ich". ' +
      'Polnisch kommt mit robię aus — die Endung erledigt den Job.',
    trapDe:
      'Ja robię klingt nicht neutral, sondern betont: „ICH mache das (nicht du)". ' +
      'Wer die Pronomen immer mitspricht, wirkt unfreiwillig nachdrücklich.',
    mnemonicDe: 'Endung statt Pronomen. Nur wer widerspricht, sagt ja.',
  },
  {
    conceptId: 'pron.possessive',
    hookDe: 'Possessivpronomen sind Adjektive. Sie beugen sich mit — natürlich.',
    ruleDe:
      'mój, twój, nasz, wasz richten sich nach dem besessenen Ding, nicht nach dem Besitzer. ' +
      'jego, jej und ich bleiben dagegen immer unverändert.',
    tableHead: ['Pronomen', 'männlich', 'weiblich', 'sächlich'],
    table: [
      ['mein', 'mój dom', 'moja książka', 'moje okno'],
      ['dein', 'twój dom', 'twoja książka', 'twoje okno'],
      ['unser', 'nasz dom', 'nasza książka', 'nasze okno'],
      ['sein/ihr', 'jego / jej', 'jego / jej', 'jego / jej'],
    ],
    bridgeDe:
      'Wie „mein Haus / meine Katze" im Deutschen: das Pronomen richtet sich nach dem Besitz. ' +
      'Und wie im Deutschen bleibt „sein/ihr" bei der Person, der es gehört.',
    trapDe:
      'Bei Körperteilen und Familie lässt Polnisch das Possessivum meist weg: Boli mnie głowa — ' +
      'wörtlich „mich schmerzt der Kopf", nicht „mein Kopf".',
    mnemonicDe: 'Das Possessivum richtet sich nach dem Besitz, nicht nach dem Besitzer.',
  },
  {
    conceptId: 'syntax.questions',
    hookDe: 'Eine Ja/Nein-Frage kostet im Polnischen genau ein Wort: czy.',
    ruleDe:
      'czy leitet Entscheidungsfragen ein und lässt die Wortstellung unangetastet. ' +
      'Ergänzungsfragen beginnen mit einem Fragewort, ebenfalls ohne Umstellung.',
    tableHead: ['Fragewort', 'Deutsch', 'Beispiel'],
    table: [
      ['czy', '(ja/nein)', 'Czy masz czas?'],
      ['kto', 'wer', 'Kto to jest?'],
      ['co', 'was', 'Co robisz?'],
      ['gdzie', 'wo', 'Gdzie jesteś?'],
      ['dlaczego', 'warum', 'Dlaczego nie?'],
      ['jak', 'wie', 'Jak się masz?'],
    ],
    bridgeDe:
      'Deutsch dreht um: „Hast du Zeit?" Polnisch stellt stattdessen czy voran und lässt den Satz ' +
      'in Ruhe — einfacher als im Deutschen.',
    trapDe:
      'Im Gespräch fällt czy oft weg und nur die Stimme steigt: Masz czas? Schriftlich gehört es dazu.',
    mnemonicDe: 'czy ist ein hörbares Fragezeichen am Satzanfang.',
  },
]
