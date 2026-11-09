import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeProgress, unlocked, type SkillAttempt } from '../src/engine/progress.ts';
import { SKILLS } from '../src/engine/curriculum.ts';

let clock = 0;
const day = (d: number) => new Date(2026, 10, 1 + d, 12, 0, clock++ % 60).toISOString();
const att = (d: number, skill: string, score: number, extra: Partial<SkillAttempt> = {}): SkillAttempt =>
  ({ at: day(d), skill, pitchScore: score, rhythmScore: 1, ...extra });

test('연속 3번 통과하면 숙달, 3일 뒤 첫 점검', () => {
  const p = computeProgress([att(0, 'd0a', 1), att(0, 'd0a', 1), att(0, 'd0a', 0.5), att(0, 'd0a', 1), att(0, 'd0a', 1)]);
  assert.equal(p.skills.d0a.mastered, false);
  const q = computeProgress([att(0, 'd0a', 1), att(0, 'd0a', 0.5), att(0, 'd0a', 1), att(0, 'd0a', 1), att(0, 'd0a', 1)]);
  assert.equal(q.skills.d0a.mastered, true);
  assert.equal(q.skills.d0a.due, '2026-11-04');
});

test('점검 간격은 3 → 7 → 14일까지만 늘고 그 뒤로는 14일마다', () => {
  const a = [att(0, 'd0a', 1), att(0, 'd0a', 1), att(0, 'd0a', 1)];
  a.push(att(3, 'd0a', 1)); // 1차 점검
  assert.equal(computeProgress(a).skills.d0a.due, '2026-11-11');
  a.push(att(10, 'd0a', 1)); // 2차 점검
  assert.equal(computeProgress(a).skills.d0a.due, '2026-11-25');
  a.push(att(24, 'd0a', 1), att(38, 'd0a', 1), att(52, 'd0a', 1)); // 그 뒤로 몇 번을 통과해도
  const st = computeProgress(a).skills.d0a;
  assert.equal(st.reviews, 2);
  assert.equal(st.due, '2027-01-06'); // 마지막 통과(12-23) + 14일
});

test('점검일 전에 통과해도 간격이 늘지 않는다', () => {
  const p = computeProgress([att(0, 'd0a', 1), att(0, 'd0a', 1), att(0, 'd0a', 1), att(1, 'd0a', 1), att(2, 'd0a', 1)]);
  assert.equal(p.skills.d0a.reviews, 0);
  assert.equal(p.skills.d0a.due, '2026-11-04');
});

test('숙달한 단원을 틀리면 연습으로 돌아가고, 다시 익힐 때는 2번이면 된다', () => {
  const a = [att(0, 'd0a', 1), att(0, 'd0a', 1), att(0, 'd0a', 1), att(3, 'd0a', 0.3)];
  assert.equal(computeProgress(a).skills.d0a.mastered, false);
  a.push(att(3, 'd0a', 1), att(3, 'd0a', 1));
  assert.equal(computeProgress(a).skills.d0a.mastered, true);
});

test('어려운 단원을 맞히면 점검일이 된 아래 단원도 확인된다', () => {
  const a = [...[0, 0, 0].map(() => att(0, 'd0a', 1)), ...[1, 1, 1].map((d) => att(d, 'd0b', 1))];
  a.push(att(5, 'd0b', 1)); // d0a는 11-04가 점검일, d0b는 11-05
  const p = computeProgress(a);
  assert.equal(p.skills.d0a.reviews, 1);
  assert.equal(p.skills.d0b.reviews, 1);
});

test('배치고사 통과는 그 단원과 아래 단원을 숙달로 본다', () => {
  const p = computeProgress([att(0, 'd2a', 1, { placement: true }), att(0, 'm1b', 0.9, { placement: true }), att(0, 'r2a', 0.2, { placement: true })]);
  for (const id of ['d0a', 'd0b', 'd1a', 'd1b', 'd2a', 'm1a', 'm1b']) assert.equal(p.skills[id].mastered, true, id);
  for (const id of ['d2b', 'r1', 'r2a', 'm2a']) assert.equal(p.skills[id].mastered, false, id);
  assert.ok(p.placed);
  assert.equal(p.level, 1); // r1을 못 해서 L1이 남았다
});

test('레벨: 아래 레벨을 다 숙달해야 다음 레벨 단원이 열리고, 레벨이 바뀐 때가 남는다', () => {
  const p0 = computeProgress([]);
  assert.equal(p0.level, 0);
  assert.ok(unlocked(p0, 'd0b'));
  assert.ok(!unlocked(p0, 'm1a'));
  const l0 = SKILLS.filter((s) => s.level === 0).flatMap((s) => [0, 0, 0].map(() => att(1, s.id, 1)));
  const p1 = computeProgress(l0);
  assert.equal(p1.level, 1);
  assert.ok(unlocked(p1, 'm1a'));
  assert.ok(!unlocked(p1, 'm2a'));
  assert.equal(p1.history.length, 1);
  assert.equal(p1.history[0].level, 1);
  // 받아쓰기는 음높이·리듬 중 낮은 쪽이 80% 이상이어야 통과
  const p2 = computeProgress([...l0, ...[0, 0, 0].map(() => ({ at: day(2), skill: 'm1a', pitchScore: 1, rhythmScore: 0.7 }))]);
  assert.equal(p2.skills.m1a.mastered, false);
});

test('모르는 단원 id나 단원 없는 기록은 무시한다', () => {
  const p = computeProgress([{ at: day(0), pitchScore: 1, rhythmScore: 1 }, att(0, 'zzz', 1)]);
  assert.equal(p.level, 0);
});
