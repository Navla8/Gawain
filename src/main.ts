import './style.css';
import { SETS, pickRandom, findProblem } from './engine/bank.ts';
import { GOAL_SECONDS, addDays, dayKey, dayStatus, reviewIds, streak } from './engine/habit.ts';
import { setCounting, startActivityClock } from './activity.ts';
import { LEVELS, MAX_LEVEL, SKILLS, TRACKS, trackLevelText } from './engine/curriculum.ts';
import { computeProgress, isDue } from './engine/progress.ts';
import { planMatch, EST } from './engine/session.ts';
import { playKey, stopAll } from './audio/synth.ts';
import type { Problem } from './engine/types.ts';
import { load, merge } from './store.ts';
import { app, clockText, h, header, nav, pct, toast } from './ui/dom.ts';
import { pianoKeys } from './ui/keyboard.ts';
import { solve } from './ui/dictation.ts';
import { startMatch, startPlacement } from './ui/match.ts';
import { skillsScreen } from './ui/skills.ts';

// ───────── 홈 ─────────

function home() {
  stopAll();
  setCounting(false);
  const d = load();
  const today = dayKey(new Date());
  const secs = d.seconds[today] ?? 0;
  const st = streak(d.attempts, d.seconds, today);
  const review = reviewIds(d.attempts).filter((id) => findProblem(id));
  const p = computeProgress(d.attempts);
  const lv = Math.min(p.level, MAX_LEVEL);
  const inLevel = SKILLS.filter((s) => s.level === lv);
  const masteredIn = inLevel.filter((s) => p.skills[s.id].mastered).length;
  const due = SKILLS.filter((s) => isDue(p, s.id, today)).length;
  // 대련: 배치고사를 끝까지 본 적이 없으면 배치고사부터(중간에 그만뒀거나, 받아쓰기 사다리가 바뀌기 전에 봤으면 다시)
  const fresh = !p.placed;
  const plan = planMatch(p, today);
  const mins = Math.round(plan.reduce((a, s) => a + EST[s.track], 0) / 60);
  const reviews = plan.filter((s) => s.role === 'review').length;
  const matchSub = fresh
    ? '배치고사로 내 레벨부터 찾아요 · 약 10분'
    : `약 ${mins}분 · ${plan.length}문항` + (reviews ? ` · 망각 점검 ${reviews}` : '') + (plan.some((s) => s.role === 'check') ? ' · 실력 확인' : '');

  app.replaceChildren(
    h('header', { class: 'home-head' },
      h('p', { class: 'eyebrow' }, 'Gawain · Ear Training'),
      h('h1', {}, '가웨인'),
    ),
    h('button', { class: 'level-row', onclick: skillsScreen },
      h('span', { class: 'lv' }, h('small', {}, 'Level'), h('b', {}, `${lv}`)),
      h('span', { class: 'lv-text' },
        h('strong', {}, p.level > MAX_LEVEL ? 'L0~L3 완료' : LEVELS[lv].name),
        h('span', {}, fresh ? '배치고사 전' : `${inLevel.length}단원 중 ${masteredIn} 숙달` + (due ? ` · 점검할 단원 ${due}` : '')),
        fresh ? '' : h('span', {}, TRACKS.map((t) => `${t.short} ${trackLevelText(p.trackLevels[t.id])}`).join(' · ')),
        h('div', { class: 'meter' }, h('i', { style: `width:${Math.round((masteredIn / inLevel.length) * 100)}%` })),
      ),
      h('em', { class: 'chev' }, '›'),
    ),
    card(fresh ? '배치고사' : '대련', matchSub, fresh ? startPlacement : startMatch, undefined, 'card match'),
    h('section', { class: 'today-panel' },
      ring(secs / GOAL_SECONDS, `${Math.floor(secs / 60)}`, '/ 10분'),
      h('div', { class: 'streak' },
        h('b', {}, `${st.days}`), h('span', {}, '일 연속'),
        h('small', {}, st.days ? `그중 10분 채운 날 ${st.goalDays}일` : '오늘 한 문제로 시작해요'),
      ),
    ),
    calendar(d, today),
    review.length
      ? card('오답 다시 풀기', `${review.length}문제 · 만점을 받으면 목록에서 빠져요`, () => startReview(), undefined, 'card review')
      : '',
    h('h2', { class: 'section' }, '자유 연습'),
    (() => {
      const ids = new Set(ALL.map((x) => x.id));
      const solved = new Set(d.attempts.filter((a) => ids.has(a.problemId)).map((a) => a.problemId)).size;
      return card('문제집', `${SETS.map((s) => s.name).join('·')} ${ALL.length}문제 · ${solved}문제 풀어 봄`, setsScreen, solved / ALL.length);
    })(),
    card('피아노 룸', '들은 멜로디를 바로 쳐 봐요 · 채점·기록 없음', pianoRoom),
    h('footer', { class: 'backup' },
      h('button', { onclick: exportRecords }, '기록 내보내기'),
      h('button', { onclick: importRecords }, '기록 불러오기'),
    ),
  );
}
nav.home = home;

/** 홈 카드 하나 */
function card(title: string, sub: string, onclick: () => void, progress?: number, cls = 'card') {
  const meter = progress === undefined ? '' : h('div', { class: 'meter' }, h('i', { style: `width:${Math.round(progress * 100)}%` }));
  return h('button', { class: cls, onclick }, h('strong', {}, title), h('em', { class: 'chev' }, '›'), h('span', {}, sub), meter);
}

