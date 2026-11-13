import { addDays, dayKey } from './habit.ts';
import { MAX_LEVEL, TRACKS, ladder, skill, type Track } from './curriculum.ts';

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
/** 빠른 통과: 이 점수 이상을 연속 FAST_STREAK번 받으면 바로 숙달(기획 M4.2) */
export const FAST_PASS = 0.95;
export const FAST_STREAK = 2;
/** 약함: 숙달 전이면서 점검에서 잊었거나, 최근 WEAK_MIN번 이상 시도의 통과율이 WEAK_RATE 미만(기획 M4.3) */
export const WEAK_MIN = 4;
export const WEAK_RATE = 0.5;

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
  /** 익히는 중 FAST_PASS 이상 연속 수 */
  fast: number;
  /** 처음 두 시도로 빠른 통과 숙달했고 잊은 적 없음 */
  easy: boolean;
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
  /** 전체 레벨(표시용) = 유형 레벨 중 가장 낮은 값. MAX_LEVEL + 1이면 구현된 레벨을 모두 마침 */
  level: number;
  /** 유형 레벨 = 그 유형에서 숙달하지 않은 가장 쉬운 단원의 레벨. 유형마다 따로 오른다(기획 M4.1) */
  trackLevels: Record<Track, number>;
  /** 레벨이 바뀐 시각들 */
  history: { at: string; level: number }[];
  /** 배치고사를 본 적 있음 */
  placed: boolean;
}

export const attemptScore = (a: Pick<SkillAttempt, 'pitchScore' | 'rhythmScore'>) => Math.min(a.pitchScore, a.rhythmScore);
export const passed = (a: Pick<SkillAttempt, 'pitchScore' | 'rhythmScore'>) => attemptScore(a) >= PASS;

const fresh = (): SkillState => ({ mastered: false, streak: 0, fast: 0, easy: false, reviews: 0, lapsed: false, tries: 0, recent: [] });

function master(st: SkillState, day: string) {
  Object.assign(st, { mastered: true, streak: 0, fast: 0, reviews: 0, due: addDays(day, INTERVALS[0]), masteredAt: day });
}

function reviewed(st: SkillState, day: string) {
  st.reviews = Math.min(INTERVALS.length - 1, st.reviews + 1);
  st.due = addDays(day, INTERVALS[st.reviews]);
}

function forgot(st: SkillState) {
  Object.assign(st, { mastered: false, streak: 0, fast: 0, easy: false, reviews: 0, due: undefined, lapsed: true });
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
    else st.streak = st.fast = 0;
    return;
  }
  if (st.mastered) {
    if (st.due && day >= st.due) reviewed(st, day);
  } else {
    st.fast = attemptScore(a) >= FAST_PASS ? st.fast + 1 : 0;
    const quick = st.fast >= FAST_STREAK;
    if (++st.streak >= (st.lapsed ? RELEARN_STREAK : MASTER_STREAK) || quick) {
      const easy = quick && st.tries <= FAST_STREAK && !st.lapsed;
      master(st, day);
      st.easy = easy;
    }
  }
  // 어려운 단원을 맞히면 점검일이 된 아래 단원도 확인된 것으로 본다
  for (const x of lower) {
    const xs = skills[x.id];
    if (xs.mastered && xs.due && day >= xs.due) reviewed(xs, day);
  }
}

/** 이 유형에서 지금 익힐 단원: 숙달하지 않은 가장 쉬운 단원. 다른 유형에 막히지 않는다 */
const firstOpen = (skills: Record<string, SkillState>, track: Track) => ladder(track).find((s) => !skills[s.id].mastered);

function levels(skills: Record<string, SkillState>) {
  const trackLevels = Object.fromEntries(TRACKS.map((t) => [t.id, firstOpen(skills, t.id)?.level ?? MAX_LEVEL + 1])) as Record<Track, number>;
  return { trackLevels, level: Math.min(...Object.values(trackLevels)) };
}

export function computeProgress(attempts: SkillAttempt[]): Progress {
  const skills: Record<string, SkillState> = Object.fromEntries(TRACKS.flatMap((t) => ladder(t.id)).map((s) => [s.id, fresh()]));
  const history: Progress['history'] = [];
  let level = levels(skills).level;
  let placed = false;
  const list = attempts.filter((a) => a.skill && skill(a.skill)).sort((x, y) => x.at.localeCompare(y.at));
  for (const a of list) {
    apply(skills, a);
    placed ||= !!a.placement;
    const l = levels(skills).level;
    if (l !== level) history.push({ at: a.at, level: (level = l) });
  }
  return { skills, ...levels(skills), history, placed };
}

/** 이 유형에서 지금 익힐 단원 id */
export const frontier = (p: Progress, track: Track) => firstOpen(p.skills, track)?.id;

const isWeak = (st: SkillState) => !st.mastered
  && (st.lapsed || (st.recent.length >= WEAK_MIN && st.recent.reduce((a, b) => a + b, 0) / st.recent.length < WEAK_RATE));

export type SkillClass = 'easy' | 'stable' | 'learning' | 'weak' | 'waiting';

/** 단원 분류(기획 M4.3): 쉬움·안정(숙달) / 약함 / 익히는 중(그 유형의 지금 단원) / 차례 전 */
export function classify(p: Progress, id: string): SkillClass {
  const st = p.skills[id];
  if (st.mastered) return st.easy ? 'easy' : 'stable';
  if (isWeak(st)) return 'weak';
  return frontier(p, skill(id)!.track) === id ? 'learning' : 'waiting';
}

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
