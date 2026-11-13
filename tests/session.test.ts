import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeProgress, type SkillAttempt } from '../src/engine/progress.ts';
import { planMatch, stepDown, nextPlacement, placementLeft, frontier, EST, BUDGET } from '../src/engine/session.ts';
import { SKILLS, ladder } from '../src/engine/curriculum.ts';

let clock = 0;
const at = (d: number) => new Date(2026, 10, 1 + d, 12, 0, 0, clock++).toISOString();
const masterAll = (ids: string[], d = 0): SkillAttempt[] => ids.flatMap((skill) => [0, 1, 2].map(() => ({ at: at(d), skill, pitchScore: 1, rhythmScore: 1 })));

test('처음에는 유형마다 첫 단원을 익힌다(유형별 진급이라 L0 계이름을 기다리지 않음)', () => {
  const p = computeProgress([]);
  const plan = planMatch(p, '2026-11-01');
  assert.ok(plan.length >= 6);
  assert.ok(plan.every((s) => s.role === 'learn'));
  assert.deepEqual(['degree', 'rhythm', 'dictation'].map((t) => frontier(p, t as never)), ['d0a', 'r1', 'm1a']);
  assert.equal(plan.filter((s) => s.track === 'dictation').length, 3);
});

test('한 판은 받아쓰기 3문제 + 짧은 문항으로 약 9분', () => {
  const p = computeProgress(masterAll(['d0a', 'd0b']));
  const plan = planMatch(p, '2026-11-01');
  assert.equal(plan.filter((s) => s.track === 'dictation').length, 3);
  const time = plan.reduce((a, s) => a + EST[s.track], 0);
  assert.ok(time >= BUDGET - 60 && time <= BUDGET + 60, `시간 ${time}`);
  assert.ok(plan.some((s) => s.track === 'rhythm') && plan.some((s) => s.track === 'degree'));
  assert.notEqual(plan[0].track, 'dictation');
});

test('숙달하고 점검일이 안 된 단원은 내지 않고, 점검일이 되면 그 유형의 가장 어려운 숙달 단원으로 점검', () => {
  const p = computeProgress(masterAll(['d0a', 'd0b', 'd1a', 'd1b', 'r1', 'm1a']));
  const today = planMatch(p, '2026-11-02');
  assert.ok(!today.some((s) => s.role === 'review'));
  assert.equal(frontier(p, 'degree'), 'd2a'); // 다른 유형(m1b)을 기다리지 않고 L2로
  assert.equal(frontier(p, 'dictation'), 'm1b');
  assert.ok(today.filter((s) => s.track === 'dictation').every((s) => s.role === 'learn')); // m1b를 익힘
  const later = planMatch(p, '2026-11-04');
  const rv = later.filter((s) => s.role === 'review');
  assert.deepEqual(rv.map((s) => s.skill).sort(), ['d1b', 'm1a', 'r1']);
});

test('점검에서 틀리면 한 단계씩 쉬운 숙달 단원으로 내려간다', () => {
  const p = computeProgress(masterAll(['d0a', 'd0b', 'd1a']));
  assert.deepEqual(stepDown(p, { track: 'degree', role: 'review', skill: 'd1a' }), { track: 'degree', role: 'review', skill: 'd0b' });
  assert.equal(stepDown(p, { track: 'degree', role: 'review', skill: 'd0a' }), undefined);
});

test('모두 숙달하고 점검할 것도 없으면 가장 어려운 단원으로 실력 확인', () => {
  const p = computeProgress(masterAll(SKILLS.map((s) => s.id)));
  const plan = planMatch(p, '2026-11-01');
  assert.ok(plan.length > 0 && plan.every((s) => s.role === 'check'));
  assert.ok(plan.some((s) => s.skill === 'm3b'));
});

test('배치고사: 유형마다 이분 탐색해 끝난다', () => {
  // 실력: 계이름 d2b까지, 리듬 r1까지, 받아쓰기 m2a까지 한다고 가정
  const can: Record<string, number> = { degree: 5, rhythm: 0, dictation: 2 };
  const results: { skill: string; ok: boolean }[] = [];
  for (let slot = nextPlacement(results); slot; slot = nextPlacement(results)) {
    const i = ladder(slot.track).findIndex((s) => s.id === slot!.skill);
    results.push({ skill: slot.skill!, ok: i <= can[slot.track] });
    assert.ok(results.length < 15);
  }
  assert.ok(results.length <= 11, `${results.length}문항`);
  const p = computeProgress(results.map((r) => ({ at: at(0), skill: r.skill, placement: true, pitchScore: r.ok ? 1 : 0, rhythmScore: 1 })));
  assert.ok(p.skills.d2b.mastered && !p.skills.d2c.mastered);
  assert.ok(p.skills.r1.mastered && !p.skills.r2a.mastered);
  assert.ok(p.skills.m2a.mastered && !p.skills.m2b.mastered);
  // 유형을 돌아가며 낸다
  assert.notEqual(results[0].skill[0], results[1].skill[0]);
});

test('배치고사 남은 문항 수', () => {
  assert.ok(placementLeft([]) >= 9 && placementLeft([]) <= 12);
  const all = (ok: boolean) => { const r: { skill: string; ok: boolean }[] = []; for (let s = nextPlacement(r); s; s = nextPlacement(r)) r.push({ skill: s.skill!, ok }); return r.length; };
  assert.ok(placementLeft([]) >= all(true));
});

test('짧은 문항은 약한 유형에 더 많이, 그래도 두 유형 모두', () => {
  // 계이름 지금 단원은 최근 다 틀리고, 리듬은 다 맞힘
  const base = masterAll(['d0a', 'd0b']);
  const weak = [0, 1, 2, 3].map(() => ({ at: at(1), skill: 'd1a', pitchScore: 0, rhythmScore: 1 }));
  const good = [0, 1].map(() => ({ at: at(1), skill: 'r1', pitchScore: 1, rhythmScore: 1 }));
  const plan = planMatch(computeProgress([...base, ...weak, ...good]), '2026-11-02');
  const n = (t: string) => plan.filter((s) => s.track === t).length;
  assert.ok(n('degree') > n('rhythm') && n('rhythm') >= 1, `계이름 ${n('degree')} 리듬 ${n('rhythm')}`);
});

test('지금 단원이 약함(점검에서 잊음)이면 짧은 문항을 더 받는다', () => {
  const base = masterAll(['d0a', 'd0b']);
  // 계이름 d1a: 숙달(3) 뒤 점검에서 잊음 → 최근 [1,1,1,0] 75%, 약함. 리듬 r1: [1,1,0,1,0] 60%, 익히는 중
  // 통과율만 보면 리듬이 더 약하지만, 잊은 단원에 가중치가 더 붙어 계이름이 더 많이 나온다
  const d1a = [1, 1, 1].map(() => ({ at: at(1), skill: 'd1a', pitchScore: 0.85, rhythmScore: 1 }));
  d1a.push({ at: at(4), skill: 'd1a', pitchScore: 0, rhythmScore: 1 });
  const r1 = [0.85, 0.85, 0, 0.85, 0].map((x) => ({ at: at(4), skill: 'r1', pitchScore: x, rhythmScore: 1 }));
  const plan = planMatch(computeProgress([...base, ...d1a, ...r1]), '2026-11-05');
  const n = (t: string) => plan.filter((s) => s.track === t && s.role === 'learn').length;
  assert.ok(n('degree') > n('rhythm'), `계이름 ${n('degree')} 리듬 ${n('rhythm')}`);
});
