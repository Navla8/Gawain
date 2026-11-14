import { TPB, type Note, type Problem } from './types.ts';
import { keyName, solfa } from './theory.ts';

// 단원별 문제 생성기 (기획 M3). 모든 생성기는 시드가 같으면 같은 문제를 만든다.
// 음높이는 '도'(조표의 으뜸음)에서 몇 반음인지로 적는다. 단조는 라 으뜸이라 라 = -3.

const mod = (a: number, n: number) => ((a % n) + n) % n;

/** 시드 난수(mulberry32). 같은 시드는 같은 문제를 만든다(복습·오답 재출제용) */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 도에서 rel 반음 떨어진 음의 상대 계이름(옥타브 무시) */
export const degreeName = (rel: number) => solfa(60 + rel, 0);

type Weights = Record<string, number>;

// ───────── 계이름 듣기 ─────────

interface DegreeCfg {
  minor?: boolean;
  /** 답 버튼(낮은 음부터) */
  choices: number[];
  /** 무작위 걷기: 음 후보, 한 번에 움직일 수 있는 후보 칸 수, 음 개수 */
  walk?: { pool: number[]; maxMove: number; len: [number, number] };
  /** 정해 둔 패턴 어휘(레퍼런스 §5.1의 4) */
  patterns?: number[][];
}

const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const MINOR = [-3, -1, 0, 2, 4, 5, 7];

const DEGREE: Record<string, DegreeCfg> = {
  d0a: { choices: [0, 2, 4], walk: { pool: [0, 2, 4], maxMove: 2, len: [3, 3] } },
  d0b: { choices: [0, 2, 4, 5, 7], walk: { pool: [0, 2, 4, 5, 7], maxMove: 2, len: [3, 4] } },
  d1a: { choices: MAJOR, walk: { pool: [-5, -3, -1, 0, 2, 4, 5, 7, 9, 11, 12], maxMove: 1, len: [4, 4] } },
  d1b: { choices: MAJOR, walk: { pool: [-5, 0, 4, 7, 12], maxMove: 2, len: [3, 4] } },
  d2a: {
    choices: MAJOR,
    patterns: [[7, 5, 4], [5, 4, 2, 0], [2, -1, 0], [0, -1, 0], [4, 5, 4, 2], [9, 11, 12], [7, 11, 12], [2, 5, 4], [0, 5, 4], [12, 11, 12, 7]],
  },
  d2b: {
    choices: MAJOR,
    patterns: [[-5, -1, 2, 0], [2, -1, 0], [7, 11, 12], [7, 2, -1, 0], [11, 7, 2, 0], [2, 7, 11, 12], [-5, 2, -1, 0], [4, 2, 7, 0]],
  },
  d2c: {
    choices: MAJOR,
    patterns: [[0, 5, 9], [9, 5, 0], [5, 9, 12], [12, 9, 5, 4], [0, 5, 9, 7], [5, 0, 4], [9, 5, 2, 0], [0, 9, 5, 4]],
  },
  d3a: { minor: true, choices: MINOR, walk: { pool: [-3, -1, 0, 2, 4, 5, 7, 9], maxMove: 2, len: [4, 4] } },
  d3b: {
    minor: true,
    choices: [-3, -1, 0, 2, 4, 5, 6, 7, 8],
    // 화성단음계 솔♯(8)과 가락단음계 상행 파♯(6)·솔♯
    patterns: [[-4, -3], [-3, -4, -3], [4, 8, 9], [-1, -4, -3], [2, -1, -4, -3], [4, 6, 8, 9], [9, 7, 5, 4], [0, -1, -4, -3], [5, 4, 8, 9], [-3, 0, 4, 8]],
  },
  // ii(레·파·라)·vi(라·도·미)·V7(솔·티·레·파) 도약. 선율 받아쓰기 g3c의 선수 단원(기획 §M5.3)
  d3c: {
    choices: MAJOR,
    patterns: [[9, 14, 12], [14, 9, 11, 12], [4, 9, 7], [9, 4, 5, 4], [2, 5, 9, 7], [5, 2, -1, 0], [7, 2, 5, 4], [11, 7, 5, 4], [12, 9, 4, 5]],
  },
};

export interface DegreeItem {
  id: string;
  skill: string;
  /** 음계를 칠 으뜸음(단조는 라) */
  tonic: number;
  fifths: number;
  minor: boolean;
  midis: number[];
  names: string[];
  choices: string[];
  /** 버튼 계이름의 MIDI 번호(이 조의 도 부근). 답을 본 뒤 버튼을 누르면 이 소리가 난다 */
  choiceMidis: number[];
  /** 문항 제목 */
  title: string;
}

/** 가중치(약점일수록 큼)에 비례해 하나 고른다 */
function weighted<T>(xs: T[], w: (x: T) => number, r: () => number): T {
  const ws = xs.map(w);
  let t = r() * ws.reduce((a, b) => a + b, 0);
  for (let i = 0; i < xs.length; i++) if ((t -= ws[i]) < 0) return xs[i];
  return xs[xs.length - 1];
}

