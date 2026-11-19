import { LEVELS, MAX_LEVEL, TRACKS, ladder, skill, trackLevelText } from '../engine/curriculum.ts';
import { bestOf, blocker, classify, computeProgress, sinceReset, weakness, type Progress } from '../engine/progress.ts';
import { MAX_TOTAL, frontier, isExam, learnUnit, nextPlacement, placementLeft, planMatch, retryIds, stepDown, type Slot } from '../engine/session.ts';
import { contentTags } from '../engine/grade.ts';
import { degreeItem, rhythmItem } from '../engine/drills.ts';
import { melodyItem, memoryItem, tuneItem } from '../engine/melody.ts';
import { dayKey } from '../engine/habit.ts';
import { setCounting } from '../activity.ts';
import { stopAll, playNotes } from '../audio/synth.ts';
import { favoriteIds, load, save } from '../store.ts';
import { app, h, header, nav } from './dom.ts';
import { solve, type ItemCtx } from './dictation.ts';
import { degreeScreen } from './degree.ts';
import { harmonyScreen } from './harmony.ts';
import { memoryScreen } from './memory.ts';
import { harmonyItem } from '../engine/harmony.ts';

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
const progressNow = () => computeProgress(sinceReset(load().attempts));
export const levelName = (l: number) => LEVELS[Math.min(l, LEVELS.length - 1)].name;

/** 대련 한 판 구성(홈의 예상 시간 표시도 이것으로) */
export function matchPlan() {
  const attempts = sinceReset(load().attempts);
  const p = computeProgress(attempts);
  const today = dayKey(new Date());
  return { p, slots: planMatch(p, today, retryIds(attempts, today)) };
}

/** 실전 조건의 재생 횟수(기획 §M6.3): 받아쓰기·리듬 5 → 3, 기억 3 → 2(1회 단원은 1 유지), 계이름·화성 3 → 2 */
const EXAM_PLAYS = { degree: 2, rhythm: 3, memory: 2, dictation: 3, harmony: 2 };

/** 홈의 대련 버튼 */
export function startMatch() {
  const { p: before, slots } = matchPlan();
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
      h('p', {}, '계이름 듣기, 리듬 받아쓰기, 선율 기억, 선율 받아쓰기, 화성 듣기를 번갈아 한 문제씩 풉니다. 정답 여부에 따라 난이도를 오르내리며 현재 실력에 맞는 레벨을 찾습니다.'),
      h('p', {}, `약 17문항으로 10분 안팎이 걸립니다. 잘 모르는 문제는 ‘모르겠어요’를 눌러 건너뛸 수 있습니다. 통과한 단원은 숙달 처리되며 3일 뒤 첫 점검에서 다시 확인합니다.`),
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
      const id = learnUnit(p, s.track) ?? (s.track === 'dictation' ? undefined : TRACKS.filter((t) => t.id !== 'dictation').map((t) => learnUnit(p, t.id)).find(Boolean));
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
    ...(slot.role === 'retry' && { retry: true }),
    ...(isExam(progressNow(), slot) && { plays: EXAM_PLAYS[slot.track], exam: true }),
    onGraded: (ok) => {
      run.log.push({ slot, skill: id, ok });
      // 배치고사는 마지막 문항까지 채점돼야 배치 완료다. 방금 남긴 시도에 끝 표시를 단다
      if (run.kind === 'placement' && !nextPlacement(run.log.map((l) => ({ skill: l.skill, ok: l.ok })))) {
        save((d) => { const last = d.attempts.at(-1); if (last?.placement) last.placementEnd = true; });
      }
      // 점검에서 틀리면 한 단계 쉬운 숙달 단원으로 바로 다시 점검한다
      if (!ok && (slot.role === 'review' || slot.role === 'check') && run.slots.length < MAX_TOTAL) {
        const down = stepDown(progressNow(), slot);
        if (down) run.slots.splice(run.i + 1, 0, down);
      }
    },
    next: () => { run.i++; next(run); },
  };
  present(id, slot, ctx);
}

function drillOne(id: string, back: () => void, next: () => void) {
  stopAll();
  const p = progressNow();
  const s = skill(id)!;
  const counted = classify(p, id) !== 'waiting' && !blocker(p, id);
  const slot: Slot = { track: s.track, skill: id, role: p.skills[id].mastered ? 'review' : 'learn' };
  present(id, slot, {
    ...(counted && { skill: id }),
    ...(counted && isExam(p, slot) && { plays: EXAM_PLAYS[s.track], exam: true }),
    back,
    next,
  });
}

