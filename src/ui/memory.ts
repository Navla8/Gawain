import { TPB, timeSignature, type Problem } from '../engine/types.ts';
import { gradeDownbeats, gradePlayback, missTags, type GradeResult } from '../engine/grade.ts';
import { downbeats } from '../engine/melody.ts';
import { toEvents } from '../engine/score.ts';
import { keyName, noteName, solfa } from '../engine/theory.ts';
import { passed } from '../engine/progress.ts';
import { later, playCadence, playKey, playNotes, playProblem, stopAll } from '../audio/synth.ts';
import { setCounting, touch } from '../activity.ts';
import { keyRead, record, settings } from '../store.ts';
import { app, h, header, pct } from './dom.ts';
import { KEY_LOW, pianoKeys } from './keyboard.ts';
import { solve, type ItemCtx } from './dictation.ts';
import { nextTip, tipLine } from './tips.ts';

// 선율 기억 화면 (기획 §M10.2):
// - m1·m2 따라 치기: 재생 1회 → 건반으로 음 순서 입력 → 확인
// - m3 강박 계이름: 재생 2회 → 마디마다 첫 박 계이름 버튼
// - m4·m5 추출 청취: 기존 dictation.ts 풀이 화면에 구간 옵션(extract)을 넘겨 그대로 쓴다

const MAJOR_SOLFA = ['도', '레', '미', '파', '솔', '라', '티'];
const MAJOR_SEMI = [0, 2, 4, 5, 7, 9, 11];

export function memoryScreen(p: Problem, ctx: ItemCtx) {
  if (p.extract) {
    solve(p, { ...ctx, extract: p.extract, tipTrack: 'memory' });
    return;
  }
  const unit = p.id.split('-')[1];
  if (unit === 'm3') downbeatScreen(p, ctx);
  else playbackScreen(p, ctx);
}

// ───────── 따라 치기 (m1·m2) ─────────

