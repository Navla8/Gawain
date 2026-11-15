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
  if (i < 0 && p.minor && mod(rel, 12) === 11) i = 6; // 솔♯
  if (i < 0 && p.minor && mod(rel, 12) === 9) i = 5; // 가락단음계 파♯
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
  for (const s of ladder('dictation').filter((x) => x.id !== 't5')) assert.ok(UNITS[s.id], s.id);
});

test('같은 시드는 같은 선율, id에 단원과 시드가 들어 있다', () => {
  assert.deepEqual(melodyItem('g2b', 42), melodyItem('g2b', 42));
  assert.equal(melodyItem('g2b', 42).id, 'mel-g2b-42');
});

/** L4 반음계·전조 단원은 음계 밖 음이 나오므로 따로 검사한다(아래) */
const L4 = ['g4a', 'g4b', 't5'];
for (const s of ladder('dictation').filter((x) => !L4.includes(x.id))) {
  const u = UNITS[s.id];
  test(`${s.id} ${s.name}: 단원 규칙 (${SEEDS}개)`, () => {
    for (let seed = 1; seed <= SEEDS; seed++) {
      const p = melodyItem(s.id, seed);
      const at = `${s.id} ${seed}`;
      // 마디를 꽉 채우고, 쓸 수 있는 음 길이만, 조표 상한, 건반 음역 F3~C6
      assert.equal(durs(p).reduce((a, b) => a + b, 0), barTicks(p) * u.bars, `${at}: 마디`);
      const allowed = [...DURS[u.rhythm], ...(p.beatsPerBar === 3 || u.pickup ? [36] : [])];
      assert.ok(durs(p).every((d) => allowed.includes(d)), `${at}: 음 길이 ${durs(p)}`);
      assert.ok(u.rhythm === '6/8' ? p.beatsPerBar === 2 : (u.meters ?? [4]).includes(p.beatsPerBar), `${at}: 박자`);
      // 못갖춘마디: 한 박짜리 여린박 음으로 시작(마지막 마디가 그만큼 짧다)
      if (u.pickup) assert.ok(p.pickup === 12 && p.notes[0].dur === 12 && p.notes[0].midi !== null, `${at}: 못갖춘마디`);
      else assert.equal(p.pickup, undefined, `${at}: 못갖춘마디 아님`);
      assert.ok(Math.abs(p.fifths) <= u.keys, `${at}: 조표`);
      // 음역: 높은음자리표 F3~C6, 낮은음자리표 C2~E4
      const [lo, hi] = u.bass ? [36, 64] : [53, 84];
      assert.equal(p.clef, u.bass ? 'bass' : undefined, `${at}: 음자리표`);
      assert.ok(pitched(p).every((m) => m >= lo && m <= hi), `${at}: 음역`);
      if (s.id === 'g5b') assert.equal(p.plays, 3, `${at}: 재생 3회`);
      // 2성부: 아래 성부는 마디를 꽉 채우고, 마디 첫 음이 위 성부 마디 첫 음보다 낮고, 마지막은 으뜸음
      if (u.bassLine) {
        const b = p.bass!;
        assert.equal(b.reduce((a, n) => a + n.dur, 0), barTicks(p) * u.bars, `${at}: 아래 성부 마디`);
        assert.ok(b.every((n) => n.midi !== null && n.midi >= 36 && n.midi <= 57), `${at}: 아래 성부 음역`);
        assert.ok(b.every((n) => MAJOR.includes(mod(n.midi! - p.tonic, 12))), `${at}: 아래 성부 음계`);
        assert.equal(mod(b.at(-1)!.midi! - p.tonic, 12), 0, `${at}: 아래 성부 끝`);
        assert.ok(b.every((n, i) => !i || Math.abs(n.midi! - b[i - 1].midi!) <= 7), `${at}: 아래 성부 도약`);
        assert.ok(Math.min(...pitched(p)) > Math.max(...b.map((n) => n.midi!)) - 5, `${at}: 성부 겹침`);
      } else assert.equal(p.bass, undefined);
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
      const chords = p.minor ? u.minorLeap! : u.leap;
      for (let i = 1; i < st.length; i++) {
        const d = st[i] - st[i - 1];
        // 순차진행은 반음 또는 온음(단조의 파→솔♯ 증2도 금지)
        if (Math.abs(d) === 1) assert.ok(Math.abs(ms[i] - ms[i - 1]) <= 2, `${at}: 증2도 ${i}`);
        if (Math.abs(d) < 2) continue;
        assert.ok(chords.some((c) => CHORDS[c].includes(mod(st[i], 7)) && CHORDS[c].includes(mod(st[i - 1], 7))), `${at}: 화음 밖 도약 ${st[i - 1]}→${st[i]}`);
        assert.ok(Math.abs(d) !== 6 && Math.abs(d) <= 7 && Math.abs(ms[i] - ms[i - 1]) !== 6, `${at}: 7도·증4도 도약`);
        if (Math.abs(d) >= 3 && i + 1 < st.length) assert.equal(st[i + 1] - st[i], -Math.sign(d), `${at}: 큰 도약 뒤 순차 ${i}`);
      }
      // 단조의 솔♯은 라로 올라갈 때만, 파♯은 솔♯ → 라로 올라갈 때만(가락단음계 상행). 내려갈 때는 자연단음계
      if (p.minor) ms.forEach((m, i) => {
        if (mod(m - p.tonic, 12) === 11) assert.equal(st[i + 1], st[i] + 1, `${at}: 솔♯ 해결`);
        if (mod(m - p.tonic, 12) === 9) assert.ok(st[i + 1] === st[i] + 1 && st[i + 2] === st[i] + 2, `${at}: 파♯ 해결`);
      });
      // 새 요소
      if (FRESH_RHYTHM[s.id]) assert.ok(FRESH_RHYTHM[s.id](p), `${at}: 새 리듬 ${durs(p)}`);
      if (u.fresh && !p.minor) assert.ok(u.fresh(st), `${at}: 새 음높이 요소`);
      if (u.leap.length === 0) assert.ok(st.every((x, i) => !i || Math.abs(x - st[i - 1]) <= 1), `${at}: 순차진행만`);
      // 길이: 마디당 음표 수 상한
      assert.ok(ms.length <= u.dense * u.bars, `${at}: 음표 수 ${ms.length}`);
    }
  });
}

