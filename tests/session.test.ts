import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeProgress, MANY_WRONG, RETRY_SHARE, type SkillAttempt } from '../src/engine/progress.ts';
import { planMatch, stepDown, nextPlacement, placementLeft, frontier, learnUnit, isExam, retryIds, wrongIds, EST, BUDGET, REVIEW_BUDGET } from '../src/engine/session.ts';
import { SKILLS, ladder, within } from '../src/engine/curriculum.ts';

let clock = 0;
const at = (d: number) => new Date(2026, 10, 1 + d, 12, 0, 0, clock++).toISOString();
// 능숙 3번(하나는 다른 날)으로 d일에 숙달
const masterAll = (ids: string[], d = 0): (SkillAttempt & { problemId?: string })[] => ids.flatMap((skill) => [d - 1, d - 1, d].map((x) => ({ at: at(x), skill, pitchScore: 1, rhythmScore: 1 })));

test('처음에는 받아쓰기의 선수 단원(계이름 도~솔, 리듬 4분·2분)부터 익힌다', () => {
  const p = computeProgress([]);
  const plan = planMatch(p, '2026-11-01');
  assert.ok(plan.length >= 6);
  assert.ok(plan.every((s) => s.role === 'learn'));
  assert.deepEqual(['degree', 'rhythm', 'dictation'].map((t) => frontier(p, t as never)), ['d0a', 'r1', 'g1a']);
  assert.equal(plan.filter((s) => s.track === 'dictation').length, 0);
  assert.equal(learnUnit(p, 'dictation'), 'd0a'); // 받아쓰기 자리는 선수 단원 유형의 지금 단원으로
});

test('선수 단원을 다 익히면 받아쓰기가 열리고, 다음 받아쓰기 단원은 그 선수 단원을 기다린다', () => {
  const p = computeProgress(masterAll(['d0a', 'd0b', 'r1', 'g1a']));
  assert.equal(frontier(p, 'dictation'), 'g1b');
  assert.equal(learnUnit(p, 'dictation'), 'd1a'); // g1b는 계이름 장음계 순차(d1a)가 먼저
  const q = computeProgress(masterAll(['d0a', 'd0b', 'd1a', 'r1', 'g1a']));
  assert.equal(learnUnit(q, 'dictation'), 'g1b');
  assert.equal(planMatch(q, '2026-11-01').filter((s) => s.track === 'dictation').length, 3);
});

test('한 판은 받아쓰기 3문제 + 짧은 문항으로 약 9분', () => {
  const p = computeProgress(masterAll(['d0a', 'd0b', 'r1']));
  const plan = planMatch(p, '2026-11-01');
  assert.equal(plan.filter((s) => s.track === 'dictation').length, 3);
  const time = plan.reduce((a, s) => a + EST[s.track], 0);
  assert.ok(time >= BUDGET - 60 && time <= BUDGET + 60, `시간 ${time}`);
  assert.ok(plan.some((s) => s.track === 'rhythm') && plan.some((s) => s.track === 'degree'));
  assert.notEqual(plan[0].track, 'dictation');
});

test('숙달하고 점검일이 안 된 단원은 내지 않고, 점검일이 되면 그 단원을 담은 가장 어려운 숙달 단원으로 점검', () => {
  const p = computeProgress(masterAll(['d0a', 'd0b', 'd1a', 'd1b', 'r1', 'g1a']));
  const today = planMatch(p, '2026-11-02');
  assert.ok(!today.some((s) => s.role === 'review'));
  assert.equal(frontier(p, 'degree'), 'd2a'); // 다른 유형(g1b)을 기다리지 않고 L2로
  assert.equal(frontier(p, 'dictation'), 'g1b');
  assert.ok(today.filter((s) => s.track === 'dictation').every((s) => s.role === 'learn')); // g1b를 익힘
  const later = planMatch(p, '2026-11-04');
  const rv = later.filter((s) => s.role === 'review');
  // d1b(으뜸화음 도약)에는 순차진행이 없어서 d1a(d0b·d0a를 담음)를 따로 점검한다
  assert.deepEqual(rv.map((s) => s.skill).sort(), ['d1a', 'd1b', 'g1a', 'r1']);
});

