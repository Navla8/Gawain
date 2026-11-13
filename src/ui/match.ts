import { LEVELS, MAX_LEVEL, TRACKS, ladder, skill, trackLevelText } from '../engine/curriculum.ts';
import { computeProgress, weakness, type Progress } from '../engine/progress.ts';
import { MAX_TOTAL, frontier, nextPlacement, placementLeft, planMatch, stepDown, type Slot } from '../engine/session.ts';
import { degreeItem, minorMelody, rhythmItem } from '../engine/drills.ts';
import { pickForSkill } from '../engine/bank.ts';
import { dayKey } from '../engine/habit.ts';
import { setCounting } from '../activity.ts';
import { stopAll, playNotes } from '../audio/synth.ts';
import { load } from '../store.ts';
import { app, h, header, nav } from './dom.ts';
import { solve, type ItemCtx } from './dictation.ts';
import { degreeScreen } from './degree.ts';

// 대련(원터치 통합 테스트)과 배치고사 진행 (기획 M3)

interface Played { slot: Slot; skill: string; ok: boolean }

interface Run {
  kind: 'match' | 'placement';
  slots: Slot[];
  i: number;
  before: Progress;
  log: Played[];
}

const seed = () => Math.floor(Math.random() * 1e9);
const progressNow = () => computeProgress(load().attempts);
export const levelName = (l: number) => LEVELS[Math.min(l, LEVELS.length - 1)].name;

/** 홈의 대련 버튼 */
export function startMatch() {
  const before = progressNow();
  const slots = planMatch(before, dayKey(new Date()));
  next({ kind: 'match', slots, i: 0, before, log: [] });
}

/** 배치고사 안내 → 시작 */
export function startPlacement() {
  stopAll();
  setCounting(false);
  const again = progressNow().placed;
  app.replaceChildren(
    header('배치고사'),
    h('section', { class: 'intro' },
      h('p', { class: 'eyebrow' }, 'Placement'),
      h('h1', {}, again ? '실력을 다시 매겨요' : '어디서부터 시작할까요'),
      h('p', {}, '계이름 듣기 · 리듬 받아쓰기 · 선율 받아쓰기를 돌아가며 한 문제씩 내요. 맞히면 더 어려운 단원으로, 틀리면 더 쉬운 단원으로 옮겨 가며 지금 레벨을 찾아요.'),
      h('p', {}, `약 10문항, 10분 남짓 걸려요. 모르는 문제는 ‘모르겠어요’로 넘겨도 돼요. 통과한 단원은 숙달로 치고, 3일 뒤 첫 점검에서 한 번 더 확인해요.`),
      h('button', { class: 'cta', onclick: () => next({ kind: 'placement', slots: [], i: 0, before: progressNow(), log: [] }) }, '시작'),
    ),
  );
}

function next(run: Run) {
  stopAll();
  let slot: Slot | undefined;
  let step: [number, number];
  if (run.kind === 'placement') {
    const results = run.log.map((l) => ({ skill: l.skill, ok: l.ok }));
    slot = nextPlacement(results);
    step = [run.log.length + 1, run.log.length + placementLeft(results)];
  } else {
    // 익히기 자리는 낼 때 단원을 정한다(그 사이 숙달했으면 다음 단원, 그 유형에 낼 단원이 없으면 다른 유형이나 건너뜀)
    while (run.i < run.slots.length) {
      const s = run.slots[run.i];
      if (s.skill) { slot = s; break; }
      const p = progressNow();
      // 짧은 문항 자리는 다른 짧은 유형으로만 바꾼다(받아쓰기로 채우면 한 판이 너무 길어짐)
      const id = frontier(p, s.track) ?? (s.track === 'dictation' ? undefined : TRACKS.filter((t) => t.id !== 'dictation').map((t) => frontier(p, t.id)).find(Boolean));
      if (id) { slot = { ...s, track: skill(id)!.track, skill: id }; break; }
      run.slots.splice(run.i, 1);
    }
    step = [run.i + 1, run.slots.length];
  }
  if (!slot) return summary(run);
  show(run, slot, step);
}

function show(run: Run, slot: Slot, step: [number, number]) {
  const id = slot.skill!;
  const ctx: ItemCtx = {
    skill: id,
    placement: run.kind === 'placement',
    step,
    onGraded: (ok) => {
      run.log.push({ slot, skill: id, ok });
      // 점검에서 틀리면 한 단계 쉬운 숙달 단원으로 바로 다시 점검한다
      if (!ok && (slot.role === 'review' || slot.role === 'check') && run.slots.length < MAX_TOTAL) {
        const down = stepDown(progressNow(), slot);
        if (down) run.slots.splice(run.i + 1, 0, down);
      }
    },
    next: () => { run.i++; next(run); },
  };
  const attempts = load().attempts;
  const s = skill(id)!;
  if (s.track === 'degree') degreeScreen(degreeItem(id, seed(), weakness(attempts, id)), ctx);
  else if (s.track === 'rhythm') solve(rhythmItem(id, seed()), { ...ctx, rhythm: true });
  else solve(s.set ? pickForSkill(s.set, attempts, Math.random) : minorMelody(seed()), ctx);
}

