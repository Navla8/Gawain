import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spell, noteName, solfa, solfege, keySignatureSteps, keyName } from '../src/engine/theory.ts';

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

test('상대 계이름은 조표의 도 기준 도레미파솔라티', () => {
  assert.equal(solfa(60, 0), '도');
  assert.equal(solfa(71, 0), '티');
  assert.equal(solfa(57, 0), '라');
  assert.equal(solfa(62, 2), '도'); // D장조의 D
  assert.equal(solfa(73, 2), '티');
  assert.equal(solfa(66, 0), '파♯');
  assert.equal(solfa(66, -1), '레♭'); // F장조에서 G♭
  assert.equal(solfa(68, 0), '솔♯'); // 가단조 화성단음계의 이끈음
});

test('조 이름', () => {
  assert.equal(keyName({ tonic: 60, fifths: 0 }), 'C 장조');
  assert.equal(keyName({ tonic: 63, fifths: -3 }), 'E♭ 장조');
  assert.equal(keyName({ tonic: 57, fifths: 0, minor: true }), 'A 단조');
  assert.equal(keyName({ tonic: 66, fifths: 3, minor: true }), 'F♯ 단조');
});

test('솔페지 음절: 조의 도를 기준으로 음계 음을 읽는다', () => {
  const scale = (tonic: number, fifths: number) => [0, 2, 4, 5, 7, 9, 11].map((s) => solfege(tonic + s, fifths));
  const names = ['Do', 'Re', 'Mi', 'Fa', 'Sol', 'La', 'Ti'];
  assert.deepEqual(scale(60, 0), names);
  assert.deepEqual(scale(62, 2), names); // D장조
  assert.deepEqual(scale(63, -3), names); // E♭장조
  assert.deepEqual(scale(66, -6), names); // G♭장조
  assert.equal(solfege(57, 0), 'La'); // 단조도 조표 기준이라 으뜸음이 La
});

test('솔페지 음절: 반음은 악보 표기를 따른다(♯조 Di Ri Fi Si Li, ♭조 Ra Me Se Le Te)', () => {
  const chromatic = (tonic: number, fifths: number) => [1, 3, 6, 8, 10].map((s) => solfege(tonic + s, fifths));
  assert.deepEqual(chromatic(60, 0), ['Di', 'Ri', 'Fi', 'Si', 'Li']);
  assert.deepEqual(chromatic(67, 1), ['Di', 'Ri', 'Fi', 'Si', 'Li']);
  assert.deepEqual(chromatic(65, -1), ['Ra', 'Me', 'Se', 'Le', 'Te']);
  assert.deepEqual(chromatic(63, -3), ['Ra', 'Me', 'Se', 'Le', 'Te']);
});

test('조표 위치', () => {
  assert.deepEqual(keySignatureSteps(2).map((s) => s.step), [38, 35]); // F5, C5
  assert.equal(keySignatureSteps(-3).length, 3);
});
