import { addSeconds } from './store.ts';
import { GOAL_SECONDS } from './engine/habit.ts';

// 실제 풀이 시간만 센다: 문제·결과 화면이 보이고, 최근 90초 안에 터치나 재생이 있었을 때 (기획 M2)
const TICK = 5;
const IDLE_MS = 90_000;
let last = 0;
let counting = false;

export const touch = () => (last = Date.now());
export const setCounting = (on: boolean) => {
  counting = on;
  if (on) touch();
};

document.addEventListener('pointerdown', touch, true);

export function startActivityClock(onTick: (todaySeconds: number, reachedGoal: boolean) => void) {
  setInterval(() => {
    if (!counting || document.visibilityState !== 'visible' || Date.now() - last > IDLE_MS) return;
    const total = addSeconds(TICK);
    onTick(total, total >= GOAL_SECONDS && total - TICK < GOAL_SECONDS);
  }, TICK * 1000);
}