const ROLE: Record<string, string> = { learn: '연습', review: '점검', check: '확인', placement: '배치' };

function summary(run: Run) {
  stopAll();
  setCounting(false);
  const after = progressNow();
  const b = run.before.skills, a = after.skills;
  const ids = [...new Set(run.log.map((l) => l.skill))];
  const learned = ids.filter((x) => !b[x].mastered && a[x].mastered);
  const kept = ids.filter((x) => b[x].mastered && a[x].mastered && a[x].due !== b[x].due);
  const lost = ids.filter((x) => b[x].mastered && !a[x].mastered);
  const passedN = run.log.filter((l) => l.ok).length;
  const up = after.level > run.before.level, down = after.level < run.before.level;
  // 전체 레벨은 그대로여도 유형 레벨이 오르면 축하한다(유형별 진급, 기획 M4.1)
  const trackUps = TRACKS.filter((t) => after.trackLevels[t.id] > run.before.trackLevels[t.id]);
  const lv = Math.min(after.level, MAX_LEVEL);
  const name = (x: string) => skill(x)!.name;
  const list = (title: string, xs: string[], cls = '') => xs.length
    ? h('section', { class: 'changes ' + cls }, h('h2', {}, title), ...xs.map((x) => h('p', {}, name(x))))
    : '';

  const levelBlock = run.kind === 'placement'
    ? h('section', { class: 'levelup' }, h('p', { class: 'eyebrow' }, 'Placement'), h('b', {}, `Level ${lv}`), h('span', {}, after.level > MAX_LEVEL ? 'L0~L3을 모두 통과했어요' : levelName(lv)))
    : up
      ? h('section', { class: 'levelup' }, h('p', { class: 'eyebrow' }, 'Level up'), h('b', {}, `Level ${lv}`), h('span', {}, after.level > MAX_LEVEL ? 'L0~L3을 모두 마쳤어요' : levelName(lv)))
      : down
        ? h('section', { class: 'leveldown' }, h('b', {}, `Level ${lv}`), h('span', {}, '잊은 단원을 다시 익히면 돌아가요'))
        : trackUps.length
          ? h('section', { class: 'levelup' }, h('p', { class: 'eyebrow' }, 'Level up'),
            ...trackUps.map((t) => h('b', {}, `${t.short} ${trackLevelText(after.trackLevels[t.id])}`)),
            h('span', {}, trackUps.map((t) => t.name).join(' · ') + ' 레벨이 올랐어요'))
          : '';

  const placementRows = run.kind === 'placement'
    ? h('section', { class: 'changes' }, h('h2', {}, '유형별 출발점'), ...TRACKS.map((t) => {
      const f = frontier(after, t.id) ?? ladder(t.id).find((s) => !after.skills[s.id].mastered)?.id;
      return h('p', {}, h('span', { class: 'tag' }, t.name), f ? name(f) : '모두 통과');
    }))
    : '';

  app.replaceChildren(
    header(run.kind === 'placement' ? '배치고사 결과' : '대련 결과'),
    levelBlock,
    h('div', { class: 'scores' },
      h('div', {}, h('b', {}, `${passedN}`), h('span', {}, `${run.log.length}문항 중 통과`)),
      h('div', {}, h('b', {}, `${learned.length}`), h('span', {}, '새로 익힌 단원')),
    ),
    placementRows,
    run.kind === 'match' ? list('새로 익힘', learned, 'good') : '',
    list('기억 확인 · 다음 점검이 미뤄졌어요', kept),
    list('다시 연습 · 연습 풀로 돌아왔어요', lost, 'bad'),
    h('section', { class: 'changes log' }, h('h2', {}, '문항'),
      ...run.log.map((l) => h('p', { class: l.ok ? 'ok' : 'bad' }, h('span', { class: 'tag' }, ROLE[l.slot.role]), name(l.skill), h('em', {}, l.ok ? '✓' : '✗')))),
    h('div', { class: 'actions' },
      h('button', { class: 'half', onclick: () => nav.home() }, '홈으로'),
      h('button', { class: 'half', onclick: startMatch }, '한 판 더'),
    ),
  );
  if (up || trackUps.length || run.kind === 'placement') playNotes([{ midi: 72, dur: 6 }, { midi: 76, dur: 6 }, { midi: 79, dur: 6 }, { midi: 84, dur: 18 }], 110);
}
