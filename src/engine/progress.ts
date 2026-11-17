import { addDays, dayKey } from './habit.ts';
import { MAX_LEVEL, TRACKS, ladder, skill, within, type Track } from './curriculum.ts';

// 숙달·망각 점검(간격 반복)·레벨 (기획 M3). 저장하는 것은 시도 기록뿐이고, 단원 상태는 기록을 처음부터 다시 돌려 계산한다.
// 그래서 기록 파일을 합쳐도 상태가 어긋나지 않는다.
//
// 익히는 단원은 맞혔는지만이 아니라 얼마나 능숙하게 맞혔는지(재생 횟수·풀이 시간)로 본다(프롬프트 2026-11-17 14:58, 15:05).
// 빠르고 적게 들어 정확히 맞힌 '능숙'만 숙달로 쌓이고, 간신히 맞힌 것은 더 자주 나오며, 자주 틀리거나 포기하면 한 단계 내려간다.

/** 이 점수 이상이면 통과. 받아쓰기는 음높이·리듬 중 낮은 쪽으로 본다 */
export const PASS = 0.8;
/** 능숙: 이 점수 이상이면서 재생 FLUENT_PLAYS번 이하, 시간 fluentTime() 안 */
export const FAST_PASS = 0.95;
/** 포기급: 이 점수 미만은 연속 실패를 두 번으로 센다 */
export const GIVE_UP = 0.4;
/** 능숙으로 볼 재생 횟수 한도(첫 재생 포함). 실전 조건 점검 한도보다 같거나 적게 */
export const FLUENT_PLAYS: Record<Track, number> = { degree: 1, rhythm: 2, dictation: 3, harmony: 1 };
/** 능숙으로 볼 풀이 시간 = 기본 초 + 답 하나(음·화음)당 초. 재생 시간이 들어 있다. 실기기 기록으로 고친다 */
export const FLUENT_TIME: Record<Track, [number, number]> = { degree: [10, 2.5], rhythm: [20, 3], dictation: [40, 6], harmony: [12, 3] };
/** 능숙 몇 번이면 숙달. 처음 익힐 때는 그중 하나가 다른 날이어야 한다. 잊었거나 되돌아와 다시 익힐 때는 더 빨리 돌아온다 */
export const MASTER_STREAK = 3;
export const RELEARN_STREAK = 2;
/** 숙달 직후·1차 점검 통과 뒤·2차 점검 통과 뒤의 다음 점검 간격(일).
 *  간격은 점검 2번까지만 늘고 그 뒤로는 14일마다 계속 점검한다(프롬프트 2026-11-09 19:13) */
export const INTERVALS = [3, 7, 14];
/** 점검을 이 점수 이상으로 넘겨야 다음 간격으로 늘어난다. 아래면 같은 간격으로 다시 점검(기획 §M6.3) */
export const FIRM = 0.9;
/** 약함: 숙달 전이면서 점검에서 잊었거나, 최근 WEAK_MIN번 이상 시도의 점수(능숙 1·통과 0.5·실패 0) 평균이 WEAK_RATE 미만(기획 M4.3) */
export const WEAK_MIN = 4;
export const WEAK_RATE = 0.5;
/** 익히는 단원을 이 횟수만큼 연속으로 못 넘기면(포기급은 2번) 같은 유형의 바로 아래 단원을 숙달 전으로 되돌려 쉬운 것부터 다시 다진다.
 *  아래 단원은 능숙 RELEARN_STREAK번이면 다시 숙달된다(프롬프트 2026-11-17 14:53, 14:57) */
export const STEP_DOWN_FAILS = 4;
/** 능숙도 규칙으로 바꾸며 실력을 0부터 다시 쌓는다. 이 시각 전 시도는 실력 계산에 넣지 않는다(기록·연속 일수는 그대로, 프롬프트 2026-11-17 15:05) */
export const PROGRESS_FROM = '2026-11-17T06:00:00.000Z';

export interface SkillAttempt {
  at: string;
  skill?: string;
  placement?: boolean;
  /** 배치고사 마지막 문항: 배치고사를 끝까지 봤다는 표시 */
  placementEnd?: boolean;
  pitchScore: number;
  rhythmScore: number;
  /** 들은 횟수·풀이 시간(초)·답(길이로 문항 크기를 잰다). 없으면 능숙 판정에서 걸리지 않는 것으로 본다 */
  plays?: number;
  seconds?: number;
  answer?: unknown[];
  answerBass?: unknown[];
  /** 틀린 요소: 계이름 듣기는 틀린 계이름, 받아쓰기는 grade.ts missTags()의 표식 */
  miss?: string[];
  /** 대련에 다시 나온 지난 오답. 숙달 판정에 넣지 않고 약점 집계에만 쓴다(기획 §M6.4) */
  retry?: boolean;
}