/** 문제집: 2도~6도 고정 선율(기획 §7.1). 대련·단원 판정에 들어가지 않는 자유 연습 (기획 §M5.5) */
function setsScreen() {
  stopAll();
  setCounting(false);
  const d = load();
  const ids = new Set(ALL.map((x) => x.id));
  const solved = new Set(d.attempts.filter((a) => ids.has(a.problemId)).map((a) => a.problemId)).size;
  app.replaceChildren(
    header('문제집'),
    h('p', { class: 'info' }, '음정 크기별 고정 선율이에요. 대련 진도에는 들어가지 않아요.'),
    card('전체 섞어 풀기', `${ALL.length}문제 · ${solved}문제 풀어 봄`, () => startAll(), solved / ALL.length),
    ...SETS.map((s) => {
      const mine = d.attempts.filter((a) => a.problemId.startsWith(s.id + '-'));
      const solvedN = new Set(mine.map((a) => a.problemId)).size;
      const recent = mine.slice(-10);
      const avg = recent.length ? recent.reduce((t, a) => t + (a.pitchScore + a.rhythmScore) / 2, 0) / recent.length : null;
      const sub = `${solvedN} / ${s.problems.length} 풀어 봄` + (avg === null ? '' : ` · 최근 평균 ${pct(avg)}`);
      return card(`${s.name} 문제집`, sub, () => startSet(s.id), solvedN / s.problems.length);
    }),
  );
}

/** 피아노 룸: 건반만 있는 화면. 채점·기록이 없고 10분 목표 시간에도 넣지 않는다 */
function pianoRoom() {
  stopAll();
  setCounting(false);
  const keys = pianoKeys(playKey);
  app.replaceChildren(
    header('피아노 룸'),
    h('p', { class: 'info' }, '채점·기록 없음 · 위 띠를 끌어 음역 이동'),
    keys.strip,
    keys.keyboard,
  );
  keys.aim(60); // C4부터
}

/** 자유 연습 한 문제 */
const practice = (p: Problem, next: () => void) => solve(p, { next });

/** 오늘 목표 진행 링 */
function ring(progress: number, big: string, small: string) {
  const r = 34, c = 2 * Math.PI * r, p = Math.min(1, progress);
  const wrap = h('div', { class: 'ring' + (p >= 1 ? ' done' : '') });
  wrap.innerHTML = `<svg viewBox="0 0 80 80"><circle cx="40" cy="40" r="${r}" class="track"/><circle cx="40" cy="40" r="${r}" class="fill" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - p)}" transform="rotate(-90 40 40)"/></svg>`;
  wrap.append(h('div', { class: 'ring-label' }, h('b', {}, p >= 1 ? '✓' : big), h('span', {}, p >= 1 ? '10분 달성' : small)));
  return wrap;
}

/** 최근 5주 달력: 10분 채운 날 ● / 1문제 이상 ◐ / 안 함 빈칸 */
function calendar(d: ReturnType<typeof load>, today: string) {
  const [y, m, dd] = today.split('-').map(Number);
  const start = addDays(today, -(new Date(y, m - 1, dd).getDay() + 28));
  const grid = h('div', { class: 'cal' }, ...'일월화수목금토'.split('').map((w) => h('i', {}, w)));
  for (let i = 0; i < 35; i++) {
    const key = addDays(start, i);
    const future = key > today;
    const status = future ? 'future' : dayStatus(key, d.attempts, d.seconds);
    const part = status === 'some' ? Math.min(1, (d.seconds[key] ?? 0) / GOAL_SECONDS) : 0;
    grid.append(h('span', {
      class: `day ${status}${key === today ? ' today' : ''}`,
      style: status === 'some' ? `--part:${Math.max(0.12, part)}` : false,
      title: key,
    }, String(Number(key.slice(8)))));
  }
  return grid;
}

function startReview(last?: string) {
  const ids = reviewIds(load().attempts).filter((id) => findProblem(id) && id !== last);
  if (!ids.length) return home();
  const id = ids[Math.floor(Math.random() * ids.length)];
  practice(findProblem(id)!, () => startReview(id));
}

async function exportRecords() {
  const d = load();
  const file = new File([JSON.stringify({ app: 'gawain', version: 1, ...d })], `gawain-${dayKey(new Date())}.json`, { type: 'application/json' });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file] }); } catch { /* 공유 취소 */ }
    return;
  }
  const a = h('a', { href: URL.createObjectURL(file), download: file.name });
  a.click();
  URL.revokeObjectURL(a.getAttribute('href')!);
}

function importRecords() {
  const input = h('input', { type: 'file', accept: 'application/json,.json' }) as HTMLInputElement;
  input.onchange = async () => {
    try {
      const n = merge(JSON.parse(await input.files![0].text()));
      alert(`기록 ${n}개를 합쳤어요.`);
    } catch {
      alert('가웨인 기록 파일이 아니에요.');
    }
    home();
  };
  input.click();
}

/** 모든 문제집을 한 풀로 섞어 무작위로 낸다(직전 문제는 피함) */
const ALL = SETS.flatMap((s) => s.problems);
function startAll(last?: number) {
  const i = pickRandom(ALL.length, last, Math.random);
  practice(ALL[i], () => startAll(i));
}

/** 문제집에서 무작위로 낸다(직전 문제는 피함) */
function startSet(setId: string, last?: number) {
  const set = SETS.find((s) => s.id === setId)!;
  const i = pickRandom(set.problems.length, last, Math.random);
  practice(set.problems[i], () => startSet(setId, i));
}


startActivityClock((secs, reached) => {
  document.querySelectorAll('.clock').forEach((c) => (c.textContent = clockText(secs)));
  if (reached) toast('오늘 10분 달성!');
});

home();

if ('serviceWorker' in navigator && import.meta.env.PROD) navigator.serviceWorker.register('./sw.js');
