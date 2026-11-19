import type { Note } from './engine/types.ts';
import { dayKey } from './engine/habit.ts';

// 연습 기록은 이 기기에 저장하고, 동기화를 켜면 본인의 비공개 Gist와만 주고받는다 (코딩 지침 §2.5, sync.ts)
const KEY = 'gawain.v1';

export interface Attempt {
  at: string;
  problemId: string;
  /** 받아쓰기는 적은 음표, 계이름 듣기는 누른 계이름 */
  answer: Note[] | string[];
  /** 2성부 받아쓰기의 아래 성부 답 */
  answerBass?: Note[];
  pitchScore: number;
  rhythmScore: number;
  plays: number;
  seconds: number;
  /** 대련·배치고사에서 푼 단원(기획 M3). 자유 연습은 없음 */
  skill?: string;
  placement?: boolean;
  /** 배치고사 마지막 문항(끝까지 봄) */
  placementEnd?: boolean;
  /** 결과 화면에서 정답을 본 직후의 '고쳐 보기'·'처음부터' 시도(오답 풀을 비우지 않음) */
  fix?: boolean;
  /** 틀린 요소(계이름 듣기: 틀린 계이름) */
  miss?: string[];
}

export interface Favorite {
  on: boolean;
  at: string;
}

export interface Data {
  attempts: Attempt[];
  /** 날짜별 실제 풀이 시간(초) */
  seconds: Record<string, number>;
  /** 단원 즐겨찾기(해제 전파를 위해 on/off와 시각을 저장, 기획 §M9.2) */
  favorites?: Record<string, Favorite>;
}

/** 화면 설정(기기별, 기록과 따로 둔다) */
export interface Settings {
  /** 단조 계이름을 도 기반(같은으뜸음조)으로 읽는다. 기본은 라 기반(기획 §M7.1) */
  minorDo: boolean;
  /** 선율이 나오는 동안에도 메트로놈을 친다. 끄면 준비박만(기획 §M7.3) */
  melodyClick: boolean;
  /** 받아쓰기 건반을 누르면 소리가 난다. 끄면 내청으로만 적는다(기획 §M7.3) */
  keySound: boolean;
}
const SETTINGS = 'gawain.settings';
const DEFAULTS: Settings = { minorDo: false, melodyClick: true, keySound: true };

export function settings(): Settings {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(SETTINGS) ?? '{}') };
  } catch {
    return { ...DEFAULTS };
  }
}

export function setSettings(patch: Partial<Settings>) {
  try { localStorage.setItem(SETTINGS, JSON.stringify({ ...settings(), ...patch })); } catch { /* 저장 못 하는 환경 */ }
}

/** 이 문제의 계이름을 읽는 법: 단조인지, 단조 도 기반 설정이면 그 으뜸음(theory.ts KeyRead) */
export const keyRead = (p: { tonic: number; minor?: boolean }) => ({ minor: !!p.minor, ...(p.minor && settings().minorDo && { minorTonic: p.tonic }) });

const empty = (): Data => ({ attempts: [], seconds: {} });

/** 저장된 기록. 없으면 빈 기록, 있는데 읽을 수 없으면 null(빈 기록으로 덮어쓰지 않으려고 구분한다) */
function read(): Data | null {
  let raw: string | null = null;
  try { raw = localStorage.getItem(KEY); } catch { return empty(); }
  if (raw === null) return empty();
  try {
    const d = JSON.parse(raw);
    return { attempts: d.attempts ?? [], seconds: d.seconds ?? {}, ...(d.favorites && { favorites: d.favorites }) };
  } catch {
    return null;
  }
}

export const load = (): Data => read() ?? empty();

let onSaveFail: (() => void) | undefined;
let warned = false;
/** 기록을 저장하지 못했을 때 부를 알림(한 번만, 화면이 정한다) */
export const setSaveFailHandler = (f: () => void) => { onSaveFail = f; warned = false; };
const saveFailed = () => { if (!warned) { warned = true; onSaveFail?.(); } };

let onSaved: (() => void) | undefined;
/** 기록이 바뀔 때마다 부를 함수(기기 간 동기화 예약, sync.ts) */
export const setSavedHandler = (f: () => void) => { onSaved = f; };

/** 시도 하나를 기록한다 */
export const record = (a: Attempt) => save((d) => d.attempts.push(a));

/** 단원 즐겨찾기를 켜거나 끈다 */
export const setFavorite = (id: string, on: boolean) => save((d) => { (d.favorites ??= {})[id] = { on, at: new Date().toISOString() }; });

/** 즐겨찾기된 단원 id 목록 */
export const favoriteIds = (): string[] => Object.entries(load().favorites ?? {}).filter(([, f]) => f.on).map(([id]) => id);

export function save(update: (d: Data) => void) {
  const d = read();
  if (!d) return saveFailed(); // 읽을 수 없는 기록은 건드리지 않는다
  update(d);
  try {
    localStorage.setItem(KEY, JSON.stringify(d));
    onSaved?.();
  } catch {
    saveFailed(); // 한도 초과·사생활 보호 모드 등: 기록만 건너뛰되 알린다
  }
}

/** 오늘 풀이 시간을 더하고, 더한 뒤의 오늘 합계를 돌려준다 */
export function addSeconds(n: number): number {
  const key = dayKey(new Date());
  let total = 0;
  save((d) => (total = d.seconds[key] = (d.seconds[key] ?? 0) + n));
  return total;
}

/** 내보낸 기록 파일을 합친다. 같은 시도는 한 번만, 날짜별 시간은 큰 쪽. 새로 들어온 시도 수를 돌려준다 */
export function merge(incoming: Partial<Data>): number {
  let added = 0;
  save((d) => {
    const seen = new Set(d.attempts.map((a) => a.at + a.problemId));
    for (const a of incoming.attempts ?? []) {
      if (typeof a?.at !== 'string' || typeof a.problemId !== 'string' || seen.has(a.at + a.problemId)) continue;
      d.attempts.push(a);
      seen.add(a.at + a.problemId);
      added++;
    }
    d.attempts.sort((x, y) => x.at.localeCompare(y.at)); // 다른 기기의 옛 기록이 '최근'으로 집계되지 않게
    for (const [k, v] of Object.entries(incoming.seconds ?? {})) if (typeof v === 'number') d.seconds[k] = Math.max(d.seconds[k] ?? 0, v);
    for (const [k, v] of Object.entries(incoming.favorites ?? {})) {
      if (typeof v?.on !== 'boolean' || typeof v.at !== 'string') continue;
      const cur = d.favorites?.[k];
      if (cur && cur.at >= v.at) continue;
      (d.favorites ??= {})[k] = { on: v.on, at: v.at };
      added++;
    }
  });
  return added;
}
