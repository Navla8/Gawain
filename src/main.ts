import './style.css';
import { TPB, type Note, type Problem } from './engine/types.ts';
import { SETS, pickRandom } from './engine/bank.ts';
import { generate } from './engine/generate.ts';
import { grade, type GradeItem, type GradeResult } from './engine/grade.ts';
import { barProblems } from './engine/score.ts';
import { noteName, solfa, KEY_NAMES } from './engine/theory.ts';
import { later, playKey, playNotes, playProblem, stopAll, unlockAudio } from './audio/synth.ts';
import { renderStaff } from './ui/staff.ts';
import { load, save } from './store.ts';

const app = document.getElementById('app')!;
const MAX_PLAYS = 5;
const KEY_LOW = 53, KEY_HIGH = 84; // 건반 F3~C6
const WHITE_NAMES = ['C', '', 'D', '', 'E', 'F', '', 'G', '', 'A', '', 'B'];

function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Record<string, unknown> = {}, ...kids: (Node | string)[]) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k.startsWith('on')) e.addEventListener(k.slice(2), v as EventListener);
    else if (k === 'class') e.className = String(v);
    else if (v !== false && v != null) e.setAttribute(k, v === true ? '' : String(v));
  }
  e.append(...kids);
  return e;
}

// ───────── 홈 ─────────

function home() {
  stopAll();
  const d = load();
  const today = new Date().toDateString();
  const solvedToday = d.attempts.filter((a) => new Date(a.at).toDateString() === today).length;
  const card = (title: string, sub: string, onclick: () => void, progress?: number) => {
    const meter = progress === undefined ? '' : h('div', { class: 'meter' }, h('i', { style: `width:${Math.round(progress * 100)}%` }));
    return h('button', { class: 'card', onclick }, h('strong', {}, title), h('em', { class: 'chev' }, '›'), h('span', {}, sub), meter);
  };
  app.replaceChildren(
    h('header', { class: 'home-head' },
      h('p', { class: 'eyebrow' }, 'Gawain · Ear Training'),
      h('h1', {}, '가웨인'),
      h('p', {}, '듣고, 적고, 맞춰 보기'),
    ),
    h('p', { class: 'today' }, `오늘 ${solvedToday}문제`),
    ...SETS.map((s) => {
      const solved = new Set(d.attempts.filter((a) => a.problemId.startsWith(s.id + '-')).map((a) => a.problemId)).size;
      return card(`${s.name} 문제집`, `${solved} / ${s.problems.length} 풀어 봄`, () => startSet(s.id), solved / s.problems.length);
    }),
    card('자동 생성', '도~솔 · 으뜸화음 도약', () => solve(generate(Math.floor(Math.random() * 1e9)), () => home())),
  );
}

/** 문제집에서 무작위로 낸다(직전 문제는 피함) */
function startSet(setId: string, last?: number) {
  const set = SETS.find((s) => s.id === setId)!;
  const i = pickRandom(set.problems.length, last, Math.random);
  solve(set.problems[i], () => startSet(setId, i));
}

// ───────── 문제 풀기 ─────────

const DURS: [string, number][] = [['온음표', 48], ['2분음표', 24], ['4분음표', 12], ['8분음표', 6], ['16분음표', 3]];

/** 길이 팔레트용 작은 음표 아이콘 */
function noteIcon(value: number): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 18 22');
  svg.setAttribute('class', 'icon');
  const hollow = value >= 24;
  const flags = value === 6 ? 1 : value === 3 ? 2 : 0;
  svg.innerHTML =
    `<ellipse cx="7" cy="17" rx="4.6" ry="3.3" transform="rotate(-20 7 17)" fill="${hollow ? 'none' : 'currentColor'}" stroke="currentColor" stroke-width="1.6"/>` +
    (value < 48 ? '<line x1="11.2" y1="16" x2="11.2" y2="2" stroke="currentColor" stroke-width="1.5"/>' : '') +
    Array.from({ length: flags }, (_, i) => `<path d="M11.2 ${2 + i * 4.5} q1.5 4.5 5.5 6.5" fill="none" stroke="currentColor" stroke-width="1.6"/>`).join('');
  return svg;
}

