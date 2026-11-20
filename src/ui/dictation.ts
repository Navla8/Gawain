import { TPB, barTicks, timeSignature, type Note, type Problem } from '../engine/types.ts';
import type { Track } from '../engine/curriculum.ts';
import { durName, grade, inheritSpell, sliceBars, tally, missTags, type GradeItem, type GradeResult } from '../engine/grade.ts';
import { barProblems } from '../engine/score.ts';
import { noteName, solfa, keyName } from '../engine/theory.ts';
import { passed } from '../engine/progress.ts';
import { later, playCadence, playKey, playNotes, playProblem, stopAll } from '../audio/synth.ts';
import { setCounting, touch } from '../activity.ts';
import { renderStaff } from './staff.ts';
import { keyRead, record, settings } from '../store.ts';
import { app, h, header, pct } from './dom.ts';
import { KEY_LOW, pianoKeys } from './keyboard.ts';
import { nextTip, tipLine } from './tips.ts';

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
  /** 재생 횟수(없으면 기본). 숙달한 단원의 점검은 실전 조건으로 줄인다(기획 §M6.3) */
  plays?: number;
  /** 대련에 다시 나온 지난 오답(숙달 판정에서 뺀다) */
  retry?: boolean;
  /** 결과 화면에서 정답을 본 직후의 '고쳐 보기'·'처음부터' 시도(오답 풀을 비우지 않음) */
  fix?: boolean;
  /** 실전 조건(기획 §M6.3, §M7.3): 선율 중 메트로놈과 건반 소리를 끈다 */
  exam?: boolean;
  /** 머리줄 뒤로 가기(없으면 홈). 실력 화면에서 연 단원 풀기는 실력 화면으로 */
  back?: () => void;
  /** 추출 청취(기획 §M10.2): 전체 선율을 듣되 이 마디 구간 [시작, 끝)(0부터)만 받아적는다 */
  extract?: [number, number];
  /** 풀이·결과 요령 유형(기본: rhythm 또는 dictation) */
  tipTrack?: Track;
  /** 단원 소개(맛보기) 시도: intro: true로 기록하고 숙달·오답 풀·레벨에서 뺀다(기획 §M12.1) */
  intro?: boolean;
  /** 맛보기 상단 안내(예: 첫 문제 정답 미리 듣기) */
  introCue?: HTMLElement;
  /** 맛보기에서 틀렸을 때 같은 문제를 다시 풀기 */
  retrySame?: () => void;
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

/** 2성부를 함께 친다. 길이(초)를 돌려준다 */
const playVoices = (vs: Note[][], tempo: number) => Math.max(...vs.map((v) => playNotes(v, tempo)));

