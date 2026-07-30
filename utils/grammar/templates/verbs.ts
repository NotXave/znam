import type { Template } from '../types'

export const VERB_TEMPLATES: Template[] = [
  // ── być ──────────────────────────────────────────────────
  // być is irregular and absent from UniMorph, so it is drilled from the
  // hand-authored table rather than generated.
  {
    id: 'byc.quiz',
    conceptIds: ['verb.byc'],
    kind: 'quiz',
    frame: '', promptDe: '', slots: {}, answerSlot: '',
    hintDe: 'Der Stamm ist „jest-", die Person hängt hinten dran. Nur są tanzt aus der Reihe.',
    items: [
      { promptDe: 'ich bin', text: 'ja …', answer: 'jestem', wrong: ['jesteś', 'jest', 'jesteśmy'] },
      { promptDe: 'du bist', text: 'ty …', answer: 'jesteś', wrong: ['jestem', 'jest', 'jesteście'] },
      { promptDe: 'er/sie ist', text: 'on …', answer: 'jest', wrong: ['jestem', 'jesteś', 'są'] },
      { promptDe: 'wir sind', text: 'my …', answer: 'jesteśmy', wrong: ['jesteście', 'są', 'jestem'] },
      { promptDe: 'ihr seid', text: 'wy …', answer: 'jesteście', wrong: ['jesteśmy', 'są', 'jesteś'] },
      { promptDe: 'sie sind', text: 'oni …', answer: 'są', wrong: ['jest', 'jesteśmy', 'jesteście'] },
      { promptDe: 'ich war (männlich)', text: 'ja …', answer: 'byłem', wrong: ['byłam', 'był', 'byliśmy'] },
      { promptDe: 'ich war (weiblich)', text: 'ja …', answer: 'byłam', wrong: ['byłem', 'była', 'byłyśmy'] },
      { promptDe: 'ich werde sein', text: 'ja …', answer: 'będę', wrong: ['będziesz', 'będzie', 'byłem'] },
    ],
  },

  // ── Vergangenheit ────────────────────────────────────────
  {
    id: 'past.p1.sg.m',
    conceptIds: ['verb.past'],
    kind: 'conjugate',
    frame: '{v1}',
    promptDe: 'ja … — Vergangenheit, männlich',
    slots: { v1: { pos: 'V', tag: 'past.p1.sg.m' } },
    answerSlot: 'v1',
    distractors: { fromTags: ['past.p1.sg.f', 'past.p2.sg.m', 'past.p3.sg.m'], count: 3 },
    hintDe: 'Männlich Singular: -łem.',
  },
  {
    id: 'past.p1.sg.f',
    conceptIds: ['verb.past'],
    kind: 'conjugate',
    frame: '{v1}',
    promptDe: 'ja … — Vergangenheit, weiblich',
    slots: { v1: { pos: 'V', tag: 'past.p1.sg.f' } },
    answerSlot: 'v1',
    distractors: { fromTags: ['past.p1.sg.m', 'past.p2.sg.f', 'past.p3.sg.f'], count: 3 },
    hintDe: 'Weiblich Singular: -łam. Das Verb verrät dein Geschlecht.',
  },
  {
    id: 'past.p3.pl.hum',
    conceptIds: ['verb.past'],
    kind: 'conjugate',
    frame: '{v1}',
    promptDe: 'oni … — Vergangenheit, Männergruppe',
    slots: { v1: { pos: 'V', tag: 'past.p3.pl.m.hum' } },
    answerSlot: 'v1',
    distractors: { fromTags: ['past.p3.pl', 'past.p3.sg.m', 'past.p1.pl.m.hum'], count: 3 },
    hintDe: 'Männlich-personal im Plural: -li. Alles andere: -ły.',
  },

  // ── Futur ────────────────────────────────────────────────
  {
    id: 'future.compound.quiz',
    conceptIds: ['verb.future.compound'],
    kind: 'quiz',
    frame: '', promptDe: '', slots: {}, answerSlot: '',
    hintDe: 'będę + Infinitiv, nur mit unvollendeten Verben.',
    items: [
      { promptDe: 'ich werde machen (unvollendet)', text: 'robić', answer: 'będę robić', wrong: ['zrobię', 'robiłem', 'będę zrobić'] },
      { promptDe: 'du wirst lesen (unvollendet)', text: 'czytać', answer: 'będziesz czytać', wrong: ['przeczytasz', 'czytałeś', 'będziesz przeczytać'] },
      { promptDe: 'wir werden schreiben (unvollendet)', text: 'pisać', answer: 'będziemy pisać', wrong: ['napiszemy', 'pisaliśmy', 'będziemy napisać'] },
      { promptDe: 'Welche Verben dürfen mit będę stehen?', text: 'będę + ?', answer: 'nur unvollendete', wrong: ['nur vollendete', 'beide', 'keine'] },
    ],
  },
  {
    id: 'future.simple.quiz',
    conceptIds: ['verb.future.simple'],
    kind: 'quiz',
    frame: '', promptDe: '', slots: {}, answerSlot: '',
    hintDe: 'Ein vollendetes Verb hat keine Gegenwart — seine Präsensform ist die Zukunft.',
    items: [
      { promptDe: 'ich werde es machen (fertig)', text: 'zrobić', answer: 'zrobię', wrong: ['robię', 'będę zrobić', 'zrobiłem'] },
      { promptDe: 'ich werde es schreiben (fertig)', text: 'napisać', answer: 'napiszę', wrong: ['piszę', 'będę napisać', 'napisałem'] },
      { promptDe: 'Was heißt „zrobię"?', text: 'zrobię', answer: 'ich werde machen', wrong: ['ich mache gerade', 'ich machte', 'ich würde machen'] },
      { promptDe: 'Was heißt „robię"?', text: 'robię', answer: 'ich mache (gerade)', wrong: ['ich werde machen', 'ich machte', 'ich habe gemacht'] },
    ],
  },

  // ── Imperativ / Konditional ──────────────────────────────
  {
    id: 'imperative.p2.sg',
    conceptIds: ['verb.imperative'],
    kind: 'conjugate',
    frame: '{v1}',
    promptDe: 'Befehl an „du" — Imperativ',
    slots: { v1: { pos: 'V', tag: 'imp.p2.sg' } },
    answerSlot: 'v1',
    distractors: { fromTags: ['imp.p2.pl', 'imp.p1.pl', 'pres.p3.sg'], count: 3 },
    hintDe: 'Nimm die er/sie-Form und schneide die Endung ab.',
  },
  {
    id: 'conditional.p1.sg.m',
    conceptIds: ['verb.conditional'],
    kind: 'conjugate',
    frame: '{v1}',
    promptDe: 'ich würde … — Konditional, männlich',
    slots: { v1: { pos: 'V', tag: 'cond.p1.sg.m' } },
    answerSlot: 'v1',
    distractors: { fromTags: ['cond.p1.sg.f', 'cond.p2.sg.m', 'past.p1.sg.m'], count: 3 },
    hintDe: 'Vergangenheitsform + by + Personenendung.',
  },

  // ── Bewegungsverben ──────────────────────────────────────
  {
    id: 'motion.quiz',
    conceptIds: ['verb.motion'],
    kind: 'quiz',
    frame: '', promptDe: '', slots: {}, answerSlot: '',
    hintDe: 'Kurzes Verb = gerade jetzt. Längeres Verb = immer wieder.',
    items: [
      { promptDe: 'Ich gehe gerade zur Schule (jetzt, zu Fuß)', text: '… do szkoły', answer: 'idę', wrong: ['chodzę', 'jadę', 'jeżdżę'] },
      { promptDe: 'Ich gehe zur Schule (ich bin Schüler)', text: '… do szkoły', answer: 'chodzę', wrong: ['idę', 'jadę', 'jeżdżę'] },
      { promptDe: 'Ich fahre gerade nach Polen (jetzt)', text: '… do Polski', answer: 'jadę', wrong: ['jeżdżę', 'idę', 'chodzę'] },
      { promptDe: 'Ich fahre öfter nach Polen', text: '… do Polski', answer: 'jeżdżę', wrong: ['jadę', 'idę', 'chodzę'] },
      { promptDe: 'Was heißt „chodzę do szkoły"?', text: 'chodzę do szkoły', answer: 'ich gehe zur Schule (regelmäßig)', wrong: ['ich gehe gerade zur Schule', 'ich fahre zur Schule', 'ich ging zur Schule'] },
    ],
  },

  // ── Aspekt / Vorsilben ───────────────────────────────────
  {
    id: 'aspect.pairs.pick',
    conceptIds: ['aspect.pairs'],
    kind: 'aspect-pick',
    frame: '', promptDe: '', slots: {}, answerSlot: '',
    hintDe: 'Vollendet = einmal, fertig. Unvollendet = Prozess oder Gewohnheit.',
  },
  {
    id: 'prefix.aspect.pick',
    conceptIds: ['prefix.aspect'],
    kind: 'aspect-pick',
    frame: '', promptDe: '', slots: {}, answerSlot: '',
    hintDe: 'Die Vorsilbe ist es, die das Verb vollendet macht: robić → zrobić.',
  },
  {
    id: 'prefix.aspect.quiz',
    conceptIds: ['prefix.aspect'],
    kind: 'quiz',
    frame: '', promptDe: '', slots: {}, answerSlot: '',
    items: [
      { promptDe: 'Welche Vorsilbe macht „pisać" vollendet?', text: 'pisać → ?', answer: 'na-', wrong: ['z-', 'po-', 'u-'] },
      { promptDe: 'Welche Vorsilbe macht „robić" vollendet?', text: 'robić → ?', answer: 'z-', wrong: ['na-', 'po-', 'za-'] },
      { promptDe: 'Welche Vorsilbe macht „czekać" vollendet?', text: 'czekać → ?', answer: 'po-', wrong: ['z-', 'na-', 'u-'] },
      { promptDe: 'Welche Vorsilbe macht „płacić" vollendet?', text: 'płacić → ?', answer: 'za-', wrong: ['z-', 'na-', 'po-'] },
      { promptDe: 'Welche Vorsilbe macht „gotować" vollendet?', text: 'gotować → ?', answer: 'u-', wrong: ['z-', 'na-', 'po-'] },
    ],
  },
]