export interface SkillState {
  mastered: boolean;
  /** 익히는 중 쌓은 능숙 수(실패하면 하나 깎임) */
  streak: number;
  /** 쌓인 능숙 각각의 날짜 */
  fluentDays: string[];
  /** 능숙만으로 곧장 숙달했고 잊은 적 없음 */
  easy: boolean;
  /** 숙달 뒤 통과한 점검 수(최대 2) */
  reviews: number;
  /** 다음 점검일 'YYYY-MM-DD' (숙달한 단원만) */
  due?: string;
  /** 숙달했다가 점검에서 틀린 적이 있음 */
  lapsed: boolean;
  /** 위 단원을 연속으로 못 넘겨 숙달 전으로 되돌아와 다시 다지는 중(STEP_DOWN_FAILS) */
  stepped: boolean;
  /** 익히는 중 연속 실패 수(포기급은 2) */
  fails: number;
  /** 마지막으로 잊은 날. 이날에는 다시 숙달하지 않는다(같은 날 다시 맞힌 것은 단기 기억이라서) */
  lapsedOn?: string;
  tries: number;
  /** 최근 6번의 능숙(1)·통과(0.5)·실패(0) */
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
  /** 배치고사를 끝까지 본 적 있음 */
  placed: boolean;
}

export const attemptScore = (a: Pick<SkillAttempt, 'pitchScore' | 'rhythmScore'>) => Math.min(a.pitchScore, a.rhythmScore);
export const passed = (a: Pick<SkillAttempt, 'pitchScore' | 'rhythmScore'>) => attemptScore(a) >= PASS;
/** 실력 계산에 넣는 시도(PROGRESS_FROM 뒤) */
export const sinceReset = <T extends { at: string }>(attempts: T[]) => attempts.filter((a) => a.at >= PROGRESS_FROM);

/** 문항 크기(답 하나 = 음·계이름·화음 하나)로 정한 능숙 시간 한도(초) */
export const fluentTime = (track: Track, size: number) => FLUENT_TIME[track][0] + FLUENT_TIME[track][1] * size;

export type Grade = 'fluent' | 'pass' | 'fail' | 'giveup';

/** 한 시도의 능숙도: 능숙(정확·적게 듣고·빠름) / 통과 / 실패 / 포기급 */
export function attemptGrade(a: SkillAttempt, track: Track): Grade {
  const score = attemptScore(a);
  if (score < GIVE_UP) return 'giveup';
  if (score < PASS) return 'fail';
  const size = Math.max(a.answer?.length ?? 0, a.answerBass?.length ?? 0, 1);
  const quick = (a.plays ?? 0) <= FLUENT_PLAYS[track] && (a.seconds ?? 0) <= fluentTime(track, size);
  return score >= FAST_PASS && quick ? 'fluent' : 'pass';
}

const fresh = (): SkillState => ({ mastered: false, streak: 0, fluentDays: [], easy: false, reviews: 0, lapsed: false, stepped: false, fails: 0, tries: 0, recent: [] });

function master(st: SkillState, day: string) {
  Object.assign(st, { mastered: true, streak: 0, fluentDays: [], fails: 0, stepped: false, reviews: 0, due: addDays(day, INTERVALS[0]), masteredAt: day });
}

function reviewed(st: SkillState, day: string, score: number) {
  if (score >= FIRM) st.reviews = Math.min(INTERVALS.length - 1, st.reviews + 1);
  st.due = addDays(day, INTERVALS[st.reviews]);
}

/** 배치고사·위 단원 연속 실패로 숙달 전으로 되돌림(점검에서 잊은 것은 아니라 약함으로 치지 않는다) */
function unmaster(st: SkillState, stepped = false) {
  Object.assign(st, { mastered: false, streak: 0, fluentDays: [], fails: 0, easy: false, reviews: 0, due: undefined, stepped });
}

function forgot(st: SkillState, day: string) {
  Object.assign(st, { mastered: false, streak: 0, fluentDays: [], easy: false, reviews: 0, due: undefined, fails: 0, lapsed: true, lapsedOn: day });
}

