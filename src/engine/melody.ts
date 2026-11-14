import { TPB, type Note, type Problem } from './types.ts';
import { rng } from './drills.ts';
import { keyName } from './theory.ts';

// 선율 받아쓰기 생성기 (기획 §M5). 대학 교재 순서대로 단원마다 새 요소를 하나씩만 넣는다.
// 마디마다 화음을 먼저 정하고, 도약은 그 마디(또는 앞 마디) 화음의 구성음 사이에서만 한다.
// 음높이는 음계 칸(step)으로 다룬다: 장조는 도 = 0, 단조는 라 = 0, 7칸이 한 옥타브.

const mod = (a: number, n: number) => ((a % n) + n) % n;
const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const MINOR = [0, 2, 3, 5, 7, 8, 10]; // 라 으뜸 자연단음계. 라로 올라가는 솔은 솔♯

/** 화음 구성음(음계 칸). 단조는 라 = 0이라 I·IV·V가 그대로 i·iv·V(미·솔♯·티)가 된다 */
export const CHORDS: Record<string, number[]> = {
  I: [0, 2, 4], IV: [3, 5, 0], V: [4, 6, 1], V7: [4, 6, 1, 3], ii: [1, 3, 5], vi: [5, 0, 2],
};
const TRIADS = ['I', 'IV', 'V'];

/** 리듬 조각(틱, 음수는 쉼표). 리듬 받아쓰기 단원과 같은 나선형: 위 단원은 아래 단원의 조각을 모두 쓴다 */
const CELLS: Record<string, number[][]> = {
  r1: [[12], [24]],
  r2a: [[6, 6], [-12]],
  r2b: [[18, 6]],
  r3a: [[3, 3, 3, 3], [6, 3, 3], [3, 3, 6]],
  r3b: [[9, 3], [6, 12, 6], [3, 6, 3]],
};
const SIMPLE = ['r1', 'r2a', 'r2b', 'r3a', 'r3b'];
/** 마지막 마디(마지막 음은 긴 음) */
const END = [[12, 12, 24], [24, 24], [48]];
const COMPOUND = [[18], [12, 6], [6, 6, 6], [6, 12]];
const COMPOUND_END = [[18, 18], [36], [12, 6, 18]];

type Rhythm = 'r1' | 'r2a' | 'r2b' | 'r3a' | 'r3b' | '6/8';

interface Unit {
  bars: number;
  rhythm: Rhythm;
  /** 이 단원의 새 리듬: 한 번은 나와야 한다 */
  freshRhythm?: boolean;
  /** 마디당 음표 수 상한(평균). 새 리듬이 들어와도 길이(음표 수)가 함께 뛰지 않게 한다 */
  dense: number;
  /** 도약을 허용하는 화음 */
  leap: string[];
  /** 마디별 화음 진행 후보(마지막 마디는 I) */
  progs: string[][];
  /** 음역(음계 칸) */
  range: [number, number];
  /** 조표 개수 상한 */
  keys: number;
  tempo: number;
  /** 단조로 낼 확률 */
  minor?: number;
  /** 이 단원의 새 음높이 요소가 들어갔는지(음계 칸 열을 받는다) */
  fresh?: (steps: number[]) => boolean;
}

const P_I = [['I', 'I', 'I', 'I']];
const P_V = [['I', 'V', 'V', 'I'], ['I', 'I', 'V', 'I'], ['I', 'V', 'I', 'I']];
const P_IV = [['I', 'IV', 'V', 'I'], ['I', 'IV', 'I', 'I'], ['I', 'I', 'IV', 'I']];
const P_DIA = [['I', 'vi', 'ii', 'I'], ['I', 'vi', 'V7', 'I'], ['I', 'ii', 'V7', 'I'], ['I', 'vi', 'IV', 'I']];
/** 8마디 앞 악절: 반종지(V)로 끝난다 */
const HALF = [['I', 'IV', 'I', 'V'], ['I', 'vi', 'ii', 'V'], ['I', 'ii', 'V', 'V'], ['I', 'I', 'IV', 'V']];
const ALL = ['I', 'IV', 'V', 'ii', 'vi', 'V7'];

const isLeap = (a: number, b: number) => Math.abs(a - b) >= 2;
/** 두 음이 다 들어 있는 화음 중 하나가 허용 목록에 있으면 그 도약은 이 화음 안의 도약 */
const inChord = (c: string, a: number, b: number) => CHORDS[c].includes(mod(a, 7)) && CHORDS[c].includes(mod(b, 7));
const leaps = (steps: number[]) => steps.slice(1).map((b, i) => [steps[i], b] as const).filter(([a, b]) => isLeap(a, b));
/** 새 도약이 두 번 이상(옥타브 도약은 같은 음이름이라 세지 않는다) */
const hasLeapIn = (steps: number[], ok: (a: number, b: number) => boolean) =>
  leaps(steps).filter(([a, b]) => Math.abs(a - b) !== 7 && ok(a, b)).length >= 2;
