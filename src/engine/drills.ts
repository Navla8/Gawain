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
  /** 반음계 단원: 버튼 12개, 한 음높이에 이름 하나(CHROMA) */
  chroma?: boolean;
}

/** 반음계 단원의 이름: 흔히 쓰는 표기 하나씩(올림 도♯·파♯·솔♯, 내림 미♭·티♭). 같은 음높이면 같은 답으로 친다(기획 §M7.5) */
const CHROMA = ['도', '도♯', '레', '미♭', '미', '파', '파♯', '솔', '솔♯', '라', '티♭', '티'];
const ALL12 = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const MINOR = [-3, -1, 0, 2, 4, 5, 7];

const DEGREE: Record<string, DegreeCfg> = {
  k0d: { choices: MAJOR, patterns: MAJOR.map((x) => [x]) },
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
  // L4(기획 §M7.5): 반음계 음은 반음으로 해결한다
  d4a: {
    chroma: true, choices: ALL12,
    patterns: [[7, 6, 7], [5, 6, 7], [0, 1, 2], [4, 3, 2], [9, 10, 9], [12, 11, 10, 9], [7, 8, 9], [2, 1, 0], [4, 5, 6, 7], [9, 8, 7], [2, 3, 4]],
  },
  // 부속화음: V/V(레·파♯·라 → 솔), V/vi(미·솔♯·티 → 라), V/ii(라·도♯·미 → 레)
  d4b: {
    chroma: true, choices: ALL12,
    patterns: [[2, 6, 7], [9, 6, 7], [2, 6, 9, 7], [0, 2, 6, 7], [4, 8, 9], [11, 8, 9], [4, 8, 11, 9], [9, 1, 2], [4, 1, 2], [9, 13, 14]],
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
  const nameOf = (rel: number) => (cfg.chroma ? CHROMA[mod(rel, 12)] : degreeName(rel));
  const w = (rel: number) => 1 + 2 * (weak[nameOf(rel)] ?? 0);
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
    names: rels.map(nameOf),
    choices: cfg.choices.map(nameOf),
    choiceMidis: cfg.choices.map((x) => doMidi + x),
    title: `계이름 듣기 · ${keyName({ tonic, fifths, minor })}`,
  };
}

// ───────── 조성 잡기 (기획 §M11) ─────────

const RES_PATH: Record<number, number[]> = {
  0: [0],
  2: [2, 0],
  4: [4, 2, 0],
  5: [5, 4, 2, 0],
  7: [7, 5, 4, 2, 0],
  9: [9, 11, 12],
  11: [11, 12],
};

/** 장음계 한 음(도에서 rel 반음)이 도까지 차례로 풀려 가는 상대 반음 목록. 레·미·파·솔은 내려가며, 라·티는 올라가며 */
export function resolution(rel: number): number[] {
  const r = mod(rel, 12);
  const oct = rel - r;
  return (RES_PATH[r] ?? [r]).map((x) => x + oct);
}

export interface TonicItem {
  id: string;
  skill: string;
  tonic: number;
  fifths: number;
  minor: false;
  lead: number[];
  candidates: number[];
  candNames: string[];
  answer: number;
  title: string;
}

const TONIC_TITLE: Record<string, string> = {
  k0a: '도 찾기 (두 음)',
  k0b: '도 찾기 (네 음)',
  k0c: '도 붙잡기',
};
const K0A_POOL = [7, 5, 2, 9];
const K0B_POOL = [2, 4, 5, 7, 9, 11];
const K0C_EXTRA = [2, 4, 5, 9, 11];
const K0C_WALK = [-5, -3, -1, 0, 2, 4, 5, 7, 9, 11];
const K0C_START = new Set([2, 5, 7, 9, 11]); // 레·파·솔·라·티

export const isTonicSkill = (id: string) => id in TONIC_TITLE;

/** 후보 음을 도(tonic) 근처 옥타브에 놓는다. 도가 늘 최저음이 되지 않게 위·아래로 섞는다 */
function nearTonic(rel: number, r: () => number): number {
  if (rel === 0) return 0;
  if (rel === 11) return -1;
  if (rel === 9) return -3;
  if (rel === 7) return r() < 0.5 ? -5 : 7;
  if (rel === 5) return r() < 0.5 ? -7 : 5;
  return rel;
}

