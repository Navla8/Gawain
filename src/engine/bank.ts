import data from '../data/bank.json' with { type: 'json' };
import type { Problem } from './types.ts';
import { generate } from './generate.ts';
import { minorMelody } from './drills.ts';

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

/** 문제 id로 문제를 찾는다. 자동 생성 문제(gen-시드)는 시드로 다시 만든다 */
export function findProblem(id: string): Problem | undefined {
  if (id.startsWith('gen-')) return generate(Number(id.slice(4)));
  if (id.startsWith('minor-')) return minorMelody(Number(id.slice(6)));
  for (const s of SETS) {
    const p = s.problems.find((x) => x.id === id);
    if (p) return p;
  }
}

/** 단원 문항으로 낼 문제: 안 풀어 본 문제 → 최근에 틀린 문제 → 오래전에 푼 문제 순. 최근 3번 안에 낸 문제는 피한다 */
export function pickForSkill(setId: string, attempts: { at: string; problemId: string; pitchScore: number; rhythmScore: number }[], rand: () => number): Problem {
  const set = SETS.find((s) => s.id === setId)!;
  const last = new Map<string, { at: string; score: number }>();
  for (const a of [...attempts].sort((x, y) => x.at.localeCompare(y.at)))
    last.set(a.problemId, { at: a.at, score: Math.min(a.pitchScore, a.rhythmScore) });
  const recent = new Set([...last.entries()].sort((x, y) => y[1].at.localeCompare(x[1].at)).slice(0, 3).map(([id]) => id));
  const rank = (p: Problem) => { const l = last.get(p.id); return !l ? 0 : l.score < 0.8 ? 1 : 2; };
  const pool = set.problems.filter((p) => !recent.has(p.id));
  const best = Math.min(...pool.map(rank));
  const top = pool.filter((p) => rank(p) === best);
  // 오래전에 푼 문제일수록 앞에 둔 뒤, 앞쪽 절반에서 무작위
  if (best === 2) top.sort((a, b) => last.get(a.id)!.at.localeCompare(last.get(b.id)!.at));
  return top[Math.floor(rand() * (best === 2 ? Math.ceil(top.length / 2) : top.length))];
}