function playbackScreen(p: Problem, ctx: ItemCtx) {
  stopAll();
  setCounting(true);
  const started = Date.now();
  const truthMidis = toEvents(p.notes).filter((e) => e.midi !== null).map((e) => e.midi!);
  const first = truthMidis[0];
  const answer: number[] = [];
  const maxPlays = Math.min(ctx.plays ?? 1, p.plays ?? 1);
  let plays = maxPlays;
  let playing = false;
  const set = settings();
  const melodyClick = set.melodyClick && !ctx.exam;
  const keySound = set.keySound && !ctx.exam;

  const playBtn = h('button', { class: 'play', onclick: () => (playing ? stop() : listen()) });
  const scaleBtn = h('button', { class: 'ghost', onclick: () => run(playCadence(p.tonic, p.minor)) }, '카덴츠 듣기');
  const seqBox = h('div', { class: 'slots seq' });
  const status = h('p', { class: 'status' });
  const tipSlot = h('div', { class: 'tip-slot' }, ctx.placement ? '' : tipLine(nextTip('memory', 'solve')));

  function listen() {
    if (plays <= 0) return;
    const withCadence = plays === maxPlays;
    plays--;
    run(playProblem(p, withCadence, melodyClick));
  }
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

  function onKey(midi: number) {
    if (keySound) playKey(midi);
    answer.push(midi);
    touch();
    draw();
  }

  function finish(giveUp = false) {
    stopAll();
    const mine = giveUp ? [] : [...answer];
    const r = gradePlayback(p.notes, mine);
    const miss = missTags(r, p.fifths, false, p.minor);
    record({
      at: new Date().toISOString(), problemId: p.id,
      answer: mine.map((midi) => ({ midi, dur: TPB })),
      pitchScore: r.pitchScore, rhythmScore: 1,
      plays: maxPlays - plays, seconds: Math.round((Date.now() - started) / 1000),
      ...(ctx.skill && { skill: ctx.skill, miss }),
      ...(ctx.placement && { placement: true }),
      ...(ctx.retry && { retry: true }),
      ...(ctx.fix && { fix: true }),
    });
    const ok = passed({ pitchScore: r.pitchScore, rhythmScore: 1 });
    ctx.onGraded?.(ok);
    playbackResult(p, mine, r, ctx);
  }

  function draw() {
    playBtn.replaceChildren(...(playing ? ['■  정지'] : plays > 0 ? ['▶  듣기', h('span', { class: 'count' }, `${plays}`)] : ['재생 횟수를 다 썼어요']));
    playBtn.toggleAttribute('disabled', !playing && plays <= 0);
    playBtn.classList.toggle('stop', playing);
    scaleBtn.toggleAttribute('disabled', playing);

    const k = keyRead(p);
    const count = Math.max(truthMidis.length, answer.length);
    seqBox.replaceChildren(...Array.from({ length: count }, (_, i) => {
      const m = answer[i];
      const cls = i === answer.length ? 'slot cur' : 'slot';
      return h('div', { class: cls },
        h('b', {}, m === undefined ? '·' : solfa(m, p.fifths, k)),
        h('small', {}, m === undefined ? '' : noteName(m, p.fifths, p.minor)),
      );
    }));
    status.textContent = `${answer.length} / ${truthMidis.length}음 입력됨`;
  }

  const keys = pianoKeys(onKey, KEY_LOW);
  app.replaceChildren(
    header(p.title, ctx.step, ctx.back),
    h('p', { class: 'info' }, `${keyName(p)} · ${p.bars}마디(${truthMidis.length}음) · 첫 음 ${solfa(first, p.fifths, keyRead(p))} ${noteName(first, p.fifths, p.minor)} · 리듬 없이 음 순서만 건반으로 쳐요`),
    ctx.exam || !melodyClick || !keySound
      ? h('p', { class: 'info' }, [ctx.exam && `실전 조건 · 재생 ${maxPlays}회`, !melodyClick && '선율 중 메트로놈 없음', !keySound && '건반 소리 없음'].filter(Boolean).join(' · '))
      : '',
    h('div', { class: 'listen' }, playBtn, scaleBtn),
    seqBox,
    status,
    h('div', { class: 'row tools' },
      h('button', { onclick: () => { answer.pop(); draw(); } }, '⌫  지우기'),
      h('button', { onclick: () => { answer.length = 0; draw(); } }, '비우기'),
    ),
    keys.strip,
    keys.keyboard,
    h('div', { class: 'submit-row' },
      ctx.placement ? h('button', { class: 'ghost', onclick: () => finish(true) }, '모르겠어요') : '',
      h('button', { class: 'submit', onclick: () => finish() }, '확인'),
    ),
    tipSlot,
  );
  draw();
  keys.aim(first - 5);
}

