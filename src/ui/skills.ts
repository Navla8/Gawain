import { LEVELS, MAX_LEVEL, SKILLS, TRACKS } from '../engine/curriculum.ts';
import { MASTER_STREAK, RELEARN_STREAK, computeProgress, isDue, unlocked, type Progress } from '../engine/progress.ts';
import { dayKey } from '../engine/habit.ts';
import { setCounting } from '../activity.ts';
import { stopAll } from '../audio/synth.ts';
import { load } from '../store.ts';
import { app, h, header } from './dom.ts';
import { startPlacement } from './match.ts';

// 실력 화면: 레벨 사다리, 단원별 숙달·점검일, 레벨 기록 (기획 M3)

const TRACK_NAME = Object.fromEntries(TRACKS.map((t) => [t.id, t.name]));
const md = (key: string) => `${Number(key.slice(5, 7))}.${Number(key.slice(8, 10))}`;

/** 이 레벨을 마친 날(가장 최근에 이 레벨 위로 올라선 때) */
function doneAt(p: Progress, level: number): string | undefined {
  if (p.level <= level) return undefined;
  let prev = 0, at: string | undefined;
  for (const x of p.history) {
    if (prev <= level && x.level > level) at = x.at;
    prev = x.level;
  }
  return at && dayKey(new Date(at));
}

export function skillsScreen() {
  stopAll();
  setCounting(false);
  const p = computeProgress(load().attempts);
  const today = dayKey(new Date());
  const lv = Math.min(p.level, MAX_LEVEL);
  const inLevel = SKILLS.filter((s) => s.level === lv);
  const masteredIn = inLevel.filter((s) => p.skills[s.id].mastered).length;

  const state = (id: string) => {
    const st = p.skills[id];
    if (st.mastered) return isDue(p, id, today)
      ? h('span', { class: 'due' }, '점검할 때')
      : h('span', { class: 'ok' }, `숙달 · 점검 ${md(st.due!)}${st.reviews ? ` · ${st.reviews}회 확인` : ''}`);
    if (!unlocked(p, id)) return h('span', { class: 'locked' }, '잠김');
    const need = st.lapsed ? RELEARN_STREAK : MASTER_STREAK;
    return h('span', {}, `익히는 중 `, h('i', { class: 'dots' }, '●'.repeat(st.streak) + '○'.repeat(Math.max(0, need - st.streak))));
  };

  const levels = LEVELS.map((L) => {
    const status = 'planned' in L ? '준비 중' : doneAt(p, L.level) ? `완료 ${md(doneAt(p, L.level)!)}` : L.level === lv ? '진행 중' : L.level > lv ? '잠김' : '';
    const rows = SKILLS.filter((s) => s.level === L.level).map((s) =>
      h('li', {}, h('span', { class: 'tag' }, TRACK_NAME[s.track]), h('b', {}, s.name), state(s.id)));
    return h('section', { class: 'lvl' + (L.level === lv ? ' current' : '') + ('planned' in L ? ' planned' : '') },
      h('header', {}, h('b', {}, `L${L.level}`), h('span', {}, L.name), h('em', {}, status)),
      h('p', {}, L.goal),
      rows.length ? h('ul', {}, ...rows) : '',
    );
  });

  const history = p.history.length
    ? h('section', { class: 'history' }, h('h2', {}, '레벨 기록'), ...[...p.history].reverse().map((x, i, all) => {
      const prev = all[i + 1]?.level ?? 0;
      return h('p', {}, h('span', {}, md(dayKey(new Date(x.at)))), h('b', {}, `Level ${Math.min(x.level, MAX_LEVEL)}`), h('em', {}, x.level > prev ? '↑' : '↓'));
    }))
    : '';

  app.replaceChildren(
    header('실력'),
    h('section', { class: 'level-hero' },
      h('p', { class: 'eyebrow' }, p.level > MAX_LEVEL ? 'L0~L3 완료' : '지금 레벨'),
      h('b', {}, `Level ${lv}`),
      h('span', {}, LEVELS[lv].name),
      h('div', { class: 'meter' }, h('i', { style: `width:${Math.round((masteredIn / inLevel.length) * 100)}%` })),
      h('small', {}, `이 레벨 ${inLevel.length}단원 중 ${masteredIn}단원 숙달`),
    ),
    h('p', { class: 'note' }, `연속 ${MASTER_STREAK}번 통과(80% 이상)하면 숙달이에요. 숙달한 단원은 연습에서 빠지고, 3일 → 7일 → 그 뒤로 14일마다 대련에서 점검해요. 점검에서 틀리면 연습으로 돌아와요.`),
    ...levels,
    history,
    h('div', { class: 'backup' }, h('button', { onclick: startPlacement }, p.placed ? '배치고사 다시 보기' : '배치고사 보기')),
  );
}
