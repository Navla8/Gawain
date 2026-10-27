import { test } from 'node:test';
import assert from 'node:assert/strict';
import { grade } from '../src/engine/grade.ts';
import type { Note } from '../src/engine/types.ts';

const mel = (...xs: [number | null, number][]): Note[] => xs.map(([midi, dur]) => ({ midi, dur }));
const truth = mel([60, 12], [62, 12], [64, 12], [65, 12], [67, 24], [64, 24]);

test('정답이면 100점', () => {
  const r = grade(truth, truth);
  assert.equal(r.pitchScore, 1);
  assert.equal(r.rhythmScore, 1);
  assert.ok(r.items.every((i) => i.verdict === 'ok'));
});

test('음 하나를 빠뜨려도 뒤가 모두 틀리지 않는다', () => {
  const ans = mel([60, 12], [64, 12], [65, 12], [67, 24], [64, 24]);
  const r = grade(truth, ans);
  assert.deepEqual(r.items.map((i) => i.verdict), ['ok', 'missing', 'ok', 'ok', 'ok', 'ok']);
});

test('남는 음', () => {
  const ans = mel([60, 12], [62, 12], [63, 6], [64, 6], [65, 12], [67, 24], [64, 24]);
  const r = grade(truth, ans);
  assert.equal(r.items.filter((i) => i.verdict === 'extra').length, 1);
  assert.equal(r.items.find((i) => i.verdict === 'extra')!.answer!.midi, 63);
  assert.equal(r.pitchScore, 1);
});

test('음높이 틀림, 리듬 틀림, 둘 다, 옥타브', () => {
  const ans = mel([60, 12], [64, 12], [64, 6], [65, 18], [69, 12], [52, 24]);
  const v = grade(truth, ans).items.map((i) => i.verdict + (i.octave ? '8' : ''));
  assert.deepEqual(v, ['ok', 'pitch', 'rhythm', 'rhythm', 'both', 'pitch8']);
});

test('붙임줄로 적은 답은 합쳐서 채점한다', () => {
  const ans: Note[] = [...truth.slice(0, 4), { midi: 67, dur: 12, tie: true }, { midi: 67, dur: 12 }, truth[5]];
  assert.equal(grade(truth, ans).rhythmScore, 1);
});

test('점수는 음높이와 리듬을 따로 낸다', () => {
  const ans = mel([60, 12], [62, 12], [64, 12], [65, 12], [67, 24], [62, 24]);
  const r = grade(truth, ans);
  assert.equal(r.rhythmScore, 1);
  assert.equal(Math.round(r.pitchScore * 6), 5);
});
