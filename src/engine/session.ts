import { TRACKS, ladder, skill, within, type Track } from './curriculum.ts';
import { MANY_WRONG, RETRY_SHARE, WRONG_DROP, attemptScore, blocker, classify, frontier, isDue, stepWrongCount, type Progress, type SkillAttempt } from './progress.ts';
import { dayKey } from './habit.ts';

export { frontier };

/** 익히기 자리에 낼 단원: 그 유형의 지금 단원. 선수 단원이 남았으면 그 선수 단원 유형의 지금 단원(기획 §M5.5) */
export function learnUnit(p: Progress, track: Track): string | undefined {
  const id = frontier(p, track);
  const b = id && blocker(p, id);
  return b ? frontier(p, skill(b)!.track) : id;
}

// 대련(원터치 통합 테스트)과 배치고사의 문항 구성 (기획 M3)

export type Role = 'learn' | 'review' | 'check' | 'placement' | 'retry';

/** 한 문항 자리. learn은 낼 때 그 유형의 지금 단원으로 정하고, 나머지는 단원이 정해져 있다 */
export interface Slot {
  track: Track;
  role: Role;
  skill?: string;
  /** retry: 다시 낼 지난 오답 문제 id */
  problem?: string;
}

/** 문항 하나에 드는 대략의 시간(초) */
export const EST: Record<Track, number> = { degree: 25, rhythm: 45, dictation: 120, harmony: 30 };
/** 한 판 목표 시간(약 9분)과 문항 수 한도 */
export const BUDGET = 540;
const MAX_ITEMS = 10;
/** 점검에서 틀려 한 단계씩 내려가며 더 붙는 문항까지 합친 한도 */
export const MAX_TOTAL = 13;
/** 한 판에 받아쓰기는 3문제(메인). 받아쓰기 지금 단원이 약함이면 4문제 */
const DICTATION = 3;
/** 한 판에 망각 점검에 쓰는 시간 한도. 넘치는 점검은 다음 판으로 미룬다(기획 §M6.1) */
export const REVIEW_BUDGET = 300;
/** 한 판에 다시 내는 지난 오답 수(기획 §M9.1) */
const RETRY = 2;


/** 최근 통과율(기록 없으면 0.5) */
const passRate = (p: Progress, id: string) => {
  const r = p.skills[id].recent;
  return r.length ? r.reduce((a, b) => a + b, 0) / r.length : 0.5;
};

/** 망각 점검 문항: 점검일이 된 단원을 모두 덮도록, 그 단원을 담은(covers) 숙달 단원 중 가장 어려운 것으로 낸다.
 *  유형을 돌아가며 점검일이 오래된 것부터, REVIEW_BUDGET 안에서 */
function planReviews(p: Progress, today: string): Slot[] {
  const queues = TRACKS.map((t) => {
    const due = ladder(t.id).filter((s) => isDue(p, s.id, today)).map((s) => s.id).reverse();
    const out: { slot: Slot; due: string }[] = [];
    while (due.length) {
      const d = due[0];
      const u = ladder(t.id).filter((s) => p.skills[s.id].mastered && (s.id === d || within(s.id).includes(d))).at(-1)!.id;
      const covered = [u, ...within(u)];
      const oldest = due.filter((x) => covered.includes(x)).map((x) => p.skills[x].due!).sort()[0];
      out.push({ slot: { track: t.id, role: 'review', skill: u }, due: oldest });
      for (const x of covered) if (due.includes(x)) due.splice(due.indexOf(x), 1);
    }
    return out.sort((a, b) => a.due.localeCompare(b.due));
  });
  const picked: Slot[] = [];
  let time = 0;
  for (let round = 0; queues.some((q) => q.length); round++) {
    const heads = queues.filter((q) => q.length).sort((a, b) => a[0].due.localeCompare(b[0].due));
    for (const q of heads) {
      const { slot } = q.shift()!;
      if (time + EST[slot.track] > REVIEW_BUDGET && picked.length) continue;
      picked.push(slot);
      time += EST[slot.track];
    }
  }
  return picked;
}

/** 실전 조건(재생 횟수를 줄임): 한 번 이상 점검을 통과한 단원의 점검·실력 확인(기획 §M6.3) */
export const isExam = (p: Progress, slot: Slot) => (slot.role === 'review' || slot.role === 'check') && p.skills[slot.skill!].reviews >= 1;

export type WrongAttempt = Pick<SkillAttempt, 'at' | 'problemId' | 'skill' | 'placement' | 'fix' | 'pitchScore' | 'rhythmScore'>;

function wrongAttempts(attempts: WrongAttempt[]): WrongAttempt[] {
  const latest = new Map<string, WrongAttempt>();
  const counts = new Map<string, number>();
  for (const a of [...attempts].sort((x, y) => x.at.localeCompare(y.at))) {
    if (!a.problemId || a.placement || a.fix) continue;
    latest.set(a.problemId, a);
    stepWrongCount(counts, a);
  }
  return [...latest.values()]
    .filter((a) => attemptScore(a) < 1 && (counts.get(a.problemId!) ?? 0) < WRONG_DROP)
    .sort((x, y) => x.at.localeCompare(y.at));
}

