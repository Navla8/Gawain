// 박 하나(4분음표)를 12틱으로 나눈다. 16분음표(3)와 셋잇단 8분음표(4)를 모두 정수로 표현할 수 있다.
export const TPB = 12;

/** 악보에 적힌 음표 하나. midi가 null이면 쉼표, tie가 true면 다음 음표와 붙임줄로 이어진다. */
export interface Note {
  midi: number | null;
  dur: number;
  tie?: boolean;
  /** 반음계 음의 표기: 1이면 올림(♯·♮, 위로 해결), -1이면 내림(♭·♮, 아래로 해결). 없으면 조표 방향(기획 §M7.5) */
  spell?: 1 | -1;
}

export interface Problem {
  id: string;
  title: string;
  /** 으뜸음 MIDI 번호. 시작 음계와 상대 계이름의 기준 */
  tonic: number;
  /** 단조면 tonic은 '라' (기획 §2: 단조는 라 으뜸). 없으면 장조 */
  minor?: boolean;
  /** 조표: 양수는 ♯ 개수, 음수는 ♭ 개수 */
  fifths: number;
  beatsPerBar: number;
  /** 한 박의 틱 수. 홑박자는 12(4분음표), 겹박자(6/8)는 18(점4분음표). 없으면 12 */
  beatTicks?: number;
  /** 마디 수(못갖춘마디가 있으면 첫 마디와 마지막 마디를 합쳐 한 마디로 센다) */
  bars: number;
  /** 못갖춘마디의 길이(틱). 첫 마디가 이만큼만 있고 마지막 마디가 이만큼 짧다 */
  pickup?: number;
  /** 낮은음자리표로 적는 선율(없으면 높은음자리표) */
  clef?: 'bass';
  /** 2성부 받아쓰기의 아래 성부(낮은음자리표, 기획 §M7.6) */
  bass?: Note[];
  /** 재생 횟수(없으면 기본 5회) */
  plays?: number;
  /** 전조: 이 틱부터 으뜸음(도)이 바뀐다. 계이름·솔페지를 새 도로 읽는다(기획 §M7.5) */
  modulation?: { at: number; tonic: number };
  /** 4분음표 기준 BPM */
  tempo: number;
  notes: Note[];
}

/** 한 마디의 틱 수 */
export const barTicks = (p: Pick<Problem, 'beatsPerBar' | 'beatTicks'>) => p.beatsPerBar * (p.beatTicks ?? TPB);

/** 박자표 [위, 아래]: 겹박자는 8분음표 단위로 적는다 (2박 × 점4분 = 6/8) */
export const timeSignature = (p: Pick<Problem, 'beatsPerBar' | 'beatTicks'>): [number, number] =>
  (p.beatTicks ?? TPB) === 18 ? [p.beatsPerBar * 3, 8] : [p.beatsPerBar, 4];

/** 붙임줄을 합친 실제 소리 단위. src는 이 소리를 이루는 Note의 인덱스 */
export interface SoundEvent {
  midi: number | null;
  start: number;
  dur: number;
  src: number[];
}
