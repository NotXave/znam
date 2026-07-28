import type { Template } from './types'

/**
 * Sentence templates. `frame` is Polish with {slot} placeholders; the slot named
 * by `answerSlot` becomes the gap. Slots are filled from the morph table with
 * lemmas the learner already knows, so the exercise tests GRAMMAR, never vocabulary.
 *
 * Frames are written so that they stay natural for any filler satisfying the
 * slot's constraints — that is the whole discipline of the hybrid approach, and
 * `scripts/grammar-audit.ts` exists to check it by sampling real output.
 */
export const TEMPLATES: Template[] = [
  // ── gender.basic ──
  {
    id: 'gender.sort.basic',
    conceptIds: ['gender.basic'],
    kind: 'gender-sort',
    frame: '{n1}',
    promptDe: 'Welches Geschlecht hat dieses Substantiv?',
    slots: { n1: { pos: 'N', tag: 'sg.nom' } },
    answerSlot: 'n1',
    hintDe: 'Schau auf den letzten Buchstaben: Konsonant → männlich, -a → weiblich, -o/-e → sächlich.',
  },

  // ── case.nom.sg ──
  {
    id: 'nom.sg.subject',
    conceptIds: ['case.nom.sg'],
    kind: 'cloze',
    // The adjective is fixed masculine, so the slot must be too — otherwise
    // this generates "kobieta jest duży".
    frame: '{n1} jest duży.',
    promptDe: '… ist groß.',
    slots: { n1: { pos: 'N', tag: 'sg.nom', gender: 'm', semantic: 'concrete' } },
    answerSlot: 'n1',
    distractors: { fromTags: ['sg.gen', 'sg.acc', 'sg.ins'], count: 3 },
    hintDe: 'Das Subjekt steht im Nominativ — also genau so, wie das Wort im Wörterbuch steht.',
  },

  // ── case.acc.sg ──
  {
    id: 'acc.sg.widze',
    conceptIds: ['case.acc.sg'],
    kind: 'cloze',
    frame: 'Widzę {n1}.',
    promptDe: 'Ich sehe … (den/die/das …)',
    slots: { n1: { pos: 'N', tag: 'sg.acc', semantic: 'concrete' } },
    answerSlot: 'n1',
    distractors: { fromTags: ['sg.nom', 'sg.gen', 'sg.ins', 'sg.loc'], count: 3 },
    hintDe: 'widzieć verlangt den Akkusativ. Belebte männliche Wörter sehen dabei aus wie der Genitiv.',
  },
  {
    id: 'acc.sg.widze.person',
    conceptIds: ['case.acc.sg'],
    kind: 'cloze',
    frame: 'Widzę {n1}.',
    promptDe: 'Ich sehe … (eine Person)',
    slots: { n1: { pos: 'N', tag: 'sg.acc', semantic: 'person' } },
    answerSlot: 'n1',
    distractors: { fromTags: ['sg.nom', 'sg.ins', 'sg.loc'], count: 3 },
    hintDe: 'Menschen sind belebt — im Akkusativ sehen sie aus wie der Genitiv: widzę lekarza.',
  },
  {
    id: 'acc.sg.mam',
    conceptIds: ['case.acc.sg'],
    kind: 'cloze',
    frame: 'Mam {n1}.',
    promptDe: 'Ich habe …',
    slots: { n1: { pos: 'N', tag: 'sg.acc', semantic: 'concrete' } },
    answerSlot: 'n1',
    distractors: { fromTags: ['sg.nom', 'sg.gen', 'sg.dat'], count: 3 },
    hintDe: 'mieć („haben") verlangt den Akkusativ.',
  },
  {
    id: 'acc.sg.transform',
    conceptIds: ['case.acc.sg'],
    kind: 'transform',
    frame: '{n1}',
    promptDe: 'Setze das Wort in den Akkusativ Singular.',
    slots: { n1: { pos: 'N', tag: 'sg.acc' } },
    answerSlot: 'n1',
    hintDe: 'Weiblich auf -a → -ę. Sächlich bleibt gleich. Männlich belebt → wie Genitiv.',
  },

  // ── case.ins.sg ──
  {
    id: 'ins.sg.jestem',
    conceptIds: ['case.ins.sg'],
    kind: 'cloze',
    frame: 'Jestem {n1}.',
    promptDe: 'Ich bin … (Beruf/Identität)',
    slots: { n1: { pos: 'N', tag: 'sg.ins', semantic: 'person' } },
    answerSlot: 'n1',
    distractors: { fromTags: ['sg.nom', 'sg.acc', 'sg.gen'], count: 3 },
    hintDe: 'Nach być steht der Beruf im Instrumental — nicht im Nominativ wie im Deutschen.',
  },
  {
    id: 'ins.sg.z',
    conceptIds: ['case.ins.sg'],
    kind: 'cloze',
    frame: 'Idę z {n1}.',
    promptDe: 'Ich gehe mit …',
    slots: { n1: { pos: 'N', tag: 'sg.ins', semantic: 'companion' } },
    answerSlot: 'n1',
    distractors: { fromTags: ['sg.nom', 'sg.gen', 'sg.loc'], count: 3 },
    hintDe: 'z im Sinne von „mit" verlangt den Instrumental: -em (m/n) oder -ą (f).',
  },
  {
    id: 'ins.sg.transform',
    conceptIds: ['case.ins.sg'],
    kind: 'transform',
    frame: '{n1}',
    promptDe: 'Setze das Wort in den Instrumental Singular.',
    slots: { n1: { pos: 'N', tag: 'sg.ins' } },
    answerSlot: 'n1',
    hintDe: 'Männlich und sächlich → -em. Weiblich auf -a → -ą.',
  },
]

export const TEMPLATES_BY_CONCEPT = new Map<string, Template[]>()
for (const t of TEMPLATES) {
  for (const cid of t.conceptIds) {
    const list = TEMPLATES_BY_CONCEPT.get(cid) ?? []
    list.push(t)
    TEMPLATES_BY_CONCEPT.set(cid, list)
  }
}
