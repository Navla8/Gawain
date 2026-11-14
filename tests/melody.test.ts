import { test } from 'node:test';
import assert from 'node:assert/strict';
import { melodyItem, UNITS, CHORDS } from '../src/engine/melody.ts';
import { ladder } from '../src/engine/curriculum.ts';
import { barTicks, type Problem } from '../src/engine/types.ts';

// 생성기 내부 값을 쓰지 않고, 만들어진 악보(MIDI)만 보고 단원 규칙을 검사한다 (기획 §M5.4-5)

const mod = (a: number, n: number) => ((a % n) + n) % n;
const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const MINOR = [0, 2, 3, 5, 7, 8, 10];
const SEEDS = 200;

/** MIDI → 음계 칸(장조 도 = 0, 단조 라 = 0). 솔♯은 솔 칸 */
function step(p: Problem, midi: number): number {
  const rel = midi - p.tonic;
  const scale = p.minor ? MINOR : MAJOR;
  let i = scale.indexOf(mod(rel, 12));
  if (i < 0 && p.minor && mod(rel, 12) === 11) i = 6;
  assert.ok(i >= 0, `${p.id}: 음계 밖의 음 ${midi}`);
  return 7 * Math.floor(rel / 12) + i;
}
const pitched = (p: Problem) => p.notes.filter((n) => n.midi !== null).map((n) => n.midi!);
const durs = (p: Problem) => p.notes.map((n) => n.dur);

/** 단원별 쓸 수 있는 음 길이(틱) */
const DURS: Record<string, number[]> = {
  r1: [12, 24, 48], r2a: [6, 12, 24, 48], r2b: [6, 12, 18, 24, 48],
  r3a: [3, 6, 12, 18, 24, 48], r3b: [3, 6, 9, 12, 18, 24, 48], '6/8': [6, 12, 18, 36],
};
/** 단원의 새 리듬이 들어갔는지 */
const FRESH_RHYTHM: Record<string, (p: Problem) => boolean> = {
  g2a: (p) => p.notes.some((n, i) => n.dur === 6 && n.midi !== null && p.notes[i + 1]?.dur === 6),
  g2d: (p) => durs(p).includes(18),
  g3d: (p) => durs(p).includes(3),
  // 붓점(9·3), 당김음(6·12·6), 16분-8분-16분(3·6·3)
  g3e: (p) => durs(p).includes(9) || p.notes.some((n, i) => (n.dur === 12 && p.notes[i - 1]?.dur === 6 && p.notes[i + 1]?.dur === 6) || (n.dur === 6 && p.notes[i - 1]?.dur === 3 && p.notes[i + 1]?.dur === 3)),
};

test('선율 사다리: 받아쓰기 단원마다 생성기 설정이 있다', () => {
  for (const s of ladder('dictation')) assert.ok(UNITS[s.id], s.id);
});

test('같은 시드는 같은 선율, id에 단원과 시드가 들어 있다', () => {
  assert.deepEqual(melodyItem('g2b', 42), melodyItem('g2b', 42));
  assert.equal(melodyItem('g2b', 42).id, 'mel-g2b-42');
});

