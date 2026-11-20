import { test } from 'node:test';
import assert from 'node:assert/strict';
import { degreeItem, degreeName, resolution, tonicItem } from '../src/engine/drills.ts';
import { findProblem } from '../src/engine/bank.ts';
import { MAX_LEVEL, SKILLS, ladder, skill, within } from '../src/engine/curriculum.ts';
import { classify, computeProgress, frontier, type SkillAttempt } from '../src/engine/progress.ts';
import { planMatch } from '../src/engine/session.ts';

const pc = (m: number) => ((m % 12) + 12) % 12;

let clock = 0;
const at = (d: number) => new Date(2026, 10, 1 + d, 12, 0, 0, clock++).toISOString();
const masterAll = (ids: string[], d = 0): SkillAttempt[] =>
  ids.flatMap((id) => [d - 1, d - 1, d].map((x) => ({ at: at(x), skill: id, pitchScore: 1, rhythmScore: 1 })));

test('조성 잡기(k0a~k0c): 결정성·후보 구성·도 위치 일치·음역', () => {
  const k0aDistractors = new Set(['솔', '파', '레', '라']);
  const majorNonDo = new Set(['레', '미', '파', '솔', '라', '티']);

  for (const id of ['k0a', 'k0b', 'k0c']) {
    assert.deepEqual(tonicItem(id, 42), tonicItem(id, 42));
    const answers = new Set<number>();
    let doIsLowest = 0;
    const total = 300;
    for (let seed = 1; seed <= total; seed++) {
      const it = tonicItem(id, seed);
      assert.equal(it.id, `ton-${id}-${seed}`);
      assert.equal(it.skill, id);
      assert.equal(it.minor, false);
      assert.equal(pc(it.tonic), pc(it.fifths * 7), `${id} ${seed}: 으뜸음`);
      assert.ok(it.tonic >= 55 && it.tonic <= 66, `${id} ${seed}: 도 음역(G3~F#4)`);

      const wantLen = id === 'k0a' ? 2 : id === 'k0b' ? 4 : 3;
      assert.equal(it.candidates.length, wantLen, `${id} ${seed}: 후보 개수`);
      assert.equal(it.candNames.length, wantLen, `${id} ${seed}: 계이름 개수`);
      assert.ok(it.candidates.every((m) => m >= 48 && m <= 84), `${id} ${seed}: 후보 음역`);
      assert.equal(new Set(it.candNames).size, wantLen, `${id} ${seed}: 후보 중복 없음`);

      // 후보 안에 도가 정확히 하나, answer 위치 일치
      assert.equal(it.candNames.filter((n) => n === '도').length, 1, `${id} ${seed}: 도 1개`);
      assert.ok(it.answer >= 0 && it.answer < wantLen, `${id} ${seed}: answer 범위`);
      assert.equal(it.candNames[it.answer], '도', `${id} ${seed}: answer 계이름`);
      assert.equal(it.candidates[it.answer], it.tonic, `${id} ${seed}: answer MIDI`);
      it.candidates.forEach((m, i) => assert.equal(degreeName(m - it.tonic), it.candNames[i], `${id} ${seed}: MIDI-계이름 일치`));

      const others = it.candNames.filter((n) => n !== '도');
      if (id === 'k0a') assert.ok(others.every((n) => k0aDistractors.has(n)), `${id} ${seed}: ${others}`);
      if (id === 'k0b') assert.ok(others.every((n) => majorNonDo.has(n)), `${id} ${seed}: ${others}`);
      if (id === 'k0c') {
        assert.ok(others.includes('솔'), `${id} ${seed}: k0c 후보에 솔 포함`);
        assert.ok(others.every((n) => majorNonDo.has(n)), `${id} ${seed}: ${others}`);
      }

      if (id !== 'k0c') assert.deepEqual(it.lead, [], `${id} ${seed}: lead 없음`);
      answers.add(it.answer);
      if (it.candidates[it.answer] === Math.min(...it.candidates)) doIsLowest++;
    }
    const wantLen = id === 'k0a' ? 2 : id === 'k0b' ? 4 : 3;
    assert.equal(answers.size, wantLen, `${id}: 모든 후보 자리에 도가 나온다`);
    assert.ok(doIsLowest < total * 0.9, `${id}: 도가 늘 최저음이 아니어야 함 (${doIsLowest}/${total})`);
  }
});

