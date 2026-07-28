import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  buildDistractors,
  generate,
  guessGender,
  makeRandom,
  rankLemmas,
  resetExerciseIds,
  shuffle,
  type Paradigm,
  type VocabRank,
} from '../../utils/grammar/generator'
import { TEMPLATES } from '../../utils/grammar/templates'
import type { Exercise } from '../../utils/grammar/types'

/** Load the real bundled table — generation bugs hide in real paradigms. */
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const paradigms = new Map<string, Paradigm>()
const ranks = new Map<string, number>()
{
  const text = readFileSync(join(ROOT, 'public', 'data', 'pl.morph.tsv'), 'utf-8')
  for (const line of text.split('\n')) {
    if (!line) continue
    const [lemma, , tag, form] = line.split('\t')
    if (!lemma || !tag || !form) continue
    let p = paradigms.get(lemma)
    if (!p) { p = new Map(); paradigms.set(lemma, p) }
    p.set(tag, form)
  }
  const freq = readFileSync(join(ROOT, 'public', 'data', 'pl.freq.tsv'), 'utf-8')
  for (const line of freq.split('\n')) {
    const [lemma, rank] = line.split('\t')
    if (lemma && rank) ranks.set(lemma, Number(rank))
  }
}

const allKnown: VocabRank = {
  learning: new Set(),
  known: new Set(paradigms.keys()),
  ignored: new Set(),
  rank: ranks,
}

/**
 * Each exercise kind promises the UI a different shape — a cloze has a gap and
 * a cue, an `order` item has no sentence at all because its words ARE the
 * options. Encoding that here keeps a new kind from silently rendering as a
 * blank card.
 */
function assertKindShape(e: Exercise, id: string) {
  switch (e.kind) {
    case 'cloze':
      assert.ok(e.text.includes('___'), `${id}: cloze needs a gap`)
      assert.ok(e.cue.length > 0, `${id}: cloze needs a cue`)
      break
    case 'transform':
    case 'gender-sort':
      // The question IS the word, so there is no gap and no separate cue.
      assert.ok(e.text.length > 0, `${id}: needs a word to transform`)
      assert.equal(e.cue, '', `${id}: should have no cue`)
      assert.ok(!e.text.includes('___'), `${id}: should not render a gap`)
      break
    case 'conjugate':
      assert.ok(e.text.includes('___'), `${id}: conjugate needs a gap`)
      assert.ok(e.cue.length > 0, `${id}: conjugate needs the infinitive as cue`)
      break
    case 'order':
      // The scrambled words are the options; there is no sentence to show.
      assert.equal(e.text, '', `${id}: order shows no sentence`)
      assert.ok(e.options.length >= 3, `${id}: too few words to reorder`)
      assert.equal(
        [...e.options].sort().join(' '),
        e.answer.split(' ').sort().join(' '),
        `${id}: options must be exactly the answer's words`,
      )
      break
    case 'translate':
      assert.equal(e.text, '', `${id}: translate shows no Polish`)
      assert.equal(e.options.length, 0, `${id}: translate is free text`)
      assert.ok(e.promptDe.length > 0, `${id}: translate needs a German prompt`)
      break
    case 'aspect-pick':
      assert.equal(e.options.length, 2, `${id}: exactly the two aspect partners`)
      assert.ok(e.options.includes(e.answer), `${id}: answer missing from options`)
      break
    case 'match':
    case 'prefix-pick':
    case 'prefix-meaning':
      assert.ok(e.options.length >= 3, `${id}: needs real choices`)
      assert.ok(e.options.includes(e.answer), `${id}: answer missing from options`)
      assert.ok(e.promptDe.length > 0, `${id}: needs a German prompt`)
      break
  }
  if (e.options.length > 0) {
    assert.equal(new Set(e.options).size, e.options.length, `${id}: duplicate options`)
  }
}

test('the real morph table loaded', () => {
  assert.ok(paradigms.size > 800, `expected ~925 lemmas, got ${paradigms.size}`)
  assert.ok(paradigms.get('kot')?.get('sg.acc'), 'kot has an accusative')
})

