import { TPB, type Note, type SoundEvent } from './types.ts';
import { toEvents } from './score.ts';
import { solfa, spell } from './theory.ts';

export type Verdict = 'ok' | 'pitch' | 'rhythm' | 'both' | 'missing' | 'extra';

export interface GradeItem {
  truth?: SoundEvent;
  answer?: SoundEvent;
  verdict: Verdict;
  /** 음높이가 옥타브만 다름 */
  octave?: boolean;
}

export interface GradeResult {
  items: GradeItem[];
  /** 정답 음(쉼표 제외) 중 음높이를 맞힌 비율 */
  pitchScore: number;
  /** 정답 소리 단위(쉼표 포함) 중 길이를 맞힌 비율 */
  rhythmScore: number;
}

const GAP = 1.2;

function judge(t: SoundEvent, a: SoundEvent): GradeItem {
  const p = t.midi !== a.midi, r = t.dur !== a.dur;
  const verdict: Verdict = p && r ? 'both' : p ? 'pitch' : r ? 'rhythm' : 'ok';
  const octave = p && t.midi !== null && a.midi !== null && (t.midi - a.midi) % 12 === 0;
  return { truth: t, answer: a, verdict, ...(octave && { octave }) };
}

// 음높이·길이가 틀리면 1씩, 빠지거나 남으면 GAP. 시간 위치가 가까운 쪽을 아주 조금 선호한다
const cost = (t: SoundEvent, a: SoundEvent) =>
  (t.midi !== a.midi ? 1 : 0) + (t.dur !== a.dur ? 1 : 0) + Math.abs(t.start - a.start) / TPB / 1000;

/** 두 음표열을 편집 거리로 정렬한 뒤 음마다 판정한다. 하나를 빠뜨려도 뒤가 줄줄이 틀리지 않는다 */
export function grade(truthNotes: Note[], answerNotes: Note[]): GradeResult {
  const T = toEvents(truthNotes), A = toEvents(answerNotes);
  const d = Array.from({ length: T.length + 1 }, (_, i) => Array.from({ length: A.length + 1 }, (_, j) => (i + j) * GAP));
  for (let i = 1; i <= T.length; i++)
    for (let j = 1; j <= A.length; j++)
      d[i][j] = Math.min(d[i - 1][j - 1] + cost(T[i - 1], A[j - 1]), d[i - 1][j] + GAP, d[i][j - 1] + GAP);

  const items: GradeItem[] = [];
  let i = T.length, j = A.length;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && Math.abs(d[i][j] - (d[i - 1][j - 1] + cost(T[i - 1], A[j - 1]))) < 1e-9) {
      items.push(judge(T[--i], A[--j]));
    } else if (i > 0 && Math.abs(d[i][j] - (d[i - 1][j] + GAP)) < 1e-9) {
      items.push({ truth: T[--i], verdict: 'missing' });
    } else items.push({ answer: A[--j], verdict: 'extra' });
  }
  items.reverse();

  const notes = items.filter((x) => x.truth && x.truth.midi !== null);
  const pitchOk = notes.filter((x) => x.verdict === 'ok' || x.verdict === 'rhythm').length;
  const rhythmOk = items.filter((x) => x.verdict === 'ok' || x.verdict === 'pitch').length;
  return {
    items,
    pitchScore: notes.length ? pitchOk / notes.length : 1,
    rhythmScore: T.length ? rhythmOk / T.length : 1,
  };
}

// ───────── 약점 표식 (기획 §M6.2) ─────────
// 선율은 '도→라'처럼 그 음으로 가는 계이름 진행과 '↑6도'처럼 음정(악보 글자 자리로 센 도수, 같은 음은 없음),
// 리듬은 '16분'·'4분쉼표'처럼 음 길이로 적는다(기획 §M6.2, §M7.3).
// 문항에 든 표식(contentTags)과 틀린 표식(missTags)이 같은 말이라, 틀린 표식이 든 문항을 골라 더 자주 낼 수 있다.

const DUR_NAMES: Record<number, string> = {
  48: '온음표', 36: '점2분', 24: '2분', 18: '점4분', 12: '4분', 9: '점8분', 6: '8분', 3: '16분', 16: '셋잇단 2분', 8: '셋잇단 4분', 4: '셋잇단 8분', 2: '셋잇단 16분',
};
export const durName = (t: number) => DUR_NAMES[t] ?? `${+(t / TPB).toFixed(2)}박`;
const durTag = (e: SoundEvent) => durName(e.dur) + (e.midi === null ? '쉼표' : '');

/** 음 하나의 표식: 음 길이, 그리고 (리듬만이 아니면) 앞 음에서 이 음으로 가는 계이름 진행 */
function eventTags(e: SoundEvent, prev: SoundEvent | undefined, fifths: number, rhythmOnly: boolean, part: 'pitch' | 'rhythm' | 'both', minor: boolean) {
  const out: string[] = [];
  if (part !== 'pitch') out.push(durTag(e));
  if (part !== 'rhythm' && !rhythmOnly && e.midi !== null && prev?.midi != null) {
    out.push(`${solfa(prev.midi, fifths, { minor })}→${solfa(e.midi, fifths, { minor })}`);
    const d = spell(e.midi, fifths, minor).step - spell(prev.midi, fifths, minor).step;
    if (d) out.push(`${d > 0 ? '↑' : '↓'}${Math.abs(d) + 1}도`);
  }
  return out;
}

/** 문항에 든 표식 */
export function contentTags(notes: Note[], fifths: number, rhythmOnly = false, minor = false): string[] {
  const ev = toEvents(notes);
  let prev: SoundEvent | undefined;
  const out = new Set<string>();
  for (const e of ev) {
    for (const t of eventTags(e, prev, fifths, rhythmOnly, 'both', minor)) out.add(t);
    if (e.midi !== null) prev = e;
  }
  return [...out];
}

/** 채점 결과에서 틀린 표식. 리듬만 받아쓰기는 쉼표 자리에 적은 음표(채점기의 음높이 틀림)도 리듬 틀림 */
export function missTags(r: GradeResult, fifths: number, rhythmOnly = false, minor = false): string[] {
  let prev: SoundEvent | undefined;
  const out = new Set<string>();
  for (const it of r.items) {
    const t = it.truth;
    if (!t) continue;
    const v = rhythmOnly && it.verdict !== 'ok' ? 'rhythm' : it.verdict;
    const part = v === 'missing' || v === 'both' ? 'both' : v === 'pitch' ? 'pitch' : v === 'rhythm' ? 'rhythm' : undefined;
    if (part) for (const x of eventTags(t, prev, fifths, rhythmOnly, part, minor)) out.add(x);
    if (t.midi !== null) prev = t;
  }
  return [...out];
}