test('k0c 도 붙잡기: 4음 선율이 티·라·솔·레·파 중에서 시작하고 도로 끝나지 않는다', () => {
  const starts = new Set(['티', '라', '솔', '레', '파']);
  const seenStarts = new Set<string>();
  for (let seed = 1; seed <= 300; seed++) {
    const it = tonicItem('k0c', seed);
    assert.equal(it.lead.length, 4, `${seed}: 4음 선율`);
    assert.ok(it.lead.every((m) => m >= 48 && m <= 84), `${seed}: 선율 음역`);
    const first = degreeName(it.lead[0] - it.tonic);
    const last = degreeName(it.lead[3] - it.tonic);
    assert.ok(starts.has(first), `${seed}: 시작음 ${first}`);
    assert.notEqual(last, '도', `${seed}: 도로 끝나지 않음`);
    seenStarts.add(first);
    for (let i = 1; i < it.lead.length; i++) assert.notEqual(it.lead[i], it.lead[i - 1], `${seed}: 같은 음 반복 없음`);
  }
  assert.equal(seenStarts.size, 5, '티·라·솔·레·파 모두 시작음으로 출제');
});

test('조성 잡기(k0a~k0c): 많이 고른 방해음이 더 자주 나온다', () => {
  const count = (id: string, name: string, weak: Record<string, number>) => {
    let n = 0;
    for (let seed = 1; seed <= 400; seed++) if (tonicItem(id, seed, weak).candNames.includes(name)) n++;
    return n;
  };
  assert.ok(count('k0a', '솔', { 솔: 3 }) > count('k0a', '솔', {}) * 1.5);
  assert.ok(count('k0b', '티', { 티: 3 }) > count('k0b', '티', {}) * 1.2);
  assert.ok(count('k0c', '레', { 레: 3 }) > count('k0c', '레', {}) * 1.5);
});

test('k0d 첫 음 계이름: 기존 degreeItem 재사용(1음, 장음계 7선택지) + resolution() 7개 값', () => {
  assert.deepEqual(degreeItem('k0d', 7), degreeItem('k0d', 7));
  const seen = new Set<string>();
  for (let seed = 1; seed <= 200; seed++) {
    const it = degreeItem('k0d', seed);
    assert.equal(it.id, `deg-k0d-${seed}`);
    assert.equal(it.minor, false);
    assert.equal(it.names.length, 1);
    assert.equal(it.midis.length, 1);
    assert.deepEqual(it.choices, ['도', '레', '미', '파', '솔', '라', '티']);
    assert.ok(it.choices.includes(it.names[0]));
    seen.add(it.names[0]);
  }
  assert.equal(seen.size, 7);

  // resolution(rel): 레·미·파·솔은 내려가며, 라·티는 올라가며 도까지
  assert.deepEqual(resolution(0), [0]);
  assert.deepEqual(resolution(2), [2, 0]);
  assert.deepEqual(resolution(4), [4, 2, 0]);
  assert.deepEqual(resolution(5), [5, 4, 2, 0]);
  assert.deepEqual(resolution(7), [7, 5, 4, 2, 0]);
  assert.deepEqual(resolution(9), [9, 11, 12]);
  assert.deepEqual(resolution(11), [11, 12]);
});

test('bank.ts findProblem()이 ton- id를 다시 만든다', () => {
  for (const id of ['k0a', 'k0b', 'k0c']) {
    const it = tonicItem(id, 123);
    assert.deepEqual(findProblem(it.id), it);
  }
  assert.equal(findProblem('ton-zzz-1'), undefined);
});

