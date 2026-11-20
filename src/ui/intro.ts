import { skill } from '../engine/curriculum.ts';
import { INTRO_COPY } from '../data/intros.ts';
import { degreeItem, isTonicSkill, resolution, rhythmItem, rng, tonicItem, type DegreeItem, type TonicItem } from '../engine/drills.ts';
import { QUALITIES, harmonyItem, pretty, realize, type HarmonyItem } from '../engine/harmony.ts';
import { melodyItem, memoryItem, tuneItem } from '../engine/melody.ts';
import { firstBars } from '../engine/grade.ts';
import { solfa } from '../engine/theory.ts';
import { later, playCadence, playChords, playDegrees, playKey, playProblem, playTonic, stopAll } from '../audio/synth.ts';
import { setCounting } from '../activity.ts';
import { keyRead, settings } from '../store.ts';
import { app, h, header } from './dom.ts';
import { renderStaff } from './staff.ts';
import { solve, type ItemCtx } from './dictation.ts';
import { degreeScreen, tonicScreen } from './degree.ts';
import { harmonyScreen } from './harmony.ts';
import { memoryScreen } from './memory.ts';

// 단원 소개(맛보기) 화면 (기획 §M12.1):
// - 정보 카드 1장(단원 이름 + 카드 문구 + 유형별 소리 예시)
// - 쉬운 문제: 첫 진입 2개, 재진입(lapsed·stepped) 1개. 틀리면 정답 재생 뒤 같은 문제 다시 풀기.
// - 모든 맛보기 시도는 intro: true로 기록해 숙달·오답 풀·레벨에서 제외한다.

const H2A_EXAMPLES: { name: string; sub: string; labels: string[]; sop?: number }[] = [
  { name: '정격 종지', sub: 'V → I', labels: ['I', 'IV', 'V', 'I'], sop: 0 },
  { name: '반종지', sub: 'IV → V', labels: ['I', 'IV', 'V'] },
  { name: '변격 종지', sub: 'IV → I', labels: ['I', 'V', 'I', 'IV', 'I'] },
  { name: '위종지', sub: 'V → vi', labels: ['I', 'IV', 'V', 'vi'] },
];

const K0_DEGREES: [string, number][] = [
  ['도', 0], ['레', 2], ['미', 4], ['파', 5], ['솔', 7], ['라', 9], ['티', 11],
];

const pickSeed = () => Math.floor(Math.random() * 1e9);

/** 범주형 선택지 축소(기획 §M12.1): 정답(+ 하나)만 남긴다 */
function slimChoices(choices: string[], answers: string[], seed: number): string[] {
  const need = new Set(answers);
  if (need.size < 2) {
    const other = choices.filter((c) => !need.has(c));
    if (other.length) need.add(other[Math.floor(rng(seed)() * other.length)]);
  }
  return choices.filter((c) => need.has(c));
}

function slimDegree(it: DegreeItem, seed: number): DegreeItem {
  const choices = slimChoices(it.choices, it.names, seed + 17);
  const choiceMidis = choices.map((c) => it.choiceMidis[it.choices.indexOf(c)]);
  return { ...it, choices, choiceMidis };
}

function slimHarmony(it: HarmonyItem, seed: number): HarmonyItem {
  return { ...it, choices: slimChoices(it.choices, it.answers, seed + 17) };
}

function slimTonic(it: TonicItem, seed: number): TonicItem {
  if (it.candidates.length <= 2) return it;
  const doMidi = it.candidates[it.answer];
  const others = it.candidates
    .map((m, i) => ({ m, n: it.candNames[i] }))
    .filter((_, i) => i !== it.answer);
  const dist = it.skill === 'k0c'
    ? (others.find((x) => x.n === '솔') ?? others[0])
    : others[Math.floor(rng(seed + 17)() * others.length)];
  const pair = rng(seed + 31)() < 0.5
    ? [{ m: doMidi, n: '도' }, dist]
    : [dist, { m: doMidi, n: '도' }];
  return {
    ...it,
    candidates: pair.map((x) => x.m),
    candNames: pair.map((x) => x.n),
    answer: pair.findIndex((x) => x.n === '도'),
  };
}