export function solve(p: Problem, ctx: ItemCtx, initial: Note[] = [], initialBass: Note[] = []) {
  stopAll();
  setCounting(true);
  const started = Date.now();
  const rhythm = !!ctx.rhythm;
  const pitch = rhythm ? p.notes.find((n) => n.midi !== null)!.midi! : 0;
  // 2성부(기획 §M7.6): 성부마다 음표 목록. notes는 지금 적는 성부(v)
  const two = !!p.bass;
  const voices: Note[][] = [initial.map((n) => ({ ...n })), initialBass.map((n) => ({ ...n }))];
  let v = 0;
  let notes: Note[] = voices[0];
  let cursor = notes.length;
  let selected: number | null = null;
  let base = 12, dotted = false, triplet = false;
  const maxPlays = ctx.intro ? Infinity : Math.min(ctx.plays ?? MAX_PLAYS, p.plays ?? MAX_PLAYS);
  let plays = maxPlays;
  let playCount = 0;
  const set = settings();
  const melodyClick = set.melodyClick && !ctx.exam;
  // 리듬 치기 버튼은 음높이가 없어 소리를 그대로 둔다
  const keySound = rhythm || (set.keySound && !ctx.exam);
  const history: [number, Note[]][] = [];

  const dur = () => {
    let d = base * (dotted ? 1.5 : 1) * (triplet ? 2 / 3 : 1);
    if (!Number.isInteger(d)) d = base * (triplet ? 2 / 3 : 1);
    return d;
  };
  const edit = (fn: () => void) => {
    history.push([v, notes.map((n) => ({ ...n }))]);
    fn();
    voices[v] = notes;
    draw();
  };
  /** 적을 성부를 바꾼다 */
  const switchTo = (to: number) => {
    voices[v] = notes;
    v = to;
    notes = voices[v];
    cursor = notes.length;
    selected = null;
    aim();
  };

  const staffBox = h('div', { class: 'staff-box' });
  const status = h('p', { class: 'status' });
  let playing = false;
  const playBtn = h('button', { class: 'play', onclick: () => (playing ? stop() : listen()) });
  const scaleBtn = rhythm ? '' : h('button', { class: 'ghost', onclick: () => run(playCadence(p.tonic, p.minor)) }, '카덴츠 듣기');
  const palette = h('div', { class: 'palette' });

  /** 준비박 → 메트로놈과 선율. 첫 재생만 카덴츠를 먼저 친다(리듬은 카덴츠 없음) */
  function listen() {
    if (plays <= 0) return;
    const withCadence = playCount === 0 && !rhythm;
    playCount++;
    if (Number.isFinite(plays)) plays--;
    run(playProblem(p, withCadence, melodyClick));
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
    if (midi !== null && keySound) playKey(midi);
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
  const offset = p.pickup ? len - p.pickup : 0;
  const extract = ctx.extract ?? p.extract;
  const startBar = extract ? extract[0] : 0;
  const targetBars = extract ? extract[1] - extract[0] : p.bars;
  const targetNotes = extract ? sliceBars(p.notes, len, extract[0], extract[1]) : p.notes;
  const tipTrack: Track = ctx.tipTrack ?? (rhythm ? 'rhythm' : 'dictation');
  function draw() {
    playBtn.replaceChildren(...(playing ? ['■  정지'] : plays > 0 ? ['▶  듣기', ...(Number.isFinite(plays) ? [h('span', { class: 'count' }, `${plays}`)] : [])] : ['재생 횟수를 다 썼어요']));
    playBtn.toggleAttribute('disabled', !playing && plays <= 0);
    playBtn.classList.toggle('stop', playing);
    if (scaleBtn) scaleBtn.toggleAttribute('disabled', playing);
    const staffOf = (vi: number) => renderStaff({
      notes: vi === v ? notes : voices[vi], fifths: p.fifths, beatsPerBar: p.beatsPerBar, beatTicks: p.beatTicks, bars: targetBars, pickup: p.pickup,
      clef: vi === 1 ? 'bass' : p.clef, solfege: !rhythm, key: keyRead(p), takadimi: true,
      ...(vi === v && { cursor, selected }),
      onTap: (i) => {
        if (vi !== v) switchTo(vi);
        selected = selected === i ? null : i;
        cursor = i + 1;
        if (selected !== null && notes[i].midi !== null && keySound) playKey(notes[i].midi!);
        draw();
      },
    });
    const svgs = two ? [staffOf(0), staffOf(1)] : [staffOf(0)];
    const svg = svgs[v];
    staffBox.replaceChildren(...svgs);
    staffBox.classList.toggle('two', two);
    voiceRow.replaceChildren(...(two ? ['위 성부', '아래 성부'].map((label, i) => h('button', { class: i === v ? 'on' : '', onclick: () => { switchTo(i); draw(); } }, label)) : []));
    const cx = svg.querySelector('.cursor')?.getAttribute('x');
    if (cx) staffBox.scrollLeft = Math.max(0, Number(cx) - staffBox.clientWidth + 60);

    const used = notes.reduce((t, n) => t + n.dur, 0);
    const beat = p.beatTicks ?? TPB;
    const rangeLabel = extract ? `${extract[0] + 1}~${extract[1]}마디` : `${p.bars}마디`;
    status.textContent = (two ? (v ? '아래 성부 · ' : '위 성부 · ') : '') + (selected !== null
      ? `${selected + 1}번째 음 선택됨 · ${rhythm ? '' : '건반·'}길이를 눌러 수정하세요`
      : used >= targetBars * len
        ? (used > targetBars * len ? `${rangeLabel}를 넘었어요` : `${rangeLabel}를 다 적었어요`)
        : `${startBar + Math.floor(used / len) + 1}마디 ${+((used % len) / beat + 1).toFixed(2)}박째`);

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
        h('button', { 'aria-label': '되돌리기', onclick: () => {
          if (!history.length) return;
          const [hv, snap] = history.pop()!;
          if (hv !== v) switchTo(hv);
          notes = voices[v] = snap;
          cursor = Math.min(cursor, notes.length);
          selected = null;
          draw();
        } }, '↶'),
      ),
    );
  }

  function finish(answers: Note[][], rs: GradeResult[]) {
    stopAll();
    const sc = tally(rs, rhythm);
    const pitchScore = rhythm ? 1 : sc.pitchScore;
    const rhythmScore = sc.rhythmScore;
    const miss = [...new Set(rs.flatMap((r) => missTags(r, p.fifths, rhythm, p.minor)))];
    record({
      at: new Date().toISOString(), problemId: p.id, answer: answers[0], ...(two && { answerBass: answers[1] }), pitchScore, rhythmScore,
      plays: playCount, seconds: Math.round((Date.now() - started) / 1000),
      ...(ctx.skill && { skill: ctx.skill, miss }), ...(ctx.placement && { placement: true }), ...(ctx.retry && { retry: true }), ...(ctx.fix && { fix: true }), ...(ctx.intro && { intro: true }),
    });
    ctx.onGraded?.(passed({ pitchScore, rhythmScore }));
    result(p, answers, rs, ctx);
  }

  const truths = two ? [p.notes, p.bass!] : [targetNotes];
  function submit() {
    voices[v] = notes;
    const mine = truths.map((_, i) => voices[i]);
    const bad = mine.map((ns, i) => barProblems(ns, len, targetBars, offset).map((b) => (two ? (i ? '아래 ' : '위 ') : '') + (b + startBar)));
    if (bad.flat().length && !confirm(`${bad.flat().join(', ')}마디의 박 수가 맞지 않습니다. 그대로 제출하시겠습니까?`)) return;
    finish(mine, truths.map((t, i) => grade(t, mine[i])));
  }

  /** 배치고사에서 모르는 문항은 0점으로 넘긴다 */
  function giveUp() {
    finish(truths.map(() => []), truths.map((t) => grade(t, [])));
  }

  // 입력: 선율은 건반, 리듬은 치기 버튼. 낮은음자리표·2성부는 건반을 C2부터
  const voiceRow = h('div', { class: 'seg voices' });
  let pad: HTMLElement[];
  let aim = () => {};
  if (rhythm) {
    pad = [h('div', { class: 'tap-pad' },
      h('button', { class: 'tap', onpointerdown: (e: PointerEvent) => { e.preventDefault(); input(pitch); } }, '♩  음표'),
      h('button', { class: 'tap rest', onclick: () => input(null) }, '쉼표'),
    )];
  } else {
    const keys = pianoKeys(input, two || p.clef === 'bass' ? 36 : KEY_LOW);
    pad = [keys.strip, keys.keyboard];
    // 건반을 지금 적는 성부의 음역 가운데로
    aim = () => keys.aim(truths[v].find((n) => n.midi !== null)!.midi! - 5);
  }

  const first = targetNotes.find((n) => n.midi !== null)!.midi!;
  app.replaceChildren(
    header(p.title, ctx.step, ctx.back),
    ctx.introCue ?? '',
    extract
      ? h('p', { class: 'extract-cue' }, h('span', { class: 'tag' }, '추출 구간'), h('strong', {}, `${extract[0] + 1}~${extract[1]}마디만 적어요`), h('span', {}, `전체 ${p.bars}마디 재생`))
      : '',
    h('p', { class: 'info' }, rhythm
      ? `${meterText(p)} · ${p.bars}마디 · 리듬만 적어요`
      : `${keyName(p)} · ${meterText(p)} · ${extract ? `${extract[0] + 1}~${extract[1]}마디` : `${p.bars}마디`}${p.pickup ? ' · 못갖춘마디(한 박)' : ''}${p.clef === 'bass' ? ' · 낮은음자리표' : ''} · ${extract ? '구간 첫 음' : '첫 음'} ${solfa(first, p.fifths, keyRead(p))} ${noteName(first, p.fifths, p.minor)}`
        + (two ? ` · 아래 성부 첫 음 ${solfa(p.bass![0].midi!, p.fifths)} ${noteName(p.bass![0].midi!, p.fifths)}` : '')),
    ctx.exam || !melodyClick || !keySound
      ? h('p', { class: 'info' }, [ctx.exam && `실전 조건 · 재생 ${maxPlays}회`, !melodyClick && '선율 중 메트로놈 없음', !keySound && '건반 소리 없음'].filter(Boolean).join(' · '))
      : '',
    h('div', { class: 'listen' }, playBtn, scaleBtn),
    voiceRow,
    staffBox,
    status,
    palette,
    ...pad,
    h('div', { class: 'submit-row' },
      ctx.placement ? h('button', { class: 'ghost', onclick: giveUp }, '모르겠어요') : '',
      h('button', { class: 'submit', onclick: submit }, '제출'),
    ),
    ctx.placement || ctx.intro ? '' : tipLine(nextTip(tipTrack, 'solve')),
  );
  draw();
  aim();
}

