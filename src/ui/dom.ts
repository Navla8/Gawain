import { GOAL_SECONDS, dayKey } from '../engine/habit.ts';
import { load } from '../store.ts';

export const app = document.getElementById('app')!;

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Record<string, unknown> = {}, ...kids: (Node | string)[]) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k.startsWith('on')) e.addEventListener(k.slice(2), v as EventListener);
    else if (k === 'class') e.className = String(v);
    else if (v !== false && v != null) e.setAttribute(k, v === true ? '' : String(v));
  }
  e.append(...kids);
  return e;
}

/** 화면 이동. main.ts가 홈을 채워 넣는다(모듈 순환 방지) */
export const nav = { home: () => {} };

/** 잠깐 띄우는 알림 */
export function toast(text: string) {
  const t = h('div', { class: 'toast' }, text);
  document.body.append(t);
  setTimeout(() => t.classList.add('out'), 2400);
  setTimeout(() => t.remove(), 2900);
}

export const clockText = (secs: number) => (secs >= GOAL_SECONDS ? `✓ ${Math.floor(secs / 60)}분` : `${Math.floor(secs / 60)} / 10분`);

/** 머리줄의 오늘 풀이 시간 */
export function clock() {
  return h('span', { class: 'clock' }, clockText(load().seconds[dayKey(new Date())] ?? 0));
}

/** 문항 화면의 머리줄. step이 있으면 대련·배치고사 진행 막대를 단다 */
export function header(title: string, step?: [number, number]) {
  const bar = h('header', { class: 'bar' },
    h('button', { class: 'back', onclick: () => nav.home(), 'aria-label': '홈' }, '‹'),
    h('span', { class: 'title' }, title),
    step ? h('span', { class: 'step' }, `${step[0]} / ${step[1]}`) : '',
    clock(),
  );
  if (!step) return bar;
  return h('div', { class: 'head' }, bar, h('div', { class: 'progress' }, h('i', { style: `width:${Math.round(((step[0] - 1) / step[1]) * 100)}%` })));
}

export const pct = (x: number) => `${Math.round(x * 100)}%`;
