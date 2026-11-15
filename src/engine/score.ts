import type { Note, SoundEvent } from './types.ts';

/** 붙임줄로 이어진 같은 음과 연속된 쉼표를 하나의 소리 단위로 합친다 */
export function toEvents(notes: Note[]): SoundEvent[] {
  const out: SoundEvent[] = [];
  let t = 0;
  notes.forEach((n, i) => {
    const prev = out.at(-1);
    const joined = prev && prev.midi === n.midi && (n.midi === null || notes[i - 1].tie);
    if (joined) {
      prev.dur += n.dur;
      prev.src.push(i);
    } else out.push({ midi: n.midi, start: t, dur: n.dur, src: [i] });
    t += n.dur;
  });
  return out;
}

/** 박 수가 맞지 않는 마디 번호(1부터, 못갖춘마디가 있으면 그 마디가 0): 모자라는 마디들, 또는 넘치면 마지막 마디.
 *  마디선을 넘는 음표는 악보에서 붙임줄로 나눠 그리므로 허용한다. offset: 못갖춘마디만큼 앞에 비는 틱(마디 길이 − 못갖춘마디) */
export function barProblems(notes: Note[], len: number, bars: number, offset = 0): number[] {
  const total = notes.reduce((t, n) => t + n.dur, 0);
  if (total > bars * len) return [bars];
  const bad: number[] = [];
  for (let k = 0; k < bars + (offset ? 1 : 0); k++) if (total < Math.min((k + 1) * len - offset, bars * len)) bad.push(offset ? k : k + 1);
  return bad;
}

export interface Glyph {
  midi: number | null;
  ticks: number;
  /** 음표 모양의 기본 길이: 48 온, 24 2분, 12 4분, 6 8분, 3 16분 */
  value: number;
  dotted: boolean;
  triplet: boolean;
  /** 다음 글리프와 붙임줄 */
  tie: boolean;
  bar: number;
  start: number;
  /** 원래 Note 인덱스 */
  src: number;
}

// [틱, 모양, 점, 셋잇단]
const PIECES: [number, number, boolean, boolean][] = [
  [48, 48, false, false], [36, 24, true, false], [24, 24, false, false], [18, 12, true, false],
  [16, 24, false, true], [12, 12, false, false], [9, 6, true, false], [8, 12, false, true],
  [6, 6, false, false], [4, 6, false, true], [3, 3, false, false], [2, 3, false, true],
];

/** 길이를 적을 수 있는 음표 조각으로 나눈다. 조각 수가 적고 셋잇단이 적은 쪽을 고른다 */
function split(ticks: number): (typeof PIECES)[number][] {
  const best: { cost: number; parts: (typeof PIECES)[number][] }[] = [{ cost: 0, parts: [] }];
  for (let t = 1; t <= ticks; t++) {
    let pick: (typeof best)[number] | undefined;
    for (const p of PIECES) {
      const rest = best[t - p[0]];
      if (!rest) continue;
      const cost = rest.cost + (p[3] ? 1.5 : 1);
      if (!pick || cost < pick.cost) pick = { cost, parts: [p, ...rest.parts] };
    }
    best[t] = pick!;
  }
  return best[ticks]?.parts.sort((a, b) => b[0] - a[0]) ?? [[ticks, 12, false, false]];
}

/** 악보에 그릴 글리프 목록. 마디선(len틱마다)에서 음표를 나누고 붙임줄로 잇는다.
 *  offset: 못갖춘마디만큼 첫 음을 뒤로 민다(start는 민 위치) */
export function toGlyphs(notes: Note[], len: number, offset = 0): Glyph[] {
  const out: Glyph[] = [];
  let t = offset;
  notes.forEach((n, src) => {
    const end = t + n.dur;
    let s = t;
    while (s < end) {
      const segEnd = Math.min(end, (Math.floor(s / len) + 1) * len);
      for (const [ticks, value, dotted, triplet] of split(segEnd - s)) {
        out.push({ midi: n.midi, ticks, value, dotted, triplet, tie: n.midi !== null, bar: Math.floor(s / len), start: s, src });
        s += ticks;
      }
    }
    out[out.length - 1].tie = !!n.tie && n.midi !== null;
    t = end;
  });
  return out;
}

// 타카디미 리듬 음절(기획 §M7.1): 박 안의 위치로 정한다. 홑박자는 ta ka di mi(셋잇단 ta ki da, 여섯잇단 ta va ki di da ma), 겹박자는 ta va ki di da ma
const TAKADIMI: Record<number, Record<number, string>> = {
  12: { 0: 'ta', 3: 'ka', 6: 'di', 9: 'mi', 4: 'ki', 8: 'da', 2: 'va', 10: 'ma' },
  18: { 0: 'ta', 3: 'va', 6: 'ki', 9: 'di', 12: 'da', 15: 'ma' },
};

/** onset(틱) 자리의 타카디미 음절. 박 안 어디에도 맞지 않으면 '·' */
export function takadimi(onset: number, beatTicks: number): string {
  return TAKADIMI[beatTicks]?.[onset % beatTicks] ?? '·';
}

/** 이어진 셋잇단 글리프 묶음(시작, 끝 다음) 목록. 한 묶음은 같은 모양 셋이라 틱 합이 모양(value)의 2배다(8분 12·4분 24·2분 48) */
export function tripletGroups(glyphs: Glyph[]): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < glyphs.length; i++) {
    if (!glyphs[i].triplet) continue;
    let j = i, ticks = 0;
    while (j < glyphs.length && glyphs[j].triplet && ticks < 2 * glyphs[i].value) ticks += glyphs[j++].ticks;
    out.push([i, j]);
    i = j - 1;
  }
  return out;
}