// ───────── 결과 ─────────

const COLORS: Record<string, string> = { ok: 'var(--accent)', pitch: 'var(--signal-danger)', rhythm: 'var(--signal-caution)', both: 'var(--signal-danger)', extra: 'var(--muted)', missing: 'var(--signal-danger)' };
const MARKS: Record<string, string> = { ok: '✓', pitch: '음', rhythm: '박', both: '음박', extra: '+', missing: '빠짐' };

function result(p: Problem, answers: Note[][], rs: GradeResult[], ctx: ItemCtx) {
  setCounting(true);
  const rhythm = !!ctx.rhythm;
  const len = barTicks(p);
  const offset = p.pickup ? len - p.pickup : 0;
  const extract = ctx.extract ?? p.extract;
  const startBar = extract ? extract[0] : 0;
  const targetBars = extract ? extract[1] - extract[0] : p.bars;
  const targetNotes = extract ? sliceBars(p.notes, len, extract[0], extract[1]) : p.notes;
  const tipTrack: Track = ctx.tipTrack ?? (rhythm ? 'rhythm' : 'dictation');
  const two = !!p.bass;
  const truths = two ? [p.notes, p.bass!] : [targetNotes];
  /** 마디 이름: 못갖춘마디가 있으면 그 마디가 0, 추출 청취면 원곡 마디 번호 */
  const barLabel = (b: number) => (offset ? (b ? `${b}마디` : '못갖춘마디') : `${b + startBar + 1}마디`);
  // 전조 뒤 음은 새 도(조표 하나 더 ♯ 쪽)로 읽는다(기획 §M7.5). 정답 음은 반음계 표기 힌트(Note.spell)를 따른다
  const name = (m: number | null, start = 0, prefer?: 1 | -1) => {
    if (m === null) return '쉼표';
    if (rhythm) return '음표';
    const moved = !!p.modulation && start >= p.modulation.at;
    return `${solfa(m, p.fifths + (moved ? 1 : 0), keyRead(p), moved ? undefined : prefer)}(${noteName(m, p.fifths, p.minor, prefer)})`;
  };

  // 같은 마디만 정답 → 내 답 순서로 들려준다(b는 그린 마디 순번, 2성부는 함께)
  const barNotes = (ns: Note[], b: number): Note[] => {
    const out: Note[] = [];
    let t = offset;
    for (const n of ns) {
      const s = Math.max(t, b * len), e = Math.min(t + n.dur, (b + 1) * len);
      if (e > s) out.push({ midi: n.midi, dur: e - s });
      t += n.dur;
    }
    return out;
  };
  const compare = (b: number) => {
    stopAll();
    const t = playVoices(truths.map((x) => barNotes(x, b)), p.tempo);
    later(t + 0.7, () => playVoices(answers.map((x) => barNotes(x, b)), p.tempo));
  };

  const sheets: SVGSVGElement[] = [];
  const parts = truths.map((truthNotes, vi) => {
    const r = rs[vi], answer = answers[vi];
    const hint = (e: { src: number[] }) => truthNotes[e.src[0]]?.spell;
    const bySrc = (pick: (i: GradeItem) => GradeItem['truth']) => {
      const map = new Map<number, GradeItem>();
      for (const it of r.items) pick(it)?.src.forEach((s) => map.set(s, it));
      return map;
    };
    const ansMap = bySrc((i) => i.answer), truthMap = bySrc((i) => i.truth);
    const staff = { fifths: p.fifths, beatsPerBar: p.beatsPerBar, beatTicks: p.beatTicks, bars: targetBars, pickup: p.pickup, clef: vi ? 'bass' as const : p.clef, solfege: !rhythm, key: keyRead(p), takadimi: true, modulation: p.modulation };
    const mine = renderStaff({
      ...staff, notes: inheritSpell(r.items, truthNotes, answer),
      color: (s) => COLORS[ansMap.get(s)?.verdict ?? 'extra'],
      label: (s) => { const x = ansMap.get(s)!; return x ? (rhythm && x.verdict === 'pitch' ? '쉼' : MARKS[x.verdict]) + (x.octave ? '8' : '') : ''; },
    });
    const truth = renderStaff({
      ...staff, notes: truthNotes,
      color: (s) => (truthMap.get(s)?.verdict === 'ok' ? undefined : COLORS[truthMap.get(s)?.verdict ?? 'ok']),
    });
    sheets.push(mine, truth);
    const errors = r.items.filter((i) => i.verdict !== 'ok').map((i) => {
      const ev = (i.truth ?? i.answer)!;
      const b = Math.min(targetBars - (offset ? 0 : 1), Math.floor((ev.start + offset) / len));
      const t = i.truth, a = i.answer;
      const text = i.verdict === 'missing' ? `빠진 음: ${name(t!.midi, t!.start, hint(t!))} ${durName(t!.dur)}`
        : i.verdict === 'extra' ? `남는 음: ${name(a!.midi, a!.start)} ${durName(a!.dur)}`
        : [
          i.verdict !== 'rhythm' && `${name(a!.midi, a!.start)} → ${name(t!.midi, t!.start, hint(t!))}${i.octave ? ' (옥타브)' : ''}`,
          i.verdict !== 'pitch' && `${durName(a!.dur)} → ${durName(t!.dur)}`,
        ].filter(Boolean).join(' · ') + '여야 해요';
      return h('li', {}, h('button', { class: 'mini', onclick: () => compare(b) }, `▶ ${barLabel(b)}`), h('span', {}, (two ? (vi ? '아래 · ' : '위 · ') : '') + text));
    });
    return { mine, truth, errors };
  });

  const sc = tally(rs, rhythm);
  const pitchScore = rhythm ? 1 : sc.pitchScore;
  const rhythmScore = sc.rhythmScore;
  const perfect = pitchScore === 1 && rhythmScore === 1;
  const ok = passed({ pitchScore, rhythmScore });
  const errors = parts.flatMap((x) => x.errors);
  // 다시 풀기는 연습으로만 남긴다(답을 본 뒤라 단원 판정·오답 풀 해제에 넣지 않음)
  const practice: ItemCtx = { ...ctx, skill: undefined, placement: undefined, retry: undefined, fix: true, plays: undefined, exam: undefined, onGraded: undefined };
  app.replaceChildren(
    header(p.title, ctx.step, ctx.back),
    h('div', { class: 'scores' + (perfect ? ' perfect' : '') },
      rhythm ? '' : h('div', {}, h('b', {}, pct(sc.pitchScore)), h('span', {}, '음높이')),
      h('div', {}, h('b', {}, pct(rhythmScore)), h('span', {}, '리듬')),
    ),
    ctx.skill && !ctx.intro ? h('p', { class: 'verdict' + (ok ? ' ok' : '') }, ok ? '통과' : '80%에 못 미쳤어요', ctx.placement ? '' : h('span', {}, ok ? '' : ' · 이 단원을 더 연습해요')) : '',
    // 마디 재생 순서(정답 → 내 답)와 같게 정답을 위에 둔다
    h('h2', {}, extract ? `정답 (${extract[0] + 1}~${extract[1]}마디)` : '정답'), h('div', { class: 'staff-box' + (two ? ' two' : '') }, ...parts.map((x) => x.truth)),
    h('h2', {}, '내 답'), h('div', { class: 'staff-box' + (two ? ' two' : '') }, ...parts.map((x) => x.mine)),
    h('p', { class: 'legend' },
      h('span', { class: 'ok' }, '●'), ' ✓ 맞음 · ',
      ...(rhythm ? [] : [h('span', { class: 'danger' }, '●'), ' 음 음높이 틀림 · ']),
      h('span', { class: 'caution' }, '●'), ' 박 리듬 틀림 · + 남는 음 · 빠짐 빠진 음', rhythm ? '' : ' · 8 옥타브만 틀림'),
    errors.length ? h('ul', { class: 'errors' }, ...errors) : h('p', { class: 'great' }, '완벽해요!'),
    h('div', { class: 'actions' },
      h('button', { onclick: () => { stopAll(); playVoices(truths, p.tempo); } }, '정답 듣기'),
      h('button', { onclick: () => { stopAll(); playVoices(answers, p.tempo); } }, '내 답 듣기'),
      h('button', { class: 'stop-all', onclick: stopAll }, '■  정지'),
      ctx.intro ? '' : h('button', { class: 'half', onclick: () => solve(p, practice, answers[0], answers[1]) }, '고쳐 보기'),
      ctx.intro ? '' : h('button', { class: 'half', onclick: () => solve(p, practice) }, '처음부터'),
      ctx.intro && !ok && ctx.retrySame
        ? h('button', { class: 'primary', onclick: ctx.retrySame }, '다시 풀기')
        : h('button', { class: 'primary', onclick: ctx.next }, ctx.intro ? (ctx.step && ctx.step[0] >= ctx.step[1] ? '본문제 시작' : '다음') : (ctx.step && ctx.step[0] >= ctx.step[1] ? '결과 보기' : '다음 문제')),
    ),
    !perfect && !ctx.placement && !ctx.intro
      ? tipLine(nextTip(
          tipTrack,
          rhythm ? 'rhythm' : pitchScore < 1 && (rhythmScore === 1 || pitchScore <= rhythmScore) ? 'pitch' : 'rhythm',
        ))
      : '',
  );
  // 결과 악보는 한눈에 비교하도록 화면 폭에 맞춰 줄인다(최소 65%)
  for (const svg of sheets) {
    const natural = Number(svg.getAttribute('width'));
    const box = svg.parentElement!.clientWidth - 2;
    if (natural > box) svg.style.width = `${Math.max(box, natural * 0.65)}px`;
    svg.style.height = 'auto';
  }
  if (ctx.intro && !ok) playVoices(truths, p.tempo);
  else if (perfect) playNotes([{ midi: p.tonic + 12, dur: 3 }, { midi: p.tonic + 19, dur: 3 }, { midi: p.tonic + 24, dur: 12 }], 120);
}