function makeProblem(id: string, seed: number) {
  const s = skill(id)!;
  if (s.track === 'rhythm') return rhythmItem(id, seed);
  if (s.track === 'memory') return memoryItem(id, seed, s.name);
  if (id === 't5') return tuneItem(seed);
  return melodyItem(id, seed, s.name);
}

/** 단원 소개(맛보기) 흐름 시작: 카드 1장 → 쉬운 문제 2개(재진입은 1개) → onDone */
export function startIntro(skillId: string, mode: 'first' | 'again', onDone: () => void, back?: () => void) {
  const s = skill(skillId);
  if (!s) { onDone(); return; }
  const totalProblems = mode === 'again' ? 1 : 2;
  const totalSteps = 1 + totalProblems;

  function showCard() {
    stopAll();
    setCounting(false);
    const note = h('p', { class: 'info' });
    const examples = buildCardExamples(skillId, note);

    app.replaceChildren(
      header(`${s!.name} · 맛보기`, [1, totalSteps], back),
      h('section', { class: 'intro' },
        h('p', { class: 'eyebrow' }, mode === 'again' ? '다시 감 잡기' : '단원 소개'),
        h('h1', {}, s!.name),
        h('p', {}, INTRO_COPY[skillId] ?? ''),
        examples,
        note,
        h('button', { class: 'cta', onclick: () => showEasy(0) }, `쉬운 문제 ${totalProblems}개 풀기`),
      ),
    );
  }

  function showEasy(idx: number, fixedSeed?: number) {
    const seed = fixedSeed ?? pickSeed();
    const step: [number, number] = [idx + 2, totalSteps];
    const next = idx + 1 < totalProblems ? () => showEasy(idx + 1) : onDone;
    const retrySame = () => showEasy(idx, seed);
    const baseCtx: ItemCtx = { skill: skillId, intro: true, step, back, next, retrySame };

    if (s!.track === 'degree') {
      if (isTonicSkill(skillId)) {
        const it = slimTonic(tonicItem(skillId, seed), seed);
        const playPreview = () => playDegrees([it.tonic], it.tonic, false, true);
        const introCue = idx === 0
          ? h('p', { class: 'intro-cue' },
            h('span', { class: 'tag' }, `맛보기 1/${totalProblems}`),
            h('strong', {}, "먼저 '도' 소리를 들어 보세요"),
            h('button', { class: 'mini', onclick: playPreview }, '▶ 도 듣기'),
          )
          : h('p', { class: 'intro-cue' }, h('span', { class: 'tag' }, `맛보기 ${idx + 1}/${totalProblems}`), h('strong', {}, "줄인 선택지에서 '도'를 골라 보세요"));
        tonicScreen(it, { ...baseCtx, introCue });
        if (idx === 0) playPreview();
        return;
      }
      const it = slimDegree(degreeItem(skillId, seed), seed);
      const k = keyRead(it);
      const show = (name: string) => (k.minorTonic === undefined ? name : solfa(it.choiceMidis[it.choices.indexOf(name)], it.fifths, k));
      const answerLabel = it.names.map(show).join(' · ');
      const playPreview = () => playDegrees(it.midis, it.tonic, it.minor, true);
      const introCue = idx === 0
        ? h('p', { class: 'intro-cue' },
          h('span', { class: 'tag' }, `맛보기 1/${totalProblems}`),
          h('strong', {}, `정답 미리 듣기 · ${answerLabel}`),
          h('button', { class: 'mini', onclick: playPreview }, '▶ 정답 듣기'),
        )
        : h('p', { class: 'intro-cue' }, h('span', { class: 'tag' }, `맛보기 ${idx + 1}/${totalProblems}`), h('strong', {}, '줄인 선택지로 직접 맞혀 보세요'));
      degreeScreen(it, { ...baseCtx, introCue });
      if (idx === 0) playPreview();
      return;
    }

    if (s!.track === 'harmony') {
      const it = slimHarmony(harmonyItem(skillId, seed), seed);
      const label = (x: string) => (it.given ? pretty(x) : x);
      const answerLabel = it.answers.map(label).join(' → ');
      const playPreview = () => playChords(it.chords, it.arpeggio);
      const introCue = idx === 0
        ? h('p', { class: 'intro-cue' },
          h('span', { class: 'tag' }, `맛보기 1/${totalProblems}`),
          h('strong', {}, `정답 미리 듣기 · ${answerLabel}`),
          h('button', { class: 'mini', onclick: playPreview }, '▶ 정답 듣기'),
        )
        : h('p', { class: 'intro-cue' }, h('span', { class: 'tag' }, `맛보기 ${idx + 1}/${totalProblems}`), h('strong', {}, '줄인 선택지로 직접 맞혀 보세요'));
      harmonyScreen(it, { ...baseCtx, introCue });
      if (idx === 0) playPreview();
      return;
    }

    // 받아쓰기형(rhythm·dictation·memory): 앞 2마디만, 재생 횟수 제한 없음
    const cut = firstBars(makeProblem(skillId, seed), 2);
    const introCue = h('p', { class: 'intro-cue' },
      h('span', { class: 'tag' }, `맛보기 ${idx + 1}/${totalProblems}`),
      h('strong', {}, `앞 ${cut.bars}마디만 · 재생 횟수 제한 없음`),
    );
    if (s!.track === 'rhythm') solve(cut, { ...baseCtx, rhythm: true, introCue });
    else if (s!.track === 'memory') memoryScreen(cut, { ...baseCtx, introCue });
    else solve(cut, { ...baseCtx, introCue });
  }

  showCard();
}