test('홑박자 단원은 3/4도 나오고, 단조는 딸림화음(솔♯) 도약과 가락단음계 상행·자연단음계 하행이 나온다', () => {
  const metersOf = (id: string) => new Set(Array.from({ length: SEEDS }, (_, i) => melodyItem(id, i + 1).beatsPerBar));
  assert.deepEqual([...metersOf('g2a')].sort(), [3, 4]);
  assert.deepEqual([...metersOf('g1a')], [4]);
  let fiSi = 0, down = 0, vLeap = 0, diaLeap = 0;
  for (const id of ['g3b', 'g3f']) for (let seed = 1; seed <= SEEDS; seed++) {
    const p = melodyItem(id, seed);
    if (!p.minor) continue;
    const ms = pitched(p), rel = ms.map((m) => mod(m - p.tonic, 12));
    rel.forEach((r, i) => {
      if (r === 9 && rel[i + 1] === 11) fiSi++;
      if (r === 0 && rel[i + 1] === 10 && rel[i + 2] === 8) down++; // 라 → 솔 → 파
      const a = rel[i - 1], d = Math.abs(ms[i] - (ms[i - 1] ?? ms[i]));
      if (i && d >= 3 && [4, 11, 2].includes(a) && [4, 11, 2].includes(r)) vLeap++; // 미·솔♯·티 사이 도약
      if (id === 'g3f' && i && d >= 3 && [[2, 5], [5, 2], [8, 0], [0, 8], [2, 8], [8, 2]].some(([x, y]) => x === a && y === r)) diaLeap++; // ii°·VI 도약
    });
  }
  assert.ok(fiSi > 0, '가락단음계 상행 파♯→솔♯');
  assert.ok(down > 0, '자연단음계 하행 라→솔→파');
  assert.ok(vLeap > 0, '딸림화음 도약');
  assert.ok(diaLeap > 0, 'ii°·VI 도약(8마디 단조)');
});

test('단원이 올라가도 음표 수는 한 번에 뛰지 않는다(4마디 단원 평균 차이 4개 이하)', () => {
  const avg = (id: string) => Array.from({ length: SEEDS }, (_, i) => pitched(melodyItem(id, i + 1)).length).reduce((a, b) => a + b, 0) / SEEDS;
  const four = ladder('dictation').filter((s) => !L4.includes(s.id) && UNITS[s.id].bars === 4 && s.level <= 3).map((s) => [s.id, avg(s.id)] as const);
  for (let i = 1; i < four.length; i++) assert.ok(four[i][1] - four[i - 1][1] <= 4, `${four[i - 1][0]} ${four[i - 1][1]} → ${four[i][0]} ${four[i][1]}`);
});

