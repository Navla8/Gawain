import { pretty, type HarmonyItem } from '../engine/harmony.ts';
import { passed } from '../engine/progress.ts';
import { later, playChords, stopAll } from '../audio/synth.ts';
import { setCounting, touch } from '../activity.ts';
import { record } from '../store.ts';
import { app, h, header } from './dom.ts';
import type { ItemCtx } from './dictation.ts';
import { nextTip, tipLine } from './tips.ts';

// 화성 듣기 (기획 §M7.4): 3화음 성질·종지는 한 번 고르고, 진행은 첫 화음(으뜸화음)을 빼고 차례로 로마 숫자를 고른다.
// 답하는 동안 버튼은 소리를 내지 않는다(계이름 듣기와 같은 까닭).

const MAX_PLAYS = 3;

export function harmonyScreen(it: HarmonyItem, ctx: ItemCtx) {
  stopAll();
  setCounting(true);
  const started = Date.now();
  const answer: string[] = [];
  const maxPlays = ctx.plays ?? MAX_PLAYS;
  let plays = maxPlays;
  let playing = false;
  let done = false;
  const label = (x: string) => (it.given ? pretty(x) : x);

  const playBtn = h('button', { class: 'play', onclick: () => (playing ? stop() : listen()) });
  const slots = h('div', { class: 'slots' });
  const pad = h('div', { class: 'degree-pad' + (it.given ? '' : ' wide') });
  const foot = h('div', { class: 'degree-foot' });
  const tipSlot = h('div', { class: 'tip-slot' }, ctx.placement ? '' : tipLine(nextTip('harmony', 'solve')));

  const sound = () => playChords(it.chords, it.arpeggio);
  function listen() {
    if (plays <= 0) return;
    plays--;
    run(sound());
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

  function choose(x: string) {
    if (done || answer.length >= it.answers.length) return;
    answer.push(x);
    touch();
    if (answer.length === it.answers.length) finish();
    else draw();
  }

  function finish(giveUp = false) {
    done = true;
    stopAll();
    const right = it.answers.filter((n, i) => answer[i] === n).length;
    const score = giveUp ? 0 : right / it.answers.length;
    record({
      at: new Date().toISOString(), problemId: it.id, answer: [...answer], pitchScore: score, rhythmScore: 1,
      plays: maxPlays - plays, seconds: Math.round((Date.now() - started) / 1000),
      miss: it.answers.filter((n, i) => answer[i] !== n),
      ...(ctx.skill && { skill: ctx.skill }), ...(ctx.placement && { placement: true }),
    });
    ctx.onGraded?.(passed({ pitchScore: score, rhythmScore: 1 }));
    tipSlot.replaceChildren(...(!ctx.placement && score < 1 ? [tipLine(nextTip('harmony', 'pitch'))] : []));
    draw();
  }

  function draw() {
    playBtn.replaceChildren(...(playing ? ['■  정지'] : plays > 0 ? ['▶  듣기', h('span', { class: 'count' }, `${plays}`)] : ['재생 횟수를 다 썼어요']));
    playBtn.toggleAttribute('disabled', done || (!playing && plays <= 0));
    playBtn.classList.toggle('stop', playing);

    const given = it.given ? [h('div', { class: 'slot given' }, h('b', {}, pretty(it.given)), h('small', {}, '처음'))] : [];
    slots.replaceChildren(...given, ...it.answers.map((truth, i) => {
      const a = answer[i];
      const cls = done ? (a === truth ? 'slot ok' : 'slot bad') : i === answer.length ? 'slot cur' : 'slot';
      return h('div', { class: cls },
        h('b', {}, a === undefined ? '·' : label(a)),
        done && a !== truth ? h('small', {}, label(truth)) : done ? h('small', {}, '✓') : '',
      );
    }));
    pad.replaceChildren(...it.choices.map((x) => h('button', { class: 'deg', onclick: () => choose(x) }, label(x))));

    if (done) {
      const right = it.answers.filter((n, i) => answer[i] === n).length;
      const ok = right / it.answers.length >= 0.8;
      foot.replaceChildren(
        h('p', { class: 'verdict' + (ok ? ' ok' : '') }, ok ? '맞았어요' : it.answers.length > 1 ? `${it.answers.length}개 중 ${right}개` : '아쉬워요'),
        h('div', { class: 'actions' },
          h('button', { class: 'half', onclick: () => run(sound()) }, '다시 듣기'),
          h('button', { class: 'half', onclick: stop }, '■  정지'),
          h('button', { class: 'primary', onclick: ctx.next }, ctx.step && ctx.step[0] >= ctx.step[1] ? '결과 보기' : '다음 문제'),
        ),
      );
    } else {
      foot.replaceChildren(h('div', { class: 'row tools' },
        it.answers.length > 1 ? h('button', { onclick: () => { answer.pop(); draw(); } }, '⌫  지우기') : '',
        ctx.placement ? h('button', { onclick: () => finish(true) }, '모르겠어요') : '',
      ));
    }
  }

  app.replaceChildren(
    header(it.title, ctx.step, ctx.back),
    h('p', { class: 'info' }, it.prompt),
    h('div', { class: 'listen' }, playBtn),
    slots,
    pad,
    foot,
    tipSlot,
  );
  draw();
}
