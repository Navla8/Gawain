import { addDays, dayKey } from './habit.ts';
import { MAX_LEVEL, SKILLS, ladder, skill } from './curriculum.ts';

// 숙달·망각 점검(간격 반복)·레벨 (기획 M3). 저장하는 것은 시도 기록뿐이고, 단원 상태는 기록을 처음부터 다시 돌려 계산한다.
// 그래서 기록 파일을 합쳐도 상태가 어긋나지 않는다.

/** 이 점수 이상이면 통과. 받아쓰기는 음높이·리듬 중 낮은 쪽으로 본다 */
export const PASS = 0.8;
/** 연속 통과 몇 번이면 숙달. 잊었다가 다시 익힐 때는 더 빨리 돌아온다 */
export const MASTER_STREAK = 3;
export const RELEARN_STREAK = 2;
/** 숙달 직후·1차 점검 통과 뒤·2차 점검 통과 뒤의 다음 점검 간격(일).
 *  간격은 점검 2번까지만 늘고 그 뒤로는 14일마다 계속 점검한다(프롬프트 2026-11-09 19:13) */
export const INTERVALS = [3, 7, 14];

export interface SkillAttempt {
  at: string;
  skill?: string;
  placement?: boolean;
  pitchScore: number;
  rhythmScore: number;
  /** 틀린 요소(계이름 듣기는 틀린 계이름) */
  miss?: string[];
}

export interface SkillState {
  mastered: boolean;
  /** 익히는 중 연속 통과 수 */
  streak: number;
  /** 숙달 뒤 통과한 점검 수(최대 2) */
  reviews: number;
  /** 다음 점검일 'YYYY-MM-DD' (숙달한 단원만) */
  due?: string;
  /** 숙달했다가 점검에서 틀린 적이 있음 */
  lapsed: boolean;
  tries: number;
  /** 최근 6번의 통과(1)·실패(0) */
  recent: number[];
  masteredAt?: string;
}

export interface Progress {
  skills: Record<string, SkillState>;
  /** 지금 익히는 레벨 = 다 숙달한 레벨 + 1. MAX_LEVEL + 1이면 구현된 레벨을 모두 마침 */
  level: number;
  /** 레벨이 바뀐 시각들 */
  history: { at: string; level: number }[];
  /** 배치고사를 본 적 있음 */
  placed: boolean;
}

export const attemptScore = (a: Pick<SkillAttempt, 'pitchScore' | 'rhythmScore'>) => Math.min(a.pitchScore, a.rhythmScore);
export const passed = (a: Pick<SkillAttempt, 'pitchScore' | 'rhythmScore'>) => attemptScore(a) >= PASS;

const fresh = (): SkillState => ({ mastered: false, streak: 0, reviews: 0, lapsed: false, tries: 0, recent: [] });

function master(st: SkillState, day: string) {
  Object.assign(st, { mastered: true, streak: 0, reviews: 0, due: addDays(day, INTERVALS[0]), masteredAt: day });
}

function reviewed(st: SkillState, day: string) {
  st.reviews = Math.min(INTERVALS.length - 1, st.reviews + 1);
  st.due = addDays(day, INTERVALS[st.reviews]);
}

function forgot(st: SkillState) {
  Object.assign(st, { mastered: false, streak: 0, reviews: 0, due: undefined, lapsed: true });
}

function apply(skills: Record<string, SkillState>, a: SkillAttempt) {
  const s = skill(a.skill!)!;
  const st = skills[s.id];
  const day = dayKey(new Date(a.at));
  const ok = passed(a);
  st.tries++;
  st.recent = [...st.recent, ok ? 1 : 0].slice(-6);
  const lower = ladder(s.track).slice(0, ladder(s.track).indexOf(s));

  if (a.placement) {
    // 배치고사 통과는 그 단원과 아래 단원을 모두 숙달로 본다. 3일 뒤 첫 점검이 진짜 확인이다
    if (ok) for (const x of [...lower, s]) { if (!skills[x.id].mastered) master(skills[x.id], day); }
    else if (st.mastered) forgot(st);
    return;
  }
  if (!ok) {
    if (st.mastered) forgot(st);
    else st.streak = 0;
    return;
  }
  if (st.mastered) {
    if (st.due && day >= st.due) reviewed(st, day);
  } else if (++st.streak >= (st.lapsed ? RELEARN_STREAK : MASTER_STREAK)) master(st, day);
  // 어려운 단원을 맞히면 점검일이 된 아래 단원도 확인된 것으로 본다
  for (const x of lower) {
    const xs = skills[x.id];
    if (xs.mastered && xs.due && day >= xs.due) reviewed(xs, day);
  }
}

function workingLevel(skills: Record<string, SkillState>): number {
  for (let l = 0; l <= MAX_LEVEL; l++) if (SKILLS.some((s) => s.level === l && !skills[s.id].mastered)) return l;
  return MAX_LEVEL + 1;
}

export function computeProgress(attempts: SkillAttempt[]): Progress {
  const skills: Record<string, SkillState> = Object.fromEntries(SKILLS.map((s) => [s.id, fresh()]));
  const history: Progress['history'] = [];
  let level = workingLevel(skills);
  let placed = false;
  const list = attempts.filter((a) => a.skill && skill(a.skill)).sort((x, y) => x.at.localeCompare(y.at));
  for (const a of list) {
    apply(skills, a);
    placed ||= !!a.placement;
    const l = workingLevel(skills);
    if (l !== level) history.push({ at: a.at, level: (level = l) });
  }
  return { skills, level, history, placed };
}

/** 지금 레벨에서 풀 수 있는 단원인가: 다 숙달한 레벨의 바로 다음 레벨까지 열린다 */
export const unlocked = (p: Progress, id: string) => skill(id)!.level <= Math.min(p.level, MAX_LEVEL);

/** 점검일이 된 단원 */
export const isDue = (p: Progress, id: string, today: string) => {
  const st = p.skills[id];
  return st.mastered && !!st.due && st.due <= today;
};

/** 이 단원에서 최근에 틀린 요소별 횟수(최근 20번). 생성기가 약점을 더 자주 내는 데 쓴다 */
export function weakness(attempts: SkillAttempt[], id: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const a of attempts.filter((x) => x.skill === id).slice(-20)) for (const m of a.miss ?? []) out[m] = (out[m] ?? 0) + 1;
  return out;
}
