import { test } from 'node:test';
import assert from 'node:assert/strict';

const mem = new Map<string, string>();
let full = false;
Object.assign(globalThis, {
  localStorage: {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => { if (full) throw new Error('quota'); mem.set(k, v); },
  },
});
const { record, load, setSaveFailHandler } = await import('../src/store.ts');
const att = (i: number) => ({ at: `2026-11-0${i}T00:00:00Z`, problemId: `p${i}`, answer: [], pitchScore: 1, rhythmScore: 1, plays: 1, seconds: 1 });

test('읽을 수 없는 기록은 빈 기록으로 덮어쓰지 않고 알린다(M2)', () => {
  let alerts = 0;
  setSaveFailHandler(() => alerts++);
  mem.set('gawain.v1', '{깨진 JSON');
  record(att(1));
  assert.equal(mem.get('gawain.v1'), '{깨진 JSON');
  assert.equal(alerts, 1);
});

test('저장이 실패하면 한 번 알린다(M2)', () => {
  let alerts = 0;
  setSaveFailHandler(() => alerts++);
  mem.delete('gawain.v1');
  record(att(1));
  assert.equal(load().attempts.length, 1);
  full = true;
  record(att(2));
  record(att(3));
  assert.equal(alerts, 1);
  assert.equal(load().attempts.length, 1);
  full = false;
});

test('기록을 합친 뒤 시도는 시간순이다(M7)', async () => {
  const { merge } = await import('../src/store.ts');
  mem.delete('gawain.v1');
  record(att(5));
  merge({ attempts: [att(1), att(9)] });
  assert.deepEqual(load().attempts.map((a) => a.problemId), ['p1', 'p5', 'p9']);
});

test('즐겨찾기 저장과 합치기: 단원마다 늦은 쪽 우선(해제 전파 포함)', async () => {
  const { setFavorite, favoriteIds, merge } = await import('../src/store.ts');
  mem.delete('gawain.v1');
  setFavorite('g1a', true);
  assert.deepEqual(favoriteIds(), ['g1a']);
  setFavorite('g1a', false);
  assert.deepEqual(favoriteIds(), []);

  // 늦은 쪽 우선: 로컬 해제(t2) vs 원격 켜짐(t1) -> 로컬 유지, 반환 0
  mem.delete('gawain.v1');
  merge({ favorites: { g1a: { on: false, at: '2026-11-19T02:00:00Z' }, d1a: { on: true, at: '2026-11-19T01:00:00Z' } } });
  const changedOld = merge({ favorites: { g1a: { on: true, at: '2026-11-19T01:00:00Z' } } });
  assert.equal(changedOld, 0);
  assert.deepEqual(favoriteIds(), ['d1a']);

  // 원격 해제(t3)가 더 늦으면 해제가 전파되고 바뀐 수 반환
  const changedNew = merge({ favorites: { d1a: { on: false, at: '2026-11-19T03:00:00Z' }, r1: { on: true, at: '2026-11-19T03:00:00Z' } } });
  assert.equal(changedNew, 2);
  assert.deepEqual(favoriteIds(), ['r1']);
});
