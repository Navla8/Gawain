import { LEVELS, MAX_LEVEL, SKILLS, TRACKS, skill, trackLevelText } from '../engine/curriculum.ts';
import { FAST_PASS, FIRM, MASTER_STREAK, RELEARN_STREAK, STEP_DOWN_FAILS, blocker, classify, computeProgress, isDue, sinceReset, weakness, type Progress } from '../engine/progress.ts';
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
  const attempts = load().attempts;
  const p = computeProgress(sinceReset(attempts));
  const today = dayKey(new Date());
  const lv = Math.min(p.level, MAX_LEVEL);
  const inLevel = SKILLS.filter((s) => s.level === lv);
  const masteredIn = inLevel.filter((s) => p.skills[s.id].mastered).length;

  const state = (id: string) => {
    const st = p.skills[id];
    const c = classify(p, id);
    // 점검에서 잊었거나 위 단원을 못 넘겨 되돌아온 단원은 능숙 2번으로 다시 숙달된다(progress.ts)
    const need = st.lapsed || st.stepped ? RELEARN_STREAK : MASTER_STREAK;
    // 점 = 쌓은 능숙 수. 처음 익힐 때 능숙이 모두 같은 날이면 다른 날 한 번 더 필요하다
    const sameDay = !st.lapsed && !st.stepped && st.streak >= need && new Set(st.fluentDays).size < 2;
    const dots = () => h('i', { class: 'dots' }, '●'.repeat(Math.min(st.streak, need)) + '○'.repeat(Math.max(0, need - st.streak)), sameDay ? h('small', {}, ' · 내일 한 번 더') : '');
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
      return h('span', { class: 'weak' }, `약함 · ${st.lapsed ? '점검에서 잊음' : rate} `, dots(), later);
    }
    if (c === 'waiting') return h('span', { class: 'locked' }, '차례 전');
    // 선수 단원이 남은 받아쓰기 단원: 그 단원부터 대련에 나온다(기획 §M5.1-2)
    const b = blocker(p, id);
    if (b) return h('span', { class: 'locked' }, `먼저 ${TRACK_NAME[skill(b)!.track]} · ${skill(b)!.name}`);
    return h('span', {}, st.stepped ? '다시 다지는 중 ' : '익히는 중 ', dots());
  };
  const weak = SKILLS.filter((s) => classify(p, s.id) === 'weak');
  // 단원마다 최근 20번에서 두 번 이상 틀린 요소(계이름·계이름 진행·음 길이), 많은 것부터 셋(기획 §M6.2)
  const misses = (id: string) => {
    const top = Object.entries(weakness(attempts, id)).filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]).slice(0, 3);
    return top.length ? h('small', { class: 'miss' }, '자주 틀림 · ' + top.map(([t, n]) => `${t} ${n}`).join(' · ')) : '';
  };

  const levels = LEVELS.map((L) => {
    const started = SKILLS.some((s) => s.level === L.level && classify(p, s.id) !== 'waiting');
    const status = 'planned' in L ? '준비 중' : doneAt(p, L.level) ? `완료 ${md(doneAt(p, L.level)!)}` : started ? '진행 중' : '차례 전';
    const rows = SKILLS.filter((s) => s.level === L.level).map((s) =>
      h('li', {}, h('span', { class: 'tag' }, TRACK_NAME[s.track]), h('b', {}, s.name), state(s.id), misses(s.id)));
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
      h('p', { class: 'eyebrow' }, p.level > MAX_LEVEL ? `L0~L${MAX_LEVEL} 완료` : '지금 레벨'),
      h('b', {}, `Level ${lv}`),
      h('span', {}, LEVELS[lv].name),
      h('div', { class: 'meter' }, h('i', { style: `width:${Math.round((masteredIn / inLevel.length) * 100)}%` })),
      h('small', {}, `이 레벨 ${inLevel.length}단원 중 ${masteredIn}단원 숙달`),
      h('small', {}, TRACKS.map((t) => `${t.short} ${trackLevelText(p.trackLevels[t.id])}`).join(' · ')),
    ),
    weak.length
      ? h('section', { class: 'changes bad' }, h('h2', {}, '약한 단원 · 대련에 더 자주 출제됩니다'),
        ...weak.map((s) => h('p', {}, h('span', { class: 'tag' }, TRACK_NAME[s.track]), s.name, misses(s.id))))
      : '',
    h('p', { class: 'note' }, `레벨은 유형별로 따로 오릅니다. [문구 T-008] ${Math.round(FAST_PASS * 100)}% 이상을 적게 듣고 빨리 맞히면 ‘능숙’(점 하나)이고, 능숙 ${MASTER_STREAK}번(하루에 몰지 않고 이틀 이상)이면 숙달됩니다. 80% 이상이어도 여러 번 듣거나 오래 걸리면 점이 늘지 않고 그 단원이 더 자주 나오며, 80% 미만은 점 하나를 잃습니다. 시도가 모두 능숙이면 ‘쉬움’으로 분류됩니다. 숙달한 단원은 일반 연습에서 빠지고 3일 → 7일 → 이후 14일 간격으로 대련에서 점검합니다. 점검 점수가 ${Math.round(FIRM * 100)}% 미만이면 간격이 늘지 않으며, 한 번 확인을 마친 단원은 점검 시 재생 횟수가 줄어듭니다(실전 조건). 점검을 통과하지 못하면 ‘약함’ 표시와 함께 연습에 복귀합니다. [문구 T-008] 익히는 단원을 ${STEP_DOWN_FAILS}번 연속 못 넘기면 바로 아래 단원으로 한 단계 내려가 ‘다시 다지는 중’이 되고, 40% 미만은 두 번 틀린 것으로 칩니다. 그 단원을 능숙 ${RELEARN_STREAK}번이면 다시 올라갑니다. 자주 틀리는 요소는 대련 출제 비중이 높아지며, 대련에서 틀린 받아쓰기·리듬 문제는 다음 날부터 대련에 다시 나옵니다.`),
    ...levels,
    history,
    h('div', { class: 'backup' }, h('button', { onclick: startPlacement }, p.placed ? '배치고사 다시 보기' : '배치고사 보기')),
  );
}