test('점검에서 틀리면 한 단계씩 쉬운 숙달 단원으로 내려간다', () => {
  const p = computeProgress(masterAll(['d0a', 'd0b', 'd1a']));
  assert.deepEqual(stepDown(p, { track: 'degree', role: 'review', skill: 'd1a' }), { track: 'degree', role: 'review', skill: 'd0b' });
  assert.equal(stepDown(p, { track: 'degree', role: 'review', skill: 'd0a' }), undefined);
  // 내려가는 길은 그 단원이 담은 단원뿐: 6/8(r3c)에는 16분·당김음이 없다
  const all = computeProgress(masterAll(SKILLS.map((s) => s.id)));
  assert.equal(stepDown(all, { track: 'rhythm', role: 'review', skill: 'r3c' }), undefined);
  assert.equal(stepDown(all, { track: 'dictation', role: 'review', skill: 'g3f' })?.skill, 'g3e');
  assert.equal(stepDown(all, { track: 'degree', role: 'review', skill: 'd1b' }), undefined);
});

test('점검일이 된 단원은 그 단원을 담은 문항으로 모두 덮고, 한 판의 점검 시간은 한도 안', () => {
  const p = computeProgress(masterAll(SKILLS.map((s) => s.id)));
  const rv = planMatch(p, '2026-11-04').filter((s) => s.role === 'review');
  assert.ok(rv.length >= 3);
  assert.ok(rv.reduce((a, s) => a + EST[s.track], 0) <= REVIEW_BUDGET);
  // 단조(g3b)·6/8(g3a)은 g3f에 들어 있지 않아 따로 점검해야 한다
  const dueAll = SKILLS.filter((s) => p.skills[s.id].mastered).map((s) => s.id);
  const covered = new Set(rv.flatMap((s) => [s.skill!, ...within(s.skill!)]));
  assert.ok(!within('g3f').includes('g3b') && !within('g3f').includes('g3a'));
  assert.ok(covered.size < dueAll.length); // 다 못 덮은 것은 다음 판으로
});

test('실전 조건: 한 번 이상 확인한 단원의 점검은 재생 횟수를 줄인다', () => {
  const a = masterAll(['d0a']);
  const p = computeProgress(a);
  const slot = { track: 'degree' as const, role: 'review' as const, skill: 'd0a' };
  assert.equal(isExam(p, slot), false);
  a.push({ at: at(3), skill: 'd0a', pitchScore: 1, rhythmScore: 1 });
  assert.equal(isExam(computeProgress(a), slot), true);
  assert.equal(isExam(computeProgress(a), { ...slot, role: 'learn' }), false);
});

