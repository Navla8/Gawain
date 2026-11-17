import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeProgress, classify, frontier, bestOf, weakness, attemptGrade, sinceReset, PROGRESS_FROM, FAST_PASS, FIRM, type SkillAttempt } from '../src/engine/progress.ts';
import { SKILLS } from '../src/engine/curriculum.ts';

let clock = 0;
const day = (d: number) => new Date(2026, 10, 1 + d, 12, 0, 0, clock++).toISOString();
const att = (d: number, skill: string, score: number, extra: Partial<SkillAttempt> = {}): SkillAttempt =>
  ({ at: day(d), skill, pitchScore: score, rhythmScore: 1, ...extra });
/** 능숙 3번(하나는 다른 날)으로 d일에 숙달 */
const learn = (id: string, d = 0) => [att(d - 1, id, 1), att(d - 1, id, 1), att(d, id, 1)];

test('점검 간격은 3 → 7 → 14일까지만 늘고 그 뒤로는 14일마다', () => {
  const a = learn('d0a');
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
  const p = computeProgress([...learn('d0a'), att(1, 'd0a', 1), att(2, 'd0a', 1)]);
  assert.equal(p.skills.d0a.reviews, 0);
  assert.equal(p.skills.d0a.due, '2026-11-04');
});

test('숙달한 단원을 틀리면 연습으로 돌아가고, 다시 익힐 때는 2번이면 된다', () => {
  const a = [...learn('d0a'), att(3, 'd0a', 0.3)];
  assert.equal(computeProgress(a).skills.d0a.mastered, false);
  a.push(att(4, 'd0a', 1), att(4, 'd0a', 1));
  assert.equal(computeProgress(a).skills.d0a.mastered, true);
});

test('잊은 날에는 몇 번을 맞혀도 다시 숙달하지 않고, 다음 날 한 번 더 맞히면 숙달', () => {
  // 대련 점검에서 틀린 뒤 같은 판의 연습 문항으로 다시 맞힌 경우(실기기 2026-11-14)
  const a = [att(0, 'd2c', 1, { placement: true }), att(3, 'd2c', 0.5), att(3, 'd2c', 1), att(3, 'd2c', 1), att(3, 'd2c', 1)];
  const p = computeProgress(a);
  assert.equal(p.skills.d2c.mastered, false);
  assert.equal(classify(p, 'd2c'), 'weak');
  a.push(att(4, 'd2c', 1));
  assert.equal(computeProgress(a).skills.d2c.mastered, true);
});

test('배치고사는 끝 표시가 있어야 본 것으로 친다(끝 표시 없는 예전 배치고사도 다시 본다)', () => {
  const at = (d: string) => new Date(`${d}T12:00:00`).toISOString();
  const part = [{ at: at('2026-11-20'), skill: 'd2a', placement: true, pitchScore: 1, rhythmScore: 1 }];
  assert.equal(computeProgress(part).placed, false);
  assert.ok(computeProgress(part).skills.d2a.mastered); // 푼 문항은 그대로 반영
  assert.ok(computeProgress([...part, { at: at('2026-11-20'), skill: 'r1', placement: true, placementEnd: true, pitchScore: 1, rhythmScore: 1 }]).placed);
  assert.equal(computeProgress([{ ...part[0], at: at('2026-11-13') }]).placed, false);
});

test('어려운 단원을 맞히면 점검일이 된 아래 단원도 확인된다', () => {
  const a = [...learn('d0a'), ...learn('d0b', 1)];
  a.push(att(5, 'd0b', 1)); // d0a는 11-04가 점검일, d0b는 11-05
  const p = computeProgress(a);
  assert.equal(p.skills.d0a.reviews, 1);
  assert.equal(p.skills.d0b.reviews, 1);
});

test('어려운 단원을 맞혀도 그 단원에 들어 있지 않은 아래 단원은 확인되지 않는다', () => {
  // 배치고사로 리듬·받아쓰기 사다리를 모두 숙달한 뒤, 3일 뒤 맨 위 단원만 맞힘
  const a = [att(0, 'r3c', 1, { placement: true }), att(0, 'g3f', 1, { placement: true }), att(3, 'r3c', 1), att(3, 'g3f', 1)];
  const p = computeProgress(a);
  assert.equal(p.skills.r3c.reviews, 1);
  for (const id of ['r3a', 'r3b', 'r2b', 'g3a', 'g3b', 'g3c', 'g2d', 'g1a']) {
    assert.equal(p.skills[id].reviews, 0, id);
    assert.equal(p.skills[id].due, '2026-11-04', id);
  }
  for (const id of ['g3e', 'g3d']) assert.equal(p.skills[id].reviews, 1, id);
});

