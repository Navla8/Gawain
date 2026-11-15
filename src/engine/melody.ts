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
/** 마지막 마디(마지막 음은 긴 음), 마디 길이(틱)별. 못갖춘마디면 마지막 마디가 한 박 짧다 */
const ENDS: Record<number, number[][]> = { 48: [[12, 12, 24], [24, 24], [48]], 36: [[12, 24], [36]], 24: [[24]] };
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
  /** 단조로 낼 때 도약을 허용하는 화음과 진행(라 = 0이라 I·IV·V·ii·vi가 i·iv·V·ii°·VI) */
  minorLeap?: string[];
  minorProgs?: string[][];
  /** 홑박자 박 수 후보(같은 값을 여러 번 넣어 비율을 정함). 없으면 4/4 */
  meters?: number[];
  /** 한 박짜리 못갖춘마디(여린박)로 시작 */
  pickup?: boolean;
  /** 반음계 보조음·경과음을 마디에 0~1개(둘 이상), 반음으로 해결(기획 §M7.5) */
  chromatic?: boolean;
  /** 낮은음자리표 선율(C2~E4 음역, 마디 센박에 근음을 더 자주) */
  bass?: boolean;
  /** 2성부: 위 선율 아래에 화음 근음 베이스(낮은음자리표)를 붙인다 */
  bassLine?: boolean;
  /** 재생 횟수(실전) */
  plays?: number;
  /** 8마디: 5마디부터 딸림조(새 도 = 솔)로 전조. 걸음은 원조 칸으로 하고 뒤 악절의 화음·종지는 새 조(4칸 위)로 본다 */
  modulate?: boolean;
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
/** 단조 4마디 진행(i·iv·V) */
const P_MINOR = [...P_IV, ['I', 'V', 'I', 'I'], ['I', 'V', 'V', 'I'], ['I', 'I', 'V', 'I']];
/** 단조 8마디 앞 악절(반종지) */
const MINOR_HALF = [['I', 'IV', 'I', 'V'], ['I', 'I', 'IV', 'V'], ['I', 'vi', 'IV', 'V']];
/** 홑박자 4/4 둘에 3/4 하나 */
const M34 = [4, 4, 3];

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
  g1b: { meters: M34, dense: 3,
    bars: 4, rhythm: 'r1', leap: [], progs: P_I, range: [-3, 7], keys: 2, tempo: 80,
    fresh: (m) => m.some((s) => s < 0 || s > 4),
  },
  g1c: { meters: M34, dense: 3, bars: 4, rhythm: 'r1', leap: ['I'], progs: P_I, range: [-3, 7], keys: 2, tempo: 80, fresh: (m) => hasLeapIn(m, () => true) },
  g2a: { meters: M34, dense: 4, bars: 4, rhythm: 'r2a', freshRhythm: true, leap: ['I'], progs: P_I, range: [-3, 7], keys: 3, tempo: 76 },
  g2b: { meters: M34, dense: 4,
    bars: 4, rhythm: 'r2a', leap: ['I', 'V'], progs: P_V, range: [-3, 8], keys: 3, tempo: 76,
    fresh: (m) => hasLeapIn(m, (a, b) => inChord('V', a, b) && touches(a, b, [6, 1])),
  },
  g2c: { meters: M34, dense: 4,
    bars: 4, rhythm: 'r2a', leap: TRIADS, progs: P_IV, range: [-3, 8], keys: 3, tempo: 76,
    fresh: (m) => hasLeapIn(m, (a, b) => inChord('IV', a, b) && touches(a, b, [3, 5])),
  },
  g2d: { meters: M34, dense: 4, bars: 4, rhythm: 'r2b', freshRhythm: true, leap: TRIADS, progs: [...P_V, ...P_IV], range: [-3, 8], keys: 3, tempo: 76 },
  g3a: { dense: 4, bars: 4, rhythm: '6/8', leap: TRIADS, progs: [...P_V, ...P_IV], range: [-3, 8], keys: 4, tempo: 84 },
  g3b: { meters: M34, dense: 4, bars: 4, rhythm: 'r2b', leap: ['I', 'IV', 'V'], progs: P_MINOR, range: [-3, 7], keys: 4, tempo: 76, minor: 1, minorLeap: ['I', 'IV', 'V'], minorProgs: P_MINOR },
  g3c: { meters: M34, dense: 4,
    bars: 4, rhythm: 'r2b', leap: ALL, progs: P_DIA, range: [-3, 9], keys: 4, tempo: 76,
    fresh: (m) => hasLeapIn(m, (a, b) => ['ii', 'vi', 'V7'].some((c) => inChord(c, a, b)) && !TRIADS.some((c) => inChord(c, a, b))),
  },
  g3d: { meters: M34, dense: 5, bars: 4, rhythm: 'r3a', freshRhythm: true, leap: ALL, progs: [...P_DIA, ...P_IV], range: [-3, 9], keys: 4, tempo: 72 },
  g3e: { meters: M34, dense: 5, bars: 4, rhythm: 'r3b', freshRhythm: true, leap: ALL, progs: [...P_DIA, ...P_IV], range: [-3, 9], keys: 4, tempo: 72 },
  // L4(기획 §M7.5): 익숙한 리듬(점4분까지) 위에 새 요소 하나
  g4a: { meters: M34, dense: 4, bars: 4, rhythm: 'r2b', leap: ALL, progs: P_DIA, range: [-3, 9], keys: 3, tempo: 72, chromatic: true },
  g4c: { meters: M34, dense: 4, bars: 4, rhythm: 'r2a', leap: TRIADS, progs: [...P_V, ...P_IV], range: [-3, 8], keys: 3, tempo: 72, bassLine: true },
  // L5(기획 §M7.6)
  g5a: { meters: M34, dense: 4, bars: 4, rhythm: 'r2b', leap: TRIADS, progs: [...P_V, ...P_IV], range: [-3, 8], keys: 3, tempo: 76, bass: true },
  g5b: { meters: M34, dense: 4.5, bars: 8, rhythm: 'r3b', leap: ALL, progs: [...P_DIA, ...P_IV, ...P_V], range: [-3, 9], keys: 4, tempo: 88, plays: 3,
    minor: 0.5, minorLeap: ALL, minorProgs: [...P_MINOR, ['I', 'vi', 'ii', 'V'], ['I', 'IV', 'V7', 'I'], ['I', 'vi', 'V7', 'I']] },
  g4b: { meters: M34, dense: 4, bars: 8, rhythm: 'r2b', leap: TRIADS, progs: [...P_V, ...P_IV], range: [-3, 11], keys: 3, tempo: 76, modulate: true },
  // 못갖춘마디: 한 박 여린박(딸림화음 위 솔·미)에서 으뜸화음 센박으로. 마지막 마디는 한 박 짧다
  g3g: { meters: M34, dense: 5, bars: 4, rhythm: 'r3b', leap: ALL, progs: [...P_DIA, ...P_IV], range: [-3, 9], keys: 4, tempo: 72, pickup: true },
  g3f: { meters: M34, dense: 4.5, bars: 8, rhythm: 'r3b', leap: ALL, progs: [...P_DIA, ...P_IV, ...P_V], range: [-3, 9], keys: 4, tempo: 72, minor: 0.25,
    minorLeap: ALL, minorProgs: [...P_MINOR, ['I', 'vi', 'ii', 'V'], ['I', 'IV', 'V7', 'I'], ['I', 'vi', 'V7', 'I']] },
};

