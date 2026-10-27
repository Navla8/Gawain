import { TPB, type Note } from '../engine/types.ts';

// 외부 음원 파일 없이 Web Audio로 피아노 비슷한 소리를 합성한다 (기획 기술 스택: 소리)
let ctx: AudioContext | undefined;
let out: GainNode;
let playing: AudioScheduledSourceNode[] = [];
let timers: number[] = [];

/** sec초 뒤에 fn을 부른다. stopAll()이 함께 취소한다 */
export function later(sec: number, fn: () => void) {
  timers.push(window.setTimeout(fn, sec * 1000));
}

/** 사용자 터치 안에서 처음 불러야 iOS가 소리를 허락한다 */
export function unlockAudio(): AudioContext {
  if (!ctx) {
    // iOS 17+: 무음 스위치가 켜져 있어도 미디어 소리로 재생
    const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
    if (session) session.type = 'playback';
    ctx = new AudioContext();
    const comp = ctx.createDynamicsCompressor();
    out = ctx.createGain();
    out.gain.value = 0.5;
    out.connect(comp).connect(ctx.destination);
  }
  if (ctx.state !== 'running') void ctx.resume();
  return ctx;
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
  [[1, 1], [2, 0.45], [3, 0.2], [4, 0.1], [5, 0.04]].forEach(([h, g]) => {
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

const MAJOR = [0, 2, 4, 5, 7, 9, 11, 12];
const MINOR = [0, 2, 3, 5, 7, 8, 10, 12]; // 라~라 (자연단음계)

/** 조성감 세우기: 음계 도~도(단조는 라~라) → 준비박 1마디 → 메트로놈과 함께 선율. 전체 길이(초)를 돌려준다 */
export function playProblem(notes: Note[], tonic: number, beatsPerBar: number, tempo: number, withScale = true, minor = false): number {
  const c = unlockAudio();
  stopAll();
  let t = c.currentTime + 0.05;
  if (withScale) {
    (minor ? MINOR : MAJOR).forEach((step, i, all) => {
      const last = i === all.length - 1;
      piano(tonic + step, t, last ? 0.7 : 0.3, 0.6);
      t += last ? 1.1 : 0.32;
    });
  }
  const beat = 60 / tempo;
  const melodyBeats = Math.ceil(notes.reduce((a, n) => a + n.dur, 0) / TPB);
  for (let b = 0; b < beatsPerBar + melodyBeats; b++) click(t + b * beat, b % beatsPerBar === 0, b < beatsPerBar ? 0.3 : 0.12);
  t += beatsPerBar * beat;
  return playNotes(notes, tempo, t - c.currentTime);
}