test('오답 풀: 최근 시도(배치고사·고쳐 보기 제외)가 만점 미만인 문제, 오래된 순, 3번 틀리면 제외', () => {
  const day = (d: number) => new Date(2026, 10, d, 12).toISOString();
  const a1 = { at: day(1), problemId: '2nd-1', pitchScore: 0.5, rhythmScore: 1 };
  const a2 = { at: day(2), problemId: 'mel-g1b-1', skill: 'g1b', pitchScore: 0.6, rhythmScore: 1 };
  // placement·fix 제외, 90%는 해제 안 됨, 만점(100%)만 해제
  const place = { at: day(1), problemId: '3rd-1', placement: true, pitchScore: 0, rhythmScore: 1 };
  const fixOk = { at: day(3), problemId: 'mel-g1b-1', fix: true, pitchScore: 1, rhythmScore: 1 };
  const pass90 = { at: day(4), problemId: '2nd-1', pitchScore: 0.9, rhythmScore: 1 };
  const perfect = { at: day(5), problemId: '2nd-1', pitchScore: 1, rhythmScore: 1 };
  assert.deepEqual(wrongIds([a1, a2, place]), ['2nd-1', 'mel-g1b-1']);
  assert.deepEqual(wrongIds([a1, a2, fixOk]), ['2nd-1', 'mel-g1b-1']);
  assert.deepEqual(wrongIds([a1, a2, pass90]), ['mel-g1b-1', '2nd-1']);
  assert.deepEqual(wrongIds([a1, a2, fixOk, pass90, perfect]), ['mel-g1b-1']);
  // 만점 뒤 다시 틀리면 그 최근 시도 시각 기준으로 오래된 순 뒤로 간다
  const newer = { at: day(6), problemId: '2nd-1', pitchScore: 0.7, rhythmScore: 1 };
  assert.deepEqual(wrongIds([a1, a2, perfect, newer]), ['mel-g1b-1', '2nd-1']);

  // 3번째 오답에서 풀 제외, 포기급(< 0.4)은 2로 세어 2번이면 제외
  const w1 = { at: day(1), problemId: '4th-1', pitchScore: 0.5, rhythmScore: 1 };
  const w2 = { at: day(2), problemId: '4th-1', pitchScore: 0.9, rhythmScore: 1 };
  const w3 = { at: day(3), problemId: '4th-1', pitchScore: 0.9, rhythmScore: 1 };
  assert.deepEqual(wrongIds([w1, w2]), ['4th-1']);
  assert.deepEqual(wrongIds([w1, w2, w3]), []);

  const g1 = { at: day(1), problemId: '5th-1', pitchScore: 0.3, rhythmScore: 1 };
  const g2 = { at: day(2), problemId: '5th-1', pitchScore: 0.2, rhythmScore: 1 };
  assert.deepEqual(wrongIds([g1]), ['5th-1']);
  assert.deepEqual(wrongIds([g1, g2]), []);
});

test('대련 오답은 다음 날부터 같은 문제로 한 판 2문제까지 다시 나오고, 숙달 단원도 재출제되며, 고쳐 보기 외 만점으로 빠진다', () => {
  const base = masterAll(['d0a', 'd0b', 'd1a', 'r1', 'g1a']);
  const miss = { at: new Date(2026, 10, 2, 12).toISOString(), skill: 'g1b', problemId: 'mel-g1b-5', pitchScore: 0.5, rhythmScore: 1 };
  const masteredMiss = { at: new Date(2026, 10, 2, 11).toISOString(), skill: 'g1a', problemId: 'mel-g1a-1', pitchScore: 0.5, rhythmScore: 1 };
  const rhyMiss = { at: new Date(2026, 10, 2, 13).toISOString(), skill: 'r1', problemId: 'rhy-r1-2', pitchScore: 1, rhythmScore: 0.5 };
  const p = computeProgress([...base, miss]);
  assert.deepEqual(retryIds([...base, miss], '2026-11-02'), []);
  assert.deepEqual(retryIds([...base, miss, masteredMiss], '2026-11-03'), ['mel-g1a-1', 'mel-g1b-5']);
  // 한 판 최대 2문제(RETRY = 2, 후보 MANY_WRONG 미만)
  const plan = planMatch(p, '2026-11-03', retryIds([...base, miss, masteredMiss, rhyMiss], '2026-11-03'));
  assert.deepEqual(plan.filter((s) => s.role === 'retry'), [
    { track: 'dictation', role: 'retry', skill: 'g1a', problem: 'mel-g1a-1' },
    { track: 'dictation', role: 'retry', skill: 'g1b', problem: 'mel-g1b-5' },
  ]);
  // 고쳐 보기(fix: true) 만점 통과는 재출제 풀에서 안 빠진다
  const fixPass = { at: new Date(2026, 10, 3, 12).toISOString(), problemId: 'mel-g1b-5', fix: true, pitchScore: 1, rhythmScore: 1 };
  assert.deepEqual(retryIds([...base, miss, fixPass], '2026-11-04'), ['mel-g1b-5']);
  // 90%는 빠지지 않고, 대련 밖 만점(100%)으로 빠진다
  const outside90 = { at: new Date(2026, 10, 3, 13).toISOString(), problemId: 'mel-g1b-5', pitchScore: 0.9, rhythmScore: 1 };
  assert.deepEqual(retryIds([...base, miss, fixPass, outside90], '2026-11-04'), ['mel-g1b-5']);
  const outside100 = { at: new Date(2026, 10, 3, 14).toISOString(), problemId: 'mel-g1b-5', pitchScore: 1, rhythmScore: 1 };
  assert.deepEqual(retryIds([...base, miss, fixPass, outside90, outside100], '2026-11-04'), []);
  // 계이름 듣기는 약점 가중치로 만들어 같은 문제를 다시 만들 수 없어 내지 않는다
  const deg = { ...miss, skill: 'd1b', problemId: 'deg-d1b-5' };
  assert.deepEqual(retryIds([...base, deg], '2026-11-03'), []);
});

