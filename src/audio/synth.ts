import { TPB, type Note, type Problem } from '../engine/types.ts';

// 외부 음원 파일 없이 Web Audio로 피아노 비슷한 소리를 합성한다 (기획 기술 스택: 소리)
let ctx: AudioContext | undefined;
let out: GainNode;
let playing: AudioScheduledSourceNode[] = [];
let timers: number[] = [];

/** sec초 뒤에 fn을 부른다. stopAll()이 함께 취소한다 */
export function later(sec: number, fn: () => void) {
  timers.push(window.setTimeout(fn, sec * 1000));
}

// 폰을 잠갔다 열거나 전화가 오면 iOS는 AudioContext를 끊는다('interrupted'/'suspended').
// 돌아와서 resume()만 하면 상태는 'running'인데 소리가 안 나는 경우가 있어,
// 끊긴 적이 있으면 다음 터치 때 컨텍스트를 새로 만든다.
let stale = false;

function createContext() {
  // iOS 17+: 무음 스위치가 켜져 있어도 미디어 소리로 재생
  const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
  if (session) session.type = 'playback';
  const c = new AudioContext();
  const comp = c.createDynamicsCompressor();
  out = c.createGain();
  out.gain.value = 0.5;
  out.connect(comp).connect(c.destination);
  c.onstatechange = () => {
    if (c === ctx && c.state !== 'running') stale = true;
  };
  ctx = c;
  stale = false;
}

/** 사용자 터치 안에서 처음 불러야 iOS가 소리를 허락한다 */
export function unlockAudio(): AudioContext {
  if (!ctx || ctx.state === 'closed') createContext();
  if (ctx!.state !== 'running') void ctx!.resume().catch(() => { stale = true; });
  return ctx!;
}

/** 사용자 터치마다 부른다: 끊긴 적이 있으면 컨텍스트를 새로 만들고, 아니면 깨운다 */
function wake() {
  if (!ctx) return; // 아직 소리를 낸 적이 없으면 첫 재생 때 만든다
  if (stale) {
    stopAll();
    const old = ctx;
    ctx = undefined;
    void old.close().catch(() => { /* 이미 닫힘 */ });
  }
  unlockAudio();
}

if (typeof window !== 'undefined') {
  // 캡처 단계라서 건반·버튼 핸들러보다 먼저 돈다
  for (const type of ['pointerdown', 'touchend', 'click', 'keydown']) {
    window.addEventListener(type, wake, { capture: true, passive: true });
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { stopAll(); stale = true; }
  });
  window.addEventListener('pagehide', () => { stale = true; });
}

const freq = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

/** 피아노 한 음: 배음 몇 개 + 빠른 어택 + 지수 감쇠 */
function piano(midi: number, at: number, length: number, velocity = 0.8) {
  const c = unlockAudio();
  const env = c.createGain();
  const filter = c.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = Math.min(9000, freq(midi) * 6);
  env.connect(filter).connect(out);
  const decay = 2.5 - (midi - 48) / 40; // 낮은 음일수록 길게 울린다
  const end = at + length + 0.25;
  env.gain.setValueAtTime(0, at);
  env.gain.linearRampToValueAtTime(velocity * 0.4, at + 0.005);
  env.gain.setTargetAtTime(velocity * 0.15, at + 0.005, decay / 4);
  env.gain.setTargetAtTime(0.0001, at + length, 0.08);
  // 낮은 음은 기음이 작은 스피커에서 잘 안 들려 2·3배음을 키운다(기획 §M7.6)
  const low = midi < 48;
  [[1, 1], [2, low ? 0.7 : 0.45], [3, low ? 0.35 : 0.2], [4, 0.1], [5, 0.04]].forEach(([h, g]) => {
    const o = c.createOscillator();
    const og = c.createGain();
    o.frequency.value = freq(midi) * h * (1 + 0.0004 * h * h); // 약간의 비조화성
    og.gain.value = g;
    o.connect(og).connect(env);
    o.start(at);
    o.stop(end);
    playing.push(o);
  });
}

function click(at: number, strong: boolean, volume = 0.3) {
  const c = unlockAudio();
  const o = c.createOscillator();
  const g = c.createGain();
  o.frequency.value = strong ? 1760 : 1320;
  g.gain.setValueAtTime(volume, at);
  g.gain.exponentialRampToValueAtTime(0.001, at + 0.06);
  o.connect(g).connect(out);
  o.start(at);
  o.stop(at + 0.07);
  playing.push(o);
}

export function stopAll() {
  playing.forEach((o) => { try { o.stop(); } catch { /* 이미 멈춤 */ } });
  playing = [];
  timers.forEach(clearTimeout);
  timers = [];
}

/** 건반을 눌렀을 때 바로 내는 소리 */
export function playKey(midi: number) {
  const c = unlockAudio();
  piano(midi, c.currentTime + 0.01, 0.6);
}

