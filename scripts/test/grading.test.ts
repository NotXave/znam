import { strict as assert } from 'node:assert'
import { test } from 'node:test'

import { editDistance, grade, gradeChoice, normalize, stripDiacritics } from '../../utils/grammar/grading'

test('normalize trims, lowercases and drops trailing punctuation', () => {
  assert.equal(normalize('  Kota. '), 'kota')
  assert.equal(normalize('w  domu'), 'w domu')
})

test('stripDiacritics folds every Polish diacritic', () => {
  assert.equal(stripDiacritics('żółć'), 'zolc')
  assert.equal(stripDiacritics('kobietę'), 'kobiete')
  assert.equal(stripDiacritics('książką'), 'ksiazka')
})

test('editDistance', () => {
  assert.equal(editDistance('kot', 'kot'), 0)
  assert.equal(editDistance('kota', 'koty'), 1)
  assert.equal(editDistance('', 'abc'), 3)
})

test('an exact answer is correct with no caveat', () => {
  const r = grade('kota', 'kota')
  assert.equal(r.verdict, 'correct')
  assert.ok(r.correct)
  assert.ok(!r.nearMiss)
})

test('missing diacritics count as correct but flag a near miss', () => {
  const r = grade('kobiete', 'kobietę')
  assert.equal(r.verdict, 'diacritics')
  assert.ok(r.correct)
  assert.ok(r.nearMiss)
  assert.match(r.noteDe ?? '', /kobietę/)
})

test('a one-char typo on a long word is forgiven', () => {
  const r = grade('nauczycielm', 'nauczycielem')
  assert.equal(r.verdict, 'typo')
  assert.ok(r.correct)
  assert.ok(r.nearMiss)
})

test('a one-char difference on a SHORT word is a real error, not a typo', () => {
  // This is the whole point: on short Polish words the single differing
  // character IS the case ending, so forgiving it would forgive the mistake.
  for (const [given, want] of [['kot', 'kota'], ['okno', 'oknem'], ['dom', 'domu']]) {
    const r = grade(given, want)
    assert.equal(r.verdict, 'wrong', `${given} vs ${want} must not be forgiven`)
    assert.ok(!r.correct)
  }
})

test('a wrong case is always wrong, however long the word', () => {
  const r = grade('nauczyciela', 'nauczycielem')
  assert.equal(r.verdict, 'wrong')
  assert.ok(!r.correct)
})

test('alsoAccept variants are honoured', () => {
  const r = grade('kinie', 'kinie', ['kinu'])
  assert.ok(r.correct)
  const alt = grade('kinu', 'kinie', ['kinu'])
  assert.equal(alt.verdict, 'correct')
})

test('empty input is wrong', () => {
  assert.equal(grade('   ', 'kota').verdict, 'wrong')
})

test('gradeChoice is exact', () => {
  assert.ok(gradeChoice('kota', 'kota').correct)
  assert.ok(!gradeChoice('kotem', 'kota').correct)
  assert.ok(!gradeChoice('kota', 'kotem').nearMiss)
})