/** 조와 도의 MIDI 번호. 도(단조는 라)를 G3~F♯4에 둔다 */
function pickKey(r: () => number, minor: boolean) {
  const fifths = Math.floor(r() * 7) - 3; // E♭ ~ A (조표 3개 이하)
  const tonicPc = mod(fifths * 7 + (minor ? 9 : 0), 12);
  const tonic = 55 + mod(tonicPc - 55, 12);
  return { fifths, tonic, doMidi: minor ? tonic + 3 : tonic };
}

/** 계이름 듣기 한 문항. weak: 최근에 틀린 계이름별 횟수(많을수록 더 자주 낸다) */
export function degreeItem(skillId: string, seed: number, weak: Weights = {}): DegreeItem {
  const cfg = DEGREE[skillId];
  const r = rng(seed);
  const w = (rel: number) => 1 + 2 * (weak[degreeName(rel)] ?? 0);
  let rels: number[];
  if (cfg.patterns) {
    rels = weighted(cfg.patterns, (p) => p.reduce((a, x) => a + w(x), 0) / p.length, r);
  } else {
    const { pool, maxMove, len } = cfg.walk!;
    const n = len[0] + Math.floor(r() * (len[1] - len[0] + 1));
    let i = Math.floor(r() * pool.length);
    const idx = [i];
    while (idx.length < n) {
      const next = pool.map((_, k) => k).filter((k) => k !== i && Math.abs(k - i) <= maxMove);
      i = weighted(next, (k) => w(pool[k]), r);
      idx.push(i);
    }
    rels = idx.map((k) => pool[k]);
  }
  const { fifths, tonic, doMidi } = pickKey(r, !!cfg.minor);
  const minor = !!cfg.minor;
  return {
    id: `deg-${skillId}-${seed}`,
    skill: skillId,
    tonic, fifths, minor,
    midis: rels.map((x) => doMidi + x),
    names: rels.map(degreeName),
    choices: cfg.choices.map(degreeName),
    choiceMidis: cfg.choices.map((x) => doMidi + x),
    title: `계이름 듣기 · ${keyName({ tonic, fifths, minor })}`,
  };
}

// ───────── 리듬 받아쓰기 ─────────

/** 리듬 조각(틱, 음수는 쉼표). 위 단원은 아래 단원의 조각을 모두 쓴다(나선형) */
const CELLS: Record<string, number[][]> = {
  r1: [[12], [24], [48]],
  r2a: [[6, 6], [-12]],
  r2b: [[18, 6]],
  r3a: [[3, 3, 3, 3], [6, 3, 3], [3, 3, 6]],
  r3b: [[9, 3], [6, 12, 6], [3, 6, 3]],
};
const SIMPLE = ['r1', 'r2a', 'r2b', 'r3a', 'r3b'];
const COMPOUND = [[18], [12, 6], [6, 6, 6], [6, 12], [36], [6, -6, 6]];
const RHYTHM_PITCH = 71; // B4: 오선 가운데 줄

/** 리듬 받아쓰기 한 문항: 한 음높이로 친 2마디 */
export function rhythmItem(skillId: string, seed: number): Problem {
  const r = rng(seed);
  const pick = <T,>(xs: T[]) => xs[Math.floor(r() * xs.length)];
  const compound = skillId === 'r3c';
  const fresh = compound ? COMPOUND : CELLS[skillId];
  const cells = compound ? COMPOUND : SIMPLE.slice(0, SIMPLE.indexOf(skillId) + 1).flatMap((k) => CELLS[k]);
  const beatsPerBar = compound ? 2 : pick([4, 4, 3]);
  const beatTicks = compound ? 18 : TPB;
  const len = beatsPerBar * beatTicks;
  const bars = 2;

  for (let tries = 0; ; tries++) {
    const out: number[] = [];
    let usedFresh = false;
    for (let b = 0; b < bars; b++) {
      let left = len;
      while (left > 0) {
        // 조각 길이는 모두 박의 배수라 늘 박 머리에 놓인다. 새 조각을 자주 고른다
        const fit = cells.filter((c) => c.reduce((a, x) => a + Math.abs(x), 0) <= left);
        const c = r() < 0.5 && fit.some((x) => fresh.includes(x)) ? pick(fit.filter((x) => fresh.includes(x))) : pick(fit);
        if (fresh.includes(c)) usedFresh = true;
        out.push(...c);
        left -= c.reduce((a, x) => a + Math.abs(x), 0);
      }
    }
    // 새 조각이 한 번은 나오고, 쉼표로 시작하거나 끝나지 않게
    if ((usedFresh && out[0] > 0 && out[out.length - 1] > 0) || tries > 200) {
      const notes: Note[] = out.map((x) => ({ midi: x > 0 ? RHYTHM_PITCH : null, dur: Math.abs(x) }));
      return {
        id: `rhy-${skillId}-${seed}`,
        title: `리듬 받아쓰기 · ${compound ? '6/8' : `${beatsPerBar}/4`}`,
        tonic: 60, fifths: 0, beatsPerBar, beatTicks, bars,
        tempo: compound ? 84 : skillId.startsWith('r3') ? 72 : 80,
        notes,
      };
    }
  }
}
