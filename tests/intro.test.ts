import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SKILLS, MAX_LEVEL } from '../src/engine/curriculum.ts';
import { classify, computeProgress, frontier, introNeed, weakness, type SkillAttempt } from '../src/engine/progress.ts';
import { retryIds, wrongIds } from '../src/engine/session.ts';
import { INTRO_COPY } from '../src/data/intros.ts';
import { firstBars } from '../src/engine/grade.ts';
import { melodyItem, memoryItem } from '../src/engine/melody.ts';
import { rhythmItem } from '../src/engine/drills.ts';
import { barProblems } from '../src/engine/score.ts';
import { barTicks } from '../src/engine/types.ts';

let clock = 0;
const day = (d: number) => new Date(2026, 10, 1 + d, 12, 0, 0, clock++).toISOString();
const att = (d: number, skill: string, score: number, extra: Partial<SkillAttempt> = {}): SkillAttempt =>
  ({ at: day(d), skill, pitchScore: score, rhythmScore: 1, ...extra });
const learn = (id: string, d = 0) => [att(d - 1, id, 1), att(d - 1, id, 1), att(d, id, 1)];

test('introNeed(): 첫 진입(미시도·미숙달 기시도), 완료 후 없음, 숙달 단원 없음', () => {
  // 시도 기록 없음 → first
  assert.equal(introNeed([], 'h2a'), 'first');
  assert.equal(introNeed([], 'k0a'), 'first');

  // 이미 풀어 봤지만 숙달 전(예: 사용자의 h2a) → first
  const tried = [att(0, 'h2a', 0.5), att(1, 'h2a', 0.85)];
  assert.equal(introNeed(tried, 'h2a'), 'first');

  // 맛보기 시도가 남으면 더 이상 필요 없음
  const afterIntro = [...tried, att(2, 'h2a', 1, { intro: true })];
  assert.equal(introNeed(afterIntro, 'h2a'), undefined);

  // 이미 숙달한 단원은 intro 시도 없어도 필요 없음
  assert.equal(introNeed(learn('d0a'), 'd0a'), undefined);

  // 모르는 단원 id → undefined
  assert.equal(introNeed([], 'zzz'), undefined);
});

test('introNeed(): lapsed·stepped 전환 뒤 재진입(again), 재맛보기 뒤 없음, 재망각 시 다시 again', () => {
  // 1) 점검에서 잊음(lapsed) → again
  const lapsed = [...learn('d0a'), att(3, 'd0a', 0.3)];
  assert.equal(introNeed(lapsed, 'd0a'), 'again');

  // 재진입 맛보기 완료 → undefined
  const afterAgain = [...lapsed, att(3, 'd0a', 1, { intro: true })];
  assert.equal(introNeed(afterAgain, 'd0a'), undefined);

  // 다시 숙달 후 또 잊음 → 다시 again
  const reMastered = [...afterAgain, att(4, 'd0a', 1), att(4, 'd0a', 1)];
  assert.equal(introNeed(reMastered, 'd0a'), undefined);
  const lapsedTwice = [...reMastered, att(8, 'd0a', 0.2)];
  assert.equal(introNeed(lapsedTwice, 'd0a'), 'again');

  // 2) 위 단원 4회 연속 실패로 한 단계 내려감(stepped) → again
  const stepped = [
    att(0, 'd0b', 1, { placement: true }),
    att(1, 'd1a', 0.4), att(1, 'd1a', 0.4), att(1, 'd1a', 0.4), att(1, 'd1a', 0.4),
  ];
  assert.equal(introNeed(stepped, 'd0b'), 'again');
  assert.equal(introNeed([...stepped, att(1, 'd0b', 1, { intro: true })], 'd0b'), undefined);

  // 3) 같은 문제 3회 오답(WRONG_DROP)으로 숙달 해제 → again
  const dropped = [
    ...learn('g1a'),
    att(1, 'g1a', 0.9, { problemId: 'mel-g1a-1', retry: true }),
    att(2, 'g1a', 0.9, { problemId: 'mel-g1a-1', retry: true }),
    att(3, 'g1a', 0.9, { problemId: 'mel-g1a-1', retry: true }),
  ];
  assert.equal(introNeed(dropped, 'g1a'), 'again');
});

