import data from '../data/bank.json' with { type: 'json' };
import type { Problem } from './types.ts';

// 기본 문제집: 이졸데의 2도~6도 4마디 선율 데이터 (기획 §7.1)
const TEMPO: Record<string, number> = { '2nd': 80, '3rd': 76, '4th': 76, '5th': 76, '6th': 60 };

export interface ProblemSet {
  id: string;
  name: string;
  problems: Problem[];
}

export const SETS: ProblemSet[] = data.map((s) => ({
  id: s.id,
  name: s.name,
  problems: s.problems.map((p) => ({
    ...p,
    tempo: TEMPO[s.id],
    notes: p.notes.map(([midi, dur]) => ({ midi, dur })),
  })),
}));

/** 0..count-1 중 하나를 고르되, 직전 문제(last)는 피한다 */
export function pickRandom(count: number, last: number | undefined, rand: () => number): number {
  if (count <= 1) return 0;
  const i = Math.floor(rand() * (count - 1));
  return last !== undefined && i >= last ? i + 1 : i;
}
