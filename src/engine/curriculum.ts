// 커리큘럼: 레벨(L0~L3) × 유형(계이름 듣기·리듬 받아쓰기·선율 받아쓰기)의 단원 사다리 (기획 M3)
// 유형마다 단원이 쉬운 것부터 어려운 것 순서로 놓인다. 숙달·복습·배치고사는 이 순서를 따른다.

export type Track = 'degree' | 'rhythm' | 'dictation';

export interface Skill {
  id: string;
  track: Track;
  level: number;
  name: string;
  /** 받아쓰기 단원이 쓰는 기본 문제집 id */
  set?: string;
}

export const TRACKS: { id: Track; name: string; short: string }[] = [
  { id: 'degree', name: '계이름 듣기', short: '계이름' },
  { id: 'rhythm', name: '리듬 받아쓰기', short: '리듬' },
  { id: 'dictation', name: '선율 받아쓰기', short: '선율' },
];

/** 유형 레벨 표시: 구현된 레벨을 모두 마쳤으면 '완료' */
export const trackLevelText = (l: number) => (l > MAX_LEVEL ? '완료' : `L${l}`);

export const LEVELS = [
  { level: 0, name: '조성감', goal: '으뜸음을 기준으로 도·레·미를 구분한다' },
  { level: 1, name: '순차진행과 으뜸화음', goal: '2도·3도 선율과 도·미·솔 도약, 4분·2분음표' },
  { level: 2, name: '주요 3화음과 8분음표', goal: '파·티 경향음, IV·V 화음 도약, 4·5도 선율, 8분·점4분음표' },
  { level: 3, name: '단조와 빠른 리듬', goal: '라 으뜸 단조, 16분음표·당김음·6/8, 6도 선율' },
  { level: 4, name: '반음계와 전조', goal: '변화음(Fi·Si·Te), 근친조 전조, 2성부', planned: true },
  { level: 5, name: '초견과 채보', goal: '8마디 실전 받아쓰기, 낮은음자리표, 초견 시창', planned: true },
] as const;

/** 지금 풀 수 있는 마지막 레벨. L4·L5는 기획만 있다 */
export const MAX_LEVEL = 3;

export const SKILLS: Skill[] = [
  { id: 'd0a', track: 'degree', level: 0, name: '도·레·미' },
  { id: 'd0b', track: 'degree', level: 0, name: '도~솔' },
  { id: 'd1a', track: 'degree', level: 1, name: '장음계 순차진행' },
  { id: 'd1b', track: 'degree', level: 1, name: '으뜸화음 도약 (도·미·솔)' },
  { id: 'd2a', track: 'degree', level: 2, name: '경향음 (파→미, 티→도)' },
  { id: 'd2b', track: 'degree', level: 2, name: '딸림화음 도약 (솔·티·레)' },
  { id: 'd2c', track: 'degree', level: 2, name: '버금딸림화음 도약 (파·라·도)' },
  { id: 'd3a', track: 'degree', level: 3, name: '자연단음계 (라 으뜸)' },
  { id: 'd3b', track: 'degree', level: 3, name: '화성·가락단음계 (솔♯·파♯)' },

  { id: 'r1', track: 'rhythm', level: 1, name: '4분·2분·온음표' },
  { id: 'r2a', track: 'rhythm', level: 2, name: '8분음표와 4분쉼표' },
  { id: 'r2b', track: 'rhythm', level: 2, name: '점4분음표 + 8분음표' },
  { id: 'r3a', track: 'rhythm', level: 3, name: '16분음표' },
  { id: 'r3b', track: 'rhythm', level: 3, name: '붓점·당김음' },
  { id: 'r3c', track: 'rhythm', level: 3, name: '6/8 겹박자' },

  { id: 'm1a', track: 'dictation', level: 1, name: '2도 선율', set: '2nd' },
  { id: 'm1b', track: 'dictation', level: 1, name: '3도 선율', set: '3rd' },
  { id: 'm2a', track: 'dictation', level: 2, name: '4도 선율', set: '4th' },
  { id: 'm2b', track: 'dictation', level: 2, name: '5도 선율', set: '5th' },
  { id: 'm3a', track: 'dictation', level: 3, name: '6도 선율', set: '6th' },
  { id: 'm3b', track: 'dictation', level: 3, name: '단조 선율' },
];

export const skill = (id: string) => SKILLS.find((s) => s.id === id);

/** 한 유형의 단원 사다리(쉬운 것부터) */
export const ladder = (track: Track) => SKILLS.filter((s) => s.track === track);
