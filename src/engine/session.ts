import { TRACKS, ladder, skill, type Track } from './curriculum.ts';
import { blocker, classify, frontier, isDue, type Progress } from './progress.ts';

export { frontier };

/** 익히기 자리에 낼 단원: 그 유형의 지금 단원. 선수 단원이 남았으면 그 선수 단원 유형의 지금 단원(기획 §M5.5) */
export function learnUnit(p: Progress, track: Track): string | undefined {
  const id = frontier(p, track);
  const b = id && blocker(p, id);
  return b ? frontier(p, skill(b)!.track) : id;
}

// 대련(원터치 통합 테스트)과 배치고사의 문항 구성 (기획 M3)

export type Role = 'learn' | 'review' | 'check' | 'placement';

/** 한 문항 자리. learn은 낼 때 그 유형의 지금 단원으로 정하고, 나머지는 단원이 정해져 있다 */
export interface Slot {
  track: Track;
  role: Role;
  skill?: string;
}

/** 문항 하나에 드는 대략의 시간(초) */
export const EST: Record<Track, number> = { degree: 25, rhythm: 45, dictation: 120 };
/** 한 판 목표 시간(약 9분)과 문항 수 한도 */
export const BUDGET = 540;
const MAX_ITEMS = 10;
/** 점검에서 틀려 한 단계씩 내려가며 더 붙는 문항까지 합친 한도 */
export const MAX_TOTAL = 13;
/** 한 판에 받아쓰기는 3문제(메인) */
const DICTATION = 3;

/** 이 유형에서 숙달한 가장 어려운 단원 */
const topMastered = (p: Progress, track: Track) => ladder(track).filter((s) => p.skills[s.id].mastered).at(-1)?.id;

/** 최근 통과율(기록 없으면 0.5) */
const passRate = (p: Progress, id: string) => {
  const r = p.skills[id].recent;
  return r.length ? r.reduce((a, b) => a + b, 0) / r.length : 0.5;
};

/** 한 판 구성: 망각 점검 → 익히는 단원(받아쓰기 3 + 짧은 문항, 약한 유형을 더 많이). 숙달하고 점검일이 안 된 단원은 내지 않는다 */
export function planMatch(p: Progress, today: string): Slot[] {
  // 망각 점검: 점검일이 된 단원이 있는 유형마다, 그 유형에서 숙달한 가장 어려운 단원으로 한 문항
  const reviews: Slot[] = TRACKS.filter((t) => ladder(t.id).some((s) => isDue(p, s.id, today)))
    .map((t) => ({ track: t.id, role: 'review' as const, skill: topMastered(p, t.id)! }));
  // 선수 단원이 남은 받아쓰기는 열지 않고, 그 선수 단원 유형에 짧은 문항을 더 준다
  const waitOn = TRACKS.map((t) => frontier(p, t.id)).map((id) => id && blocker(p, id)).filter(Boolean).map((b) => skill(b!)!.track);
  const open = TRACKS.map((t) => t.id).filter((t) => { const id = frontier(p, t); return id && !blocker(p, id); });

  if (!reviews.length && !open.length) {
    // 구현된 단원을 모두 숙달했고 점검할 것도 없다: 각 유형의 가장 어려운 단원으로 실력 확인
    const checks = TRACKS.map((t) => ({ track: t.id, role: 'check' as const, skill: topMastered(p, t.id)! }));
    return [...checks, ...checks.map((c) => ({ ...c }))];
  }

  let time = reviews.reduce((a, s) => a + EST[s.track], 0);
  const learn: Track[] = [];
  const add = (t: Track) => { learn.push(t); time += EST[t]; };
  const shorts = open.filter((t) => t !== 'dictation');
  if (open.includes('dictation')) {
    const n = DICTATION - reviews.filter((s) => s.track === 'dictation').length;
    for (let i = 0; i < n; i++) add('dictation');
  }
  // 짧은 문항: 지금 단원의 최근 통과율이 낮은 유형일수록, 약함(기획 M4.3)이면 더 자주
  const weight = (t: Track) => { const id = frontier(p, t)!; return 1.5 - passRate(p, id) + (classify(p, id) === 'weak' ? 0.5 : 0) + (waitOn.includes(t) ? 1 : 0); };
  while (open.length && reviews.length + learn.length < MAX_ITEMS && time < BUDGET) {
    const pool = shorts.length ? shorts : open;
    // 가중치 대비 지금까지 받은 문항이 가장 적은 유형에 하나씩(약할수록 많이, 그래도 고르게)
    const share = (t: Track) => learn.filter((x) => x === t).length / weight(t);
    add(pool.reduce((a, t) => (share(t) < share(a) ? t : a)));
  }

  // 순서: 짧은 문항 하나로 몸을 풀고, 점검을 슬쩍 넣고, 받아쓰기는 고르게 흩는다
  const d = learn.filter((t) => t === 'dictation').map((track) => ({ track, role: 'learn' as const }));
  const s = learn.filter((t) => t !== 'dictation').map((track) => ({ track, role: 'learn' as const }));
  const out: Slot[] = [];
  if (s.length) out.push(s.shift()!);
  out.push(...reviews);
  const gap = Math.max(1, Math.round(s.length / (d.length + 1)));
  while (s.length || d.length) {
    out.push(...s.splice(0, gap));
    if (d.length) out.push(d.shift()!);
  }
  return out;
}

/** 점검에서 틀렸을 때 바로 이어 낼 한 단계 쉬운 점검. 숙달한 아래 단원이 없으면 없음 */
export function stepDown(p: Progress, failed: Slot): Slot | undefined {
  const steps = ladder(failed.track);
  const below = steps.slice(0, steps.findIndex((s) => s.id === failed.skill)).filter((s) => p.skills[s.id].mastered).at(-1);
  return below && { track: failed.track, role: failed.role, skill: below.id };
}

/** 배치고사: 유형마다 단원 사다리를 이분 탐색한다. 지금까지의 결과로 다음 문항을 정하고, 끝나면 undefined */
export function nextPlacement(results: { skill: string; ok: boolean }[]): Slot | undefined {
  const state = TRACKS.map((t) => {
    const steps = ladder(t.id);
    let lo = -1, hi = steps.length, asked = 0;
    for (const r of results) {
      const i = steps.findIndex((s) => s.id === r.skill);
      if (i < 0) continue;
      asked++;
      if (r.ok) lo = Math.max(lo, i);
      else hi = Math.min(hi, i);
    }
    return { track: t.id, steps, lo, hi, asked };
  }).filter((s) => s.hi - s.lo > 1);
  if (!state.length) return undefined;
  // 문항을 가장 적게 낸 유형부터 돌아가며
  const t = state.reduce((a, b) => (b.asked < a.asked ? b : a));
  return { track: t.track, role: 'placement', skill: t.steps[Math.floor((t.lo + t.hi) / 2)].id };
}

/** 배치고사에 남은 문항 수(최대치): 모두 맞히거나 모두 틀린다고 치고 끝날 때까지 세어 큰 쪽 */
export function placementLeft(results: { skill: string; ok: boolean }[]): number {
  const count = (ok: boolean) => {
    const sim = [...results];
    for (let s = nextPlacement(sim); s; s = nextPlacement(sim)) sim.push({ skill: s.skill!, ok });
    return sim.length - results.length;
  };
  return Math.max(count(true), count(false));
}