test('점검을 아슬아슬하게(90% 미만) 넘기면 간격이 늘지 않고 같은 간격으로 다시 점검', () => {
  const a = [...learn('g1a'), att(3, 'g1a', 0.85)];
  assert.equal(FIRM, 0.9);
  assert.equal(computeProgress(a).skills.g1a.reviews, 0);
  assert.equal(computeProgress(a).skills.g1a.due, '2026-11-07');
  a.push(att(6, 'g1a', 0.95));
  assert.equal(computeProgress(a).skills.g1a.reviews, 1);
  assert.equal(computeProgress(a).skills.g1a.due, '2026-11-14');
});

test('대련의 오답 다시 풀기는 숙달 판정에 넣지 않고, 약점 집계에는 넣는다', () => {
  const a = [0, 1, 2].map(() => att(0, 'g1a', 1, { retry: true, miss: ['도→솔'] }));
  const p = computeProgress(a);
  assert.equal(p.skills.g1a.mastered, false);
  assert.equal(p.skills.g1a.tries, 0);
  assert.deepEqual(weakness(a, 'g1a'), { '도→솔': 3 });
});

test('약점 가중 고르기: 같은 시드면 같은 결과, 약점이 든 후보를 고른다', () => {
  const make = (s: number) => ({ s, tags: s % 3 === 0 ? ['x'] : ['y'] });
  assert.equal(bestOf(make, (x) => x.tags, 1, {}).s, 1);
  assert.equal(bestOf(make, (x) => x.tags, 1, { x: 2 }).s, 3);
  assert.deepEqual(bestOf(make, (x) => x.tags, 1, { x: 2 }), bestOf(make, (x) => x.tags, 1, { x: 2 }));
});

test('배치고사 통과는 그 단원과 아래 단원을 숙달로 본다', () => {
  const p = computeProgress([att(0, 'd2a', 1, { placement: true }), att(0, 'g1b', 0.9, { placement: true }), att(0, 'r2a', 0.2, { placement: true, placementEnd: true })]);
  for (const id of ['d0a', 'd0b', 'd1a', 'd1b', 'd2a', 'g1a', 'g1b']) assert.equal(p.skills[id].mastered, true, id);
  for (const id of ['d2b', 'r1', 'r2a', 'g1c']) assert.equal(p.skills[id].mastered, false, id);
  assert.ok(p.placed);
  assert.equal(p.level, 1); // r1을 못 해서 L1이 남았다
});

test('배치고사를 다시 보면 틀린 단원과 그 위 단원은 숙달 전으로(잊음은 아님)', () => {
  const before = ['d0a', 'd0b', 'd1a', 'd1b', 'd2a'].flatMap((id) => learn(id));
  const p = computeProgress([...before, att(5, 'd1a', 0, { placement: true })]);
  for (const id of ['d0a', 'd0b']) assert.equal(p.skills[id].mastered, true, id);
  for (const id of ['d1a', 'd1b', 'd2a']) assert.equal(p.skills[id].mastered, false, id);
  assert.equal(classify(p, 'd2a'), 'waiting');
  assert.equal(p.skills.d1a.lapsed, false);
});

