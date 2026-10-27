import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generate } from '../src/engine/generate.ts';
import { barProblems, toEvents } from '../src/engine/score.ts';

const deg = (midi: number, tonic: number) => [0, 2, 4, 5, 7].indexOf(midi - tonic);

test('같은 시드는 같은 선율', () => {
  assert.deepEqual(generate(42), generate(42));
});

test('M1 단원 규칙을 지킨다 (500개)', () => {
  for (let seed = 1; seed <= 500; seed++) {
    const p = generate(seed);
    const ev = toEvents(p.notes).filter((e) => e.midi !== null);
    const d = ev.map((e) => deg(e.midi!, p.tonic));
    assert.ok(d.every((x) => x >= 0), `seed ${seed}: 도~솔 밖의 음`);
    assert.ok([0, 2, 4].includes(d[0]), `seed ${seed}: 시작음`);
    assert.equal(d.at(-1), 0, `seed ${seed}: 끝음`);
    assert.equal(d.at(-2), 1, `seed ${seed}: 끝 직전은 레`);
    for (let i = 1; i < d.length; i++) {
      const leap = Math.abs(d[i] - d[i - 1]) > 1;
      if (leap) assert.ok([0, 2, 4].includes(d[i]) && [0, 2, 4].includes(d[i - 1]), `seed ${seed}: 으뜸화음 밖 도약`);
    }
    assert.ok(ev.at(-1)!.dur >= 24, `seed ${seed}: 마지막 음은 길게`);
    assert.deepEqual(barProblems(p.notes, p.beatsPerBar, p.bars), [], `seed ${seed}: 마디`);
    assert.ok([0, 1, -1].includes(p.fifths));
  }
});