test('재출제 후보가 6개(MANY_WRONG) 이상이면 한 판 문항의 60%(올림)까지 오답을 낸다', () => {
  assert.equal(MANY_WRONG, 6);
  const p = computeProgress(masterAll(['d0a', 'd0b', 'd1a', 'r1', 'g1a']));
  const make = (n: number) => Array.from({ length: n }, (_, i) => `mel-g1b-${i + 1}`);
  const under = planMatch(p, '2026-11-03', make(5)).filter((s) => s.role === 'retry');
  assert.equal(under.length, 2);

  const six = planMatch(p, '2026-11-03', make(6));
  const sixRetries = six.filter((s) => s.role === 'retry');
  assert.equal(sixRetries.length, 6);
  assert.ok(sixRetries.length <= Math.ceil(six.length * RETRY_SHARE));

  const ten = planMatch(p, '2026-11-03', make(10));
  const tenRetries = ten.filter((s) => s.role === 'retry');
  assert.equal(tenRetries.length, Math.ceil(ten.length * RETRY_SHARE));
  assert.ok(ten.some((s) => s.role === 'learn'));

  // 받아쓰기가 막혀 짧은 문항만 열린 상태에서도 남는 자리에 익히기 문항을 둔다
  const early = planMatch(computeProgress([]), '2026-11-03', make(6));
  const earlyRetries = early.filter((s) => s.role === 'retry');
  assert.ok(earlyRetries.length <= Math.ceil(early.length * RETRY_SHARE));
  assert.ok(early.some((s) => s.role === 'learn'));
});

test('모두 숙달하고 점검할 것도 없으면 가장 어려운 단원으로 실력 확인', () => {
  const p = computeProgress(masterAll(SKILLS.map((s) => s.id)));
  const plan = planMatch(p, '2026-11-01');
  assert.ok(plan.length > 0 && plan.every((s) => s.role === 'check'));
  assert.ok(plan.some((s) => s.skill === 't5'));
});

test('배치고사: 유형마다 이분 탐색해 끝난다', () => {
  // 실력: 계이름 d2b까지, 리듬 r1까지, 받아쓰기 g1c까지 한다고 가정
  const can: Record<string, number> = { degree: 5, rhythm: 0, dictation: 2, harmony: 1 };
  const results: { skill: string; ok: boolean }[] = [];
  for (let slot = nextPlacement(results); slot; slot = nextPlacement(results)) {
    const i = ladder(slot.track).findIndex((s) => s.id === slot!.skill);
    results.push({ skill: slot.skill!, ok: i <= can[slot.track] });
    assert.ok(results.length < 15);
  }
  assert.ok(results.length <= 14, `${results.length}문항`);
  const p = computeProgress(results.map((r) => ({ at: at(0), skill: r.skill, placement: true, pitchScore: r.ok ? 1 : 0, rhythmScore: 1 })));
  assert.ok(p.skills.d2b.mastered && !p.skills.d2c.mastered);
  assert.ok(p.skills.r1.mastered && !p.skills.r2a.mastered);
  assert.ok(p.skills.g1c.mastered && !p.skills.g2a.mastered);
  assert.ok(p.skills.h2a.mastered && !p.skills.h2b.mastered);
  // 유형을 돌아가며 낸다
  assert.notEqual(results[0].skill[0], results[1].skill[0]);
});