/** 음계 칸 → 으뜸음에서 몇 반음. 단조에서 라로 올라가는 솔은 솔♯, 솔♯ → 라로 올라가는 파는 파♯(가락단음계 상행).
 *  내려가거나 라로 가지 않으면 자연단음계 */
const semis = (s: number, minor: boolean, next?: number, next2?: number) =>
  12 * Math.floor(s / 7) + (minor ? MINOR : MAJOR)[mod(s, 7)]
  + (minor && mod(s, 7) === 6 && next === s + 1 ? 1 : 0)
  + (minor && mod(s, 7) === 5 && next === s + 1 && next2 === s + 2 ? 1 : 0);

interface Slot { dur: number; bar: number; onset: number }

/** 마디마다 리듬 조각을 채운다. 마지막 마디(와 8마디의 4마디째)는 긴 음으로 끝난다.
 *  못갖춘마디면 한 박짜리 여린박 음(bar -1)으로 시작하고 마지막 마디가 한 박 짧다 */
function rhythm(u: Unit, r: () => number, beats: number): Slot[] | undefined {
  const compound = u.rhythm === '6/8';
  const cells = compound ? COMPOUND : SIMPLE.slice(0, SIMPLE.indexOf(u.rhythm) + 1).flatMap((k) => CELLS[k]);
  // 새 리듬은 음표 조각으로만 센다(쉼표만 나와서는 안 된다)
  const fresh = compound || !u.freshRhythm ? [] : CELLS[u.rhythm].filter((c) => c[0] > 0);
  const barLen = compound ? 36 : beats * TPB;
  const pick = <T,>(xs: T[]) => xs[Math.floor(r() * xs.length)];
  const out: Slot[] = u.pickup ? [{ dur: TPB, bar: -1, onset: barLen - TPB }] : [];
  let usedFresh = !fresh.length;
  for (let b = 0; b < u.bars; b++) {
    const cadence = b === u.bars - 1 || (u.bars === 8 && b === 3);
    const thisLen = barLen - (u.pickup && b === u.bars - 1 ? TPB : 0);
    const bar = cadence ? pick(compound ? COMPOUND_END : ENDS[thisLen]) : [];
    let left = thisLen - bar.reduce((a, x) => a + Math.abs(x), 0);
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
function walk(u: Unit, slots: Slot[], chords: string[], leapOk: string[], r: () => number, beats: number): number[] | undefined {
  const notes = slots.filter((s) => s.dur > 0);
  const n = notes.length;
  const [lo, hi] = u.range;
  const beat = u.rhythm === '6/8' ? 18 : beats === 3 ? 36 : TPB * 2; // 센박: 마디 첫 박(4/4는 가운데 박도)
  const chordAt = (bar: number) => (bar < 0 ? 'V' : chords[bar]); // 못갖춘마디는 딸림화음 위
  // 전조 단원의 뒤 악절은 새 조: 화음·종지를 4칸(솔) 위에서 센다
  const off = (bar: number) => (u.modulate && bar >= 4 ? 4 : 0);
  const halfEnd = u.bars === 8 ? notes.filter((s) => s.bar <= 3).length - 1 : -1;
  const steps: number[] = [];
  for (let i = 0; i < n; i++) {
    const chord = CHORDS[chordAt(notes[i].bar)];
    const o = off(notes[i].bar);
    let cand: number[];
    if (i === 0) cand = (u.pickup ? [-3, 4, 2] : [0, 2, 4, 7]).filter((s) => s >= lo && s <= hi);
    else {
      const cur = steps[i - 1];
      const prev = i >= 2 ? cur - steps[i - 2] : 0;
      const prevLeap = Math.abs(prev) >= 2;
      cand = [cur - 1, cur + 1, cur];
      // 4도 넘는 도약 뒤에는 반대 방향 순차진행만
      if (Math.abs(prev) >= 3) cand = [cur - Math.sign(prev)];
      else if (!(prevLeap && i >= 3 && Math.abs(steps[i - 2] - steps[i - 3]) >= 2)) {
        // 도약: 지금 음과 다음 음이 같은 허용 화음(이 마디 또는 앞 마디)에 들어 있을 때만. 7도·증4도는 뺀다
        const here = [chordAt(notes[i].bar), chordAt(notes[i - 1].bar)].filter((c) => leapOk.includes(c));
        for (let t = lo; t <= hi; t++) {
          const d = Math.abs(t - cur);
          if (d < 2 || d === 6 || d > 7 || !here.some((c) => inChord(c, cur - o, t - o))) continue;
          if (Math.abs(semis(t, !!u.minor) - semis(cur, !!u.minor)) === 6) continue;
          cand.push(t);
        }
      }
      cand = cand.filter((t) => t >= lo && t <= hi);
      // 같은 음은 두 번까지
      if (i >= 2 && steps[i - 2] === cur) cand = cand.filter((t) => t !== cur);
      // 단조: 솔을 되풀이하면 솔→솔♯이 생기므로 되풀이하지 않는다. 파→솔→라는 파♯→솔♯→라(가락단음계 상행)가 된다.
      // 딸림화음(V·V7) 마디의 솔은 이끈음이라 라로 올라간다
      if (u.minor && mod(cur, 7) === 6) {
        cand = cand.filter((t) => t !== cur);
        if (['V', 'V7'].includes(chordAt(notes[i - 1].bar))) cand = cand.filter((t) => t === cur + 1);
      }
    }
    // 종지: 마지막은 으뜸음, 그 앞은 레·티(단조는 티·솔♯). 8마디 앞 악절 끝은 딸림화음 음
    if (i === n - 1) cand = cand.filter((t) => mod(t - o, 7) === 0 && Math.abs(t - steps[i - 1]) === 1);
    else if (i === n - 2) cand = cand.filter((t) => [1, 6].includes(mod(t - o, 7)) && (t + 1 <= hi || mod(t - o, 7) === 1));
    else if (i === halfEnd) cand = cand.filter((t) => CHORDS.V.includes(mod(t, 7)));
    if (!cand.length) return undefined;
    const strong = notes[i].onset % beat === 0;
    const w = (t: number) => {
      const prev = i ? steps[i - 1] : t;
      let x = t === prev ? 0.3 : isLeap(prev, t) ? 0.6 : 1;
      if (strong) x *= chord.includes(mod(t - o, 7)) ? 3 : 0.5;
      if (strong && u.bass && notes[i].onset === 0 && mod(t - o, 7) === chord[0]) x *= 2; // 베이스: 마디 첫 박에 근음
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

/** 2성부의 아래 성부(기획 §M7.6): 마디마다 화음 근음(온마디 또는 반반, 둘째 음은 근음이나 5음), 마지막 마디는 으뜸음.
 *  C2~A3에서 앞 음에 가까운 옥타브로 */
function bassVoice(chords: string[], beats: number, tonic: number, r: () => number): Note[] | undefined {
  const barLen = beats * TPB;
  const out: Note[] = [];
  let prev = 48 + mod(tonic - 48, 12);
  const near = (pc: number) => [36, 48].map((o) => o + mod(tonic + pc - o, 12)).flatMap((m) => [m, m + 12]).filter((m) => m >= 36 && m <= 57)
    .reduce((a, m) => (Math.abs(m - prev) < Math.abs(a - prev) ? m : a));
  chords.forEach((c, b) => {
    const [root, , fifth] = CHORDS[c].map((s) => MAJOR[s]);
    const last = b === chords.length - 1;
    const split = !last && r() < 0.5;
    const first = near(root);
    prev = first;
    if (!split) { out.push({ midi: first, dur: barLen }); return; }
    const head = 24;
    out.push({ midi: first, dur: head });
    const second = near(r() < 0.5 ? fifth : root);
    out.push({ midi: second, dur: barLen - head });
    prev = second;
  });
  // 음역 끝에서 옥타브가 막혀 5도 넘게 뛰면 다시 만든다
  return out.every((n, i) => !i || Math.abs(n.midi! - out[i - 1].midi!) <= 7) ? out : undefined;
}

/** 반음계 보조음·경과음(기획 §M7.5): 여린박 음을 다음 음의 반음 아래(올림, 위로 해결)나 반음 위(내림, 아래로 해결)로 바꾼다.
 *  다음 음과 온음 사이일 때만, 마디에 하나까지, 첫 음과 마지막 두 음은 두고, 앞 음에서 증4도·6도 넘게 뛰지 않게. 둘 이상 바꾸면 true */
function chromaticize(notes: Note[], slots: Slot[], tonic: number, beats: number, r: () => number): boolean {
  const idx = notes.map((n, i) => i).filter((i) => notes[i].midi !== null);
  const used = new Set<number>();
  let n = 0;
  for (let k = 1; k < idx.length - 2; k++) {
    const [x, y, z] = [notes[idx[k - 1]], notes[idx[k]], notes[idx[k + 1]]];
    const s = slots[idx[k]];
    if (used.has(s.bar) || s.onset % (beats === 3 ? 36 : TPB) === 0 || r() < 0.4) continue;
    const dir = Math.sign(z.midi! - y.midi!);
    if (Math.abs(z.midi! - y.midi!) !== 2) continue;
    const c = z.midi! - dir; // 다음 음의 반음 아래(위로 갈 때)·위(아래로 갈 때)
    if (MAJOR.includes(mod(c - tonic, 12)) || c === x.midi || Math.abs(c - x.midi!) === 6 || Math.abs(c - x.midi!) > 9) continue;
    Object.assign(y, { midi: c, spell: dir > 0 ? 1 : -1 });
    used.add(s.bar);
    n++;
    k++; // 해결음은 그대로 둔다
  }
  return n >= 2;
}

/** 선율 받아쓰기 한 문제. 같은 시드는 같은 문제(오답 다시 풀기는 id의 시드로 다시 만든다).
 *  드물게(8마디 4/4 약 0.02%) 만들지 못하는 시드는 다음 시드로 넘어가며, id에는 실제로 쓴 시드가 든다 */
export function melodyItem(id: string, seed: number, name = id): Problem {
  for (let k = 0; ; k++) {
    try { return buildMelody(id, seed + k, name); } catch (e) { if (k >= 50) throw e; }
  }
}

function buildMelody(id: string, seed: number, name: string): Problem {
  const u0 = UNITS[id];
  const r = rng(seed);
  const pick = <T,>(xs: T[]) => xs[Math.floor(r() * xs.length)];
  const minor = r() < (u0.minor ?? 0);
  const u: Unit = { ...u0, minor: minor ? 1 : 0 };
  const leapOk = minor ? u.minorLeap! : u.leap;
  // 박자는 따로 뽑는다(같은 시드의 4/4 선율이 예전과 같게, 오답 다시 풀기 id 호환)
  const meterR = rng(seed ^ 0x5bd1e995);
  const beats = u.rhythm === '6/8' ? 2 : (u.meters ?? [4])[Math.floor(meterR() * (u.meters ?? [4]).length)];
  const fifths = Math.floor(r() * (2 * u.keys + 1)) - u.keys;
  const pc = mod(fifths * 7 + (minor ? 9 : 0), 12);

  let best: { notes: Note[]; tonic: number; bass?: Note[] } | undefined;
  for (let tries = 0; tries < 2000 && !best; tries++) {
    const slots = rhythm(u, r, beats);
    if (!slots) continue;
    const progs = minor ? u.minorProgs! : u.progs;
    const chords = u.bars === 8 ? [...pick(minor ? MINOR_HALF : HALF), ...pick(progs)] : pick(progs).slice(-u.bars);
    const steps = walk(u, slots, chords, leapOk, r, beats);
    if (!steps) continue;
    if (u.fresh && !minor && !u.fresh(steps)) continue;
    // 전조: 뒤 악절의 파는 새 조의 티(파♯). 새 조의 티가 한 번은 나와야 한다
    const bars = slots.filter((s) => s.dur > 0).map((s) => s.bar);
    const raised = (i: number) => !!u.modulate && bars[i] >= 4 && mod(steps[i], 7) === 3;
    if (u.modulate && !steps.some((_, i) => raised(i))) continue;
    // 단조의 파♯·솔♯(또는 전조의 파♯)이 생기면서 도약이 증4도가 되면 다시 만든다
    const sem = steps.map((s, i) => semis(s, minor, steps[i + 1], steps[i + 2]) + (raised(i) ? 1 : 0));
    if (steps.some((s, i) => i && Math.abs(s - steps[i - 1]) >= 2 && Math.abs(sem[i] - sem[i - 1]) === 6)) continue;
    // 으뜸음(장조 도, 단조 라)을 조표에 맞추고, 선율이 건반(F3~C6) 안에 들면서 가운데가 G4에 가장 가까운 옥타브. 안 들면 다시 만든다
    const ss = sem;
    const low = Math.min(...ss), high = Math.max(...ss);
    // 높은음자리표는 F3~C6에서 G4 가까이, 낮은음자리표는 C2~E4에서 C3 가까이
    const [kLo, kHi, mid] = u.bass ? [36, 64, 50] : [53, 84, 67];
    const fits = [24, 36, 48, 60, 72].map((o) => o + pc).filter((t) => t + low >= kLo && t + high <= kHi);
    if (!fits.length) continue;
    const dist = (t: number) => Math.abs(t + (low + high) / 2 - mid);
    const tonic = fits.reduce((a, t) => (dist(t) < dist(a) ? t : a));
    let k = 0;
    const notes: Note[] = slots.map((s) => {
      if (s.dur < 0) return { midi: null, dur: -s.dur };
      const i = k++;
      return { midi: tonic + sem[i], dur: s.dur, ...(raised(i) && { spell: 1 as const }) };
    });
    if (u.chromatic && !chromaticize(notes, slots, tonic, beats, r)) continue;
    // 전조 지점(4마디 끝 → 5마디 첫 음)은 4도 안으로
    if (u.modulate) {
      const ps = notes.filter((x) => x.midi !== null), j = bars.findIndex((b) => b >= 4);
      if (Math.abs(ps[j].midi! - ps[j - 1].midi!) > 5) continue;
    }
    const bass = u.bassLine ? bassVoice(chords, beats, tonic, r) : undefined;
    if (u.bassLine && !bass) continue;
    best = { notes, tonic, bass };
  }
  if (!best) throw new Error(`선율 생성 실패: ${id} ${seed}`);

  const { notes, tonic, bass } = best;
  const compound = u.rhythm === '6/8';
  return {
    id: `mel-${id}-${seed}`,
    title: `${name} · ${keyName({ tonic, fifths, minor })}`,
    tonic, ...(minor && { minor: true }), fifths,
    beatsPerBar: beats, ...(compound && { beatTicks: 18 }), ...(u.pickup && { pickup: TPB }),
    ...(u.modulate && { modulation: { at: 4 * beats * TPB, tonic: tonic + 7 } }),
    ...(u.bass && { clef: 'bass' as const }), ...(u.plays && { plays: u.plays }),
    ...(bass && { bass }),
    bars: u.bars, tempo: u.tempo, notes,
  };
}

// ───────── 곡 채보(t5, 기획 §M7.6): 공개 도메인 곡 선율. [도에서 몇 반음, 틱] ─────────

interface Tune { name: string; beats: number; beatTicks?: number; tempo: number; notes: [number, number][] }
const q = 12, hf = 24, w = 48, e = 6;
export const TUNES: Tune[] = [
  { name: '환희의 송가 (베토벤)', beats: 4, tempo: 96, notes: [
    [4, q], [4, q], [5, q], [7, q], [7, q], [5, q], [4, q], [2, q], [0, q], [0, q], [2, q], [4, q], [4, 18], [2, e], [2, hf],
    [4, q], [4, q], [5, q], [7, q], [7, q], [5, q], [4, q], [2, q], [0, q], [0, q], [2, q], [4, q], [2, 18], [0, e], [0, hf]] },
  { name: '반짝반짝 작은 별 (프랑스 민요)', beats: 4, tempo: 92, notes: [
    [0, q], [0, q], [7, q], [7, q], [9, q], [9, q], [7, hf], [5, q], [5, q], [4, q], [4, q], [2, q], [2, q], [0, hf],
    [7, q], [7, q], [5, q], [5, q], [4, q], [4, q], [2, hf], [7, q], [7, q], [5, q], [5, q], [4, q], [4, q], [2, hf],
    [0, q], [0, q], [7, q], [7, q], [9, q], [9, q], [7, hf], [5, q], [5, q], [4, q], [4, q], [2, q], [2, q], [0, hf]] },
  { name: '자크 형제 (프랑스 민요)', beats: 4, tempo: 100, notes: [
    [0, q], [2, q], [4, q], [0, q], [0, q], [2, q], [4, q], [0, q], [4, q], [5, q], [7, hf], [4, q], [5, q], [7, hf],
    [7, e], [9, e], [7, e], [5, e], [4, q], [0, q], [7, e], [9, e], [7, e], [5, e], [4, q], [0, q],
    [0, q], [-5, q], [0, hf], [0, q], [-5, q], [0, hf]] },
  { name: '메리의 어린 양 (미국 동요)', beats: 4, tempo: 100, notes: [
    [4, q], [2, q], [0, q], [2, q], [4, q], [4, q], [4, hf], [2, q], [2, q], [2, hf], [4, q], [7, q], [7, hf],
    [4, q], [2, q], [0, q], [2, q], [4, q], [4, q], [4, q], [4, q], [2, q], [2, q], [4, q], [2, q], [0, w]] },
  { name: '런던 다리 (영국 동요)', beats: 4, tempo: 100, notes: [
    [7, 18], [9, e], [7, q], [5, q], [4, q], [5, q], [7, hf], [2, q], [4, q], [5, hf], [4, q], [5, q], [7, hf],
    [7, 18], [9, e], [7, q], [5, q], [4, q], [5, q], [7, hf], [2, hf], [7, hf], [4, q], [0, 36]] },
  { name: '노를 저어라 (미국 동요)', beats: 2, beatTicks: 18, tempo: 92, notes: [
    [0, 18], [0, 18], [0, 12], [2, e], [4, 18], [4, 12], [2, e], [4, 12], [5, e], [7, 36],
    [12, e], [12, e], [12, e], [7, e], [7, e], [7, e], [4, e], [4, e], [4, e], [0, e], [0, e], [0, e],
    [7, 12], [5, e], [4, 12], [2, e], [0, 36]] },
];

/** 곡 채보 한 문제: 시드로 곡과 조(조표 3개까지)를 고르고, 건반 안에서 G4 가까이 옮긴다 */
export function tuneItem(seed: number): Problem {
  const r = rng(seed);
  const t = TUNES[Math.floor(r() * TUNES.length)];
  const fifths = Math.floor(r() * 7) - 3;
  const pc = mod(fifths * 7, 12);
  const rels = t.notes.map(([x]) => x);
  const low = Math.min(...rels), high = Math.max(...rels);
  const tonic = [48, 60, 72].map((o) => o + pc).filter((x) => x + low >= 53 && x + high <= 84)
    .reduce((a, x) => (Math.abs(x + (low + high) / 2 - 67) < Math.abs(a + (low + high) / 2 - 67) ? x : a));
  const len = t.beats * (t.beatTicks ?? TPB);
  const total = t.notes.reduce((a, [, d]) => a + d, 0);
  return {
    id: `tun-t5-${seed}`, title: `곡 채보 · ${t.name} · ${keyName({ tonic, fifths })}`,
    tonic, fifths, beatsPerBar: t.beats, ...(t.beatTicks && { beatTicks: t.beatTicks }), bars: total / len, tempo: t.tempo,
    notes: t.notes.map(([x, d]) => ({ midi: tonic + x, dur: d })),
  };
}
