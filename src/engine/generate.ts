import { KEY_NAMES } from './theory.ts';
import type { Note, Problem } from './types.ts';

// M1 단원: 장조(C·G·F), 도~솔, 순차진행 + 으뜸화음(도·미·솔) 도약, 4/4·3/4, 2분·4분·8분음표
const DEGREES = [0, 2, 4, 5, 7]; // 도 레 미 파 솔
const TRIAD = [0, 2, 4]; // DEGREES 인덱스: 도 미 솔
const TONIC: Record<number, number> = { 0: 60, 1: 67, [-1]: 65 };
const RHYTHM: Record<number, { body: number[][]; end: number[][] }> = {
  4: {
    body: [[12, 12, 12, 12], [24, 12, 12], [12, 12, 24], [24, 24], [12, 6, 6, 12, 12], [6, 6, 12, 12, 12], [12, 12, 6, 6, 12]],
    end: [[12, 12, 24], [24, 24], [48]],
  },
  3: { body: [[12, 12, 12], [24, 12], [12, 24], [12, 6, 6, 12], [6, 6, 12, 12]], end: [[12, 24], [36]] },
};

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 같은 시드는 언제나 같은 문제를 만든다(복습·오답 재출제용) */
export function generate(seed: number): Problem {
  const r = rng(seed);
  const pick = <T,>(xs: T[]) => xs[Math.floor(r() * xs.length)];
  const fifths = pick([0, 1, -1]);
  const beatsPerBar = pick([4, 3]);
  const bars = pick([2, 4]);
  const durs = [...Array.from({ length: bars - 1 }, () => pick(RHYTHM[beatsPerBar].body)), pick(RHYTHM[beatsPerBar].end)].flat();
  const n = durs.length;

  let deg: number[];
  do {
    deg = [pick(TRIAD)];
    let leapDir = 0;
    for (let i = 1; i < n - 2; i++) {
      const cur = deg[i - 1];
      let next: number;
      if (leapDir) next = cur - leapDir; // 도약 뒤엔 반대 방향 순차진행
      else if (TRIAD.includes(cur) && r() < 0.3) next = pick(TRIAD.filter((x) => x !== cur));
      else next = cur + pick([-1, 1, 0, -1, 1]);
      next = Math.max(0, Math.min(4, next));
      leapDir = Math.abs(next - cur) > 1 ? Math.sign(next - cur) : 0;
      deg.push(next);
    }
    deg.push(1, 0);
    deg = deg.slice(-n);
  } while (n >= 3 && deg[n - 3] > 2);

  const tonic = TONIC[fifths];
  const notes: Note[] = durs.map((dur, i) => ({ midi: tonic + DEGREES[deg[i]], dur }));
  return {
    id: `gen-${seed}`,
    title: `자동 생성 · ${KEY_NAMES[fifths]} 장조 ${beatsPerBar}/4`,
    tonic, fifths, beatsPerBar, bars, tempo: 80, notes,
  };
}