/** 조성 잡기(k0a·k0b·k0c) 한 문항. weak: 도 대신 많이 고른 방해음 계이름별 횟수 */
export function tonicItem(skillId: string, seed: number, weak: Weights = {}): TonicItem {
  const r = rng(seed);
  const { fifths, tonic } = pickKey(r, false);
  const w = (rel: number) => 1 + 2 * (weak[degreeName(rel)] ?? 0);

  const lead: number[] = [];
  if (skillId === 'k0c') {
    const startIdx = K0C_WALK.map((_, k) => k).filter((k) => K0C_START.has(mod(K0C_WALK[k], 12)));
    let i = startIdx[Math.floor(r() * startIdx.length)];
    const idx = [i];
    while (idx.length < 4) {
      const last = idx.length === 3;
      const next = K0C_WALK.map((_, k) => k).filter((k) => k !== i && Math.abs(k - i) <= 2 && (!last || mod(K0C_WALK[k], 12) !== 0));
      i = next[Math.floor(r() * next.length)];
      idx.push(i);
    }
    lead.push(...idx.map((k) => tonic + K0C_WALK[k]));
  }

  let rels: number[];
  if (skillId === 'k0a') {
    rels = [0, weighted(K0A_POOL, w, r)];
  } else if (skillId === 'k0b') {
    const left = [...K0B_POOL];
    const picked: number[] = [];
    for (let n = 0; n < 3; n++) {
      const x = weighted(left, w, r);
      picked.push(x);
      left.splice(left.indexOf(x), 1);
    }
    rels = [0, ...picked];
  } else {
    rels = [0, 7, weighted(K0C_EXTRA, w, r)];
  }

  const placed = rels.map((x) => nearTonic(x, r));
  for (let i = placed.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [placed[i], placed[j]] = [placed[j], placed[i]];
  }

  return {
    id: `ton-${skillId}-${seed}`,
    skill: skillId,
    tonic,
    fifths,
    minor: false,
    lead,
    candidates: placed.map((x) => tonic + x),
    candNames: placed.map(degreeName),
    answer: placed.indexOf(0),
    title: `${TONIC_TITLE[skillId]} · ${keyName({ tonic, fifths, minor: false })}`,
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
const TRIPLETS = [[4, 4, 4], [8, 8, 8]];
const DUPLETS = [[9, 9]];
const RHYTHM_PITCH = 71; // B4: 오선 가운데 줄

/** 리듬 받아쓰기 한 문항: 한 음높이로 친 2마디 */
export function rhythmItem(skillId: string, seed: number): Problem {
  const r = rng(seed);
  const pick = <T,>(xs: T[]) => xs[Math.floor(r() * xs.length)];
  const compound = skillId === 'r3c' || skillId === 'r4b';
  // 붙임줄(r3d): 홑박자 조각을 모두 쓰고, 마디선을 넘는 붙임줄을 하나 단다(새 요소는 조각이 아니라 붙임줄)
  const tie = skillId === 'r3d';
  // L4(기획 §M7.5): r4a 셋잇단은 홑박자 조각 전부 + 셋잇단, r4b 둘잇단은 6/8 조각 + 점8분 둘(9·9, 둘잇단을 점8분으로 적는 표기)
  const unit = tie || skillId === 'r4a' ? 'r3b' : skillId;
  const extra = skillId === 'r4a' ? TRIPLETS : skillId === 'r4b' ? DUPLETS : [];
  const fresh = extra.length ? extra : compound ? COMPOUND : tie ? [] : CELLS[unit];
  const cells = [...(compound ? COMPOUND : SIMPLE.slice(0, SIMPLE.indexOf(unit) + 1).flatMap((k) => CELLS[k])), ...extra];
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
        if (fresh.includes(c) || tie) usedFresh = true;
        out.push(...c);
        left -= c.reduce((a, x) => a + Math.abs(x), 0);
      }
    }
    // 새 조각이 한 번은 나오고, 쉼표로 시작하거나 끝나지 않게
    // 붙임줄: 첫 마디 끝 음과 둘째 마디 첫 음이 모두 음표여야 마디선을 넘어 이을 수 있다
    const cut = out.findIndex((_, i) => out.slice(0, i + 1).reduce((a, x) => a + Math.abs(x), 0) === len);
    const tieOk = !tie || (out[cut] > 0 && out[cut + 1] > 0);
    if ((usedFresh && tieOk && out[0] > 0 && out[out.length - 1] > 0) || tries > 200) {
      const notes: Note[] = out.map((x, i) => ({ midi: x > 0 ? RHYTHM_PITCH : null, dur: Math.abs(x), ...(tie && i === cut && { tie: true }) }));
      return {
        id: `rhy-${skillId}-${seed}`,
        title: `리듬 받아쓰기 · ${compound ? '6/8' : `${beatsPerBar}/4`}`,
        tonic: 60, fifths: 0, beatsPerBar, beatTicks, bars,
        tempo: compound ? 84 : skillId.startsWith('r3') || skillId.startsWith('r4') ? 72 : 80,
        notes,
      };
    }
  }
}
