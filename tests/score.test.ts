import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toEvents, barProblems, toGlyphs } from '../src/engine/score.ts';
import type { Note } from '../src/engine/types.ts';

const n = (midi: number | null, dur: number, tie = false): Note => ({ midi, dur, tie });

test('붙임줄로 이어진 같은 음은 하나의 소리로 합친다', () => {
  const ev = toEvents([n(60, 12, true), n(60, 6), n(null, 6), n(null, 12)]);
  assert.deepEqual(ev.map((e) => [e.midi, e.start, e.dur]), [[60, 0, 18], [null, 18, 18]]);
  assert.deepEqual(ev[0].src, [0, 1]);
});

test('마디 박 수 검사: 모자라거나 넘치면 문제, 마디선을 넘는 음은 허용', () => {
  assert.deepEqual(barProblems([n(60, 48), n(62, 48)], 4, 2), []);
  assert.deepEqual(barProblems([n(60, 48), n(62, 36)], 4, 2), [2]);
  assert.deepEqual(barProblems([n(60, 36), n(62, 24), n(62, 36)], 4, 2), []); // 마디선을 넘는 음
  assert.deepEqual(barProblems([n(60, 48), n(62, 60)], 4, 2), [2]); // 넘침
  assert.deepEqual(barProblems([n(60, 48)], 4, 2), [2]);
});

test('악보 글리프: 마디선에서 나누고 붙임줄을 단다', () => {
  const g = toGlyphs([n(60, 36), n(62, 24), n(64, 36)], 4);
  assert.deepEqual(g.map((x) => [x.midi, x.value, x.dotted, x.tie, x.bar]), [
    [60, 24, true, false, 0],
    [62, 12, false, true, 0],
    [62, 12, false, false, 1],
    [64, 24, true, false, 1],
  ]);
});

test('셋잇단과 기묘한 길이도 적을 수 있는 음표로 쪼갠다', () => {
  const g = toGlyphs([n(60, 4), n(62, 4), n(64, 4), n(65, 10), n(67, 26)], 4);
  assert.ok(g.slice(0, 3).every((x) => x.triplet && x.value === 6));
  const f = g.filter((x) => x.src === 3);
  assert.equal(f.reduce((a, x) => a + x.ticks, 0), 10);
  assert.equal(g.reduce((a, x) => a + x.ticks, 0), 48);
});
