import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TRACKS, ladder, skill } from '../src/engine/curriculum.ts';
import { computeProgress, blocker, fluentTime, FLUENT_TIME, type SkillAttempt } from '../src/engine/progress.ts';
import { EST, planMatch, retryIds } from '../src/engine/session.ts';
import { melodyItem, memoryItem, downbeats } from '../src/engine/melody.ts';
import { findProblem } from '../src/engine/bank.ts';
import { gradePlayback, gradeDownbeats, gradeExtract, sliceBars } from '../src/engine/grade.ts';
import { barTicks, TPB } from '../src/engine/types.ts';

let clock = 0;
const at = (d: number) => new Date(2026, 10, 1 + d, 12, 0, 0, clock++).toISOString();
const masterAll = (ids: string[], d = 0): SkillAttempt[] =>
  ids.flatMap((id) => [d - 1, d - 1, d].map((x) => ({ at: at(x), skill: id, pitchScore: 1, rhythmScore: 1 })));

test('선율 기억 유형과 새 단원 사다리·레벨·선수 순서(기획 §M10)', () => {
  assert.ok(TRACKS.some((t) => t.id === 'memory' && t.name === '선율 기억' && t.short === '기억'));
  assert.deepEqual(
    ladder('memory').map((s) => [s.id, s.level]),
    [['m1', 1], ['m2', 1], ['m3', 2], ['m4', 2], ['m5', 2]],
  );
  assert.equal(skill('g2e')?.level, 2);
  assert.equal(skill('g5c')?.level, 5);

  const dictIds = ladder('dictation').map((s) => s.id);
  assert.ok(dictIds.indexOf('g2d') < dictIds.indexOf('g2e') && dictIds.indexOf('g2e') < dictIds.indexOf('g3a'));
  assert.ok(dictIds.indexOf('g5c') < dictIds.indexOf('g5b'));

  // 기억 사다리 선수 순서: m1 ← d0b, m2 ← m1·d1b, m3 ← m2·r2a, m4 ← m3, m5 ← m4·g2e
  assert.deepEqual(skill('m1')?.prereq, ['d0b']);
  assert.deepEqual(skill('m2')?.prereq, ['m1', 'd1b']);
  assert.deepEqual(skill('m3')?.prereq, ['m2', 'r2a']);
  assert.deepEqual(skill('m4')?.prereq, ['m3']);
  assert.deepEqual(skill('m5')?.prereq, ['m4', 'g2e']);

  // 받아쓰기 단원의 기억 선수 연결
  assert.ok(skill('g1a')?.prereq?.includes('m1'));
  assert.ok(skill('g1b')?.prereq?.includes('m2'));
  assert.ok(skill('g2b')?.prereq?.includes('m3'));
  assert.ok(skill('g2d')?.prereq?.includes('m4'));
  assert.ok(skill('g3f')?.prereq?.includes('m5'));
});

test('이미 연 받아쓰기 단원은 새 m 선수 때문에 잠기지 않는다', () => {
  // 아직 시도 없는 g1a: d0b·r1만 숙달했으면 m1에 막힌다
  const fresh = computeProgress(masterAll(['d0a', 'd0b', 'r1']));
  assert.equal(blocker(fresh, 'g1a'), 'm1');

  // 이미 g1a를 시도한 적 있으면 m1 없이도 잠기지 않는다
  const triedG1a = computeProgress([
    ...masterAll(['d0a', 'd0b', 'r1']),
    { at: at(1), skill: 'g1a', pitchScore: 0.7, rhythmScore: 0.7 },
  ]);
  assert.equal(blocker(triedG1a, 'g1a'), undefined);
  assert.ok(planMatch(triedG1a, '2026-11-03').some((s) => s.track === 'dictation'));

  // g2b를 이미 시도했으면 m3 때문에 잠기지 않지만, 아직 시도 없는 g2d는 m4에 막힌다
  const triedG2b = computeProgress([
    ...masterAll(['d0a', 'd0b', 'd1a', 'd1b', 'd2a', 'd2b', 'r1', 'r2a', 'r2b', 'g1a', 'g1b', 'g1c', 'g2a']),
    { at: at(1), skill: 'g2b', pitchScore: 0.85, rhythmScore: 0.85 },
  ]);
  assert.equal(blocker(triedG2b, 'g2b'), undefined);
  assert.equal(blocker(triedG2b, 'g2d'), 'm4');

  // 기억 선수가 아닌 기존 선수(d2b)가 미숙달이면 시도 기록이 있어도 여전히 막힌다
  const missingDeg = computeProgress([
    ...masterAll(['d0a', 'd0b', 'r1', 'g1a']),
    { at: at(1), skill: 'g2b', pitchScore: 0.7, rhythmScore: 0.7 },
  ]);
  assert.equal(blocker(missingDeg, 'g2b'), 'd2b');
});

