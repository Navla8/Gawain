import type { Note } from './engine/types.ts';

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

interface Data {
  attempts: Attempt[];
  /** 문제집별 다음에 풀 문제 번호 */
  next: Record<string, number>;
}

export function load(): Data {
  try {
    const d = JSON.parse(localStorage.getItem(KEY) ?? '');
    return { attempts: d.attempts ?? [], next: d.next ?? {} };
  } catch {
    return { attempts: [], next: {} };
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
