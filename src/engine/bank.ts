import data from '../data/bank.json' with { type: 'json' };
import type { Problem } from './types.ts';

// 기본 문제집: 이졸데의 2도·6도 4마디 선율 데이터 (기획 §7.1)
const TEMPO: Record<string, number> = { '2nd': 80, '6th': 60 };

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
