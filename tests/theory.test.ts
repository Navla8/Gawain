import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spell, noteName, solfa, keySignatureSteps } from '../src/engine/theory.ts';

test('조표에 맞춰 음이름을 적는다', () => {
  assert.equal(noteName(60, 0), 'C4');
  assert.equal(noteName(66, 1), 'F♯4'); // G장조
  assert.equal(noteName(70, -1), 'B♭4'); // F장조
  assert.equal(noteName(61, -5), 'D♭4'); // D♭장조
  assert.equal(noteName(66, -6), 'G♭4'); // G♭장조
  assert.equal(noteName(71, -6), 'C♭5'); // G♭장조의 4음은 C♭
  assert.equal(noteName(61, 0), 'C♯4'); // 다장조의 반음은 ♯
  assert.equal(noteName(61, -1), 'D♭4'); // ♭조의 반음은 ♭
});

test('spell은 오선 위치(step)를 돌려준다', () => {
  assert.equal(spell(64, 0).step, 2 + 7 * 4); // E4
  assert.equal(spell(71, -6).step, 0 + 7 * 5); // C♭5는 C5 자리
});

test('상대 계이름은 으뜸음 기준 도레미파솔라티', () => {
  assert.equal(solfa(60, 60, 0), '도');
  assert.equal(solfa(71, 60, 0), '티');
  assert.equal(solfa(57, 60, 0), '라');
  assert.equal(solfa(62, 62, 2), '도'); // D장조의 D
  assert.equal(solfa(73, 62, 2), '티');
  assert.equal(solfa(66, 60, 0), '파♯');
  assert.equal(solfa(66, 65, -1), '레♭'); // F장조에서 G♭
});

test('조표 위치', () => {
  assert.deepEqual(keySignatureSteps(2).map((s) => s.step), [38, 35]); // F5, C5
  assert.equal(keySignatureSteps(-3).length, 3);
});