function solve(p: Problem, next: () => void, initial: Note[] = []) {
  stopAll();
  const started = Date.now();
  let notes: Note[] = initial.map((n) => ({ ...n }));
  let cursor = notes.length;
  let selected: number | null = null;
  let base = 12, dotted = false, triplet = false;
  let plays = MAX_PLAYS;
  const history: Note[][] = [];

  const dur = () => {
    let d = base * (dotted ? 1.5 : 1) * (triplet ? 2 / 3 : 1);
    if (!Number.isInteger(d)) d = base * (triplet ? 2 / 3 : 1);
    return d;
  };
  const edit = (fn: () => void) => {
    history.push(notes.map((n) => ({ ...n })));
    fn();
    draw();
  };

  const staffBox = h('div', { class: 'staff-box' });
  const status = h('p', { class: 'status' });
  let playing = false;
  const playBtn = h('button', { class: 'play', onclick: () => (playing ? stop() : listen(true)) });
  const quickBtn = h('button', { class: 'ghost', onclick: () => (playing ? stop() : listen(false)) }, '음계 없이');
  const palette = h('div', { class: 'palette' });

  /** 음계 → 준비박 → 메트로놈과 선율. 음계 없이 듣기는 재생 횟수를 쓰지 않는다 */
  function listen(withScale: boolean) {
    unlockAudio();
    if (withScale) {
      if (plays <= 0) return;
      plays--;
    }
    const sec = playProblem(p.notes, p.tonic, p.beatsPerBar, p.tempo, withScale, p.minor);
    playing = true;
    later(sec + 0.3, () => { playing = false; draw(); });
    draw();
  }

  function stop() {
    stopAll();
    playing = false;
    draw();
  }

  function input(midi: number | null) {
    if (midi !== null) playKey(midi);
    edit(() => {
      if (selected !== null) notes[selected].midi = midi;
      else {
        notes.splice(cursor, 0, { midi, dur: dur() });
        cursor++;
      }
    });
  }

  function draw() {
    playBtn.replaceChildren(...(playing ? ['■  정지'] : plays > 0 ? ['▶  듣기', h('span', { class: 'count' }, `${plays}`)] : ['재생 횟수를 다 썼어요']));
    playBtn.toggleAttribute('disabled', !playing && plays <= 0);
    playBtn.classList.toggle('stop', playing);
    quickBtn.toggleAttribute('disabled', playing);
    const svg = renderStaff({
      notes, fifths: p.fifths, beatsPerBar: p.beatsPerBar, bars: p.bars, cursor, selected,
      onTap: (i) => {
        selected = selected === i ? null : i;
        cursor = i + 1;
        if (selected !== null && notes[i].midi !== null) playKey(notes[i].midi!);
        draw();
      },
    });
    staffBox.replaceChildren(svg);
    const cx = svg.querySelector('.cursor')?.getAttribute('x');
    if (cx) staffBox.scrollLeft = Math.max(0, Number(cx) - staffBox.clientWidth + 60);

    const used = notes.reduce((t, n) => t + n.dur, 0);
    const len = p.beatsPerBar * TPB;
    status.textContent = selected !== null
      ? `${selected + 1}번째 음 선택됨 · 건반·길이를 누르면 바뀌어요`
      : used >= p.bars * len
        ? (used > p.bars * len ? `${p.bars}마디를 넘었어요` : `${p.bars}마디를 다 적었어요`)
        : `${Math.floor(used / len) + 1}마디 ${+((used % len) / TPB + 1).toFixed(2)}박째`;

    const toggle = (label: Node | string, on: boolean, onclick: () => void, title?: string) =>
      h('button', { class: on ? 'on' : '', onclick, 'aria-label': title ?? false }, label);
    const setDur = (fn: () => void) => () => { fn(); if (selected !== null) edit(() => (notes[selected!].dur = dur())); else draw(); };
    const at = () => selected ?? cursor - 1;
    palette.replaceChildren(
      h('div', { class: 'row' },
        h('div', { class: 'seg' }, ...DURS.map(([label, v]) => toggle(noteIcon(v), base === v, setDur(() => (base = v)), label))),
        h('div', { class: 'seg mods' },
          toggle('점', dotted, setDur(() => (dotted = !dotted))),
          toggle('3잇단', triplet, setDur(() => (triplet = !triplet))),
        ),
      ),
      h('div', { class: 'row tools' },
        h('button', { onclick: () => input(null) }, '쉼표'),
        toggle('붙임줄', !!notes[at()]?.tie, () => { const i = at(); if (notes[i]) edit(() => (notes[i].tie = !notes[i].tie)); }),
        h('button', { 'aria-label': '왼쪽', onclick: () => { selected = null; cursor = Math.max(0, cursor - 1); draw(); } }, '←'),
        h('button', { 'aria-label': '오른쪽', onclick: () => { selected = null; cursor = Math.min(notes.length, cursor + 1); draw(); } }, '→'),
        h('button', { 'aria-label': '지우기', onclick: () => edit(() => {
          const i = at();
          if (i < 0) return;
          notes.splice(i, 1);
          cursor = i;
          selected = null;
        }) }, '⌫'),
        h('button', { 'aria-label': '되돌리기', onclick: () => { if (history.length) { notes = history.pop()!; cursor = Math.min(cursor, notes.length); selected = null; draw(); } } }, '↶'),
      ),
    );
  }

  function submit() {
    const bad = barProblems(notes, p.beatsPerBar, p.bars);
    if (bad.length && !confirm(`${bad.join(', ')}마디의 박 수가 맞지 않아요. 그대로 제출할까요?`)) return;
    stopAll();
    const r = grade(p.notes, notes);
    save((d) => d.attempts.push({
      at: new Date().toISOString(), problemId: p.id, answer: notes, pitchScore: r.pitchScore, rhythmScore: r.rhythmScore,
      plays: MAX_PLAYS - plays, seconds: Math.round((Date.now() - started) / 1000),
    }));
    result(p, notes, r, next);
  }

  // 건반. 건반 위를 쓸어도 스크롤되지 않고, 위쪽 띠를 끌어야 스크롤된다(누르려다 밀리는 것 방지)
  const keyboard = h('div', { class: 'keyboard' });
  const whites = h('div', { class: 'whites' });
  const strip = h('div', { class: 'strip', 'aria-label': '건반 이동' });
  const thumb = h('div', { class: 'thumb' });
  for (let m = KEY_LOW; m <= KEY_HIGH; m++) {
    const black = [1, 3, 6, 8, 10].includes(m % 12);
    const key = h('button', {
      class: black ? 'key black' : m % 12 === 0 ? 'key white c' : 'key white',
      'data-midi': m,
      onpointerdown: (e: PointerEvent) => { e.preventDefault(); input(m); },
    }, m % 12 === 0 ? `C${m / 12 - 1}` : WHITE_NAMES[m % 12]);
    if (black) whites.lastElementChild!.append(key);
    else {
      whites.append(h('div', { class: 'wkey' }, key));
      strip.append(h('span', {}, m % 12 === 0 ? `C${m / 12 - 1}` : ''));
    }
  }
  keyboard.append(whites);
  strip.append(thumb);
  const syncThumb = () => {
    const ratio = strip.clientWidth / keyboard.scrollWidth;
    thumb.style.left = `${keyboard.scrollLeft * ratio}px`;
    thumb.style.width = `${keyboard.clientWidth * ratio}px`;
  };
  keyboard.addEventListener('scroll', syncThumb);
  strip.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    try { strip.setPointerCapture(e.pointerId); } catch { /* 합성 이벤트 등 */ }
    const ratio = keyboard.scrollWidth / strip.clientWidth;
    const rect = strip.getBoundingClientRect();
    // 띠를 누른 곳이 보이는 영역 가운데가 되도록 옮긴 뒤, 끄는 만큼 따라간다
    const center = (x: number) => (keyboard.scrollLeft = (x - rect.left) * ratio - keyboard.clientWidth / 2);
    center(e.clientX);
    const move = (ev: PointerEvent) => center(ev.clientX);
    const up = () => { strip.removeEventListener('pointermove', move); strip.removeEventListener('pointerup', up); };
    strip.addEventListener('pointermove', move);
    strip.addEventListener('pointerup', up);
  });

  const first = p.notes.find((n) => n.midi !== null)!.midi!;
  app.replaceChildren(
    h('header', { class: 'bar' },
      h('button', { class: 'back', onclick: home, 'aria-label': '홈' }, '‹'),
      h('span', { class: 'title' }, p.title),
    ),
    h('p', { class: 'info' }, `${KEY_NAMES[p.fifths]} 장조 · ${p.beatsPerBar}/4 · ${p.bars}마디 · 첫 음 ${solfa(first, p.tonic, p.fifths)} ${noteName(first, p.fifths)}`),
    h('div', { class: 'listen' }, playBtn, quickBtn),
    staffBox,
    status,
    palette,
    strip,
    keyboard,
    h('button', { class: 'submit', onclick: submit }, '제출'),
  );
  draw();
  // 건반을 문제 음역 가운데로
  const target = keyboard.querySelector(`[data-midi="${Math.max(KEY_LOW, first - 5)}"]`) as HTMLElement | null;
  if (target) keyboard.scrollLeft = target.closest('.wkey')!.getBoundingClientRect().left - keyboard.getBoundingClientRect().left;
  syncThumb();
}