test('배치고사 남은 문항 수', () => {
  assert.ok(placementLeft([]) >= 11 && placementLeft([]) <= 16);
  const all = (ok: boolean) => { const r: { skill: string; ok: boolean }[] = []; for (let s = nextPlacement(r); s; s = nextPlacement(r)) r.push({ skill: s.skill!, ok }); return r.length; };
  assert.ok(placementLeft([]) >= all(true));
});

test('짧은 문항은 약한 유형에 더 많이, 그래도 두 유형 모두', () => {
  // 계이름 지금 단원은 최근 다 틀리고, 리듬은 다 맞힘
  // 받아쓰기 선수 단원(d0b·r1)은 숙달해 둔다(선수 단원 가중치가 끼지 않게)
  const base = masterAll(['d0a', 'd0b', 'r1']);
  const weak = [0, 1, 2, 3].map(() => ({ at: at(1), skill: 'd1a', pitchScore: 0, rhythmScore: 1 }));
  const good = [0, 1].map(() => ({ at: at(1), skill: 'r2a', pitchScore: 1, rhythmScore: 1 }));
  const plan = planMatch(computeProgress([...base, ...weak, ...good]), '2026-11-02');
  const n = (t: string) => plan.filter((s) => s.track === t).length;
  assert.ok(n('degree') > n('rhythm') && n('rhythm') >= 1, `계이름 ${n('degree')} 리듬 ${n('rhythm')}`);
});

test('지금 단원이 약함(점검에서 잊음)이면 짧은 문항을 더 받는다', () => {
  const base = masterAll(['d0a', 'd0b', 'r1']);
  // 계이름 d1a: 숙달(능숙 3) 뒤 점검에서 잊음 → 최근 [1,1,1,0] 75%, 약함. 리듬 r2a: 능숙·능숙·실패·능숙·통과·실패 [1,1,0,1,0.5,0] 58%, 익히는 중(능숙은 실패로 깎여 1)
  // 통과율만 보면 리듬이 더 약하지만, 잊은 단원에 가중치가 더 붙어 계이름이 더 많이 나온다
  const d1a = [0, 0, 1].map((d) => ({ at: at(d), skill: 'd1a', pitchScore: 1, rhythmScore: 1 }));
  d1a.push({ at: at(4), skill: 'd1a', pitchScore: 0, rhythmScore: 1 });
  const r1 = [1, 1, 0, 1, 0.85, 0].map((x) => ({ at: at(4), skill: 'r2a', pitchScore: x, rhythmScore: 1 }));
  const plan = planMatch(computeProgress([...base, ...d1a, ...r1]), '2026-11-05');
  const n = (t: string) => plan.filter((s) => s.track === t && s.role === 'learn').length;
  assert.ok(n('degree') > n('rhythm'), `계이름 ${n('degree')} 리듬 ${n('rhythm')}`);
});

test('covers는 생성기가 95% 이상 넣는 쌍만 남긴다(H4)', () => {
  const drop: [string, string][] = [['g2c', 'g2b'], ['g2d', 'g2c'], ['g3c', 'g2d'], ['g3d', 'g3c'], ['g4a', 'g3c'], ['r2b', 'r2a'], ['r3a', 'r2b'], ['r3b', 'r3a'], ['r4a', 'r3b']];
  for (const [up, down] of drop) assert.ok(!within(up).includes(down), `${up} ⊅ ${down}`);
  const keep: [string, string][] = [['g2b', 'g2a'], ['g3e', 'g3d'], ['g3f', 'g3e'], ['g5b', 'g3e'], ['r4b', 'r3c']];
  for (const [up, down] of keep) assert.ok(within(up).includes(down), `${up} ⊃ ${down}`);
});