function buildCardExamples(skillId: string, note: HTMLElement): HTMLElement {
  const s = skill(skillId)!;

  if (s.track === 'harmony') {
    if (skillId === 'h1') {
      note.textContent = '버튼을 눌러 3화음 네 가지 성질을 비교해 들어 보세요';
      return h('div', { class: 'degree-pad wide intro-examples' },
        ...Object.entries(QUALITIES).map(([name, pcs]) =>
          h('button', { class: 'deg intro-btn', onclick: () => { stopAll(); playChords([pcs.map((x) => 60 + x)], true); } }, name)),
      );
    }
    if (skillId === 'h2a') {
      note.textContent = '네 종지의 끝 두 화음과 마침 느낌을 눌러 비교해 보세요';
      return h('div', { class: 'degree-pad wide intro-examples' },
        ...H2A_EXAMPLES.map((ex) =>
          h('button', {
            class: 'deg intro-btn',
            onclick: () => { stopAll(); playChords(realize(60, ex.labels, ex.sop)); },
          }, ex.name, h('small', {}, ex.sub))),
      );
    }
    const ex = harmonyItem(skillId, 1);
    const rootChord = ex.minor ? 'i' : 'I';
    note.textContent = `화음을 누르면 ${pretty(rootChord)} 다음으로 이어지는 소리가 납니다`;
    return h('div', { class: 'degree-pad intro-examples' },
      ...ex.choices.map((c) =>
        h('button', {
          class: 'deg intro-btn',
          onclick: () => { stopAll(); playChords(realize(ex.tonic, c === rootChord ? [c] : [rootChord, c])); },
        }, pretty(c))),
    );
  }

  if (s.track === 'degree') {
    if (isTonicSkill(skillId)) {
      const pool = skillId === 'k0a' ? K0_DEGREES.filter(([n]) => ['도', '레', '파', '솔', '라'].includes(n)) : K0_DEGREES;
      const sampleK0c = skillId === 'k0c' ? tonicItem('k0c', 1) : undefined;
      note.textContent = "카덴츠를 먼저 들은 뒤 '도'와 다른 음의 안정감을 비교해 보세요";
      return h('div', { class: 'intro-stack' },
        h('div', { class: 'listen' },
          h('button', { class: 'ghost', onclick: () => playCadence(60, false) }, '카덴츠 듣기'),
          sampleK0c ? h('button', { class: 'ghost', onclick: () => playTonic(sampleK0c.tonic, sampleK0c.lead, [sampleK0c.tonic]) }, '선율 뒤 도 듣기') : '',
        ),
        h('div', { class: 'degree-pad intro-examples' },
          ...pool.map(([name, rel]) =>
            h('button', {
              class: 'deg intro-btn',
              onclick: () => playKey(60 + rel),
            }, name, rel === 0 ? h('small', {}, '으뜸음') : '')),
        ),
      );
    }
    const ex = degreeItem(skillId, 1);
    const k = keyRead(ex);
    const show = (name: string) => (k.minorTonic === undefined ? name : solfa(ex.choiceMidis[ex.choices.indexOf(name)], ex.fifths, k));
    note.textContent = skillId === 'k0d'
      ? '계이름을 누르면 그 음에서 도까지 차례로 풀려 가는 소리가 납니다'
      : '카덴츠를 들은 뒤 각 계이름을 눌러 소리를 익혀 보세요';
    return h('div', { class: 'intro-stack' },
      h('div', { class: 'listen' },
        h('button', { class: 'ghost', onclick: () => playCadence(ex.tonic, ex.minor) }, '카덴츠 듣기'),
      ),
      h('div', { class: 'degree-pad intro-examples' },
        ...ex.choices.map((name, i) =>
          h('button', {
            class: 'deg intro-btn',
            onclick: () => {
              if (skillId === 'k0d') {
                const rels = resolution(ex.choiceMidis[i] - ex.tonic);
                playDegrees(rels.map((x) => ex.tonic + x), ex.tonic, false, false, 96);
                note.textContent = rels.map((x) => solfa(ex.tonic + x, ex.fifths)).join(' → ');
              } else {
                playKey(ex.choiceMidis[i]);
              }
            },
          }, show(name))),
      ),
    );
  }

  // 받아쓰기형(rhythm·dictation·memory): 문항 하나(앞 2마디)를 악보와 함께 들려준다
  const rhythm = s.track === 'rhythm';
  const sample = firstBars(makeProblem(skillId, 1), 2);
  const staffOpts = {
    fifths: sample.fifths, beatsPerBar: sample.beatsPerBar, beatTicks: sample.beatTicks, bars: sample.bars,
    pickup: sample.pickup, solfege: !rhythm, key: keyRead(sample), takadimi: true, modulation: sample.modulation,
  };
  const svgs = [
    renderStaff({ ...staffOpts, notes: sample.notes, clef: sample.clef }),
    ...(sample.bass ? [renderStaff({ ...staffOpts, notes: sample.bass, clef: 'bass' as const })] : []),
  ];
  const staffBox = h('div', { class: 'staff-box' + (sample.bass ? ' two' : '') }, ...svgs);
  let playing = false;
  const playBtn = h('button', { class: 'ghost' }, '▶  예시 듣기');
  const setBtn = () => {
    playBtn.textContent = playing ? '■  정지' : '▶  예시 듣기';
  };
  playBtn.onclick = () => {
    if (playing) {
      stopAll();
      playing = false;
      setBtn();
      return;
    }
    playing = true;
    setBtn();
    const sec = playProblem(sample, !rhythm, settings().melodyClick);
    later(sec + 0.3, () => { playing = false; setBtn(); });
  };
  note.textContent = `앞 ${sample.bars}마디 예시를 악보와 함께 들어 보세요`;
  queueMicrotask(() => {
    const box = staffBox.clientWidth - 2;
    if (box <= 0) return;
    for (const svg of svgs) {
      const natural = Number(svg.getAttribute('width'));
      if (natural > box) { svg.style.width = `${Math.max(box, natural * 0.65)}px`; svg.style.height = 'auto'; }
    }
  });
  return h('div', { class: 'intro-stack' },
    h('div', { class: 'listen' }, playBtn),
    staffBox,
  );
}
