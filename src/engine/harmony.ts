import { rng } from './drills.ts';
import { keyName } from './theory.ts';

// 화성 듣기 (기획 §M7.4): 3화음 성질 → 종지 → 주요 3화음 진행 → 자리바꿈·V7 → 부3화음·단조 진행.
// 화음은 베이스 + 위 3성부(4성부)로 소리 내고, 위 성부는 앞 화음에서 가장 적게 움직이는 자리를 고른다.
// 약점 가중치를 넣어 만들므로 같은 문제를 다시 만들 수는 없다(대련 오답 재출제 대상 아님).

const mod = (a: number, n: number) => ((a % n) + n) % n;

interface ChordDef {
  /** 으뜸음에서 몇 반음(화음 구성음) */
  pcs: number[];
  /** 베이스 음(으뜸음에서 몇 반음) */
  bass: number;
}

/** 로마 숫자 → 화음. 단조는 라 으뜸(으뜸음 = 0)에서 센다 */
export const CHORD: Record<string, ChordDef> = {
  I: { pcs: [0, 4, 7], bass: 0 }, I6: { pcs: [0, 4, 7], bass: 4 }, I64: { pcs: [0, 4, 7], bass: 7 },
  ii: { pcs: [2, 5, 9], bass: 2 }, IV: { pcs: [5, 9, 0], bass: 5 },
  V: { pcs: [7, 11, 2], bass: 7 }, V6: { pcs: [7, 11, 2], bass: 11 }, V7: { pcs: [7, 11, 2, 5], bass: 7 },
  vi: { pcs: [9, 0, 4], bass: 9 },
  i: { pcs: [0, 3, 7], bass: 0 }, iv: { pcs: [5, 8, 0], bass: 5 }, VI: { pcs: [8, 0, 3], bass: 8 },
  'ii°6': { pcs: [2, 5, 8], bass: 5 },
};

/** 화면 표기 */
export const pretty = (label: string) => label.replace('64', '⁶₄').replace(/6$/, '⁶').replace('V7', 'V⁷');

export const QUALITIES: Record<string, number[]> = { 장3화음: [0, 4, 7], 단3화음: [0, 3, 7], 감3화음: [0, 3, 6], 증3화음: [0, 4, 8] };
export const CADENCES = ['정격 종지(완전)', '정격 종지(불완전)', '반종지', '변격 종지', '위종지'];

type Weights = Record<string, number>;

/** 진행 문법: 이 화음 다음에 올 수 있는 화음 */
const NEXT: Record<string, Record<string, string[]>> = {
  h2b: { I: ['IV', 'V'], IV: ['I', 'V'], V: ['I'] },
  h3a: { I: ['IV', 'V', 'V6', 'I6', 'V7'], I6: ['IV', 'V', 'V7', 'I'], IV: ['V', 'V7', 'I64', 'I'], I64: ['V', 'V7'], V: ['I', 'I6'], V6: ['I'], V7: ['I'] },
  h3b: { I: ['vi', 'IV', 'ii', 'V'], vi: ['ii', 'IV'], ii: ['V', 'V7'], IV: ['V', 'V7', 'ii', 'I'], V: ['I', 'vi'], V7: ['I', 'vi'] },
  h3bm: { i: ['iv', 'VI', 'ii°6', 'V'], VI: ['iv', 'ii°6'], iv: ['V', 'V7', 'i'], 'ii°6': ['V', 'V7'], V: ['i', 'VI'], V7: ['i', 'VI'] },
};
/** 답 버튼(낮은 음 화음부터) */
const CHOICES: Record<string, string[]> = {
  h2b: ['I', 'IV', 'V'],
  h3a: ['I', 'I6', 'I64', 'IV', 'V', 'V6', 'V7'],
  h3b: ['I', 'ii', 'IV', 'V', 'V7', 'vi'],
  h3bm: ['i', 'ii°6', 'iv', 'V', 'V7', 'VI'],
};
/** 단원의 새 요소: 진행에 하나는 들어 있어야 한다 */
const FRESH: Record<string, string[]> = { h3a: ['I6', 'I64', 'V6', 'V7'], h3b: ['ii', 'vi'], h3bm: ['VI', 'ii°6', 'iv'] };

export interface HarmonyItem {
  id: string;
  skill: string;
  tonic: number;
  fifths: number;
  minor: boolean;
  title: string;
  /** 소리 낼 화음(MIDI, 베이스부터) */
  chords: number[][];
  /** 성질 문제는 화음을 펼쳐(아르페지오) 한 번 친 뒤 함께 친다 */
  arpeggio?: boolean;
  /** 정답(차례대로). 진행 문제의 첫 화음은 주어지므로 넣지 않는다 */
  answers: string[];
  /** 진행 문제에서 주어지는 첫 화음 */
  given?: string;
  choices: string[];
  /** 질문 */
  prompt: string;
}

/** 가중치(약점일수록 큼)에 비례해 하나 고른다 */
function weighted<T>(xs: T[], w: (x: T) => number, r: () => number): T {
  const ws = xs.map(w);
  let t = r() * ws.reduce((a, b) => a + b, 0);
  for (let i = 0; i < xs.length; i++) if ((t -= ws[i]) < 0) return xs[i];
  return xs[xs.length - 1];
}

/** 위 3성부: 화음 구성음(3음은 꼭, 7화음은 5음을 빼도 됨)으로 G3~G5 안에서, 앞 화음에서 가장 적게 움직이는 자리.
 *  soprano를 주면 맨 위 음이 그 음(으뜸음에서 몇 반음)이어야 한다 */
