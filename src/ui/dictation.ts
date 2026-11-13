import { TPB, barTicks, timeSignature, type Note, type Problem } from '../engine/types.ts';
import { grade, type GradeItem, type GradeResult } from '../engine/grade.ts';
import { barProblems } from '../engine/score.ts';
import { noteName, solfa, keyName } from '../engine/theory.ts';
import { passed } from '../engine/progress.ts';
import { later, playKey, playNotes, playProblem, playScale, stopAll } from '../audio/synth.ts';
import { setCounting, touch } from '../activity.ts';
import { renderStaff } from './staff.ts';
import { record } from '../store.ts';
import { app, h, header, pct } from './dom.ts';
import { pianoKeys } from './keyboard.ts';

// 선율 받아쓰기와 리듬 받아쓰기 화면 (기획 §3, §5, M3)

export interface ItemCtx {
  /** 다음 문항으로 */
  next: () => void;
  /** 대련·배치고사 단원. 있으면 시도에 단원을 남긴다 */
  skill?: string;
  placement?: boolean;
  /** 머리줄 진행 [지금, 전체] */
  step?: [number, number];
  /** 채점 직후 통과 여부를 알린다 */
  onGraded?: (ok: boolean) => void;
  /** 리듬만 받아쓰기: 건반 대신 치기 버튼, 리듬만 채점 */
  rhythm?: boolean;
}

const MAX_PLAYS = 5;
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

const meterText = (p: Problem) => timeSignature(p).join('/');

/** 리듬 받아쓰기 점수: 쉼표 자리에 음표(채점기의 '음높이 틀림')도 리듬 틀림으로 친다 */
const rhythmOnlyScore = (r: GradeResult) => {
  const truth = r.items.filter((i) => i.truth).length;
  return truth ? r.items.filter((i) => i.verdict === 'ok').length / truth : 1;
};

