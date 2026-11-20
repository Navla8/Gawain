import { resolution, type DegreeItem, type TonicItem } from '../engine/drills.ts';
import { passed } from '../engine/progress.ts';
import { later, playCadence, playDegrees, playKey, playTonic, stopAll } from '../audio/synth.ts';
import { solfa } from '../engine/theory.ts';
import { setCounting, touch } from '../activity.ts';
import { keyRead, record } from '../store.ts';
import { app, h, header } from './dom.ts';
import type { ItemCtx } from './dictation.ts';
import { nextTip, tipLine } from './tips.ts';

// 계이름 듣기: 음계로 조성감을 세운 뒤 들리는 2~4음을 계이름 버튼으로 맞힌다 (기획 M3)
// 답하는 동안 버튼은 소리를 내지 않는다. 소리로 하나씩 대 보면 기능으로 듣는 연습이 되지 않기 때문이다.

const MAX_PLAYS = 3;

export function degreeScreen(it: DegreeItem, ctx: ItemCtx) {
  stopAll();
  setCounting(true);
  const started = Date.now();
  const answer: string[] = [];
  const maxPlays = ctx.plays ?? MAX_PLAYS;
  let plays = maxPlays;
  let playing = false;
  let done = false;

  const k0d = it.skill === 'k0d';
  const resRels = k0d ? resolution(it.midis[0] - it.tonic) : [];
  const resMidis = resRels.map((x) => it.tonic + x);
  const resText = resRels.map((x) => solfa(it.tonic + x, it.fifths)).join(' → ');

  const playBtn = h('button', { class: 'play', onclick: () => (playing ? stop() : listen()) });
  const scaleBtn = h('button', { class: 'ghost', onclick: () => run(playCadence(it.tonic, it.minor)) }, '카덴츠 듣기');
  // 답·채점은 라 기반 이름으로 하고, 단조 도 기반 설정이면 보이는 글자만 바꾼다(기획 §M7.1)
  const k = keyRead(it);
  const show = (name: string) => (k.minorTonic === undefined ? name : solfa(it.choiceMidis[it.choices.indexOf(name)], it.fifths, k));
  const slots = h('div', { class: 'slots' });
  const pad = h('div', { class: 'degree-pad' });
  const foot = h('div', { class: 'degree-foot' });
  const tipSlot = h('div', { class: 'tip-slot' }, ctx.placement ? '' : tipLine(nextTip('degree', 'solve')));

  function listen() {
    if (plays <= 0) return;
    const withCadence = k0d || plays === maxPlays;
    plays--;
    run(playDegrees(it.midis, it.tonic, it.minor, withCadence));
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
    if (done) { playKey(it.choiceMidis[it.choices.indexOf(name)]); return; }
    if (answer.length >= it.names.length) return;
    answer.push(name);
    touch();
    if (answer.length === it.names.length) finish();
    else draw();
  }

  function finish(giveUp = false) {
    done = true;
    stopAll();
    playing = false;
    const right = it.names.filter((n, i) => answer[i] === n).length;
    const score = giveUp ? 0 : right / it.names.length;
    record({
      at: new Date().toISOString(), problemId: it.id, answer: [...answer], pitchScore: score, rhythmScore: 1,
      plays: maxPlays - plays, seconds: Math.round((Date.now() - started) / 1000),
      miss: it.names.filter((n, i) => answer[i] !== n),
      ...(ctx.skill && { skill: ctx.skill }), ...(ctx.placement && { placement: true }),
    });
    const ok = passed({ pitchScore: score, rhythmScore: 1 });
    ctx.onGraded?.(ok);
    if (k0d) playDegrees(resMidis, it.tonic, false, false, 96);
    else if (score === 1) playDegrees([it.midis.at(-1)!], it.tonic, it.minor, false);
    tipSlot.replaceChildren(...(!ctx.placement && score < 1 ? [tipLine(nextTip('degree', 'pitch'))] : []));
    draw();
  }

  function draw() {
    playBtn.replaceChildren(...(playing ? ['■  정지'] : plays > 0 ? ['▶  듣기', h('span', { class: 'count' }, `${plays}`)] : ['재생 횟수를 다 썼어요']));
    playBtn.toggleAttribute('disabled', done || (!playing && plays <= 0));
    playBtn.classList.toggle('stop', playing);
    scaleBtn.toggleAttribute('disabled', playing);

    slots.replaceChildren(...it.names.map((truth, i) => {
      const a = answer[i];
      const cls = done ? (a === truth ? 'slot ok' : 'slot bad') : i === answer.length ? 'slot cur' : 'slot';
      return h('div', { class: cls },
        h('b', {}, a === undefined ? '·' : show(a)),
        done && a !== truth ? h('small', {}, show(truth)) : done ? h('small', {}, '✓') : '',
      );
    }));
    pad.replaceChildren(...it.choices.map((name) => h('button', { class: 'deg', onclick: () => choose(name) }, show(name))));

    const right = it.names.filter((n, i) => answer[i] === n).length;
    if (done) {
      const ok = right / it.names.length >= 0.8;
      foot.replaceChildren(
        h('p', { class: 'verdict' + (ok ? ' ok' : '') },
          ok ? '정답입니다' : k0d ? `정답은 ${show(it.names[0])}` : `${it.names.length}음 중 ${right}음`,
          h('span', {}, k0d ? ` · ${resText} · 계이름을 누르면 해당 음이 재생됩니다` : ' · 계이름을 누르면 해당 음이 재생됩니다'),
        ),
        h('div', { class: 'actions' },
          h('button', { class: 'half', onclick: () => { stopAll(); playDegrees(k0d ? resMidis : it.midis, it.tonic, it.minor, false, k0d ? 96 : 72); } }, k0d ? '도로 풀림 듣기' : '정답 듣기'),
          h('button', { class: 'half', onclick: () => run(playCadence(it.tonic, it.minor)) }, '카덴츠 듣기'),
          h('button', { class: 'primary', onclick: ctx.next }, ctx.step && ctx.step[0] >= ctx.step[1] ? '결과 보기' : '다음 문제'),
        ),
      );
    } else {
      foot.replaceChildren(h('div', { class: 'row tools' },
        it.names.length > 1 ? h('button', { onclick: () => { answer.pop(); draw(); } }, '⌫  지우기') : '',
        ctx.placement ? h('button', { onclick: () => finish(true) }, '모르겠어요') : '',
      ));
    }
  }

  app.replaceChildren(
    header(it.title, ctx.step, ctx.back),
    h('p', { class: 'info' }, k0d ? '1음 · 재생마다 카덴츠(I–IV–V–I)를 먼저 들려줘요' : `${it.names.length}음 · 첫 재생에 카덴츠(${it.minor ? 'i–iv–V–i' : 'I–IV–V–I'})를 먼저 들려줘요`),
    h('div', { class: 'listen' }, playBtn, scaleBtn),
    slots,
    pad,
    foot,
    tipSlot,
  );
  draw();
}