test('사다리 순서·bridge·covers(k0b ⊃ k0a 3,000문항 95% 이상)', () => {
  assert.deepEqual(ladder('degree').slice(0, 5).map((s) => s.id), ['k0a', 'k0b', 'k0c', 'k0d', 'd0a']);
  for (const id of ['k0a', 'k0b', 'k0c', 'k0d']) {
    const s = skill(id);
    assert.equal(s?.track, 'degree', id);
    assert.equal(s?.level, 0, id);
    assert.equal(s?.bridge, true, id);
  }
  assert.ok(within('k0b').includes('k0a'));

  const k0aDistractors = new Set(['솔', '파', '레', '라']);
  let hit = 0;
  for (let seed = 1; seed <= 3000; seed++) {
    const it = tonicItem('k0b', seed);
    if (it.candNames.includes('도') && it.candNames.some((n) => k0aDistractors.has(n))) hit++;
  }
  assert.ok(hit / 3000 >= 0.95, `k0b ⊃ k0a: ${hit}/3000`);
});

test('기존 기록 호환(M10 bridge 방식): d0a 이상 기록이 있어도 유형·전체 레벨과 열린 단원이 그대로', () => {
  // 새 사용자는 k0a부터, d0a는 차례 전
  const fresh = computeProgress([]);
  assert.equal(frontier(fresh, 'degree'), 'k0a');
  assert.equal(classify(fresh, 'k0a'), 'learning');
  assert.equal(classify(fresh, 'd0a'), 'waiting');
  assert.equal(fresh.trackLevels.degree, 0);
  assert.equal(fresh.level, 0);

  // d0a만 시도한 기존 사용자: d0a가 잠기지 않는다
  const triedD0a = computeProgress([{ at: at(0), skill: 'd0a', pitchScore: 0.7, rhythmScore: 1 }]);
  assert.equal(classify(triedD0a, 'd0a'), 'learning');
  assert.equal(classify(triedD0a, 'd0b'), 'waiting');

  // d0a 숙달 기존 사용자: d0b가 열린 상태 유지
  const didD0a = computeProgress(masterAll(['d0a']));
  assert.equal(classify(didD0a, 'd0a'), 'easy');
  assert.equal(classify(didD0a, 'd0b'), 'learning');
  assert.equal(classify(didD0a, 'd1a'), 'waiting');
  assert.equal(didD0a.trackLevels.degree, 0);

  // L0~L1 계이름 숙달 기존 사용자: 유형 레벨 2, d2a 열린 상태 유지
  const didL1 = computeProgress(masterAll(['d0a', 'd0b', 'd1a', 'd1b']));
  assert.equal(didL1.trackLevels.degree, 2);
  assert.equal(didL1.level, 1);
  assert.equal(classify(didL1, 'd2a'), 'learning');
  assert.equal(classify(didL1, 'd2b'), 'waiting');

  // L0~L3 기존 단원 전부 숙달: 전체 레벨 4·계이름 레벨 4 유지, bridge는 frontier·대련에 나옴
  const upToL3 = SKILLS.filter((s) => s.level <= 3 && !s.bridge).map((s) => s.id);
  const p3 = computeProgress(masterAll(upToL3));
  assert.equal(p3.level, 4);
  assert.equal(p3.trackLevels.degree, 4);
  assert.equal(classify(p3, 'd4a'), 'learning');
  assert.equal(frontier(p3, 'degree'), 'k0a');
  assert.ok(planMatch(p3, '2026-11-02').some((s) => s.track === 'degree' && s.role === 'learn'));

  // L0~L5 기존 단원 전부 숙달: 완료 유지
  const allCore = SKILLS.filter((s) => !s.bridge).map((s) => s.id);
  const p5 = computeProgress(masterAll(allCore));
  assert.equal(p5.level, MAX_LEVEL + 1);
  assert.equal(p5.trackLevels.degree, MAX_LEVEL + 1);

  // 배치고사 통과는 아래 k0a~k0d도 숙달 처리
  const placed = computeProgress([{ at: at(0), skill: 'd0a', placement: true, pitchScore: 1, rhythmScore: 1 }]);
  for (const id of ['k0a', 'k0b', 'k0c', 'k0d', 'd0a']) assert.equal(placed.skills[id].mastered, true, id);

  // ton- 오답 3회 누적 시 숙달 해제(skill 없는 자유 오답 재풀이에서도)
  const base = masterAll(['k0a']);
  const homeWrong = [0, 1, 2].map((d) => ({ at: at(d + 2), problemId: 'ton-k0a-9', pitchScore: 0.5, rhythmScore: 1 }));
  assert.equal(computeProgress([...base, ...homeWrong]).skills.k0a.mastered, false);
});