test('mem- id 생성과 findProblem 재생성, 마디 수·재생 횟수·강박·추출 구간', () => {
  const m4Ranges = new Set<string>();
  const m5Ranges = new Set<string>();
  for (let seed = 1; seed <= 40; seed++) {
    const p1 = memoryItem('m1', seed, '따라 치기 1마디');
    assert.ok(p1.id.startsWith('mem-m1-'));
    assert.equal(p1.bars, 1);
    assert.equal(p1.plays, 1);
    const n1 = p1.notes.filter((n) => n.midi !== null).length;
    assert.ok(n1 >= 3 && n1 <= 5, `m1 음표 수 ${n1}`);
    assert.deepEqual(findProblem(p1.id), p1);

    const p2 = memoryItem('m2', seed, '따라 치기 2마디');
    assert.ok(p2.id.startsWith('mem-m2-'));
    assert.equal(p2.bars, 2);
    assert.equal(p2.plays, 1);
    assert.deepEqual(findProblem(p2.id), p2);

    const p3 = memoryItem('m3', seed, '강박 계이름');
    assert.ok(p3.id.startsWith('mem-m3-'));
    assert.equal(p3.bars, 4);
    assert.equal(p3.plays, 2);
    assert.equal(downbeats(p3).length, 4, `${p3.id} 모든 마디 첫 박에 음이 있어야 함`);
    assert.deepEqual(findProblem(p3.id), p3);

    const p4 = memoryItem('m4', seed, '추출 청취 4마디');
    assert.ok(p4.id.startsWith('mem-m4-'));
    assert.equal(p4.bars, 4);
    assert.equal(p4.plays, 3);
    assert.ok(p4.extract && p4.extract[1] - p4.extract[0] === 2 && p4.extract[0] >= 0 && p4.extract[1] <= 4);
    m4Ranges.add(p4.extract!.join('-'));
    assert.deepEqual(findProblem(p4.id), p4);

    const p5 = memoryItem('m5', seed, '추출 청취 8마디');
    assert.ok(p5.id.startsWith('mem-m5-'));
    assert.equal(p5.bars, 8);
    assert.equal(p5.plays, 3);
    assert.ok(p5.extract && p5.extract[1] - p5.extract[0] === 2 && p5.extract[0] >= 0 && p5.extract[1] <= 8);
    m5Ranges.add(p5.extract!.join('-'));
    assert.deepEqual(findProblem(p5.id), p5);
  }
  assert.ok(m4Ranges.has('0-2') && m4Ranges.has('2-4'), 'm4 앞·뒤 구간 모두 출제');
  assert.ok(m5Ranges.size >= 3, 'm5 여러 2마디 구간 출제');
});

test('오답 재출제(retryIds)가 mem-도 받고, 3번 틀리면 숙달 해제', () => {
  const miss = { at: new Date(2026, 10, 2, 12).toISOString(), skill: 'm1', problemId: 'mem-m1-7', pitchScore: 0.5, rhythmScore: 1 };
  assert.deepEqual(retryIds([miss], '2026-11-03'), ['mem-m1-7']);
  assert.deepEqual(retryIds([miss], '2026-11-02'), []);

  const base = masterAll(['d0a', 'd0b', 'm1']);
  const homeWrong = [0, 1, 2].map((d) => ({ at: at(d + 2), problemId: 'mem-m1-9', pitchScore: 0.75, rhythmScore: 1 }));
  assert.equal(computeProgress([...base, ...homeWrong]).skills.m1.mastered, false);
});

