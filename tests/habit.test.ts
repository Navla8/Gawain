import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dayKey, dayStatus, streak, reviewIds, GOAL_SECONDS } from '../src/engine/habit.ts';

const at = (key: string, problemId = 'p', score = 1) => ({ at: new Date(key + 'T12:00:00').toISOString(), problemId, pitchScore: score, rhythmScore: 1 });

test('날짜 키는 기기 현지 날짜', () => {
  assert.equal(dayKey(new Date(2026, 9, 5, 23, 59)), '2026-10-05');
});

test('날짜 상태: 10분 채움 / 1문제 이상 / 안 함', () => {
  const attempts = [at('2026-10-01'), at('2026-10-02')];
  const seconds = { '2026-10-01': GOAL_SECONDS, '2026-10-02': 120 };
  assert.equal(dayStatus('2026-10-01', attempts, seconds), 'goal');
  assert.equal(dayStatus('2026-10-02', attempts, seconds), 'some');
  assert.equal(dayStatus('2026-10-03', attempts, seconds), 'none');
  // 시간만 있고 푼 문제가 없으면 연속 일수에 들지 않는다
  assert.equal(dayStatus('2026-10-04', attempts, { '2026-10-04': 700 }), 'none');
});

test('연속 일수: 오늘 아직 안 했으면 어제까지로 센다', () => {
  const attempts = ['2026-10-01', '2026-10-03', '2026-10-04', '2026-10-05'].map((d) => at(d));
  const seconds = { '2026-10-04': GOAL_SECONDS };
  assert.deepEqual(streak(attempts, seconds, '2026-10-05'), { days: 3, goalDays: 1 });
  assert.deepEqual(streak(attempts, seconds, '2026-10-06'), { days: 3, goalDays: 1 });
  assert.deepEqual(streak(attempts, seconds, '2026-10-07'), { days: 0, goalDays: 0 });
});

test('연속 일수는 월이 바뀌어도 이어진다', () => {
  const attempts = ['2026-09-30', '2026-10-01'].map((d) => at(d));
  assert.equal(streak(attempts, {}, '2026-10-01').days, 2);
});

test('오답 목록: 문제별 가장 최근 시도가 만점이 아닌 것', () => {
  const attempts = [at('2026-10-01', 'a', 0.5), at('2026-10-02', 'a', 1), at('2026-10-01', 'b', 1), at('2026-10-03', 'c', 0.8)];
  assert.deepEqual(reviewIds(attempts), ['c']);
});