function playbackResult(p: Problem, answer: number[], r: GradeResult, ctx: ItemCtx) {
  setCounting(true);
  const k = keyRead(p);
  const perfect = r.pitchScore === 1;
  const ok = passed({ pitchScore: r.pitchScore, rhythmScore: 1 });
  const practice: ItemCtx = { ...ctx, skill: undefined, placement: undefined, retry: undefined, fix: true, plays: undefined, exam: undefined, onGraded: undefined };
  const label = (m: number) => solfa(m, p.fifths, k);

  const items = r.items.map((it) => {
    if (it.verdict === 'ok') {
      return h('div', { class: 'slot ok' }, h('b', {}, label(it.answer!.midi!)), h('small', {}, '✓'));
    }
    if (it.verdict === 'missing') {
      return h('div', { class: 'slot bad' }, h('b', {}, '—'), h('small', {}, label(it.truth!.midi!)));
    }
    if (it.verdict === 'extra') {
      return h('div', { class: 'slot bad' }, h('b', {}, label(it.answer!.midi!)), h('small', {}, '+'));
    }
    return h('div', { class: 'slot bad' },
      h('b', {}, label(it.answer!.midi!)),
      h('small', {}, label(it.truth!.midi!) + (it.octave ? '8' : '')),
    );
  });

  app.replaceChildren(
    header(p.title, ctx.step, ctx.back),
    h('div', { class: 'scores' + (perfect ? ' perfect' : '') },
      h('div', {}, h('b', {}, pct(r.pitchScore)), h('span', {}, '음 순서')),
    ),
    ctx.skill ? h('p', { class: 'verdict' + (ok ? ' ok' : '') }, ok ? '통과' : '80%에 못 미쳤어요', ctx.placement ? '' : h('span', {}, ok ? '' : ' · 이 단원을 더 연습해요')) : '',
    h('div', { class: 'slots seq' }, ...items),
    perfect ? h('p', { class: 'great' }, '완벽해요!') : '',
    h('div', { class: 'actions' },
      h('button', { onclick: () => { stopAll(); playNotes(p.notes, p.tempo); } }, '정답 듣기'),
      h('button', { onclick: () => { stopAll(); playNotes(answer.map((midi) => ({ midi, dur: TPB })), p.tempo); } }, '내 답 듣기'),
      h('button', { class: 'stop-all', onclick: stopAll }, '■  정지'),
      h('button', { class: 'half', onclick: () => playbackScreen(p, practice) }, '다시 치기'),
      h('button', { class: 'half', onclick: () => { stopAll(); playCadence(p.tonic, p.minor); } }, '카덴츠 듣기'),
      h('button', { class: 'primary', onclick: ctx.next }, ctx.step && ctx.step[0] >= ctx.step[1] ? '결과 보기' : '다음 문제'),
    ),
    !perfect && !ctx.placement ? tipLine(nextTip('memory', 'pitch')) : '',
  );
  if (perfect) playNotes([{ midi: p.tonic + 12, dur: 3 }, { midi: p.tonic + 19, dur: 3 }, { midi: p.tonic + 24, dur: 12 }], 120);
}

// ───────── 강박 계이름 (m3) ─────────

