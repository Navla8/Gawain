import { TPB, type Note, type SoundEvent } from './types.ts';
import { toEvents } from './score.ts';

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