test('guessGender follows the rule the lesson teaches', () => {
  const g = (nom: string) => guessGender(new Map([['sg.nom', nom]]))
  assert.equal(g('kot'), 'm')
  assert.equal(g('dom'), 'm')
  assert.equal(g('kobieta'), 'f')
  assert.equal(g('okno'), 'n')
  assert.equal(g('morze'), 'n')
  assert.equal(guessGender(new Map()), undefined)
})

test('rankLemmas prefers learning words, then known, and drops ignored', () => {
  const vocab: VocabRank = {
    learning: new Set(['kot']),
    known: new Set(['dom']),
    ignored: new Set(['pies']),
    rank: new Map([['kot', 500], ['dom', 100], ['pies', 50], ['rzecz', 200]]),
  }
  const out = rankLemmas(['pies', 'rzecz', 'dom', 'kot'], vocab)
  assert.equal(out[0], 'kot', 'learning word first')
  assert.equal(out[1], 'dom', 'then known')
  assert.ok(!out.includes('pies'), 'ignored words never appear')
  assert.ok(out.includes('rzecz'), 'common unmet words are allowed as fallback')
})

test('rankLemmas drops rare words the learner has never met', () => {
  const vocab: VocabRank = {
    learning: new Set(),
    known: new Set(),
    ignored: new Set(),
    rank: new Map([['czesty', 100], ['rzadki', 99_999]]),
  }
  const out = rankLemmas(['czesty', 'rzadki'], vocab)
  assert.deepEqual(out, ['czesty'], 'an exercise must test grammar, not vocabulary')
})

test('the game still works when no frequency list is installed', () => {
  // The morph table is frequency-filtered at build time, so an unranked lemma
  // means "freq data missing", not "rare word". Dropping those made the whole
  // tab unplayable on a fresh profile.
  const vocab: VocabRank = {
    learning: new Set(),
    known: new Set(),
    ignored: new Set(),
    rank: new Map(),
  }
  const out = rankLemmas(['kot', 'dom', 'okno'], vocab)
  assert.equal(out.length, 3, 'unranked lemmas stay usable')
})

test('blocked lemmas are dropped even when unranked', () => {
  const vocab: VocabRank = {
    learning: new Set(),
    known: new Set(),
    ignored: new Set(),
    rank: new Map(),
  }
  const out = rankLemmas(['kot', 'kurwa'], vocab)
  assert.deepEqual(out, ['kot'], 'profanity never reaches a drill')
})

test('distractors come from the same paradigm and never include the answer', () => {
  const p = paradigms.get('kot')!
  const answer = p.get('sg.acc')!
  const d = buildDistractors(p, answer, ['sg.nom', 'sg.gen', 'sg.ins'], 3, makeRandom(1))

  assert.equal(d.length, 3)
  assert.ok(!d.includes(answer), 'the answer is never offered as a distractor')
  assert.equal(new Set(d).size, d.length, 'no duplicate options')
  for (const form of d) {
    assert.ok([...p.values()].includes(form), `${form} must come from kot's own paradigm`)
  }
})

test('distractors dedupe syncretic forms', () => {
  // Polish is full of case syncretism (kot: sg.nom and sg.acc can collide for
  // inanimates). Offering the same string twice would be a giveaway.
  for (const lemma of [...paradigms.keys()].slice(0, 200)) {
    const p = paradigms.get(lemma)!
    const answer = p.get('sg.acc')
    if (!answer) continue
    const d = buildDistractors(p, answer, ['sg.nom', 'sg.gen', 'sg.ins', 'sg.loc'], 3, makeRandom(7))
    assert.ok(!d.includes(answer), `${lemma}: answer leaked into distractors`)
    assert.equal(new Set(d).size, d.length, `${lemma}: duplicate distractors`)
  }
})

test('every template generates a valid exercise against the real table', () => {
  resetExerciseIds()
  const lemmas = rankLemmas([...paradigms.keys()], allKnown)

  for (const template of TEMPLATES) {
    const exercise = generate(template, template.conceptIds[0], 'drill', {
      lemmas,
      paradigmOf: l => paradigms.get(l),
      random: makeRandom(42),
    })
    assert.ok(exercise, `${template.id} produced nothing`)
    assert.ok(exercise.answer.length > 0, `${template.id}: empty answer`)
    assert.ok(!exercise.text.includes('{'), `${template.id}: unfilled slot in "${exercise.text}"`)
    assertKindShape(exercise, template.id)
    if (template.distractors) {
      assert.ok(exercise.options.includes(exercise.answer), `${template.id}: answer missing from options`)
      assert.equal(
        new Set(exercise.options).size,
        exercise.options.length,
        `${template.id}: duplicate options`,
      )
    }
  }
})

