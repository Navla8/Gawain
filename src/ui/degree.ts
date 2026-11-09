import type { DegreeItem } from '../engine/drills.ts';
import { passed } from '../engine/progress.ts';
import { later, playDegrees, playKey, playScale, stopAll } from '../audio/synth.ts';
import { setCounting, touch } from '../activity.ts';
import { record } from '../store.ts';
import { app, h, header } from './dom.ts';
import type { ItemCtx } from './dictation.ts';

// 계이름 듣기: 음계로 조성감을 세운 뒤 들리는 2~4음을 계이름 버튼으로 맞힌다 (기획 M3)
// 답하는 동안 버튼은 소리를 내지 않는다. 소리로 하나씩 대 보면 기능으로 듣는 연습이 되지 않기 때문이다.

const MAX_PLAYS = 3;

export function degreeScreen(it: DegreeItem, ctx: ItemCtx) {
  stopAll();
  setCounting(true);
  const started = Date.now();
  const answer: string[] = [];
  let plays = MAX_PLAYS;
  let playing = false;
  let done = false;

  const playBtn = h('button', { class: 'play', onclick: () => (playing ? stop() : listen()) });
  const scaleBtn = h('button', { class: 'ghost', onclick: () => run(playScale(it.tonic, it.minor)) }, '음계 듣기');
  const slots = h('div', { class: 'slots' });
  const pad = h('div', { class: 'degree-pad' });
  const foot = h('div', { class: 'degree-foot' });

  function listen() {
    if (plays <= 0) return;
    const withScale = plays === MAX_PLAYS;
    plays--;
    run(playDegrees(it.midis, it.tonic, it.minor, withScale));
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
    const right = it.names.filter((n, i) => answer[i] === n).length;
    const score = giveUp ? 0 : right / it.names.length;
    record({
      at: new Date().toISOString(), problemId: it.id, answer: [...answer], pitchScore: score, rhythmScore: 1,
      plays: MAX_PLAYS - plays, seconds: Math.round((Date.now() - started) / 1000),
      miss: it.names.filter((n, i) => answer[i] !== n),
      ...(ctx.skill && { skill: ctx.skill }), ...(ctx.placement && { placement: true }),
    });
    const ok = passed({ pitchScore: score, rhythmScore: 1 });
    ctx.onGraded?.(ok);
    if (score === 1) playDegrees([it.midis.at(-1)!], it.tonic, it.minor, false);
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
        h('b', {}, a ?? '·'),
        done && a !== truth ? h('small', {}, truth) : done ? h('small', {}, '✓') : '',
      );
    }));
    pad.replaceChildren(...it.choices.map((name) => h('button', { class: 'deg', onclick: () => choose(name) }, name)));

    const right = it.names.filter((n, i) => answer[i] === n).length;
    if (done) {
      const ok = right / it.names.length >= 0.8;
      foot.replaceChildren(
        h('p', { class: 'verdict' + (ok ? ' ok' : '') }, ok ? '맞았어요' : `${it.names.length}음 중 ${right}음`, h('span', {}, ' · 계이름을 누르면 그 음이 나요')),
        h('div', { class: 'actions' },
          h('button', { class: 'half', onclick: () => { stopAll(); playDegrees(it.midis, it.tonic, it.minor, false); } }, '정답 듣기'),
          h('button', { class: 'half', onclick: () => run(playScale(it.tonic, it.minor)) }, '음계 듣기'),
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
    header(it.title, ctx.step),
    h('p', { class: 'info' }, `${it.names.length}음 · 첫 재생에 음계${it.minor ? '(라~라)' : '(도~도)'}를 먼저 들려줘요`),
    h('div', { class: 'listen' }, playBtn, scaleBtn),
    slots,
    pad,
    foot,
  );
  draw();
}
