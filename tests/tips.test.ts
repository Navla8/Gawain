import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TRACKS } from '../src/engine/curriculum.ts';
import { TIPS, TIP_SOURCES, TIP_TOPICS } from '../src/data/tips.ts';

test('팁 데이터: 30~40개이고 id가 겹치지 않는다', () => {
  assert.ok(TIPS.length >= 30 && TIPS.length <= 40, `팁 개수: ${TIPS.length}`);
  assert.equal(new Set(TIPS.map((t) => t.id)).size, TIPS.length);
});

test('모든 유형에 solve 팁이 있고 받아쓰기·리듬에 pitch·rhythm 팁이 있다', () => {
  for (const tr of TRACKS) {
    assert.ok(TIPS.some((t) => t.when === 'solve' && (t.track === tr.id || t.track === 'all')), `${tr.id} solve 없음`);
  }
  assert.ok(TIPS.some((t) => t.when === 'pitch' && (t.track === 'dictation' || t.track === 'all')), 'dictation pitch 없음');
  assert.ok(TIPS.some((t) => t.when === 'rhythm' && (t.track === 'dictation' || t.track === 'all')), 'dictation rhythm 없음');
  assert.ok(TIPS.some((t) => t.when === 'rhythm' && (t.track === 'rhythm' || t.track === 'all')), 'rhythm rhythm 없음');
  assert.ok(TIPS.some((t) => t.when === 'pitch' && (t.track === 'degree' || t.track === 'all')), 'degree pitch 없음');
  assert.ok(TIPS.some((t) => t.when === 'pitch' && (t.track === 'harmony' || t.track === 'all')), 'harmony pitch 없음');
  assert.ok(TIPS.filter((t) => t.track === 'memory' && t.when === 'solve').length >= 2, 'memory solve 2개 이상 필요');
  assert.ok(TIPS.filter((t) => t.track === 'memory' && t.when === 'pitch').length >= 1, 'memory pitch 1개 이상 필요');
});

test('주제별 묶음과 교재 출처가 비어 있지 않고 이끈음은 티로 쓴다', () => {
  for (const topic of TIP_TOPICS) {
    assert.ok(TIPS.some((t) => t.topic === topic), `${topic} 비어 있음`);
  }
  assert.ok(TIP_SOURCES.length >= 8);
  for (const t of TIPS) {
    assert.ok(t.title && t.body && t.source, t.id);
    assert.ok(!/\b(?:Ch\.|Chapter|장)\s*\d/i.test(t.source), `${t.id} 출처에 장 번호 있음: ${t.source}`);
  }
});