const touches = (a: number, b: number, xs: number[]) => xs.includes(mod(a, 7)) || xs.includes(mod(b, 7));

export const UNITS: Record<string, Unit> = {
  g1a: { dense: 3, bars: 2, rhythm: 'r1', leap: [], progs: [['I', 'I']], range: [0, 4], keys: 2, tempo: 80 },
  g1b: { dense: 3,
    bars: 4, rhythm: 'r1', leap: [], progs: P_I, range: [-3, 7], keys: 2, tempo: 80,
    fresh: (m) => m.some((s) => s < 0 || s > 4),
  },
  g1c: { dense: 3, bars: 4, rhythm: 'r1', leap: ['I'], progs: P_I, range: [-3, 7], keys: 2, tempo: 80, fresh: (m) => hasLeapIn(m, () => true) },
  g2a: { dense: 4, bars: 4, rhythm: 'r2a', freshRhythm: true, leap: ['I'], progs: P_I, range: [-3, 7], keys: 3, tempo: 76 },
  g2b: { dense: 4,
    bars: 4, rhythm: 'r2a', leap: ['I', 'V'], progs: P_V, range: [-3, 8], keys: 3, tempo: 76,
    fresh: (m) => hasLeapIn(m, (a, b) => inChord('V', a, b) && touches(a, b, [6, 1])),
  },
  g2c: { dense: 4,
    bars: 4, rhythm: 'r2a', leap: TRIADS, progs: P_IV, range: [-3, 8], keys: 3, tempo: 76,
    fresh: (m) => hasLeapIn(m, (a, b) => inChord('IV', a, b) && touches(a, b, [3, 5])),
  },
  g2d: { dense: 4, bars: 4, rhythm: 'r2b', freshRhythm: true, leap: TRIADS, progs: [...P_V, ...P_IV], range: [-3, 8], keys: 3, tempo: 76 },
  g3a: { dense: 4, bars: 4, rhythm: '6/8', leap: TRIADS, progs: [...P_V, ...P_IV], range: [-3, 8], keys: 4, tempo: 84 },
  g3b: { dense: 4, bars: 4, rhythm: 'r2b', leap: ['I', 'IV'], progs: [...P_IV, ['I', 'V', 'I', 'I']], range: [-3, 7], keys: 4, tempo: 76, minor: 1 },
  g3c: { dense: 4,
    bars: 4, rhythm: 'r2b', leap: ALL, progs: P_DIA, range: [-3, 9], keys: 4, tempo: 76,
    fresh: (m) => hasLeapIn(m, (a, b) => ['ii', 'vi', 'V7'].some((c) => inChord(c, a, b)) && !TRIADS.some((c) => inChord(c, a, b))),
  },
  g3d: { dense: 5, bars: 4, rhythm: 'r3a', freshRhythm: true, leap: ALL, progs: [...P_DIA, ...P_IV], range: [-3, 9], keys: 4, tempo: 72 },
  g3e: { dense: 5, bars: 4, rhythm: 'r3b', freshRhythm: true, leap: ALL, progs: [...P_DIA, ...P_IV], range: [-3, 9], keys: 4, tempo: 72 },
  g3f: { dense: 4.5, bars: 8, rhythm: 'r3b', leap: ALL, progs: [...P_DIA, ...P_IV, ...P_V], range: [-3, 9], keys: 4, tempo: 72, minor: 0.25 },
};

/** 단조로 낼 때 쓰는 화음과 진행(i·iv 도약만, 딸림은 솔♯→라 종지로) */
const MINOR_UNIT = { leap: ['I', 'IV'], progs: UNITS.g3b.progs, half: [['I', 'IV', 'I', 'V'], ['I', 'I', 'IV', 'V']] };

/** 음계 칸 → 으뜸음에서 몇 반음. 단조에서 라로 올라가는 솔은 솔♯ */
const semis = (s: number, minor: boolean, next?: number) =>
  12 * Math.floor(s / 7) + (minor ? MINOR : MAJOR)[mod(s, 7)] + (minor && mod(s, 7) === 6 && next === s + 1 ? 1 : 0);

interface Slot { dur: number; bar: number; onset: number }