// ───────── 결과 ─────────

const DUR_NAMES: Record<number, string> = {
  48: '온음표', 36: '점2분', 24: '2분', 18: '점4분', 12: '4분', 9: '점8분', 6: '8분', 3: '16분', 16: '셋잇단 2분', 8: '셋잇단 4분', 4: '셋잇단 8분', 2: '셋잇단 16분',
};
const durName = (t: number) => DUR_NAMES[t] ?? `${+(t / TPB).toFixed(2)}박`;
const COLORS: Record<string, string> = { ok: 'var(--ok)', pitch: 'var(--bad)', rhythm: 'var(--warn)', both: 'var(--bad)', extra: 'var(--muted)', missing: 'var(--bad)' };
const MARKS: Record<string, string> = { ok: '✓', pitch: '음', rhythm: '박', both: '음박', extra: '+', missing: '빠짐' };

function result(p: Problem, answer: Note[], r: GradeResult, next: () => void) {
  const len = p.beatsPerBar * TPB;
  const name = (m: number | null) => (m === null ? '쉼표' : `${solfa(m, p.tonic, p.fifths)}(${noteName(m, p.fifths)})`);
  const bySrc = (pick: (i: GradeItem) => GradeItem['truth']) => {
    const map = new Map<number, GradeItem>();
    for (const it of r.items) pick(it)?.src.forEach((s) => map.set(s, it));
    return map;
  };
  const ansMap = bySrc((i) => i.answer), truthMap = bySrc((i) => i.truth);

  const mine = renderStaff({
    notes: answer, fifths: p.fifths, beatsPerBar: p.beatsPerBar, bars: p.bars,
    color: (s) => COLORS[ansMap.get(s)?.verdict ?? 'extra'],
    label: (s) => { const v = ansMap.get(s)!; return v ? MARKS[v.verdict] + (v.octave ? '8' : '') : ''; },
  });
  const truth = renderStaff({
    notes: p.notes, fifths: p.fifths, beatsPerBar: p.beatsPerBar, bars: p.bars,
    color: (s) => (truthMap.get(s)?.verdict === 'ok' ? undefined : COLORS[truthMap.get(s)?.verdict ?? 'ok']),
    label: (s) => (truthMap.get(s)?.verdict === 'ok' ? '' : p.notes[s].midi === null ? '쉼' : solfa(p.notes[s].midi!, p.tonic, p.fifths)),
  });

  // 같은 마디만 정답 → 내 답 순서로 들려준다
  const barNotes = (ns: Note[], b: number): Note[] => {
    const out: Note[] = [];
    let t = 0;
    for (const n of ns) {
      const s = Math.max(t, b * len), e = Math.min(t + n.dur, (b + 1) * len);
      if (e > s) out.push({ midi: n.midi, dur: e - s });
      t += n.dur;
    }
    return out;
  };
  const compare = (b: number) => {
    stopAll();
    const t = playNotes(barNotes(p.notes, b), p.tempo);
    later(t + 0.7, () => playNotes(barNotes(answer, b), p.tempo));
  };

  const errors = r.items.filter((i) => i.verdict !== 'ok').map((i) => {
    const ev = (i.truth ?? i.answer)!;
    const b = Math.min(p.bars - 1, Math.floor(ev.start / len));
    const t = i.truth, a = i.answer;
    const text = i.verdict === 'missing' ? `빠진 음: ${name(t!.midi)} ${durName(t!.dur)}`
      : i.verdict === 'extra' ? `남는 음: ${name(a!.midi)} ${durName(a!.dur)}`
      : [
        i.verdict !== 'rhythm' && `${name(a!.midi)} → ${name(t!.midi)}${i.octave ? ' (옥타브)' : ''}`,
        i.verdict !== 'pitch' && `${durName(a!.dur)} → ${durName(t!.dur)}`,
      ].filter(Boolean).join(' · ') + '여야 해요';
    return h('li', {}, h('button', { class: 'mini', onclick: () => compare(b) }, `▶ ${b + 1}마디`), h('span', {}, text));
  });

  const pct = (x: number) => `${Math.round(x * 100)}%`;
  const perfect = r.pitchScore === 1 && r.rhythmScore === 1;
  app.replaceChildren(
    h('header', { class: 'bar' }, h('button', { class: 'back', onclick: home, 'aria-label': '홈' }, '‹'), h('span', { class: 'title' }, p.title)),
    h('div', { class: 'scores' + (perfect ? ' perfect' : '') },
      h('div', {}, h('b', {}, pct(r.pitchScore)), h('span', {}, '음높이')),
      h('div', {}, h('b', {}, pct(r.rhythmScore)), h('span', {}, '리듬')),
    ),
    h('h2', {}, '내 답'), h('div', { class: 'staff-box' }, mine),
    h('h2', {}, '정답'), h('div', { class: 'staff-box' }, truth),
    h('p', { class: 'legend' }, '✓ 맞음 · 음 음높이 틀림 · 박 리듬 틀림 · + 남는 음 · 빠짐 빠진 음 · 8 옥타브만 틀림'),
    errors.length ? h('ul', { class: 'errors' }, ...errors) : h('p', { class: 'great' }, '완벽해요!'),
    h('div', { class: 'actions' },
      h('button', { onclick: () => { stopAll(); playNotes(p.notes, p.tempo); } }, '정답 듣기'),
      h('button', { onclick: () => { stopAll(); playNotes(answer, p.tempo); } }, '내 답 듣기'),
      h('button', { class: 'stop-all', onclick: stopAll }, '■  정지'),
      h('button', { class: 'half', onclick: () => solve(p, next, answer) }, '고쳐 보기'),
      h('button', { class: 'half', onclick: () => solve(p, next) }, '처음부터'),
      h('button', { class: 'primary', onclick: next }, '다음 문제'),
    ),
  );
  // 결과 악보는 한눈에 비교하도록 화면 폭에 맞춰 줄인다(최소 65%)
  for (const svg of [mine, truth]) {
    const natural = Number(svg.getAttribute('width'));
    const box = svg.parentElement!.clientWidth - 2;
    if (natural > box) svg.style.width = `${Math.max(box, natural * 0.65)}px`;
    svg.style.height = 'auto';
  }
  if (perfect) playNotes([{ midi: p.tonic + 12, dur: 3 }, { midi: p.tonic + 19, dur: 3 }, { midi: p.tonic + 24, dur: 12 }], 120);
}

home();

if ('serviceWorker' in navigator && import.meta.env.PROD) navigator.serviceWorker.register('./sw.js');