export function solve(p: Problem, ctx: ItemCtx, initial: Note[] = []) {
  stopAll();
  setCounting(true);
  const started = Date.now();
  const rhythm = !!ctx.rhythm;
  const pitch = rhythm ? p.notes.find((n) => n.midi !== null)!.midi! : 0;
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
  const playBtn = h('button', { class: 'play', onclick: () => (playing ? stop() : listen()) });
  const scaleBtn = rhythm ? '' : h('button', { class: 'ghost', onclick: () => run(playScale(p.tonic, p.minor)) }, '음계 듣기');
  const palette = h('div', { class: 'palette' });

  /** 준비박 → 메트로놈과 선율. 첫 재생만 음계를 먼저 친다(리듬은 음계 없음) */
  function listen() {
    if (plays <= 0) return;
    const withScale = plays === MAX_PLAYS && !rhythm;
    plays--;
    run(playProblem(p, withScale));
  }

  /** sec초 동안 재생 중 상태로 둔다 */
  function run(sec: number) {
    playing = true;
    later(sec + 0.3, () => { playing = false; touch(); draw(); });
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
        dotted = false; // 점음표는 연달아 찍는 일이 드물어 한 번 쓰면 풀린다
      }
    });
  }

  const len = barTicks(p);
  function draw() {
    playBtn.replaceChildren(...(playing ? ['■  정지'] : plays > 0 ? ['▶  듣기', h('span', { class: 'count' }, `${plays}`)] : ['재생 횟수를 다 썼어요']));
    playBtn.toggleAttribute('disabled', !playing && plays <= 0);
    playBtn.classList.toggle('stop', playing);
    if (scaleBtn) scaleBtn.toggleAttribute('disabled', playing);
    const svg = renderStaff({
      notes, fifths: p.fifths, beatsPerBar: p.beatsPerBar, beatTicks: p.beatTicks, bars: p.bars, cursor, selected, solfege: !rhythm,
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
    const beat = p.beatTicks ?? TPB;
    status.textContent = selected !== null
      ? `${selected + 1}번째 음 선택됨 · ${rhythm ? '' : '건반·'}길이를 누르면 바뀌어요`
      : used >= p.bars * len
        ? (used > p.bars * len ? `${p.bars}마디를 넘었어요` : `${p.bars}마디를 다 적었어요`)
        : `${Math.floor(used / len) + 1}마디 ${+((used % len) / beat + 1).toFixed(2)}박째`;

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

  function finish(answer: Note[], r: GradeResult) {
    stopAll();
    const pitchScore = rhythm ? 1 : r.pitchScore;
    const rhythmScore = rhythm ? rhythmOnlyScore(r) : r.rhythmScore;
    record({
      at: new Date().toISOString(), problemId: p.id, answer, pitchScore, rhythmScore,
      plays: MAX_PLAYS - plays, seconds: Math.round((Date.now() - started) / 1000),
      ...(ctx.skill && { skill: ctx.skill }), ...(ctx.placement && { placement: true }),
    });
    ctx.onGraded?.(passed({ pitchScore, rhythmScore }));
    result(p, answer, r, ctx);
  }

  function submit() {
    const bad = barProblems(notes, len, p.bars);
    if (bad.length && !confirm(`${bad.join(', ')}마디의 박 수가 맞지 않아요. 그대로 제출할까요?`)) return;
    finish(notes, grade(p.notes, notes));
  }

  /** 배치고사에서 모르는 문항은 0점으로 넘긴다 */
  function giveUp() {
    finish([], grade(p.notes, []));
  }

  // 입력: 선율은 건반, 리듬은 치기 버튼
  let pad: HTMLElement[];
  let aim = () => {};
  if (rhythm) {
    pad = [h('div', { class: 'tap-pad' },
      h('button', { class: 'tap', onpointerdown: (e: PointerEvent) => { e.preventDefault(); input(pitch); } }, '♩  음표'),
      h('button', { class: 'tap rest', onclick: () => input(null) }, '쉼표'),
    )];
  } else {
    const keys = pianoKeys(input);
    pad = [keys.strip, keys.keyboard];
    // 건반을 문제 음역 가운데로
    aim = () => keys.aim(p.notes.find((n) => n.midi !== null)!.midi! - 5);
  }

  const first = p.notes.find((n) => n.midi !== null)!.midi!;
  app.replaceChildren(
    header(p.title, ctx.step),
    h('p', { class: 'info' }, rhythm
      ? `${meterText(p)} · ${p.bars}마디 · 리듬만 적어요`
      : `${keyName(p)} · ${meterText(p)} · ${p.bars}마디 · 첫 음 ${solfa(first, p.fifths)} ${noteName(first, p.fifths)}`),
    h('div', { class: 'listen' }, playBtn, scaleBtn),
    staffBox,
    status,
    palette,
    ...pad,
    h('div', { class: 'submit-row' },
      ctx.placement ? h('button', { class: 'ghost', onclick: giveUp }, '모르겠어요') : '',
      h('button', { class: 'submit', onclick: submit }, '제출'),
    ),
  );
  draw();
  aim();
}

// ───────── 결과 ─────────

const DUR_NAMES: Record<number, string> = {
  48: '온음표', 36: '점2분', 24: '2분', 18: '점4분', 12: '4분', 9: '점8분', 6: '8분', 3: '16분', 16: '셋잇단 2분', 8: '셋잇단 4분', 4: '셋잇단 8분', 2: '셋잇단 16분',
};
const durName = (t: number) => DUR_NAMES[t] ?? `${+(t / TPB).toFixed(2)}박`;
const COLORS: Record<string, string> = { ok: 'var(--accent)', pitch: 'var(--signal-danger)', rhythm: 'var(--signal-caution)', both: 'var(--signal-danger)', extra: 'var(--muted)', missing: 'var(--signal-danger)' };
const MARKS: Record<string, string> = { ok: '✓', pitch: '음', rhythm: '박', both: '음박', extra: '+', missing: '빠짐' };

function result(p: Problem, answer: Note[], r: GradeResult, ctx: ItemCtx) {
  setCounting(true);
  const rhythm = !!ctx.rhythm;
  const len = barTicks(p);
  const name = (m: number | null) => (m === null ? '쉼표' : rhythm ? '음표' : `${solfa(m, p.fifths)}(${noteName(m, p.fifths)})`);
  const bySrc = (pick: (i: GradeItem) => GradeItem['truth']) => {
    const map = new Map<number, GradeItem>();
    for (const it of r.items) pick(it)?.src.forEach((s) => map.set(s, it));
    return map;
  };
  const ansMap = bySrc((i) => i.answer), truthMap = bySrc((i) => i.truth);
  const staff = { fifths: p.fifths, beatsPerBar: p.beatsPerBar, beatTicks: p.beatTicks, bars: p.bars, solfege: !rhythm };

  const mine = renderStaff({
    ...staff, notes: answer,
    color: (s) => COLORS[ansMap.get(s)?.verdict ?? 'extra'],
    label: (s) => { const v = ansMap.get(s)!; return v ? (rhythm && v.verdict === 'pitch' ? '쉼' : MARKS[v.verdict]) + (v.octave ? '8' : '') : ''; },
  });
  const truth = renderStaff({
    ...staff, notes: p.notes,
    color: (s) => (truthMap.get(s)?.verdict === 'ok' ? undefined : COLORS[truthMap.get(s)?.verdict ?? 'ok']),
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

  const pitchScore = rhythm ? 1 : r.pitchScore;
  const rhythmScore = rhythm ? rhythmOnlyScore(r) : r.rhythmScore;
  const perfect = pitchScore === 1 && rhythmScore === 1;
  const ok = passed({ pitchScore, rhythmScore });
  // 다시 풀기는 연습으로만 남긴다(답을 본 뒤라 단원 판정에 넣지 않음)
  const practice: ItemCtx = { ...ctx, skill: undefined, placement: undefined, onGraded: undefined };
  app.replaceChildren(
    header(p.title, ctx.step),
    h('div', { class: 'scores' + (perfect ? ' perfect' : '') },
      rhythm ? '' : h('div', {}, h('b', {}, pct(r.pitchScore)), h('span', {}, '음높이')),
      h('div', {}, h('b', {}, pct(rhythmScore)), h('span', {}, '리듬')),
    ),
    ctx.skill ? h('p', { class: 'verdict' + (ok ? ' ok' : '') }, ok ? '통과' : '80%에 못 미쳤어요', ctx.placement ? '' : h('span', {}, ok ? '' : ' · 이 단원을 더 연습해요')) : '',
    h('h2', {}, '내 답'), h('div', { class: 'staff-box' }, mine),
    h('h2', {}, '정답'), h('div', { class: 'staff-box' }, truth),
    h('p', { class: 'legend' },
      h('span', { class: 'ok' }, '●'), ' ✓ 맞음 · ',
      ...(rhythm ? [] : [h('span', { class: 'danger' }, '●'), ' 음 음높이 틀림 · ']),
      h('span', { class: 'caution' }, '●'), ' 박 리듬 틀림 · + 남는 음 · 빠짐 빠진 음', rhythm ? '' : ' · 8 옥타브만 틀림'),
    errors.length ? h('ul', { class: 'errors' }, ...errors) : h('p', { class: 'great' }, '완벽해요!'),
    h('div', { class: 'actions' },
      h('button', { onclick: () => { stopAll(); playNotes(p.notes, p.tempo); } }, '정답 듣기'),
      h('button', { onclick: () => { stopAll(); playNotes(answer, p.tempo); } }, '내 답 듣기'),
      h('button', { class: 'stop-all', onclick: stopAll }, '■  정지'),
      h('button', { class: 'half', onclick: () => solve(p, practice, answer) }, '고쳐 보기'),
      h('button', { class: 'half', onclick: () => solve(p, practice) }, '처음부터'),
      h('button', { class: 'primary', onclick: ctx.next }, ctx.step && ctx.step[0] >= ctx.step[1] ? '결과 보기' : '다음 문제'),
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