test('generation is stable across many lemmas without leaking placeholders', () => {
  resetExerciseIds()
  const lemmas = rankLemmas([...paradigms.keys()], allKnown)
  let produced = 0

  for (const template of TEMPLATES) {
    for (let seed = 0; seed < 40; seed++) {
      const offset = seed * 7 % lemmas.length
      const rotated = [...lemmas.slice(offset), ...lemmas.slice(0, offset)]
      const e = generate(template, template.conceptIds[0], 'drill', {
        lemmas: rotated,
        paradigmOf: l => paradigms.get(l),
        random: makeRandom(seed),
      })
      if (!e) continue
      produced++
      assert.ok(!e.text.includes('{'), `${template.id}: unfilled slot "${e.text}"`)
      assertKindShape(e, template.id)
      for (const opt of e.options) {
        assert.ok(opt.length > 0, `${template.id}: empty option`)
      }
    }
  }
  assert.ok(produced > 200, `expected plenty of variety, got ${produced}`)
})

test('generate declines rather than guessing when no lemma fits', () => {
  const impossible = TEMPLATES.find(t => t.id === 'ins.sg.jestem')!
  const e = generate(impossible, 'case.ins.sg', 'drill', {
    lemmas: ['nieistniejące'],
    paradigmOf: () => undefined,
    random: makeRandom(1),
  })
  assert.equal(e, undefined, 'never emit a guessed form')
})

test('shuffle is a permutation', () => {
  const input = [1, 2, 3, 4, 5, 6, 7, 8]
  const out = shuffle(input, makeRandom(3))
  assert.deepEqual([...out].sort((a, b) => a - b), input)
  assert.deepEqual(input, [1, 2, 3, 4, 5, 6, 7, 8], 'input not mutated')
})

test('makeRandom is deterministic', () => {
  const a = makeRandom(99)
  const b = makeRandom(99)
  for (let i = 0; i < 20; i++) assert.equal(a(), b())
})

test('a gender-sort item asks for the gender, not the word', () => {
  const template = TEMPLATES.find(t => t.kind === 'gender-sort')!
  const e = generate(template, template.conceptIds[0], 'warmup', {
    lemmas: ['kobieta'],
    paradigmOf: l => paradigms.get(l),
    random: makeRandom(5),
  })!
  assert.ok(e, 'produced an exercise')
  assert.equal(e.text, 'kobieta', 'the noun itself is the question')
  assert.equal(e.answer, 'weiblich', 'the answer is a gender label')
  assert.equal(e.options.length, 3, 'all three genders offered')
  assert.ok(e.options.includes(e.answer))
  assert.equal(e.cue, '', 'no redundant cue')
})

test('gender-sort gets the gender right across the real table', () => {
  const template = TEMPLATES.find(t => t.kind === 'gender-sort')!
  const expect: Record<string, string> = {
    kot: 'männlich', dom: 'männlich',
    kobieta: 'weiblich', gazeta: 'weiblich',
    okno: 'sächlich', miasto: 'sächlich',
  }
  for (const [lemma, want] of Object.entries(expect)) {
    const e = generate(template, template.conceptIds[0], 'warmup', {
      lemmas: [lemma], paradigmOf: l => paradigms.get(l), random: makeRandom(1),
    })
    assert.ok(e, `${lemma}: nothing generated`)
    assert.equal(e.answer, want, `${lemma} should be ${want}`)
  }
})

test('a transform item shows the base form instead of an empty gap', () => {
  const template = TEMPLATES.find(t => t.kind === 'transform')!
  const e = generate(template, template.conceptIds[0], 'drill', {
    lemmas: ['kot'], paradigmOf: l => paradigms.get(l), random: makeRandom(2),
  })!
  assert.ok(e)
  assert.equal(e.text, 'kot', 'the base form is the question')
  assert.ok(!e.text.includes('___'), 'no empty gap')
  assert.notEqual(e.answer, e.text, 'the answer is a different form')
})
