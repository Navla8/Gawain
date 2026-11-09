import { test } from 'node:test';
import assert from 'node:assert/strict';
import { degreeItem, rhythmItem, minorMelody, degreeName } from '../src/engine/drills.ts';
import { ladder } from '../src/engine/curriculum.ts';
import { barProblems, toEvents } from '../src/engine/score.ts';
import { barTicks } from '../src/engine/types.ts';

const pc = (m: number) => ((m % 12) + 12) % 12;

test('계이름 듣기: 같은 시드는 같은 문항, 답은 늘 버튼 안에 있다', () => {
  for (const s of ladder('degree')) {
    assert.deepEqual(degreeItem(s.id, 7), degreeItem(s.id, 7));
    for (let seed = 1; seed <= 300; seed++) {
      const it = degreeItem(s.id, seed);
      assert.ok(it.names.length >= 2 && it.names.length <= 4, `${s.id} ${seed}: 음 개수`);
      assert.ok(it.names.every((n) => it.choices.includes(n)), `${s.id} ${seed}: ${it.names} ⊄ ${it.choices}`);
      assert.ok(it.midis.every((m) => m >= 48 && m <= 84), `${s.id} ${seed}: 음역`);
      // 음계를 칠 으뜸음이 조표와 맞는다(단조는 라)
      assert.equal(pc(it.tonic), pc(it.fifths * 7 + (it.minor ? 9 : 0)), `${s.id} ${seed}: 으뜸음`);
      for (let i = 1; i < it.midis.length; i++) assert.notEqual(it.midis[i], it.midis[i - 1], `${s.id} ${seed}: 같은 음 반복`);
    }
  }
});

test('계이름 듣기: 도·레·미 단원은 세 음만, 단조는 라 으뜸 계이름', () => {
  for (let seed = 1; seed <= 100; seed++) assert.ok(degreeItem('d0a', seed).names.every((n) => ['도', '레', '미'].includes(n)));
  assert.deepEqual(degreeItem('d3a', 1).choices, ['라', '티', '도', '레', '미', '파', '솔']);
  assert.ok(degreeItem('d3b', 1).choices.includes('솔♯'));
  assert.equal(degreeName(-4), '솔♯');
});

test('계이름 듣기: 약점 계이름이 더 자주 나온다', () => {
  const count = (weak: Record<string, number>) => {
    let n = 0;
    for (let seed = 1; seed <= 400; seed++) n += degreeItem('d0b', seed, weak).names.filter((x) => x === '파').length;
    return n;
  };
  assert.ok(count({ 파: 3 }) > count({}) * 1.5);
});

test('리듬 받아쓰기: 2마디를 꽉 채우고, 그 단원의 새 리듬이 들어간다', () => {
  const has = (durs: number[], cell: number[]) => durs.some((_, i) => cell.every((c, k) => durs[i + k] === c));
  for (const s of ladder('rhythm')) for (let seed = 1; seed <= 300; seed++) {
    const p = rhythmItem(s.id, seed);
    assert.deepEqual(barProblems(p.notes, barTicks(p), p.bars), [], `${s.id} ${seed}`);
    assert.notEqual(p.notes[0].midi, null, `${s.id} ${seed}: 쉼표로 시작`);
    assert.notEqual(p.notes.at(-1)!.midi, null, `${s.id} ${seed}: 쉼표로 끝남`);
    const d = p.notes.map((n) => (n.midi === null ? -n.dur : n.dur));
    if (s.id === 'r3a') assert.ok(d.includes(3), `${seed}: 16분음표`);
    if (s.id === 'r2b') assert.ok(has(d, [18, 6]), `${seed}: 점4분+8분`);
    if (s.id === 'r3c') assert.equal(p.beatTicks, 18);
  }
  assert.ok(rhythmItem('r1', 3).notes.every((n) => [12, 24, 48].includes(n.dur)));
});

test('단조 선율: 라 으뜸, 라·도·미에서 시작해 으뜸음으로 끝나고, 라\'로 갈 때만 솔♯', () => {
  for (let seed = 1; seed <= 500; seed++) {
    const p = minorMelody(seed);
    assert.ok(p.minor);
    assert.equal(pc(p.tonic), pc(p.fifths * 7 + 9), `${seed}: 으뜸음`);
    assert.deepEqual(barProblems(p.notes, barTicks(p), p.bars), [], `${seed}: 마디`);
    const rel = toEvents(p.notes).map((e) => e.midi! - p.tonic);
    assert.ok([0, 3, 7].includes(rel[0]), `${seed}: 시작음 ${rel[0]}`);
    assert.ok([0, 12].includes(rel.at(-1)!), `${seed}: 끝음`);
    assert.ok(rel.every((r) => [0, 2, 3, 5, 7, 8, 10, 11, 12].includes(r)), `${seed}: 음계 밖`);
    rel.forEach((r, i) => { if (r === 11) assert.equal(rel[i + 1], 12, `${seed}: 솔♯ 다음은 라'`); });
    assert.ok(p.notes.every((n) => n.midi! >= 53 && n.midi! <= 84), `${seed}: 건반 음역`);
  }
});
