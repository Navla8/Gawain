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