export function voice(tonic: number, c: ChordDef, prev: number[] | undefined, soprano?: number, above = 0): number[] {
  const tones: number[] = [];
  for (let m = Math.max(55, above + 1); m <= 79; m++) if (c.pcs.includes(mod(m - tonic, 12))) tones.push(m);
  const need = c.pcs.length === 4 ? [c.pcs[0], c.pcs[1], c.pcs[3]] : c.pcs.slice(0, 2); // 근음·3음(·7음)
  let best: number[] = [], cost = Infinity;
  for (let a = 0; a < tones.length; a++) for (let b = a + 1; b < tones.length; b++) for (let d = b + 1; d < tones.length; d++) {
    const v = [tones[a], tones[b], tones[d]];
    if (v[2] - v[0] > 12) continue; // 밀집·약간 넓은 자리
    const pcs = v.map((m) => mod(m - tonic, 12));
    if (!need.every((x) => pcs.includes(x))) continue;
    if (soprano !== undefined && pcs[2] !== mod(soprano, 12)) continue;
    const k = prev ? v.reduce((s, m, i) => s + Math.abs(m - prev[i]), 0) : Math.abs(v[1] - (tonic + 12 > 72 ? tonic : tonic + 12));
    if (k < cost) [best, cost] = [v, k];
  }
  return best;
}

/** 베이스: C2~B3 사이, 앞 베이스에서 가까운 옥타브 */
function bassNote(tonic: number, c: ChordDef, prev?: number): number {
  const opts = [36, 48].map((o) => o + mod(tonic + c.bass - o, 12)).flatMap((m) => [m, m + 12]).filter((m) => m >= 38 && m <= 57);
  const ref = prev ?? tonic - 12;
  return opts.reduce((a, m) => (Math.abs(m - ref) < Math.abs(a - ref) ? m : a));
}

/** 진행을 4성부 소리로 */
export function realize(tonic: number, labels: string[], lastSoprano?: number): number[][] {
  const out: number[][] = [];
  let up: number[] | undefined, bass: number | undefined;
  labels.forEach((l, i) => {
    const c = CHORD[l];
    bass = bassNote(tonic, c, bass);
    up = voice(tonic, c, up, i === labels.length - 1 ? lastSoprano : undefined, bass);
    out.push([bass, ...up]);
  });
  return out;
}

/** 조와 으뜸음: 으뜸음을 E♭3~D4에 둔다(위 성부가 G3~G5) */
function pickKey(r: () => number, minor: boolean) {
  const fifths = Math.floor(r() * 7) - 3;
  const pc = mod(fifths * 7 + (minor ? 9 : 0), 12);
  return { fifths, tonic: 51 + mod(pc - 51, 12) };
}

export function harmonyItem(skill: string, seed: number, weak: Weights = {}): HarmonyItem {
  const r = rng(seed);
  const w = (x: string) => 1 + 2 * (weak[x] ?? 0);
  const id = `har-${skill}-${seed}`;

  if (skill === 'h1') {
    const q = weighted(Object.keys(QUALITIES), w, r);
    const root = 55 + Math.floor(r() * 12);
    const chord = QUALITIES[q].map((x) => root + x);
    return { id, skill, tonic: root, fifths: 0, minor: false, title: '화성 듣기 · 3화음 성질', chords: [chord], arpeggio: true, answers: [q], choices: Object.keys(QUALITIES), prompt: '어떤 3화음인가요?' };
  }

  if (skill === 'h2a') {
    const kind = weighted(CADENCES, w, r);
    const { fifths, tonic } = pickKey(r, false);
    const pre = weighted([['I', 'IV'], ['I', 'ii'], ['I', 'vi', 'IV'], ['I', 'vi', 'ii']], () => 1, r);
    const [labels, sop] = kind === '정격 종지(완전)' ? [[...pre, 'V', 'I'], 0]
      : kind === '정격 종지(불완전)' ? [[...pre, 'V', 'I'], weighted([4, 7], () => 1, r)]
      : kind === '반종지' ? [[...pre, 'V'], undefined]
      : kind === '변격 종지' ? [weighted([['I', 'vi', 'IV', 'I'], ['I', 'V', 'I', 'IV', 'I']], () => 1, r), undefined]
      : [[...pre, 'V', 'vi'], undefined];
    return {
      id, skill, tonic, fifths, minor: false, title: `화성 듣기 · 종지 · ${keyName({ tonic, fifths })}`,
      chords: realize(tonic, labels as string[], sop as number | undefined), answers: [kind], choices: CADENCES, prompt: '어떤 종지로 끝나나요?',
    };
  }

  // 진행: 첫 화음(으뜸화음)은 주고, 나머지를 로마 숫자로
  const minor = skill === 'h3b' && r() < 0.5;
  const grammar = minor ? 'h3bm' : skill;
    const tonicChord = minor ? 'i' : 'I';
  const { fifths, tonic } = pickKey(r, minor);
  let labels: string[] = [];
  for (let tries = 0; tries < 500; tries++) {
    labels = [tonicChord];
    while (labels.length < 4) labels.push(weighted(NEXT[grammar][labels.at(-1)!], w, r));
    // 마지막은 딸림화음 → 으뜸화음(정격 종지). h2b는 IV → I(변격)도 허용
    if (!(skill === 'h2b' ? ['V', 'IV'] : ['V', 'V7']).includes(labels.at(-1)!)) continue;
    labels.push(tonicChord);
    if (FRESH[grammar] && !labels.some((l) => FRESH[grammar].includes(l))) continue;
    break;
  }
  return {
    id, skill, tonic, fifths, minor, title: `화성 듣기 · ${keyName({ tonic, fifths, minor })}`,
    chords: realize(tonic, labels), answers: labels.slice(1), given: labels[0], choices: CHOICES[grammar],
    prompt: `첫 화음은 ${pretty(tonicChord)}예요. 이어지는 화음을 차례로 골라요`,
  };
}