/** 음표열을 재생하고, 끝나는 시각(초)까지의 길이를 돌려준다 */
export function playNotes(notes: Note[], tempo: number, delay = 0.05): number {
  const c = unlockAudio();
  const sec = 60 / tempo / TPB;
  let t = c.currentTime + delay;
  let tied = 0;
  notes.forEach((n, i) => {
    if (n.midi !== null && !(i > 0 && notes[i - 1].tie && notes[i - 1].midi === n.midi)) {
      let len = n.dur;
      for (let j = i; notes[j].tie && notes[j + 1]?.midi === n.midi; j++) len += notes[j + 1].dur;
      piano(n.midi, t, len * sec * 0.95);
    }
    t += n.dur * sec;
    tied = t;
  });
  return tied - c.currentTime;
}

/** 카덴츠 I–IV–V–I(단조 i–iv–V–i, V는 이끈음 솔♯)의 화음: 으뜸음에서 몇 반음. 첫 음은 베이스(기획 §M7.1) */
export function cadenceChords(minor: boolean): number[][] {
  const third = minor ? 3 : 4, sixth = minor ? 8 : 9;
  return [[-12, 0, third, 7], [-7, 0, 5, sixth], [-5, -1, 2, 7], [-12, 0, third, 7]];
}

/** 카덴츠를 at부터 치고, 끝나는 시각을 돌려준다. 대학 청음 시험처럼 조성을 화음 진행으로 세운다 */
function cadence(tonic: number, minor: boolean, at: number): number {
  let t = at;
  cadenceChords(minor).forEach((chord, i, all) => {
    const last = i === all.length - 1;
    for (const x of chord) piano(tonic + x, t, last ? 1.0 : 0.55, 0.5);
    t += last ? 1.4 : 0.7;
  });
  return t;
}

/** 카덴츠만 친다. 전체 길이(초)를 돌려준다 */
export function playCadence(tonic: number, minor = false): number {
  const c = unlockAudio();
  stopAll();
  return cadence(tonic, minor, c.currentTime + 0.05) - c.currentTime;
}

/** 조성감 세우기: (첫 재생이면 카덴츠) → 준비박 1마디 → (melodyClick이면 메트로놈과 함께) 선율. 겹박자는 점4분음표마다 친다. 전체 길이(초)를 돌려준다 */
export function playProblem(p: Problem, withCadence: boolean, melodyClick = true): number {
  const c = unlockAudio();
  stopAll();
  let t = c.currentTime + 0.05;
  if (withCadence) t = cadence(p.tonic, !!p.minor, t);
  const beatTicks = p.beatTicks ?? TPB;
  const beat = (60 / p.tempo) * (beatTicks / TPB);
  // 못갖춘마디: 준비박 한 마디 뒤, 다음 마디의 비는 박도 준비박으로 세고 여린박에서 선율이 들어온다
  const lead = p.pickup ? p.beatsPerBar * beatTicks - p.pickup : 0;
  const count = p.beatsPerBar + lead / beatTicks;
  const melodyBeats = Math.ceil(p.notes.reduce((a, n) => a + n.dur, 0) / beatTicks);
  for (let b = 0; b < count + (melodyClick ? melodyBeats : 0); b++) click(t + b * beat, b % p.beatsPerBar === 0, b < count ? 0.3 : 0.12);
  t += count * beat;
  // 2성부는 아래 성부를 함께 친다
  const bass = p.bass ? playNotes(p.bass, p.tempo, t - c.currentTime) : 0;
  return Math.max(bass, playNotes(p.notes, p.tempo, t - c.currentTime));
}

/** 화성 듣기: 화음을 차례로(베이스 + 위 성부). arpeggio면 첫 화음을 아래부터 펼친 뒤 함께 친다. 전체 길이(초)를 돌려준다 */
export function playChords(chords: number[][], arpeggio = false, sec = 1.0): number {
  const c = unlockAudio();
  stopAll();
  let t = c.currentTime + 0.05;
  for (const chord of chords) {
    if (arpeggio) chord.forEach((m, i) => piano(m, t + i * 0.45, 0.4, 0.55));
    if (arpeggio) t += chord.length * 0.45 + 0.2;
    for (const m of chord) piano(m, t, sec * 0.9, 0.5);
    t += sec;
  }
  return t - c.currentTime;
}

/** 계이름 듣기: (처음이면 카덴츠) → 잠깐 쉬고 → 음들을 4분음표로. 전체 길이(초)를 돌려준다 */
export function playDegrees(midis: number[], tonic: number, minor: boolean, withCadence: boolean): number {
  const c = unlockAudio();
  stopAll();
  let t = c.currentTime + 0.05;
  if (withCadence) t = cadence(tonic, minor, t) + 0.5;
  return playNotes(midis.map((midi) => ({ midi, dur: TPB })), 72, t - c.currentTime);
}