/** 마디마다 리듬 조각을 채운다. 마지막 마디(와 8마디의 4마디째)는 긴 음으로 끝난다 */
function rhythm(u: Unit, r: () => number): Slot[] | undefined {
  const compound = u.rhythm === '6/8';
  const cells = compound ? COMPOUND : SIMPLE.slice(0, SIMPLE.indexOf(u.rhythm) + 1).flatMap((k) => CELLS[k]);
  // 새 리듬은 음표 조각으로만 센다(쉼표만 나와서는 안 된다)
  const fresh = compound || !u.freshRhythm ? [] : CELLS[u.rhythm].filter((c) => c[0] > 0);
  const barLen = compound ? 36 : 48;
  const ends = compound ? COMPOUND_END : END;
  const pick = <T,>(xs: T[]) => xs[Math.floor(r() * xs.length)];
  const out: Slot[] = [];
  let usedFresh = !fresh.length;
  for (let b = 0; b < u.bars; b++) {
    const cadence = b === u.bars - 1 || (u.bars === 8 && b === 3);
    const bar = cadence ? pick(ends) : [];
    let left = barLen - bar.reduce((a, x) => a + Math.abs(x), 0);
    while (left > 0) {
      // 쉼표는 드물게, 첫 마디·종지 마디에는 넣지 않는다. 새 조각은 자주 고른다
      const fit = cells.filter((c) => c.reduce((a, x) => a + Math.abs(x), 0) <= left && (c[0] > 0 || (b > 0 && !cadence && r() < 0.3)));
      if (!fit.length) return undefined;
      // 새 조각은 처음 한 번은 자주 고르고, 그 뒤로는 드물게(한 판에 한두 번)
      const fr = fit.filter((c) => fresh.includes(c));
      const old = fit.filter((c) => !fresh.includes(c));
      const c = !usedFresh && fr.length && r() < 0.5 ? pick(fr) : usedFresh && old.length && r() < 0.8 ? pick(old) : pick(fit);
      if (fresh.includes(c)) usedFresh = true;
      bar.unshift(...c);
      left -= c.reduce((a, x) => a + Math.abs(x), 0);
    }
    let t = 0;
    for (const d of bar) { out.push({ dur: d, bar: b, onset: t }); t += Math.abs(d); }
  }
  const notes = out.filter((s) => s.dur > 0).length;
  return usedFresh && notes <= u.dense * u.bars ? out : undefined;
}

/** 화음 진행 위에서 음을 고른다. 실패하면 undefined(다시 만든다) */
function walk(u: Unit, slots: Slot[], chords: string[], leapOk: string[], r: () => number): number[] | undefined {
  const notes = slots.filter((s) => s.dur > 0);
  const n = notes.length;
  const [lo, hi] = u.range;
  const beat = u.rhythm === '6/8' ? 18 : TPB * 2; // 센박: 마디 첫 박과 가운데 박
  const halfEnd = u.bars === 8 ? notes.filter((s) => s.bar <= 3).length - 1 : -1;
  const steps: number[] = [];
  for (let i = 0; i < n; i++) {
    const chord = CHORDS[chords[notes[i].bar]];
    let cand: number[];
    if (i === 0) cand = [0, 2, 4, 7].filter((s) => s >= lo && s <= hi);
    else {
      const cur = steps[i - 1];
      const prev = i >= 2 ? cur - steps[i - 2] : 0;
      const prevLeap = Math.abs(prev) >= 2;
      cand = [cur - 1, cur + 1, cur];
      // 4도 넘는 도약 뒤에는 반대 방향 순차진행만
      if (Math.abs(prev) >= 3) cand = [cur - Math.sign(prev)];
      else if (!(prevLeap && i >= 3 && Math.abs(steps[i - 2] - steps[i - 3]) >= 2)) {
        // 도약: 지금 음과 다음 음이 같은 허용 화음(이 마디 또는 앞 마디)에 들어 있을 때만. 7도·증4도는 뺀다
        const here = [chords[notes[i].bar], chords[notes[i - 1].bar]].filter((c) => leapOk.includes(c));
        for (let t = lo; t <= hi; t++) {
          const d = Math.abs(t - cur);
          if (d < 2 || d === 6 || d > 7 || !here.some((c) => inChord(c, cur, t))) continue;
          if (Math.abs(semis(t, !!u.minor) - semis(cur, !!u.minor)) === 6) continue;
          cand.push(t);
        }
      }
      cand = cand.filter((t) => t >= lo && t <= hi);
      // 같은 음은 두 번까지
      if (i >= 2 && steps[i - 2] === cur) cand = cand.filter((t) => t !== cur);
      // 단조: 파→솔♯→라는 증2도라 뺀다(솔이 라로 올라가면 솔♯이 된다)
      // 솔을 되풀이하면 솔→솔♯이 생기므로 단조에서는 솔을 되풀이하지 않는다
      if (u.minor && mod(cur, 7) === 6) cand = cand.filter((t) => t !== cur && !(i >= 2 && steps[i - 2] === cur - 1 && t === cur + 1));
    }
    // 종지: 마지막은 으뜸음, 그 앞은 레·티(단조는 티·솔♯). 8마디 앞 악절 끝은 딸림화음 음
    if (i === n - 1) cand = cand.filter((t) => mod(t, 7) === 0 && Math.abs(t - steps[i - 1]) === 1);
    else if (i === n - 2) cand = cand.filter((t) => [1, 6].includes(mod(t, 7)) && (t + 1 <= hi || mod(t, 7) === 1));
    else if (i === halfEnd) cand = cand.filter((t) => CHORDS.V.includes(mod(t, 7)));
    if (!cand.length) return undefined;
    const strong = notes[i].onset % beat === 0;
    const w = (t: number) => {
      const prev = i ? steps[i - 1] : t;
      let x = t === prev ? 0.3 : isLeap(prev, t) ? 0.6 : 1;
      if (strong) x *= chord.includes(mod(t, 7)) ? 3 : 0.5;
      return x;
    };
    const ws = cand.map(w);
    let pickT = r() * ws.reduce((a, b) => a + b, 0);
    let k = 0;
    while (k < cand.length - 1 && (pickT -= ws[k]) >= 0) k++;
    steps.push(cand[k]);
  }
  return steps;
}