test('g4a 반음계 선율: 반음계 음이 둘 이상, 모두 반음으로 해결하고 올림·내림 표기가 해결 방향과 맞다', () => {
  for (let seed = 1; seed <= SEEDS; seed++) {
    const p = melodyItem('g4a', seed);
    const at = `g4a ${seed}`;
    assert.equal(durs(p).reduce((a, b) => a + b, 0), barTicks(p) * UNITS.g4a.bars, `${at}: 마디`);
    const ns = p.notes.filter((n) => n.midi !== null);
    let chroma = 0;
    ns.forEach((n, i) => {
      const rel = mod(n.midi! - p.tonic, 12);
      if (MAJOR.includes(rel)) { assert.equal(n.spell, undefined, `${at}: 음계 음에 표기 힌트`); return; }
      chroma++;
      const next = ns[i + 1];
      assert.ok(next && Math.abs(next.midi! - n.midi!) === 1, `${at}: 반음 해결 ${i}`);
      assert.equal(n.spell, next.midi! > n.midi! ? 1 : -1, `${at}: 표기 방향 ${i}`);
      assert.ok(i > 0 && Math.abs(n.midi! - ns[i - 1].midi!) !== 6, `${at}: 증4도 진입`);
    });
    assert.ok(chroma >= 2, `${at}: 반음계 음 ${chroma}`);
    assert.ok(pitched(p).every((m) => m >= 53 && m <= 84), `${at}: 음역`);
    assert.equal(mod(pitched(p).at(-1)! - p.tonic, 12), 0, `${at}: 끝 음`);
  }
});

test('g4b 딸림조 전조: 5마디부터 딸림조(새 도 = 솔), 새 조의 티(파♯)가 나오고 새 으뜸음으로 끝난다', () => {
  for (let seed = 1; seed <= SEEDS; seed++) {
    const p = melodyItem('g4b', seed);
    const at = `g4b ${seed}`;
    const len = barTicks(p);
    assert.equal(p.bars, 8);
    assert.ok(p.modulation && p.modulation.at === 4 * len && mod(p.modulation.tonic - p.tonic, 12) === 7, `${at}: 전조 표시`);
    let t = 0, fi = false;
    const first: number[] = [], second: number[] = [];
    for (const n of p.notes) {
      if (n.midi !== null) (t < p.modulation!.at ? first : second).push(n.midi);
      if (n.midi !== null && t >= p.modulation!.at && mod(n.midi - p.modulation!.tonic, 12) === 11) { fi = true; assert.equal(n.spell, 1, `${at}: 파♯ 표기`); }
      t += n.dur;
    }
    assert.ok(first.every((m) => MAJOR.includes(mod(m - p.tonic, 12))), `${at}: 앞 악절은 원조`);
    assert.ok(second.every((m) => MAJOR.includes(mod(m - p.modulation!.tonic, 12))), `${at}: 뒤 악절은 딸림조`);
    assert.ok(fi, `${at}: 새 조의 티`);
    assert.ok(Math.abs(second[0] - first.at(-1)!) <= 5, `${at}: 전조 지점 도약 ${first.at(-1)} → ${second[0]}`);
    assert.equal(mod(second.at(-1)! - p.modulation!.tonic, 12), 0, `${at}: 새 으뜸음으로 끝`);
    assert.ok(pitched(p).every((m) => m >= 53 && m <= 84), `${at}: 음역`);
  }
});

test('t5 곡 채보: 공개 곡 선율, 마디를 꽉 채우고 조를 옮겨 건반 안에', async () => {
  const { tuneItem, TUNES } = await import('../src/engine/melody.ts');
  assert.ok(TUNES.length >= 5);
  for (let seed = 1; seed <= 120; seed++) {
    const p = tuneItem(seed);
    assert.equal(durs(p).reduce((a, b) => a + b, 0), barTicks(p) * p.bars, `${p.title}: 마디`);
    assert.ok(pitched(p).every((m) => m >= 53 && m <= 84), `${p.title}: 음역`);
    assert.ok(Math.abs(p.fifths) <= 3);
    assert.equal(mod(pitched(p).at(-1)! - p.tonic, 12), 0, `${p.title}: 으뜸음으로 끝`);
    assert.deepEqual(tuneItem(seed), p);
  }
});

test('드물게 만들지 못하는 시드는 다음 시드로 넘어가고 id에 실제 시드가 든다(M1)', () => {
  for (const id of ['g3f', 'g5b']) {
    const p = melodyItem(id, 23202683);
    const seed = Number(p.id.split('-')[2]);
    assert.ok(seed > 23202683, `${id}: 시드가 그대로`);
    assert.deepEqual(melodyItem(id, seed), p);
  }
});

test('2성부(g4c): 모든 시점에 위 성부가 아래 성부보다 단3도 이상 높다(M5)', () => {
  for (let seed = 1; seed <= 3000; seed++) {
    const p = melodyItem('g4c', seed);
    let t = 0;
    const top: [number, number, number | null][] = p.notes.map((n) => { const s = t; t += n.dur; return [s, t, n.midi]; });
    t = 0;
    for (const b of p.bass!) {
      const s = t; t += b.dur;
      for (const [ts, te, m] of top) if (m !== null && ts < t && te > s) assert.ok(m - b.midi! >= 3, `${p.id}: ${m} vs ${b.midi}`);
    }
  }
});
