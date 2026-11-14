import { LEVELS, MAX_LEVEL, SKILLS, TRACKS, skill, trackLevelText } from '../engine/curriculum.ts';
import { FAST_STREAK, MASTER_STREAK, RELEARN_STREAK, blocker, classify, computeProgress, isDue, type Progress } from '../engine/progress.ts';
import { dayKey } from '../engine/habit.ts';
import { setCounting } from '../activity.ts';
import { stopAll } from '../audio/synth.ts';
import { load } from '../store.ts';
import { app, h, header } from './dom.ts';
import { startPlacement } from './match.ts';

// 실력 화면: 레벨 사다리, 단원 분류(쉬움·안정·익히는 중·약함·차례 전)와 점검일, 약한 단원, 레벨 기록 (기획 M3, M4)

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
    const c = classify(p, id);
    const dots = (need: number) => h('i', { class: 'dots' }, '●'.repeat(Math.min(st.streak, need)) + '○'.repeat(Math.max(0, need - st.streak)));
    if (c === 'easy' || c === 'stable') {
      const label = c === 'easy' ? '쉬움' : '안정';
      return isDue(p, id, today)
        ? h('span', { class: 'due' }, `${label} · 점검할 때`)
        : h('span', { class: 'ok' }, `${label} · 점검 ${md(st.due!)}${st.reviews ? ` · ${st.reviews}회 확인` : ''}`);
    }
    if (c === 'weak') {
      const rate = `최근 ${st.recent.length}번 중 ${st.recent.filter(Boolean).length}번 통과`;
      // 잊은 날에는 다시 숙달하지 않는다(progress.ts). 점이 다 차도 내일 한 번 더 맞혀야 한다
      const later = st.lapsedOn === today ? ' · 내일부터 다시 숙달돼요' : '';
      return h('span', { class: 'weak' }, `약함 · ${st.lapsed ? '점검에서 잊음' : rate} `, dots(st.lapsed ? RELEARN_STREAK : MASTER_STREAK), later);
    }
    if (c === 'waiting') return h('span', { class: 'locked' }, '차례 전');
    // 선수 단원이 남은 받아쓰기 단원: 그 단원부터 대련에 나온다(기획 §M5.1-2)
    const b = blocker(p, id);
    if (b) return h('span', { class: 'locked' }, `먼저 ${TRACK_NAME[skill(b)!.track]} · ${skill(b)!.name}`);
    return h('span', {}, '익히는 중 ', dots(st.lapsed ? RELEARN_STREAK : MASTER_STREAK));
  };
  const weak = SKILLS.filter((s) => classify(p, s.id) === 'weak');

  const levels = LEVELS.map((L) => {
    const started = SKILLS.some((s) => s.level === L.level && classify(p, s.id) !== 'waiting');
    const status = 'planned' in L ? '준비 중' : doneAt(p, L.level) ? `완료 ${md(doneAt(p, L.level)!)}` : started ? '진행 중' : '차례 전';
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
      h('small', {}, TRACKS.map((t) => `${t.short} ${trackLevelText(p.trackLevels[t.id])}`).join(' · ')),
    ),
    weak.length
      ? h('section', { class: 'changes bad' }, h('h2', {}, '약한 단원 · 대련에서 더 자주 나와요'),
        ...weak.map((s) => h('p', {}, h('span', { class: 'tag' }, TRACK_NAME[s.track]), s.name)))
      : '',
    h('p', { class: 'note' }, `유형마다 따로 레벨이 올라요. 연속 ${MASTER_STREAK}번 통과(80% 이상)하거나, 95% 이상으로 ${FAST_STREAK}번 연속 맞히면 숙달이에요. 처음 두 번 만에 숙달하면 ‘쉬움’이에요. 숙달한 단원은 연습에서 빠지고, 3일 → 7일 → 그 뒤로 14일마다 대련에서 점검해요. 점검에서 틀리면 ‘약함’으로 연습에 돌아와요.`),
    ...levels,
    history,
    h('div', { class: 'backup' }, h('button', { onclick: startPlacement }, p.placed ? '배치고사 다시 보기' : '배치고사 보기')),
  );
}
