const LETTERS = 'CDEFGAB';
const NATURAL = [0, 2, 4, 5, 7, 9, 11];
const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const SOLFA = ['도', '레', '미', '파', '솔', '라', '티'];
const SOLFEGE = ['Do', 'Re', 'Mi', 'Fa', 'Sol', 'La', 'Ti'];
const SOLFEGE_SHARP = ['Di', 'Ri', '', 'Fi', 'Si', 'Li'];
const SOLFEGE_FLAT = ['', 'Ra', 'Me', '', 'Se', 'Le', 'Te'];
const ACC = { '-2': '𝄫', '-1': '♭', '0': '', '1': '♯', '2': '𝄪' } as Record<string, string>;

const mod = (a: number, n: number) => ((a % n) + n) % n;

export interface Spelling {
  letter: number; // 0=C … 6=B
  acc: number; // -1=♭, 1=♯
  octave: number;
  /** 오선 위치: letter + 7*octave. E4 = 30 (높은음자리표 첫째 줄) */
  step: number;
}

/** 으뜸음에서 몇 반음 위인지 → [음계 안 몇 번째 음, 임시표]. 음계 밖의 음은 아래 음+♯ 또는 위 음+♭.
 *  단조(라 으뜸)의 파♯(6)·솔♯(8)은 가락단음계·이끈음이라 ♭조에서도 올린 음으로 적는다 */
function degreeOf(rel: number, flat: boolean, minor = false, prefer?: 1 | -1): [number, number] {
  const r = mod(rel, 12);
  const i = MAJOR.indexOf(r);
  if (i >= 0) return [i, 0];
  const down = prefer ? prefer < 0 : flat && !(minor && (r === 6 || r === 8));
  return down ? [MAJOR.indexOf(mod(r + 1, 12)), -1] : [MAJOR.indexOf(mod(r - 1, 12)), 1];
}

/** 계이름을 읽는 조: 단조인지, 단조 도 기반이면 그 으뜸음 MIDI(기획 §M7.1) */
export interface KeyRead {
  minor?: boolean;
  minorTonic?: number;
}

/** prefer: 반음계 음을 올림(1)·내림(-1)으로 적는다(Note.spell, 기획 §M7.5) */
export function spell(midi: number, fifths: number, minor = false, prefer?: 1 | -1): Spelling {
  const [deg] = degreeOf(midi - fifths * 7, fifths < 0, minor, prefer);
  const letter = (mod(fifths * 4, 7) + deg) % 7;
  const acc = mod(midi - NATURAL[letter] + 2, 12) - 2;
  const octave = Math.round((midi - NATURAL[letter] - acc) / 12) - 1;
  return { letter, acc, octave, step: letter + 7 * octave };
}

/** 절대 음이름: C4, F♯4 */
export function noteName(midi: number, fifths: number, minor = false, prefer?: 1 | -1): string {
  const s = spell(midi, fifths, minor, prefer);
  return LETTERS[s.letter] + ACC[s.acc] + s.octave;
}

// 단조 도 기반(같은으뜸음조, 기획 §M7.1): 단조 으뜸음을 도로 읽는다. 반음은 단조에서 흔한 쪽(미♭·라♭·티♭, 가락단음계 라·티)
const DO_MINOR_SOLFA = ['도', '레♭', '레', '미♭', '미', '파', '파♯', '솔', '라♭', '라', '티♭', '티'];
const DO_MINOR_SOLFEGE = ['Do', 'Ra', 'Re', 'Me', 'Mi', 'Fa', 'Fi', 'Sol', 'Le', 'La', 'Te', 'Ti'];

/** 상대 계이름: 도 레 미 파 솔 라 티. 도는 조표로 정하므로 단조 으뜸음은 '라'(기획 §2).
 *  k.minorTonic(단조 으뜸음 MIDI)을 주면 단조 도 기반으로 읽는다 */
export function solfa(midi: number, fifths: number, k: KeyRead = {}, prefer?: 1 | -1): string {
  if (k.minorTonic !== undefined) return DO_MINOR_SOLFA[mod(midi - k.minorTonic, 12)];
  const [deg, alt] = degreeOf(midi - fifths * 7, fifths < 0, k.minor, prefer);
  return SOLFA[deg] + ACC[alt];
}

/** 솔페지 음절(이동도). 도는 조표로 정하므로 단조 으뜸음은 La, 반음은 spell()의 표기를 따른다 */
export function solfege(midi: number, fifths: number, k: KeyRead = {}, prefer?: 1 | -1): string {
  if (k.minorTonic !== undefined) return DO_MINOR_SOLFEGE[mod(midi - k.minorTonic, 12)];
  const [deg, alt] = degreeOf(midi - fifths * 7, fifths < 0, k.minor, prefer);
  return (alt > 0 ? SOLFEGE_SHARP : alt < 0 ? SOLFEGE_FLAT : SOLFEGE)[deg];
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

/** 조 이름: 'C 장조', 'A 단조' */
export function keyName(p: { tonic: number; fifths: number; minor?: boolean }): string {
  return `${noteName(p.tonic, p.fifths).replace(/-?\d+$/, '')} ${p.minor ? '단조' : '장조'}`;
}