for (const s of ladder('dictation')) {
  const u = UNITS[s.id];
  test(`${s.id} ${s.name}: 단원 규칙 (${SEEDS}개)`, () => {
    for (let seed = 1; seed <= SEEDS; seed++) {
      const p = melodyItem(s.id, seed);
      const at = `${s.id} ${seed}`;
      // 마디를 꽉 채우고, 쓸 수 있는 음 길이만, 조표 상한, 건반 음역 F3~C6
      assert.equal(durs(p).reduce((a, b) => a + b, 0), barTicks(p) * u.bars, `${at}: 마디`);
      assert.ok(durs(p).every((d) => DURS[u.rhythm].includes(d)), `${at}: 음 길이 ${durs(p)}`);
      assert.ok(Math.abs(p.fifths) <= u.keys, `${at}: 조표`);
      assert.ok(pitched(p).every((m) => m >= 53 && m <= 84), `${at}: 음역`);
      assert.equal(p.notes[0].midi !== null && p.notes.at(-1)!.midi !== null, true, `${at}: 쉼표로 시작·끝`);
      if (u.rhythm === '6/8') assert.equal(barTicks(p), 36, `${at}: 6/8`);
      if (u.minor === 1) assert.ok(p.minor, `${at}: 단조`);

      const ms = pitched(p);
      const st = ms.map((m) => step(p, m));
      // 음역(음계 칸), 시작은 으뜸화음 음, 끝은 으뜸음을 긴 음으로, 그 앞은 순차
      assert.ok(st.every((x) => x >= u.range[0] && x <= u.range[1]), `${at}: 음계 칸 음역 ${st}`);
      assert.ok([0, 2, 4].includes(mod(st[0], 7)), `${at}: 시작 음`);
      assert.equal(mod(st.at(-1)!, 7), 0, `${at}: 끝 음`);
      assert.equal(Math.abs(st.at(-1)! - st.at(-2)!), 1, `${at}: 종지`);
      assert.ok(p.notes.at(-1)!.dur >= 18, `${at}: 마지막 음 길이`);

      // 도약은 그 단원이 허용한 화음의 구성음 사이에서만. 7도·증4도 도약 없음. 큰 도약 뒤엔 반대 방향 순차
      const chords = p.minor ? ['I', 'IV'] : u.leap;
      for (let i = 1; i < st.length; i++) {
        const d = st[i] - st[i - 1];
        // 순차진행은 반음 또는 온음(단조의 파→솔♯ 증2도 금지)
        if (Math.abs(d) === 1) assert.ok(Math.abs(ms[i] - ms[i - 1]) <= 2, `${at}: 증2도 ${i}`);
        if (Math.abs(d) < 2) continue;
        assert.ok(chords.some((c) => CHORDS[c].includes(mod(st[i], 7)) && CHORDS[c].includes(mod(st[i - 1], 7))), `${at}: 화음 밖 도약 ${st[i - 1]}→${st[i]}`);
        assert.ok(Math.abs(d) !== 6 && Math.abs(d) <= 7 && Math.abs(ms[i] - ms[i - 1]) !== 6, `${at}: 7도·증4도 도약`);
        if (Math.abs(d) >= 3 && i + 1 < st.length) assert.equal(st[i + 1] - st[i], -Math.sign(d), `${at}: 큰 도약 뒤 순차 ${i}`);
      }
      // 단조의 솔♯은 라로 올라갈 때만
      if (p.minor) ms.forEach((m, i) => { if (mod(m - p.tonic, 12) === 11) assert.equal(st[i + 1], st[i] + 1, `${at}: 솔♯ 해결`); });
      // 새 요소
      if (FRESH_RHYTHM[s.id]) assert.ok(FRESH_RHYTHM[s.id](p), `${at}: 새 리듬 ${durs(p)}`);
      if (u.fresh && !p.minor) assert.ok(u.fresh(st), `${at}: 새 음높이 요소`);
      if (u.leap.length === 0) assert.ok(st.every((x, i) => !i || Math.abs(x - st[i - 1]) <= 1), `${at}: 순차진행만`);
      // 길이: 마디당 음표 수 상한
      assert.ok(ms.length <= u.dense * u.bars, `${at}: 음표 수 ${ms.length}`);
    }
  });
}

test('단원이 올라가도 음표 수는 한 번에 뛰지 않는다(4마디 단원 평균 차이 4개 이하)', () => {
  const avg = (id: string) => Array.from({ length: SEEDS }, (_, i) => pitched(melodyItem(id, i + 1)).length).reduce((a, b) => a + b, 0) / SEEDS;
  const four = ladder('dictation').filter((s) => UNITS[s.id].bars === 4).map((s) => [s.id, avg(s.id)] as const);
  for (let i = 1; i < four.length; i++) assert.ok(four[i][1] - four[i - 1][1] <= 4, `${four[i - 1][0]} ${four[i - 1][1]} → ${four[i][0]} ${four[i][1]}`);
});