function downbeatScreen(p: Problem, ctx: ItemCtx) {
  stopAll();
  setCounting(true);
  const started = Date.now();
  const beats = downbeats(p);
  const truth = beats.map((b) => b.name);
  const choiceMidis = MAJOR_SEMI.map((s) => p.tonic + s);
  const answer: string[] = [];
  const maxPlays = Math.min(ctx.plays ?? 2, p.plays ?? 2);
  let plays = maxPlays;
  let playing = false;
  let graded: { answer: string[]; pitchScore: number; right: number } | undefined;
  const set = settings();
  const melodyClick = set.melodyClick && !ctx.exam;

  const playBtn = h('button', { class: 'play', onclick: () => (playing ? stop() : listen()) });
  const scaleBtn = h('button', { class: 'ghost', onclick: () => run(playCadence(p.tonic, p.minor)) }, '카덴츠 듣기');
  const slots = h('div', { class: 'slots' });
  const pad = h('div', { class: 'degree-pad' });
  const foot = h('div', { class: 'degree-foot' });
  const tipSlot = h('div', { class: 'tip-slot' }, ctx.placement ? '' : tipLine(nextTip('memory', 'solve')));

  function listen() {
    if (plays <= 0) return;
    const withCadence = plays === maxPlays;
    plays--;
    run(playProblem(p, withCadence, melodyClick));
  }
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

  function choose(name: string) {
    if (graded) { playKey(choiceMidis[MAJOR_SOLFA.indexOf(name)]); return; }
    if (answer.length >= truth.length) return;
    answer.push(name);
    touch();
    if (answer.length === truth.length) finish();
    else draw();
  }

  function finish(giveUp = false) {
    if (graded) return;
    stopAll();
    const mine = giveUp ? [] : [...answer];
    const g = gradeDownbeats(truth, mine);
    graded = { answer: mine, pitchScore: g.pitchScore, right: g.right };
    record({
      at: new Date().toISOString(), problemId: p.id, answer: mine,
      pitchScore: g.pitchScore, rhythmScore: 1,
      plays: maxPlays - plays, seconds: Math.round((Date.now() - started) / 1000),
      ...(ctx.skill && { skill: ctx.skill, miss: g.miss }),
      ...(ctx.placement && { placement: true }),
      ...(ctx.retry && { retry: true }),
      ...(ctx.fix && { fix: true }),
    });
    const ok = passed({ pitchScore: g.pitchScore, rhythmScore: 1 });
    ctx.onGraded?.(ok);
    if (g.pitchScore === 1) playNotes([{ midi: p.tonic + 12, dur: 3 }, { midi: p.tonic + 19, dur: 3 }, { midi: p.tonic + 24, dur: 12 }], 120);
    tipSlot.replaceChildren(...(!ctx.placement && g.pitchScore < 1 ? [tipLine(nextTip('memory', 'pitch'))] : []));
    draw();
  }

  function draw() {
    const done = !!graded;
    const shown = graded ? graded.answer : answer;
    playBtn.replaceChildren(...(playing ? ['■  정지'] : plays > 0 ? ['▶  듣기', h('span', { class: 'count' }, `${plays}`)] : ['재생 횟수를 다 썼어요']));
    playBtn.toggleAttribute('disabled', done || (!playing && plays <= 0));
    playBtn.classList.toggle('stop', playing);
    scaleBtn.toggleAttribute('disabled', playing);

    slots.replaceChildren(...beats.map((b, i) => {
      const a = shown[i];
      const cls = done ? (a === b.name ? 'slot ok' : 'slot bad') : i === answer.length ? 'slot cur' : 'slot';
      return h('div', { class: cls },
        h('small', { class: 'bar-no' }, `${b.bar + 1}마디`),
        h('b', {}, a === undefined ? '·' : a),
        done && a !== b.name ? h('small', {}, b.name) : done ? h('small', {}, '✓') : '',
      );
    }));
    pad.replaceChildren(...MAJOR_SOLFA.map((name) => h('button', { class: 'deg', onclick: () => choose(name) }, name)));

    if (graded) {
      const ok = passed({ pitchScore: graded.pitchScore, rhythmScore: 1 });
      foot.replaceChildren(
        h('p', { class: 'verdict' + (ok ? ' ok' : '') }, ok ? '정답입니다' : `${beats.length}마디 중 ${graded.right}마디`, h('span', {}, ' · 계이름을 누르면 해당 음이 재생됩니다')),
        h('div', { class: 'actions' },
          h('button', { class: 'half', onclick: () => { stopAll(); playNotes(p.notes, p.tempo); } }, '정답 듣기'),
          h('button', { class: 'half', onclick: () => { stopAll(); playNotes(beats.map((b) => ({ midi: b.midi, dur: TPB })), 72); } }, '강박만 듣기'),
          h('button', { class: 'primary', onclick: ctx.next }, ctx.step && ctx.step[0] >= ctx.step[1] ? '결과 보기' : '다음 문제'),
        ),
      );
    } else {
      foot.replaceChildren(h('div', { class: 'row tools' },
        h('button', { onclick: () => { answer.pop(); draw(); } }, '⌫  지우기'),
        ctx.placement ? h('button', { onclick: () => finish(true) }, '모르겠어요') : '',
      ));
    }
  }

  app.replaceChildren(
    header(p.title, ctx.step, ctx.back),
    h('p', { class: 'info' }, `${keyName(p)} · ${timeSignature(p).join('/')} · ${p.bars}마디 · 마디마다 첫 박(강박) 계이름을 고르세요`),
    ctx.exam || !melodyClick
      ? h('p', { class: 'info' }, [ctx.exam && `실전 조건 · 재생 ${maxPlays}회`, !melodyClick && '선율 중 메트로놈 없음'].filter(Boolean).join(' · '))
      : '',
    h('div', { class: 'listen' }, playBtn, scaleBtn),
    slots,
    pad,
    foot,
    tipSlot,
  );
  draw();
}