/** 선율 받아쓰기 한 문제. 같은 시드는 같은 문제(오답 다시 풀기는 id의 시드로 다시 만든다) */
export function melodyItem(id: string, seed: number, name = id): Problem {
  const u0 = UNITS[id];
  const r = rng(seed);
  const pick = <T,>(xs: T[]) => xs[Math.floor(r() * xs.length)];
  const minor = r() < (u0.minor ?? 0);
  const u: Unit = { ...u0, minor: minor ? 1 : 0 };
  const leapOk = minor ? MINOR_UNIT.leap : u.leap;
  const fifths = Math.floor(r() * (2 * u.keys + 1)) - u.keys;
  const pc = mod(fifths * 7 + (minor ? 9 : 0), 12);

  let best: { steps: number[]; slots: Slot[]; tonic: number } | undefined;
  for (let tries = 0; tries < 2000 && !best; tries++) {
    const slots = rhythm(u, r);
    if (!slots) continue;
    const progs = minor ? MINOR_UNIT.progs : u.progs;
    const chords = u.bars === 8 ? [...pick(minor ? MINOR_UNIT.half : HALF), ...pick(progs)] : pick(progs).slice(-u.bars);
    const steps = walk(u, slots, chords, leapOk, r);
    if (!steps) continue;
    if (u.fresh && !minor && !u.fresh(steps)) continue;
    // 으뜸음(장조 도, 단조 라)을 조표에 맞추고, 선율이 건반(F3~C6) 안에 들면서 가운데가 G4에 가장 가까운 옥타브. 안 들면 다시 만든다
    const ss = steps.map((s, i) => semis(s, minor, steps[i + 1]));
    const low = Math.min(...ss), high = Math.max(...ss);
    const fits = [36, 48, 60, 72].map((o) => o + pc).filter((t) => t + low >= 53 && t + high <= 84);
    if (!fits.length) continue;
    const dist = (t: number) => Math.abs(t + (low + high) / 2 - 67);
    best = { steps, slots, tonic: fits.reduce((a, t) => (dist(t) < dist(a) ? t : a)) };
  }
  if (!best) throw new Error(`선율 생성 실패: ${id} ${seed}`);

  const { steps, slots, tonic } = best;
  let k = 0;
  const notes: Note[] = slots.map((s) => {
    if (s.dur < 0) return { midi: null, dur: -s.dur };
    const i = k++;
    return { midi: tonic + semis(steps[i], minor, steps[i + 1]), dur: s.dur };
  });
  const compound = u.rhythm === '6/8';
  return {
    id: `mel-${id}-${seed}`,
    title: `${name} · ${keyName({ tonic, fifths, minor })}`,
    tonic, ...(minor && { minor: true }), fifths,
    beatsPerBar: compound ? 2 : 4, ...(compound && { beatTicks: 18 }),
    bars: u.bars, tempo: u.tempo, notes,
  };
}
