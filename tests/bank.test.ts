import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SETS, pickRandom } from '../src/engine/bank.ts';
import { barProblems, toGlyphs } from '../src/engine/score.ts';

test('기본 문제집: 2도~6도', () => {
  assert.deepEqual(SETS.map((s) => [s.id, s.problems.length]), [['2nd', 19], ['3rd', 30], ['4th', 20], ['5th', 20], ['6th', 30]]);
});

test('모든 문제가 4/4 4마디를 꽉 채우고 건반 음역(F3~C6) 안에 있다', () => {
  for (const s of SETS) for (const p of s.problems) {
    assert.deepEqual(barProblems(p.notes, 4, 4), [], p.id);
    assert.ok(p.notes.every((n) => n.midi! >= 53 && n.midi! <= 84), p.id);
    assert.ok(toGlyphs(p.notes, 4).length >= p.notes.length);
  }
});

test('랜덤 출제: 직전 문제는 다시 내지 않는다', () => {
  for (let i = 0; i < 200; i++) assert.notEqual(pickRandom(19, 7, Math.random), 7);
  assert.equal(pickRandom(1, 0, Math.random), 0);
});
