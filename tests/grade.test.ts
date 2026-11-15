import { test } from 'node:test';
import assert from 'node:assert/strict';
import { grade, tally, inheritSpell, contentTags, missTags } from '../src/engine/grade.ts';
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
  assert.equal(r.pitchScore, 6 / 7);
  assert.equal(r.rhythmScore, 5 / 7);
});

test('남는 음을 여러 개 끼워도 만점이 아니다(H1)', () => {
  const t = mel([60, 12], [62, 12], [64, 12], [65, 12], [67, 24], [64, 24]);
  const ans = mel([60, 12], [61, 6], [62, 6], [63, 12], [64, 12], [65, 6], [66, 6], [67, 24], [65, 12], [64, 12]);
  const r = grade(t, ans);
  assert.ok(r.pitchScore < 1 && r.rhythmScore < 1);
  assert.equal(tally([r]).pitchScore, r.pitchScore);
});

test('쉼표 자리에 음표를 적으면 리듬이 깎인다(H2)', () => {
  const t = mel([60, 12], [null, 12], [64, 12], [65, 12], [67, 12], [null, 12], [64, 24]);
  const ans = mel([60, 12], [62, 12], [64, 12], [65, 12], [67, 12], [65, 12], [64, 24]);
  const r = grade(t, ans);
  assert.deepEqual(r.items.map((i) => i.verdict), ['ok', 'pitch', 'ok', 'ok', 'ok', 'pitch', 'ok']);
  assert.equal(r.pitchScore, 1);
  assert.equal(r.rhythmScore, 5 / 7);
});

test('리듬만 채점: 남는 소리도 분모에 든다', () => {
  const t = mel([71, 12], [null, 12], [71, 24]);
  const r = grade(t, mel([71, 12], [71, 6], [71, 6], [71, 24]));
  assert.ok(tally([r], true).rhythmScore < 1);
  assert.equal(tally([grade(t, t)], true).rhythmScore, 1);
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

test('약점 표식: 선율은 틀린 음으로 가는 계이름 진행, 리듬은 틀린 음 길이', () => {
  const t = mel([60, 12], [69, 12], [null, 12], [67, 6], [67, 6], [60, 48]);
  assert.deepEqual(contentTags(t, 0).sort(), ['4분', '4분쉼표', '8분', '도→라', '라→솔', '솔→도', '솔→솔', '온음표', '↑6도', '↓2도', '↓5도'].sort());
  assert.deepEqual(contentTags(t, 0, true).sort(), ['4분', '4분쉼표', '8분', '온음표'].sort());
  // 라를 솔로(음높이), 8분 둘을 4분 하나로(리듬·빠짐)
  const ans = mel([60, 12], [67, 12], [null, 12], [67, 12], [60, 48]);
  assert.deepEqual(missTags(grade(t, ans), 0).sort(), ['8분', '도→라', '솔→솔', '↑6도'].sort()); // 같은 음 되풀이는 음정 표식 없음
  // 음정은 악보 글자 자리로 센다(증2도 파→솔♯도 2도)
  assert.ok(contentTags(mel([65, 12], [68, 12], [69, 24]), 0, false, true).includes('↑2도'));
  // 리듬만: 쉼표 자리에 음표를 적은 것도 쉼표 틀림
  const r = mel([71, 12], [null, 12], [71, 24]);
  assert.deepEqual(missTags(grade(r, mel([71, 12], [71, 12], [71, 24])), 0, true), ['4분쉼표']);
  // 단조(조표 기준 라 으뜸)
  assert.deepEqual(contentTags(mel([69, 12], [68, 12], [69, 24]), 0, false, true).filter((x) => x.includes('→')), ['라→솔♯', '솔♯→라']);
});

test('맞게 적은 음은 정답 음의 표기(올림·내림)를 물려받는다(M6)', () => {
  const t: Note[] = [{ midi: 71, dur: 12, spell: 1 }, { midi: 72, dur: 12 }, { midi: 70, dur: 24 }];
  const a: Note[] = [{ midi: 71, dur: 12 }, { midi: 72, dur: 12 }, { midi: 69, dur: 24 }];
  const out = inheritSpell(grade(t, a).items, t, a);
  assert.equal(out[0].spell, 1); // 맞은 음: 정답의 표기
  assert.equal(out[2].spell, undefined); // 틀린 음: 그대로
  assert.equal(a[0].spell, undefined); // 원본은 건드리지 않음
});
