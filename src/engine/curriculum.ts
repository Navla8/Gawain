// 커리큘럼: 레벨(L0~L3) × 유형(계이름 듣기·리듬 받아쓰기·선율 받아쓰기·화성 듣기)의 단원 사다리 (기획 M3, §M7.4)
// 유형마다 단원이 쉬운 것부터 어려운 것 순서로 놓인다. 숙달·복습·배치고사는 이 순서를 따른다.

export type Track = 'degree' | 'rhythm' | 'dictation' | 'harmony';

export interface Skill {
  id: string;
  track: Track;
  level: number;
  name: string;
  /** 선수 단원: 이 단원이 쓰는 도약·리듬을 먼저 익히는 다른 유형의 단원(기획 §M5.1-2) */
  prereq?: string[];
  /** 이 단원 문항에 늘 들어 있는 같은 유형의 아래 단원. 이 단원을 맞히면 그 단원도 점검한 것으로 본다(기획 §M6.1) */
  covers?: string[];
}

export const TRACKS: { id: Track; name: string; short: string }[] = [
  { id: 'degree', name: '계이름 듣기', short: '계이름' },
  { id: 'rhythm', name: '리듬 받아쓰기', short: '리듬' },
  { id: 'dictation', name: '선율 받아쓰기', short: '선율' },
  { id: 'harmony', name: '화성 듣기', short: '화성' },
];

/** 유형 레벨 표시: 구현된 레벨을 모두 마쳤으면 '완료' */
export const trackLevelText = (l: number) => (l > MAX_LEVEL ? '완료' : `L${l}`);

export const LEVELS = [
  { level: 0, name: '조성감', goal: '으뜸음을 기준으로 도·레·미를 구분한다' },
  { level: 1, name: '순차진행과 으뜸화음', goal: '장음계 순차진행과 도·미·솔 도약, 4분·2분음표, 3화음 성질' },
  { level: 2, name: '주요 3화음과 8분음표', goal: '파·티 경향음, 딸림·버금딸림화음 도약, 8분·점4분음표, 종지·I·IV·V 진행' },
  { level: 3, name: '단조와 빠른 리듬', goal: '라 으뜸 단조, ii·vi·V7 도약, 16분음표·당김음·6/8·붙임줄, 못갖춘마디, 8마디 선율, 자리바꿈·V7·부3화음 진행' },
  { level: 4, name: '반음계와 전조', goal: '변화음(Fi·Si·Te), 근친조 전조, 2성부', planned: true },
  { level: 5, name: '초견과 채보', goal: '8마디 실전 받아쓰기, 낮은음자리표, 초견 시창', planned: true },
] as const;

/** 지금 풀 수 있는 마지막 레벨. L4·L5는 기획만 있다 */
export const MAX_LEVEL = 3;