test('레벨은 유형마다 따로 오르고, 전체 레벨은 가장 낮은 유형 레벨이다', () => {
  const p0 = computeProgress([]);
  assert.equal(p0.level, 0);
  assert.deepEqual(p0.trackLevels, { degree: 0, rhythm: 1, dictation: 1, harmony: 1 });
  // 계이름만 L0·L1을 다 숙달해도 L2 계이름 단원으로 넘어간다(다른 유형에 막히지 않음)
  const deg = ['d0a', 'd0b', 'd1a', 'd1b'].flatMap((id) => learn(id, 1));
  const p1 = computeProgress(deg);
  assert.deepEqual(p1.trackLevels, { degree: 2, rhythm: 1, dictation: 1, harmony: 1 });
  assert.equal(p1.level, 1);
  assert.equal(frontier(p1, 'degree'), 'd2a');
  assert.equal(frontier(p1, 'dictation'), 'g1a');
  assert.equal(p1.history.length, 1);
  assert.equal(p1.history[0].level, 1);
  // 받아쓰기는 음높이·리듬 중 낮은 쪽이 80% 이상이어야 통과
  const p2 = computeProgress([...deg, ...[0, 0, 0].map(() => ({ at: day(2), skill: 'g1a', pitchScore: 1, rhythmScore: 0.7 }))]);
  assert.equal(p2.skills.g1a.mastered, false);
});

test('단원 분류: 쉬움·안정·익히는 중·약함·차례 전', () => {
  const easy = computeProgress(learn('d0a'));
  assert.equal(classify(easy, 'd0a'), 'easy'); // 시도가 모두 능숙
  assert.equal(classify(easy, 'd0b'), 'learning'); // 계이름의 지금 단원
  assert.equal(classify(easy, 'd1a'), 'waiting');
  // 능숙이 아닌 시도가 끼었으면 안정
  assert.equal(classify(computeProgress([att(-1, 'd0a', 0.85), ...learn('d0a')]), 'd0a'), 'stable');
  // 점검에서 잊으면 약함, 다시 익히면 안정(쉬움으로 돌아가지 않음)
  const lapse = [...learn('d0a'), att(3, 'd0a', 0.3)];
  assert.equal(classify(computeProgress(lapse), 'd0a'), 'weak');
  assert.equal(classify(computeProgress([...lapse, att(4, 'd0a', 1), att(4, 'd0a', 1)]), 'd0a'), 'stable');
  // 최근 4번 이상의 점수(능숙 1·통과 0.5·실패 0) 평균이 50% 미만이면 약함
  const low = [0.5, 0.85, 0.5, 0.5].map((x) => att(0, 'd0a', x));
  assert.equal(classify(computeProgress(low.slice(0, 3)), 'd0a'), 'learning');
  assert.equal(classify(computeProgress(low), 'd0a'), 'weak');
  // 간신히 통과만 이어지면 약함은 아니지만 숙달도 안 된다
  const hard = computeProgress([0, 1, 2, 3, 4].map((d) => att(d, 'd0a', 0.85)));
  assert.equal(classify(hard, 'd0a'), 'learning');
});

test('모르는 단원 id나 단원 없는 기록은 무시한다', () => {
  const p = computeProgress([{ at: day(0), pitchScore: 1, rhythmScore: 1 }, att(0, 'zzz', 1)]);
  assert.equal(p.level, 0);
});

test('익히는 단원을 4번 연속 틀리면 바로 아래 단원으로 돌아가 레벨이 내려가고, 아래 단원을 2번 맞히면 다시 올라간다', () => {
  // d0b까지 숙달(L1 d1a를 익히는 중)
  const a = [att(0, 'd0b', 1, { placement: true })];
  assert.equal(computeProgress(a).trackLevels.degree, 1);
  a.push(...[0, 1, 2, 3].map(() => att(1, 'd1a', 0.4)));
  const p = computeProgress(a);
  assert.equal(p.skills.d0b.mastered, false);
  assert.equal(p.skills.d0b.stepped, true);
  assert.equal(p.skills.d0a.mastered, true, '두 단계는 내려가지 않는다');
  assert.equal(frontier(p, 'degree'), 'd0b');
  assert.equal(p.trackLevels.degree, 0);
  assert.equal(classify(p, 'd0b'), 'learning');
  assert.equal(p.history.at(-1)!.level, 0);
  // 같은 날이라도 아래 단원을 2번 맞히면 다시 숙달하고 d1a로 돌아간다
  a.push(att(1, 'd0b', 1), att(1, 'd0b', 1));
  const q = computeProgress(a);
  assert.equal(q.skills.d0b.mastered, true);
  assert.equal(q.skills.d0b.stepped, false);
  assert.equal(frontier(q, 'degree'), 'd1a');
});

