import { test } from 'node:test';
import assert from 'node:assert/strict';
import { harmonyItem, CHORD, QUALITIES, CADENCES } from '../src/engine/harmony.ts';
import { ladder } from '../src/engine/curriculum.ts';

const mod = (a: number, n: number) => ((a % n) + n) % n;
const SEEDS = 300;

test('화성 사다리: 3화음 성질 → 종지 → 주요 3화음 → 자리바꿈·V7 → 부3화음·단조', () => {
  assert.deepEqual(ladder('harmony').map((s) => [s.id, s.level]), [['h1', 1], ['h2a', 2], ['h2b', 2], ['h3a', 3], ['h3b', 3]]);
});

test('같은 시드는 같은 문제', () => {
  for (const s of ladder('harmony')) assert.deepEqual(harmonyItem(s.id, 9), harmonyItem(s.id, 9));
});

test('3화음 성질: 소리가 고른 성질의 음정과 맞는다', () => {
  for (let seed = 1; seed <= SEEDS; seed++) {
    const it = harmonyItem('h1', seed);
    const [c] = it.chords;
    assert.deepEqual(c.map((m) => m - c[0]), QUALITIES[it.answers[0]]);
    assert.ok(it.choices.includes(it.answers[0]));
  }
});

/** 4성부 화음의 로마 숫자 맞추기: 베이스와 구성음이 그 화음과 같은지 */
function check(it: ReturnType<typeof harmonyItem>, labels: string[]) {
  assert.equal(it.chords.length, labels.length);
  it.chords.forEach((v, i) => {
    const c = CHORD[labels[i]];
    const at = `${it.id} ${labels.join(' ')} #${i}`;
    assert.equal(v.length, 4, at);
    assert.equal(mod(v[0] - it.tonic, 12), c.bass, `${at}: 베이스`);
    assert.ok(v.every((m) => c.pcs.includes(mod(m - it.tonic, 12))), `${at}: 구성음`);
    assert.ok(v[0] < v[1] && v[1] < v[2] && v[2] < v[3], `${at}: 성부 순서`);
    assert.ok(v[0] >= 38 && v[3] <= 79, `${at}: 음역 ${v}`);
    if (i) for (let k = 1; k < 4; k++) assert.ok(Math.abs(v[k] - it.chords[i - 1][k]) <= 7, `${at}: 위 성부 도약 ${it.chords[i - 1]} → ${v}`);
  });
}

test('종지: 마지막 두 화음과 소프라노가 종지 종류와 맞는다', () => {
  const seen = new Set<string>();
  for (let seed = 1; seed <= SEEDS; seed++) {
    const it = harmonyItem('h2a', seed);
    const kind = it.answers[0];
    seen.add(kind);
    assert.ok(CADENCES.includes(kind));
    const last = it.chords.at(-1)!, prev = it.chords.at(-2)!;
    const rel = (m: number) => mod(m - it.tonic, 12);
    const is = (v: number[], l: string) => rel(v[0]) === CHORD[l].bass && v.every((m) => CHORD[l].pcs.includes(rel(m)));
    if (kind.startsWith('정격')) {
      assert.ok(is(prev, 'V') && is(last, 'I'), `${it.id}: V–I`);
      assert.equal(rel(last[3]) === 0, kind === '정격 종지(완전)', `${it.id}: 소프라노`);
    }
    if (kind === '반종지') assert.ok(is(last, 'V'));
    if (kind === '변격 종지') assert.ok(is(prev, 'IV') && is(last, 'I'));
    if (kind === '위종지') assert.ok(is(prev, 'V') && is(last, 'vi'));
  }
  assert.equal(seen.size, CADENCES.length);
});

test('진행: 첫 화음은 으뜸화음, 딸림화음 → 으뜸화음으로 끝나고, 단원의 새 화음이 들어 있다', () => {
  for (const id of ['h2b', 'h3a', 'h3b']) {
    let minor = 0;
    for (let seed = 1; seed <= SEEDS; seed++) {
      const it = harmonyItem(id, seed);
      const labels = [it.given!, ...it.answers];
      check(it, labels);
      assert.ok(it.answers.every((a) => it.choices.includes(a)), `${it.id}: 버튼에 없는 답`);
      assert.equal(labels[0], it.minor ? 'i' : 'I');
      assert.equal(labels.at(-1), labels[0]);
      assert.ok((id === 'h2b' ? ['V', 'IV'] : ['V', 'V7']).includes(labels.at(-2)!));
      if (id === 'h3a') assert.ok(labels.some((l) => ['I6', 'I64', 'V6', 'V7'].includes(l)), `${it.id}: 자리바꿈·V7`);
      if (id === 'h3b' && !it.minor) assert.ok(labels.some((l) => ['ii', 'vi'].includes(l)), `${it.id}: 부3화음`);
      if (it.minor) minor++;
    }
    if (id === 'h3b') assert.ok(minor > SEEDS * 0.3 && minor < SEEDS * 0.7);
    else assert.equal(minor, 0);
  }
});

test('진행 단원마다 정답이 여러 가지다(h2b가 늘 IV V I이던 결함)', () => {
  for (const [id, min] of [['h2b', 4], ['h3a', 8], ['h3b', 8]] as const) {
    const kinds = new Set<string>();
    for (let seed = 1; seed <= SEEDS; seed++) kinds.add(harmonyItem(id, seed).answers.join(' '));
    assert.ok(kinds.size >= min, `${id}: 정답 ${kinds.size}가지`);
  }
});

test('약점 화음·성질을 더 자주 낸다', () => {
  const count = (weak: Record<string, number>) => {
    let n = 0;
    for (let seed = 1; seed <= SEEDS; seed++) n += harmonyItem('h3a', seed, weak).answers.filter((a) => a === 'V6').length;
    return n;
  };
  assert.ok(count({ V6: 3 }) > count({}) * 1.3);
});