/**
 * 실력 화면에서 고른 단원만 이어서 푼다. 열린 단원은 대련처럼 단원 판정에 들어가고(숙달한 단원은 점검으로),
 * 아직 차례가 안 된 단원은 미리 풀어 보기라 판정에 넣지 않는다(기획 §M3.6). 뒤로 가면 실력 화면.
 */
export const startDrill = (id: string, back: () => void) => drillOne(id, back, () => startDrill(id, back));

/** 즐겨찾기 단원을 무작위 순서로 돌아가며 한 문항씩 이어서 낸다(기획 §M9.2) */
export function startFavorites(back: () => void) {
  const queue: string[] = [];
  let last: string | undefined;
  const step = () => {
    if (!queue.length) {
      queue.push(...favoriteIds().filter((id) => skill(id)));
      if (!queue.length) return back();
      for (let i = queue.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [queue[i], queue[j]] = [queue[j], queue[i]];
      }
      if (queue.length > 1 && queue[0] === last) {
        const j = 1 + Math.floor(Math.random() * (queue.length - 1));
        [queue[0], queue[j]] = [queue[j], queue[0]];
      }
    }
    last = queue.shift()!;
    drillOne(last, back, step);
  };
  step();
}

/** 단원 id의 새 문항(지난 오답 자리면 그 문제)을 띄운다 */
function present(id: string, slot: Slot, ctx: ItemCtx) {
  const weak = weakness(load().attempts, id);
  const s = skill(id)!;
  // 지난 오답은 문제 id의 시드로 같은 문제를 다시 만든다. 새 문항은 약점 표식이 든 것을 골라 낸다(기획 §M6.2)
  const fixed = slot.problem ? Number(slot.problem.split('-')[2]) : undefined;
  const rhythmAt = (x: number) => rhythmItem(id, x);
  const memoryAt = (x: number) => memoryItem(id, x, s.name);
  const melodyAt = (x: number) => melodyItem(id, x, s.name);
  if (s.track === 'degree') degreeScreen(degreeItem(id, seed(), weak), ctx);
  else if (s.track === 'harmony') harmonyScreen(harmonyItem(id, seed(), weak), ctx);
  else if (s.track === 'memory') memoryScreen(fixed !== undefined ? memoryAt(fixed) : bestOf(memoryAt, (it) => contentTags(it.notes, it.fifths, false, it.minor), seed(), weak), ctx);
  else if (s.track === 'rhythm') solve(fixed !== undefined ? rhythmAt(fixed) : bestOf(rhythmAt, (it) => contentTags(it.notes, it.fifths, true), seed(), weak), { ...ctx, rhythm: true });
  else if (id === 't5') solve(tuneItem(fixed ?? seed()), ctx);
  else solve(fixed !== undefined ? melodyAt(fixed) : bestOf(melodyAt, (it) => contentTags(it.notes, it.fifths, false, it.minor), seed(), weak), ctx);
}

const ROLE: Record<string, string> = { learn: '연습', review: '점검', check: '확인', placement: '배치', retry: '오답' };

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
    ? h('section', { class: 'levelup' }, h('p', { class: 'eyebrow' }, 'Placement'), h('b', {}, `Level ${lv}`), h('span', {}, after.level > MAX_LEVEL ? `L0~L${MAX_LEVEL}을 모두 통과했어요` : levelName(lv)))
    : up
      ? h('section', { class: 'levelup' }, h('p', { class: 'eyebrow' }, 'Level up'), h('b', {}, `Level ${lv}`), h('span', {}, after.level > MAX_LEVEL ? `L0~L${MAX_LEVEL}을 모두 마쳤어요` : levelName(lv)))
      : down
        ? h('section', { class: 'leveldown' }, h('b', {}, `Level ${lv}`), h('span', {}, '아래 단원을 다시 숙달하면 원래 레벨로 돌아옵니다'))
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
    list('기억 확인 · 다음 점검이 미뤄졌습니다', kept),
    list('다시 연습 · 연습 풀로 돌아갔습니다', lost, 'bad'),
    h('section', { class: 'changes log' }, h('h2', {}, '문항'),
      ...run.log.map((l) => h('p', { class: l.ok ? 'ok' : 'bad' }, h('span', { class: 'tag' }, ROLE[l.slot.role]), name(l.skill), h('em', {}, l.ok ? '✓' : '✗')))),
    h('div', { class: 'actions' },
      h('button', { class: 'half', onclick: () => nav.home() }, '홈으로'),
      h('button', { class: 'half', onclick: startMatch }, '한 판 더'),
    ),
  );
  if (up || trackUps.length || run.kind === 'placement') playNotes([{ midi: 72, dur: 6 }, { midi: 76, dur: 6 }, { midi: 79, dur: 6 }, { midi: 84, dur: 18 }], 110);
}
