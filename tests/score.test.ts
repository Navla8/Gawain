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
  assert.deepEqual(barProblems([n(60, 48), n(62, 48)], 48, 2), []);
  assert.deepEqual(barProblems([n(60, 48), n(62, 36)], 48, 2), [2]);
  assert.deepEqual(barProblems([n(60, 36), n(62, 24), n(62, 36)], 48, 2), []); // 마디선을 넘는 음
  assert.deepEqual(barProblems([n(60, 48), n(62, 60)], 48, 2), [2]); // 넘침
  assert.deepEqual(barProblems([n(60, 48)], 48, 2), [2]);
});

test('악보 글리프: 마디선에서 나누고 붙임줄을 단다', () => {
  const g = toGlyphs([n(60, 36), n(62, 24), n(64, 36)], 48);
  assert.deepEqual(g.map((x) => [x.midi, x.value, x.dotted, x.tie, x.bar]), [
    [60, 24, true, false, 0],
    [62, 12, false, true, 0],
    [62, 12, false, false, 1],
    [64, 24, true, false, 1],
  ]);
});

test('셋잇단과 기묘한 길이도 적을 수 있는 음표로 쪼갠다', () => {
  const g = toGlyphs([n(60, 4), n(62, 4), n(64, 4), n(65, 10), n(67, 26)], 48);
  assert.ok(g.slice(0, 3).every((x) => x.triplet && x.value === 6));
  const f = g.filter((x) => x.src === 3);
  assert.equal(f.reduce((a, x) => a + x.ticks, 0), 10);
  assert.equal(g.reduce((a, x) => a + x.ticks, 0), 48);
});

test('6/8 (마디 36틱): 마디선에서 나누고 점4분음표로 적는다', () => {
  const g = toGlyphs([n(60, 18), n(62, 6), n(64, 6), n(65, 6), n(67, 36)], 36);
  assert.deepEqual(g.map((x) => [x.value, x.dotted, x.bar]), [[12, true, 0], [6, false, 0], [6, false, 0], [6, false, 0], [24, true, 1]]);
  assert.deepEqual(barProblems([n(60, 36), n(62, 36)], 36, 2), []);
});

test('타카디미: 홑박자 ta ka di mi, 셋잇단 ta ki da, 겹박자 ta (va) ki (di) da (ma)', async () => {
  const { takadimi } = await import('../src/engine/score.ts');
  assert.deepEqual([0, 3, 6, 9, 12, 4, 8].map((t) => takadimi(t, 12)), ['ta', 'ka', 'di', 'mi', 'ta', 'ki', 'da']);
  assert.deepEqual([0, 6, 12, 3, 9, 15, 18].map((t) => takadimi(t, 18)), ['ta', 'ki', 'da', 'va', 'di', 'ma', 'ta']);
  assert.equal(takadimi(5, 12), '·'); // 박 안 어디에도 맞지 않는 위치
});

test('못갖춘마디: 첫 마디가 짧아 offset만큼 밀려 그리고, 박 수 검사도 밀린 마디선으로 한다', async () => {
  const { toGlyphs, barProblems } = await import('../src/engine/score.ts');
  // 4/4, 한 박 못갖춘마디(offset 36): 4분 | 2분 2분 | … 
  const ns = [{ midi: 67, dur: 12 }, { midi: 72, dur: 24 }, { midi: 71, dur: 24 }];
  const g = toGlyphs(ns, 48, 36);
  assert.deepEqual(g.map((x) => [x.bar, x.start]), [[0, 36], [1, 48], [1, 72]]);
  assert.deepEqual(barProblems(ns, 48, 2, 36), [2]); // 둘째 마디(첫 온마디)까지 채움, 마지막 마디(3박) 모자람
  assert.deepEqual(barProblems([...ns, { midi: 72, dur: 36 }], 48, 2, 36), []);
});