test('intro 시도는 숙달·오답 풀·약점·레벨 계산에서 완전히 제외된다', () => {
  // intro 10번 만점을 받아도 숙달·시도 수·레벨 변화 없음
  const introOnly = Array.from({ length: 10 }, (_, i) =>
    att(i, 'k0a', 1, { intro: true, problemId: `ton-k0a-${i + 1}`, miss: ['솔'] }),
  );
  const p0 = computeProgress(introOnly);
  assert.equal(p0.skills.k0a.mastered, false);
  assert.equal(p0.skills.k0a.tries, 0);
  assert.equal(p0.skills.k0a.streak, 0);
  assert.equal(p0.level, 0);
  assert.deepEqual(weakness(introOnly, 'k0a'), {});

  // intro에서 틀려도 wrongIds·retryIds에 안 들어가고, 이미 들어 있던 오답을 intro 만점으로 지우지도 않는다
  const wrongIntro = att(0, 'g1a', 0, { intro: true, problemId: 'mel-g1a-7' });
  assert.deepEqual(wrongIds([wrongIntro]), []);
  assert.deepEqual(retryIds([wrongIntro], '2026-11-10'), []);

  const realWrong = att(0, 'g1a', 0.5, { problemId: 'mel-g1a-9' });
  const introPassSame = att(1, 'g1a', 1, { intro: true, problemId: 'mel-g1a-9' });
  assert.deepEqual(wrongIds([realWrong, introPassSame]), ['mel-g1a-9']);

  // 숙달 단원에서 intro 3번 틀려도 숙달 해제되지 않음
  const masteredWithIntroFails = [
    ...learn('g1a'),
    att(1, 'g1a', 0, { intro: true, problemId: 'mel-g1a-5' }),
    att(2, 'g1a', 0, { intro: true, problemId: 'mel-g1a-5' }),
    att(3, 'g1a', 0, { intro: true, problemId: 'mel-g1a-5' }),
  ];
  assert.equal(computeProgress(masteredWithIntroFails).skills.g1a.mastered, true);
});

test('기존 기록 주입 뒤 intro 시도를 섞어도 레벨·유형 레벨·열린 단원 불변', () => {
  const upToL3 = SKILLS.filter((s) => s.level <= 3 && !s.bridge).map((s) => s.id);
  const base = upToL3.flatMap((id) => learn(id));
  const before = computeProgress(base);
  const withIntros = [
    ...base,
    att(5, 'h2a', 0, { intro: true, problemId: 'har-h2a-1' }),
    att(5, 'h2a', 1, { intro: true, problemId: 'har-h2a-2' }),
    att(5, 'k0a', 1, { intro: true, problemId: 'ton-k0a-1' }),
  ];
  const after = computeProgress(withIntros);
  assert.equal(after.level, before.level);
  assert.deepEqual(after.trackLevels, before.trackLevels);
  assert.equal(frontier(after, 'degree'), frontier(before, 'degree'));
  assert.equal(classify(after, 'd4a'), classify(before, 'd4a'));

  const allCore = SKILLS.filter((s) => !s.bridge).map((s) => s.id).flatMap((id) => learn(id));
  assert.equal(computeProgress([...allCore, att(5, 'k0a', 0, { intro: true })]).level, MAX_LEVEL + 1);
});

test('INTRO_COPY: 전 단원(57개) 카드 문구가 빠짐없이 일치한다', () => {
  assert.equal(Object.keys(INTRO_COPY).length, SKILLS.length);
  for (const s of SKILLS) {
    assert.ok(typeof INTRO_COPY[s.id] === 'string' && INTRO_COPY[s.id].trim().length >= 10, `${s.id} 문구 누락`);
  }
});

test('firstBars(): 4~8마디·못갖춘마디·2성부·추출 문항을 앞 2마디로 깔끔히 자른다', () => {
  for (const p of [
    rhythmItem('r1', 1),
    rhythmItem('r3c', 1),
    melodyItem('g1a', 1),
    melodyItem('g1b', 1),
    melodyItem('g2e', 1),
    melodyItem('g3g', 1),
    melodyItem('g4c', 1),
    memoryItem('m4', 1),
  ]) {
    const cut = firstBars(p, 2);
    assert.ok(cut.bars <= 2, `${p.id}: bars ${cut.bars}`);
    assert.equal(cut.extract, undefined, `${p.id}: extract 해제`);
    const len = barTicks(cut);
    const offset = cut.pickup ? len - cut.pickup : 0;
    assert.deepEqual(barProblems(cut.notes, len, cut.bars, offset), [], `${p.id} 위 성부 마디 검사`);
    if (cut.bass) assert.deepEqual(barProblems(cut.bass, len, cut.bars, offset), [], `${p.id} 아래 성부 마디 검사`);
  }
});