/** 오답 풀: 문제마다 가장 최근 시도(배치고사·고쳐 보기 제외)가 만점 미만이고 오답 수가 WRONG_DROP 미만인 문제 id, 최근 시도가 오래된 순(기획 §M9.1a) */
export const wrongIds = (attempts: WrongAttempt[]): string[] => wrongAttempts(attempts).map((a) => a.problemId!);

/** 대련에 다시 낼 지난 오답: 오답 풀 중 같은 문제를 다시 만들 수 있는 받아쓰기(mel-)·리듬(rhy-)이고 단원이 존재하며 최근 시도가 오늘 이전인 것 */
export function retryIds(attempts: WrongAttempt[], today: string): string[] {
  return wrongAttempts(attempts)
    .filter((a) => {
      const [kind, unit] = a.problemId!.split('-');
      return (kind === 'mel' || kind === 'rhy') && !!skill(unit) && dayKey(new Date(a.at)) < today;
    })
    .map((a) => a.problemId!);
}

/** 한 판 구성: 망각 점검 → 지난 오답 → 익히는 단원(받아쓰기 3 + 짧은 문항, 약한 유형을 더 많이). 숙달하고 점검일이 안 된 단원은 내지 않는다 */
export function planMatch(p: Progress, today: string, retries: string[] = []): Slot[] {
  const reviews = planReviews(p, today);
  const retryCap = retries.length >= MANY_WRONG ? Math.ceil(MAX_ITEMS * RETRY_SHARE) : RETRY;
  const again: Slot[] = retries.slice(0, retryCap).map((id) => { const s = skill(id.split('-')[1])!; return { track: s.track, role: 'retry', skill: s.id, problem: id }; });
  // 선수 단원이 남은 받아쓰기는 열지 않고, 그 선수 단원 유형에 짧은 문항을 더 준다
  const waitOn = TRACKS.map((t) => frontier(p, t.id)).map((id) => id && blocker(p, id)).filter(Boolean).map((b) => skill(b!)!.track);
  const open = TRACKS.map((t) => t.id).filter((t) => { const id = frontier(p, t); return id && !blocker(p, id); });

  if (!reviews.length && !open.length) {
    // 구현된 단원을 모두 숙달했고 점검할 것도 없다: 유형마다 다음 점검일이 가까운(잊기 쉬운) 단원 둘로 실전 조건 실력 확인
    const near = (t: Track) => ladder(t).map((s) => s.id).reverse().sort((a, b) => p.skills[a].due!.localeCompare(p.skills[b].due!)).slice(0, 2);
    const checks = TRACKS.map((t) => near(t.id).map((id) => ({ track: t.id, role: 'check' as const, skill: id })));
    const out: Slot[] = [...checks.map((c) => c[0]), ...checks.map((c) => c[1]).filter(Boolean)];
    out.splice(Math.ceil(out.length / 2), 0, ...again);
    return out;
  }

  let time = [...reviews, ...again].reduce((a, s) => a + EST[s.track], 0);
  const learn: Track[] = [];
  const add = (t: Track) => { learn.push(t); time += EST[t]; };
  const shorts = open.filter((t) => t !== 'dictation');
  if (open.includes('dictation')) {
    const n = DICTATION + (classify(p, frontier(p, 'dictation')!) === 'weak' ? 1 : 0) - reviews.filter((s) => s.track === 'dictation').length;
    for (let i = 0; i < n; i++) add('dictation');
  }
  // 짧은 문항: 지금 단원의 최근 통과율이 낮은 유형일수록, 약함(기획 M4.3)이면 더 자주
  const weight = (t: Track) => { const id = frontier(p, t)!; return 1.5 - passRate(p, id) + (classify(p, id) === 'weak' ? 0.5 : 0) + (waitOn.includes(t) ? 1 : 0); };
  const minOther = retries.length >= MANY_WRONG ? Math.floor(MAX_ITEMS * (1 - RETRY_SHARE)) : 1;
  while (open.length && reviews.length + again.length + learn.length < MAX_ITEMS && (time < BUDGET || reviews.length + learn.length < minOther)) {
    const pool = shorts.length ? shorts : open;
    // 가중치 대비 지금까지 받은 문항이 가장 적은 유형에 하나씩(약할수록 많이, 그래도 고르게)
    const share = (t: Track) => learn.filter((x) => x === t).length / weight(t);
    add(pool.reduce((a, t) => (share(t) < share(a) ? t : a)));
  }
  if (retries.length >= MANY_WRONG) {
    while (again.length > Math.ceil((reviews.length + learn.length + again.length) * RETRY_SHARE)) again.pop();
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
  // 지난 오답은 한가운데에
  out.splice(Math.ceil(out.length / 2), 0, ...again);
  return out;
}

/** 점검에서 틀렸을 때 바로 이어 낼 한 단계 쉬운 점검: 틀린 단원이 담은 아래 단원 중 숙달한 가장 가까운 것. 없으면 없음 */
export function stepDown(p: Progress, failed: Slot): Slot | undefined {
  const below = within(failed.skill!).find((x) => p.skills[x].mastered);
  return below ? { track: failed.track, role: failed.role, skill: below } : undefined;
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
