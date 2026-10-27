import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SETS } from '../src/engine/bank.ts';
import { barProblems, toGlyphs } from '../src/engine/score.ts';

test('기본 문제집: 2도 19개, 6도 30개', () => {
  assert.deepEqual(SETS.map((s) => [s.id, s.problems.length]), [['2nd', 19], ['6th', 30]]);
});

test('모든 문제가 4/4 4마디를 꽉 채우고 장음계 안의 음만 쓴다', () => {
  for (const s of SETS) for (const p of s.problems) {
    assert.deepEqual(barProblems(p.notes, 4, 4), [], p.id);
    for (const n of p.notes) assert.ok([0, 2, 4, 5, 7, 9, 11].includes((((n.midi! - p.tonic) % 12) + 12) % 12), p.id);
    assert.ok(toGlyphs(p.notes, 4).length >= p.notes.length);
  }
});