test('연속 실패가 4번에 못 미치거나 중간에 통과하면 레벨을 낮추지 않는다', () => {
  const a = [att(0, 'd0b', 1, { placement: true }), ...[0, 1, 2].map(() => att(1, 'd1a', 0.4)), att(1, 'd1a', 0.9), ...[0, 1, 2].map(() => att(1, 'd1a', 0.4))];
  const p = computeProgress(a);
  assert.equal(p.skills.d0b.mastered, true);
  assert.equal(frontier(p, 'degree'), 'd1a');
});

test('사다리 첫 단원은 연속으로 틀려도 내려갈 곳이 없다', () => {
  const p = computeProgress([0, 1, 2, 3, 4].map(() => att(0, 'd0a', 0.5)));
  assert.equal(frontier(p, 'degree'), 'd0a');
  assert.equal(p.skills.d0a.fails, 5);
});

// 능숙도 숙달(프롬프트 2026-11-17 14:58, 15:05)
const slow = { seconds: 999 };
test('능숙(95% 이상·재생 적게·빠르게)을 3번 쌓아야 숙달하고, 3번이 모두 같은 날이면 아직 아니다', () => {
  const a = [att(0, 'd0a', 1), att(0, 'd0a', 1), att(0, 'd0a', 1)];
  assert.equal(computeProgress(a).skills.d0a.mastered, false);
  a.push(att(1, 'd0a', 1));
  const p = computeProgress(a);
  assert.equal(p.skills.d0a.mastered, true);
  assert.equal(p.skills.d0a.due, '2026-11-05');
});

test('간신히 통과(80~95%)·오래 걸림·여러 번 들음은 숙달에 세지 않는다', () => {
  const a = [0, 1, 2, 3].map((d) => att(d, 'd0a', 0.85));
  a.push(...[4, 5].map((d) => att(d, 'd0a', 1, slow)), ...[6, 7].map((d) => att(d, 'd0a', 1, { plays: 3 })));
  const p = computeProgress(a);
  assert.equal(p.skills.d0a.mastered, false);
  assert.equal(p.skills.d0a.streak, 0);
  assert.equal(attemptGrade(att(0, 'd0a', 1, { plays: 1, seconds: 15, answer: ['도', '레', '미'] }), 'degree'), 'fluent');
  assert.equal(attemptGrade(att(0, 'd0a', 1, { plays: 1, seconds: 30, answer: ['도', '레', '미'] }), 'degree'), 'pass');
  assert.equal(attemptGrade(att(0, 'g1a', 1, { plays: 3, seconds: 80, answer: Array(8).fill(0) }), 'dictation'), 'fluent');
  assert.equal(attemptGrade(att(0, 'g1a', 0.5), 'dictation'), 'fail');
  assert.equal(attemptGrade(att(0, 'g1a', 0.3), 'dictation'), 'giveup');
});

test('간신히 통과는 능숙 수를 지키고, 실패는 하나 깎는다', () => {
  const a = [att(0, 'd0a', 1), att(0, 'd0a', 1), att(1, 'd0a', 0.85)];
  assert.equal(computeProgress(a).skills.d0a.streak, 2);
  a.push(att(1, 'd0a', 0.5));
  assert.equal(computeProgress(a).skills.d0a.streak, 1);
  a.push(att(1, 'd0a', 1), att(1, 'd0a', 1));
  assert.equal(computeProgress(a).skills.d0a.mastered, true);
});

test('포기급(40% 미만)은 두 번 틀린 것으로 쳐서 두 번이면 한 단계 내려간다', () => {
  const a = [att(0, 'd0b', 1, { placement: true }), att(1, 'd1a', 0.2), att(1, 'd1a', 0)];
  const p = computeProgress(a);
  assert.equal(p.skills.d0b.mastered, false);
  assert.equal(frontier(p, 'degree'), 'd0b');
});

test('초기화 시점 전 기록은 실력 계산에서 뺀다', () => {
  const old = { at: '2026-11-01T00:00:00.000Z', skill: 'd0a', pitchScore: 1, rhythmScore: 1 };
  const now = { at: '2026-11-18T00:00:00.000Z', skill: 'd0a', pitchScore: 1, rhythmScore: 1 };
  assert.deepEqual(sinceReset([old, now]), [now]);
  assert.ok(PROGRESS_FROM > old.at && PROGRESS_FROM < now.at);
});
