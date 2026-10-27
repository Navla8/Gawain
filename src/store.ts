import type { Note } from './engine/types.ts';
import { dayKey } from './engine/habit.ts';

// 연습 기록은 이 기기에만 저장한다 (코딩 지침 §2.5)
const KEY = 'gawain.v1';

export interface Attempt {
  at: string;
  problemId: string;
  answer: Note[];
  pitchScore: number;
  rhythmScore: number;
  plays: number;
  seconds: number;
}

export interface Data {
  attempts: Attempt[];
  /** 날짜별 실제 풀이 시간(초) */
  seconds: Record<string, number>;
}

export function load(): Data {
  try {
    const d = JSON.parse(localStorage.getItem(KEY) ?? '');
    return { attempts: d.attempts ?? [], seconds: d.seconds ?? {} };
  } catch {
    return { attempts: [], seconds: {} };
  }
}

export function save(update: (d: Data) => void) {
  const d = load();
  update(d);
  try {
    localStorage.setItem(KEY, JSON.stringify(d));
  } catch {
    /* 저장소를 못 쓰는 환경(사생활 보호 모드 등)에서는 기록만 건너뛴다 */
  }
}

/** 오늘 풀이 시간을 더하고, 더한 뒤의 오늘 합계를 돌려준다 */
export function addSeconds(n: number): number {
  const key = dayKey(new Date());
  let total = 0;
  save((d) => (total = d.seconds[key] = (d.seconds[key] ?? 0) + n));
  return total;
}

/** 내보낸 기록 파일을 합친다. 같은 시도는 한 번만, 날짜별 시간은 큰 쪽. 새로 들어온 시도 수를 돌려준다 */
export function merge(incoming: Partial<Data>): number {
  let added = 0;
  save((d) => {
    const seen = new Set(d.attempts.map((a) => a.at + a.problemId));
    for (const a of incoming.attempts ?? []) {
      if (typeof a?.at !== 'string' || typeof a.problemId !== 'string' || seen.has(a.at + a.problemId)) continue;
      d.attempts.push(a);
      seen.add(a.at + a.problemId);
      added++;
    }
    for (const [k, v] of Object.entries(incoming.seconds ?? {})) if (typeof v === 'number') d.seconds[k] = Math.max(d.seconds[k] ?? 0, v);
  });
  return added;
}