export const SKILLS: Skill[] = [
  { id: 'd0a', track: 'degree', level: 0, name: '도·레·미' },
  { id: 'd0b', track: 'degree', level: 0, name: '도~솔', covers: ['d0a'] },
  { id: 'd1a', track: 'degree', level: 1, name: '장음계 순차진행', covers: ['d0b'] },
  { id: 'd1b', track: 'degree', level: 1, name: '으뜸화음 도약 (도·미·솔)' },
  { id: 'd2a', track: 'degree', level: 2, name: '경향음 (파→미, 티→도)' },
  { id: 'd2b', track: 'degree', level: 2, name: '딸림화음 도약 (솔·티·레)' },
  { id: 'd2c', track: 'degree', level: 2, name: '버금딸림화음 도약 (파·라·도)' },
  { id: 'd3a', track: 'degree', level: 3, name: '자연단음계 (라 으뜸)' },
  { id: 'd3b', track: 'degree', level: 3, name: '화성·가락단음계 (솔♯·파♯)' },
  { id: 'd3c', track: 'degree', level: 3, name: 'ii·vi·V7 도약 (레·라, 미·라, 솔·파)' },

  { id: 'r1', track: 'rhythm', level: 1, name: '4분·2분·온음표' },
  { id: 'r2a', track: 'rhythm', level: 2, name: '8분음표와 4분쉼표', covers: ['r1'] },
  { id: 'r2b', track: 'rhythm', level: 2, name: '점4분음표 + 8분음표', covers: ['r2a'] },
  { id: 'r3a', track: 'rhythm', level: 3, name: '16분음표', covers: ['r2b'] },
  { id: 'r3b', track: 'rhythm', level: 3, name: '붓점·당김음', covers: ['r3a'] },
  { id: 'r3c', track: 'rhythm', level: 3, name: '6/8 겹박자' },
  { id: 'r3d', track: 'rhythm', level: 3, name: '붙임줄 (마디선 넘기)', covers: ['r3b'] },

  // 6/8(r3c·g3a)·단조(g3b)·화성 기능별 계이름 단원은 위 단원에 늘 들어 있지 않아 covers가 없다. 따로 점검한다
  // 선율 받아쓰기: 대학 교재 순서(화성 기능), 한 단원에 새 요소 하나 (기획 §M5.2). 생성기는 engine/melody.ts
  { id: 'g1a', track: 'dictation', level: 1, name: '도~솔 순차 (2마디)', prereq: ['d0b', 'r1'] },
  { id: 'g1b', track: 'dictation', level: 1, name: '장음계 순차', prereq: ['d1a'], covers: ['g1a'] },
  { id: 'g1c', track: 'dictation', level: 1, name: '으뜸화음 도약', prereq: ['d1b'], covers: ['g1b'] },
  { id: 'g2a', track: 'dictation', level: 2, name: '8분음표', prereq: ['r2a'], covers: ['g1c'] },
  { id: 'g2b', track: 'dictation', level: 2, name: '딸림화음 도약', prereq: ['d2b'], covers: ['g2a'] },
  { id: 'g2c', track: 'dictation', level: 2, name: '버금딸림화음 도약', prereq: ['d2c'], covers: ['g2b'] },
  { id: 'g2d', track: 'dictation', level: 2, name: '점4분음표', prereq: ['r2b'], covers: ['g2c'] },
  { id: 'g3a', track: 'dictation', level: 3, name: '6/8 겹박자', prereq: ['r3c'] },
  { id: 'g3b', track: 'dictation', level: 3, name: '단조', prereq: ['d3a', 'd3b'] },
  { id: 'g3c', track: 'dictation', level: 3, name: 'ii·vi·V7 도약', prereq: ['d3c'], covers: ['g2d'] },
  { id: 'g3d', track: 'dictation', level: 3, name: '16분음표', prereq: ['r3a'], covers: ['g3c'] },
  { id: 'g3e', track: 'dictation', level: 3, name: '붓점·당김음', prereq: ['r3b'], covers: ['g3d'] },
  { id: 'g3g', track: 'dictation', level: 3, name: '못갖춘마디', covers: ['g3e'] },
  { id: 'g3f', track: 'dictation', level: 3, name: '8마디', covers: ['g3e'] },

  // 화성 듣기(기획 §M7.4): 생성기는 engine/harmony.ts
  { id: 'h1', track: 'harmony', level: 1, name: '3화음 성질 (장·단·감·증)' },
  { id: 'h2a', track: 'harmony', level: 2, name: '종지 (정격·반·변격·위)' },
  { id: 'h2b', track: 'harmony', level: 2, name: '주요 3화음 진행 (I·IV·V)' },
  { id: 'h3a', track: 'harmony', level: 3, name: '자리바꿈·V7 (I⁶·I⁶₄·V⁶·V⁷)', covers: ['h2b'] },
  { id: 'h3b', track: 'harmony', level: 3, name: '부3화음·단조 진행 (ii·vi / i·iv·VI·ii°⁶)', covers: ['h2b'] },
];

export const skill = (id: string) => SKILLS.find((s) => s.id === id);

/** 한 유형의 단원 사다리(쉬운 것부터) */
export const ladder = (track: Track) => SKILLS.filter((s) => s.track === track);

/** 이 단원 문항에 들어 있는 아래 단원 전부(covers를 따라간다, 가까운 것부터) */
export function within(id: string): string[] {
  const out: string[] = [];
  for (let q = [...(skill(id)?.covers ?? [])]; q.length;) {
    const x = q.shift()!;
    if (!out.includes(x)) { out.push(x); q.push(...(skill(x)?.covers ?? [])); }
  }
  return out;
}