test('세 가지 채점 방식: 따라 치기·강박·추출', () => {
  // 1. 따라 치기: 음 순서만(리듬 무시), 리듬 점수는 항상 1
  const p1 = memoryItem('m1', 1);
  const midis = p1.notes.filter((n) => n.midi !== null).map((n) => n.midi!);
  const perfect = gradePlayback(p1.notes, midis);
  assert.equal(perfect.pitchScore, 1);
  assert.equal(perfect.rhythmScore, 1);

  // 한 음 빠뜨려도 뒤가 줄줄이 틀리지 않음
  const dropped = gradePlayback(p1.notes, midis.filter((_, i) => i !== 1));
  assert.equal(dropped.rhythmScore, 1);
  assert.equal(dropped.pitchScore, (midis.length - 1) / midis.length);

  // 한 음 틀림
  const wrongOne = gradePlayback(p1.notes, midis.map((m, i) => (i === 0 ? m + 2 : m)));
  assert.equal(wrongOne.rhythmScore, 1);
  assert.equal(wrongOne.pitchScore, (midis.length - 1) / midis.length);

  // 2. 강박 계이름: 마디 첫 박 계이름 일치 비율
  const p3 = memoryItem('m3', 1);
  const db = downbeats(p3).map((b) => b.name);
  const gAll = gradeDownbeats(db, [...db]);
  assert.equal(gAll.pitchScore, 1);
  assert.equal(gAll.rhythmScore, 1);
  assert.deepEqual(gAll.miss, []);

  const gThree = gradeDownbeats(db, [db[0] === '도' ? '레' : '도', ...db.slice(1)]);
  assert.equal(gThree.pitchScore, 0.75);
  assert.equal(gThree.rhythmScore, 1);
  assert.deepEqual(gThree.miss, [db[0]]);

  // 3. 추출 청취: 지정 구간만 기존 받아쓰기 채점
  const p4 = memoryItem('m4', 1);
  const [from, to] = p4.extract!;
  const slice = sliceBars(p4.notes, barTicks(p4), from, to);
  const gExtOk = gradeExtract(p4, slice);
  assert.equal(gExtOk.pitchScore, 1);
  assert.equal(gExtOk.rhythmScore, 1);

  // 구간 안 한 음만 틀리게
  const tweaked = slice.map((n, i) => (i === 0 && n.midi !== null ? { ...n, midi: n.midi + 2, dur: TPB } : n));
  const gExtPart = gradeExtract(p4, tweaked);
  assert.ok(gExtPart.pitchScore < 1);
});

test('g2e 8마디(쉬운 선율)와 g5c 8마디(재생 4회)', () => {
  for (let seed = 1; seed <= 30; seed++) {
    const e = melodyItem('g2e', seed, '8마디 (쉬운 선율)');
    assert.equal(e.bars, 8);
    assert.equal(e.plays, undefined);
    assert.ok(Math.abs(e.fifths) <= 2);
    assert.equal(e.notes.reduce((a, n) => a + n.dur, 0), barTicks(e) * 8);
    assert.deepEqual(findProblem(e.id), e);

    const c = melodyItem('g5c', seed, '8마디 (재생 4회)');
    assert.equal(c.bars, 8);
    assert.equal(c.plays, 4);
    assert.equal(c.notes.reduce((a, n) => a + n.dur, 0), barTicks(c) * 8);
    assert.deepEqual(findProblem(c.id), c);
  }
});

test('능숙 시간(FLUENT_TIME.memory)과 예상 시간(EST.memory)', () => {
  assert.ok(Array.isArray(FLUENT_TIME.memory));
  assert.ok(EST.memory > 0 && EST.memory < EST.dictation);
  assert.ok(fluentTime('memory', 4, 'm1') < fluentTime('memory', 7, 'm4'));
  assert.ok(fluentTime('memory', 7, 'm4') < fluentTime('dictation', 14));
});