function apply(skills: Record<string, SkillState>, a: SkillAttempt) {
  const s = skill(a.skill!)!;
  const st = skills[s.id];
  const day = dayKey(new Date(a.at));
  const ok = passed(a);
  const grade = attemptGrade(a, s.track);
  st.tries++;
  st.recent = [...st.recent, grade === 'fluent' ? 1 : ok ? 0.5 : 0].slice(-6);

  if (a.placement) {
    // 배치고사 통과는 그 단원과 아래 단원을 모두 숙달로 본다. 3일 뒤 첫 점검이 진짜 확인이다.
    // 틀리면 그 단원과 위 단원을 모두 숙달 전으로 되돌린다(배치고사를 다시 보면 사다리를 처음부터 다시 매김)
    if (ok) for (const x of ladder(s.track).slice(0, ladder(s.track).indexOf(s) + 1)) { if (!skills[x.id].mastered) master(skills[x.id], day); }
    else for (const x of ladder(s.track).slice(ladder(s.track).indexOf(s))) unmaster(skills[x.id]);
    return;
  }
  if (!ok) {
    if (st.mastered) forgot(st, day);
    else {
      // 실패는 쌓은 능숙을 하나 깎는다
      st.fluentDays.pop();
      st.streak = st.fluentDays.length;
      // 너무 많이 틀리면 바로 아래 단원부터 다시(한 번에 한 단계). 아래 단원도 같은 식으로 틀리면 또 한 단계 내려간다
      const below = ladder(s.track)[ladder(s.track).indexOf(s) - 1];
      st.fails += grade === 'giveup' ? 2 : 1;
      if (st.fails >= STEP_DOWN_FAILS && below && skills[below.id].mastered) {
        st.fails = 0;
        unmaster(skills[below.id], true);
      }
    }
    return;
  }
  st.fails = 0;
  if (st.mastered) {
    if (st.due && day >= st.due) reviewed(st, day, attemptScore(a));
  } else if (grade === 'fluent') {
    // 간신히 통과는 능숙 수를 지키기만 한다(그 단원이 더 자주 나오는 것은 recent 점수로)
    st.fluentDays.push(day);
    st.streak = st.fluentDays.length;
    const relearn = st.lapsed || st.stepped;
    const enough = st.streak >= (relearn ? RELEARN_STREAK : MASTER_STREAK);
    // 처음 익힐 때는 하루에 몰아서 숙달하지 않는다. 잊은 날에 맞힌 것도 쌓되, 다시 숙달은 다음 날부터
    const spread = relearn || new Set(st.fluentDays).size >= 2;
    if (enough && spread && st.lapsedOn !== day) {
      const easy = st.tries === st.streak && !st.lapsed;
      master(st, day);
      st.easy = easy;
    }
  }
  // 어려운 단원을 맞히면 그 문항에 들어 있는 아래 단원(covers)도 점검일이 됐으면 확인된 것으로 본다
  for (const x of within(s.id)) {
    const xs = skills[x];
    if (xs.mastered && xs.due && day >= xs.due) reviewed(xs, day, attemptScore(a));
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
  const list = attempts.filter((a) => a.skill && skill(a.skill) && !a.retry).sort((x, y) => x.at.localeCompare(y.at));
  for (const a of list) {
    apply(skills, a);
    // 배치고사는 끝까지 봐야 본 것. 끝 표시가 없는 예전 배치고사는 받아쓰기 사다리가 바뀌어(기획 §M5) 다시 본다
    placed ||= !!a.placementEnd;
    const l = levels(skills).level;
    if (l !== level) history.push({ at: a.at, level: (level = l) });
  }
  return { skills, ...levels(skills), history, placed };
}

/** 이 유형에서 지금 익힐 단원 id */
export const frontier = (p: Progress, track: Track) => firstOpen(p.skills, track)?.id;

/** 이 단원의 선수 단원 중 아직 숙달하지 않은 첫 단원(기획 §M5.1-2) */
export const blocker = (p: Progress, id: string) => skill(id)!.prereq?.find((x) => !p.skills[x].mastered);

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

/** 시드 seed부터 n개를 만들어 약점 표식이 가장 많이 든 것을 고른다. 약점이 없으면 seed 그대로.
 *  생성기에 가중치를 넣지 않으므로 문항 id의 시드로 같은 문항을 다시 만들 수 있다(오답 다시 풀기) */
export function bestOf<T>(make: (seed: number) => T, tags: (x: T) => string[], seed: number, weak: Record<string, number>, n = 6): T {
  if (!Object.keys(weak).length) return make(seed);
  let best = make(seed), top = -1;
  for (let i = 0; i < n; i++) {
    const x = i ? make(seed + i) : best;
    const v = tags(x).reduce((a, t) => a + (weak[t] ?? 0), 0);
    if (v > top) [best, top] = [x, v];
  }
  return best;
}
