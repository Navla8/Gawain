const LETTERS = 'CDEFGAB';
const NATURAL = [0, 2, 4, 5, 7, 9, 11];
const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const SOLFA = ['도', '레', '미', '파', '솔', '라', '티'];
const ACC = { '-2': '𝄫', '-1': '♭', '0': '', '1': '♯', '2': '𝄪' } as Record<string, string>;

const mod = (a: number, n: number) => ((a % n) + n) % n;

export interface Spelling {
  letter: number; // 0=C … 6=B
  acc: number; // -1=♭, 1=♯
  octave: number;
  /** 오선 위치: letter + 7*octave. E4 = 30 (높은음자리표 첫째 줄) */
  step: number;
}

/** 으뜸음에서 몇 반음 위인지 → [음계 안 몇 번째 음, 임시표]. 음계 밖의 음은 아래 음+♯ 또는 위 음+♭ */
function degreeOf(rel: number, flat: boolean): [number, number] {
  const i = MAJOR.indexOf(mod(rel, 12));
  if (i >= 0) return [i, 0];
  return flat ? [MAJOR.indexOf(mod(rel + 1, 12)), -1] : [MAJOR.indexOf(mod(rel - 1, 12)), 1];
}

export function spell(midi: number, fifths: number): Spelling {
  const [deg] = degreeOf(midi - fifths * 7, fifths < 0);
  const letter = (mod(fifths * 4, 7) + deg) % 7;
  const acc = mod(midi - NATURAL[letter] + 2, 12) - 2;
  const octave = Math.round((midi - NATURAL[letter] - acc) / 12) - 1;
  return { letter, acc, octave, step: letter + 7 * octave };
}

/** 절대 음이름: C4, F♯4 */
export function noteName(midi: number, fifths: number): string {
  const s = spell(midi, fifths);
  return LETTERS[s.letter] + ACC[s.acc] + s.octave;
}

/** 상대 계이름(으뜸음 = 도): 도 레 미 파 솔 라 티 */
export function solfa(midi: number, tonic: number, fifths: number): string {
  const [deg, alt] = degreeOf(midi - tonic, fifths < 0);
  return SOLFA[deg] + ACC[alt];
}

const SHARP_STEPS = [38, 35, 39, 36, 33, 37, 34];
const FLAT_STEPS = [34, 37, 33, 36, 32, 35, 31];

/** 높은음자리표 조표의 오선 위치와 임시표 */
export function keySignatureSteps(fifths: number): { step: number; acc: number }[] {
  return fifths >= 0
    ? SHARP_STEPS.slice(0, fifths).map((step) => ({ step, acc: 1 }))
    : FLAT_STEPS.slice(0, -fifths).map((step) => ({ step, acc: -1 }));
}

/** 조표가 이 글자(C~B)에 붙이는 임시표 */
export function keyAccidental(letter: number, fifths: number): number {
  return keySignatureSteps(fifths).find((k) => mod(k.step, 7) === letter)?.acc ?? 0;
}

export const accidentalSymbol = (acc: number) => ACC[acc] || '♮';

export const KEY_NAMES: Record<number, string> = {
  [-6]: 'G♭', [-5]: 'D♭', [-4]: 'A♭', [-3]: 'E♭', [-2]: 'B♭', [-1]: 'F', 0: 'C', 1: 'G', 2: 'D', 3: 'A', 4: 'E', 5: 'B', 6: 'F♯',
};
