// 하루 10분 습관 (기획 §4, M2)
export const GOAL_SECONDS = 600;

export interface AttemptLike {
  at: string;
  problemId: string;
  pitchScore: number;
  rhythmScore: number;
}

/** 기기 현지 날짜 'YYYY-MM-DD' */
export function dayKey(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** 'YYYY-MM-DD'에서 n일 더한 날짜 키 */
export function addDays(key: string, n: number): string {
  const [y, m, d] = key.split('-').map(Number);
  return dayKey(new Date(y, m - 1, d + n));
}

export type DayStatus = 'goal' | 'some' | 'none';

/** 1문제라도 푼 날은 'some', 그중 10분을 채운 날은 'goal' */
export function dayStatus(key: string, attempts: AttemptLike[], seconds: Record<string, number>): DayStatus {
  if (!attempts.some((a) => dayKey(new Date(a.at)) === key)) return 'none';
  return (seconds[key] ?? 0) >= GOAL_SECONDS ? 'goal' : 'some';
}

/** 연속 일수와 그중 10분 채운 날 수. 오늘 아직 안 했으면 어제부터 센다 */
export function streak(attempts: AttemptLike[], seconds: Record<string, number>, today: string) {
  const solved = new Set(attempts.map((a) => dayKey(new Date(a.at))));
  let key = solved.has(today) ? today : addDays(today, -1);
  let days = 0, goalDays = 0;
  while (solved.has(key)) {
    days++;
    if ((seconds[key] ?? 0) >= GOAL_SECONDS) goalDays++;
    key = addDays(key, -1);
  }
  return { days, goalDays };
}

/** 문제별 가장 최근 시도가 만점이 아닌 문제 id */
export function reviewIds(attempts: AttemptLike[]): string[] {
  const latest = new Map<string, AttemptLike>();
  for (const a of [...attempts].sort((x, y) => x.at.localeCompare(y.at))) latest.set(a.problemId, a);
  return [...latest.values()].filter((a) => a.pitchScore < 1 || a.rhythmScore < 1).map((a) => a.problemId);
}