const CAND_NUM = ['①', '②', '③', '④'];

/** 조성 잡기(k0a·k0b·k0c, 기획 §M11): 재생마다 카덴츠 → (선율) → 후보 차례 재생, 번호로 '도' 고르기 */
export function tonicScreen(it: TonicItem, ctx: ItemCtx) {
  stopAll();
  setCounting(true);
  const started = Date.now();
  const maxPlays = ctx.plays ?? MAX_PLAYS;
  let plays = maxPlays;
  let playing = false;
  let done = false;
  let chosen: number | undefined;
  let active = -1;
  let preview: number | undefined;

  const playBtn = h('button', { class: 'play', onclick: () => (playing ? stop() : listen()) });
  const scaleBtn = h('button', { class: 'ghost', onclick: () => run(playCadence(it.tonic, false)) }, '카덴츠 듣기');
  const slots = h('div', { class: 'slots' });
  const pad = h('div', { class: 'degree-pad' });
  const foot = h('div', { class: 'degree-foot' });
  const tipSlot = h('div', { class: 'tip-slot' }, ctx.placement ? '' : tipLine(nextTip('degree', 'solve')));

  function listen() {
    if (plays <= 0) return;
    plays--;
    run(playTonic(it.tonic, it.lead, it.candidates, (i) => { active = i; draw(); }));
  }
  function run(sec: number) {
    playing = true;
    later(sec + 0.3, () => { playing = false; active = -1; touch(); draw(); });
    draw();
  }
  function stop() {
    stopAll();
    playing = false;
    active = -1;
    draw();
  }

  function choose(i: number) {
    if (done) {
      preview = i;
      playKey(it.candidates[i]);
      draw();
      return;
    }
    chosen = i;
    touch();
    finish();
  }

  function finish(giveUp = false) {
    done = true;
    stopAll();
    playing = false;
    active = -1;
    const ok = !giveUp && chosen === it.answer;
    const score = ok ? 1 : 0;
    const miss = !giveUp && chosen !== undefined && chosen !== it.answer ? [it.candNames[chosen]] : [];
    record({
      at: new Date().toISOString(), problemId: it.id, answer: chosen === undefined ? [] : [it.candNames[chosen]],
      pitchScore: score, rhythmScore: 1, plays: maxPlays - plays, seconds: Math.round((Date.now() - started) / 1000),
      miss, ...(ctx.skill && { skill: ctx.skill }), ...(ctx.placement && { placement: true }), ...(ctx.retry && { retry: true }),
    });
    ctx.onGraded?.(passed({ pitchScore: score, rhythmScore: 1 }));
    if (ok) playKey(it.candidates[it.answer]);
    tipSlot.replaceChildren(...(!ctx.placement && score < 1 ? [tipLine(nextTip('degree', 'pitch'))] : []));
    draw();
  }

  function draw() {
    playBtn.replaceChildren(...(playing ? ['■  정지'] : plays > 0 ? ['▶  듣기', h('span', { class: 'count' }, `${plays}`)] : ['재생 횟수를 다 썼어요']));
    playBtn.toggleAttribute('disabled', done || (!playing && plays <= 0));
    playBtn.classList.toggle('stop', playing);
    scaleBtn.toggleAttribute('disabled', playing);

    slots.replaceChildren(...it.candidates.map((_, i) => {
      const cls = done
        ? (i === it.answer ? 'slot ok' : i === chosen ? 'slot bad' : preview === i ? 'slot cur' : 'slot')
        : active === i ? 'slot cur' : 'slot';
      return h('div', { class: cls },
        h('b', {}, CAND_NUM[i]),
        done ? h('small', {}, it.candNames[i]) : '',
      );
    }));
    pad.replaceChildren(...it.candidates.map((_, i) => h('button', { class: 'deg', onclick: () => choose(i) }, CAND_NUM[i])));

    if (done) {
      const ok = chosen === it.answer;
      const hint = preview !== undefined ? ` · ${CAND_NUM[preview]} ${it.candNames[preview]}` : ' · 번호를 누르면 그 음과 계이름이 나와요';
      foot.replaceChildren(
        h('p', { class: 'verdict' + (ok ? ' ok' : '') },
          ok ? '정답입니다' : `정답은 ${CAND_NUM[it.answer]} 도`,
          h('span', {}, hint),
        ),
        h('div', { class: 'actions' },
          h('button', { class: 'half', onclick: () => run(playTonic(it.tonic, it.lead, it.candidates, (i) => { active = i; draw(); })) }, '다시 듣기'),
          h('button', { class: 'half', onclick: () => run(playCadence(it.tonic, false)) }, '카덴츠 듣기'),
          h('button', { class: 'primary', onclick: ctx.next }, ctx.step && ctx.step[0] >= ctx.step[1] ? '결과 보기' : '다음 문제'),
        ),
      );
    } else {
      foot.replaceChildren(ctx.placement ? h('div', { class: 'row tools' }, h('button', { onclick: () => finish(true) }, '모르겠어요')) : '');
    }
  }

  const info = it.lead.length
    ? `카덴츠 → 선율 ${it.lead.length}음 뒤 ${it.candidates.length}음 중 '도'를 고르세요 · 재생마다 카덴츠를 먼저 들려줘요`
    : `카덴츠(I–IV–V–I) 뒤 ${it.candidates.length}음 중 '도'를 고르세요 · 재생마다 카덴츠를 먼저 들려줘요`;

  app.replaceChildren(
    header(it.title, ctx.step, ctx.back),
    h('p', { class: 'info' }, info),
    h('div', { class: 'listen' }, playBtn, scaleBtn),
    slots,
    pad,
    foot,
    tipSlot,
  );
  draw();
}
