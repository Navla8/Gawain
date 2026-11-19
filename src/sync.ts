import { load, merge, setSavedHandler } from './store.ts';

// 기기 간 기록 동기화: 사용자 본인의 비공개(secret) GitHub Gist 한 개에 기록 파일을 두고,
// 받아서 합친 뒤(store.ts merge) 이 기기에만 있던 기록이 있으면 다시 올린다.
// 토큰은 이 기기에만 저장하고 빌드·저장소에 넣지 않는다(코딩 지침 §2.5).

const KEY = 'gawain.sync';
const API = 'https://api.github.com';
const FILE = 'gawain-records.json';
const DESC = 'Gawain sync';

interface SyncState {
  token?: string;
  gistId?: string;
  /** 마지막으로 성공한 동기화 시각(ISO) */
  last?: string;
}

export function syncState(): SyncState {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '{}'); } catch { return {}; }
}
function setState(s: SyncState) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* 저장 못 하는 환경 */ }
}

export class SyncError extends Error {
  kind: 'auth' | 'network' | 'server';
  constructor(kind: SyncError['kind'], message: string) { super(message); this.kind = kind; }
}

async function api(token: string, path: string, init: RequestInit = {}) {
  let res: Response;
  try {
    res = await fetch(API + path, {
      ...init,
      cache: 'no-store', // 다른 기기가 방금 올린 기록을 놓치지 않게
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', ...(init.body ? { 'Content-Type': 'application/json' } : {}) },
    });
  } catch {
    throw new SyncError('network', 'offline');
  }
  if (res.status === 401 || res.status === 403) throw new SyncError('auth', String(res.status));
  if (!res.ok) throw new SyncError('server', String(res.status));
  return res.json();
}

/** 기록 파일을 담은 Gist를 찾는다. 없으면 null */
async function findGist(token: string): Promise<string | null> {
  for (let page = 1; page <= 10; page++) {
    const list: { id: string; files: Record<string, unknown> }[] = await api(token, `/gists?per_page=100&page=${page}`);
    const hit = list.find((g) => FILE in g.files);
    if (hit) return hit.id;
    if (list.length < 100) return null;
  }
  return null;
}

/** Gist의 기록 파일 내용. 파일이 크면 API가 잘라 주므로 원본 주소에서 다시 받는다 */
async function readGist(token: string, id: string) {
  const g = await api(token, `/gists/${id}`);
  const f = g.files?.[FILE];
  if (!f) return {};
  let text: string = f.content ?? '';
  if (f.truncated) {
    try { text = await (await fetch(f.raw_url, { cache: 'no-store' })).text(); } catch { throw new SyncError('network', 'offline'); }
  }
  try { return JSON.parse(text || '{}'); } catch { return {}; }
}

const body = () => JSON.stringify({ app: 'gawain', version: 1, ...load() });

let running: Promise<number> | null = null;

/**
 * 받아서 합치고, 이 기기에만 있던 기록이 있으면 올린다. 새로 들어온 시도 수를 돌려준다.
 * token을 주면 그 토큰으로 처음 연결한다(성공해야 저장).
 */
export function sync(token?: string): Promise<number> {
  if (running) return running;
  running = run(token).finally(() => (running = null));
  return running;
}

async function run(newToken?: string): Promise<number> {
  const s = newToken ? { token: newToken } : syncState();
  if (!s.token) return 0;
  let id = s.gistId ?? (await findGist(s.token));
  let added = 0;
  if (!id) {
    const g = await api(s.token, '/gists', { method: 'POST', body: JSON.stringify({ description: DESC, public: false, files: { [FILE]: { content: body() } } }) });
    id = g.id as string;
  } else {
    let remote;
    try {
      remote = await readGist(s.token, id);
    } catch (e) {
      // 저장해 둔 Gist가 지워졌으면 다시 찾는다
      if (s.gistId && e instanceof SyncError && e.kind === 'server') { setState({ token: s.token }); return run(s.token); }
      throw e;
    }
    added = merge(remote);
    const local = load();
    const r = { attempts: remote.attempts?.length ?? 0, seconds: remote.seconds ?? {}, favorites: remote.favorites ?? {} };
    const ahead = local.attempts.length > r.attempts
      || Object.entries(local.seconds).some(([k, v]) => v > (r.seconds[k] ?? 0))
      || Object.entries(local.favorites ?? {}).some(([k, f]) => !r.favorites[k] || f.at > r.favorites[k].at);
    if (ahead) await api(s.token, `/gists/${id}`, { method: 'PATCH', body: JSON.stringify({ files: { [FILE]: { content: body() } } }) });
  }
  setState({ token: s.token, gistId: id, last: new Date().toISOString() });
  return added;
}

/** 이 기기의 연결을 끊는다(Gist와 기록은 그대로) */
export const disconnect = () => setState({});

/** 기록이 바뀐 뒤 이만큼 조용하면 올린다(문제마다 요청하지 않게) */
const PUSH_DELAY = 15_000;

/**
 * 자동 동기화: 앱을 열 때·다시 볼 때 받고, 기록이 바뀐 뒤 잠시 뒤와 앱을 내릴 때 올린다.
 * 실패는 조용히 넘기고 다음 기회에 다시 한다(오프라인 연습은 그대로).
 */
export function startAutoSync(onPulled: (added: number) => void) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const go = () => {
    clearTimeout(timer);
    if (!syncState().token) return;
    sync().then((n) => n && onPulled(n), () => {});
  };
  setSavedHandler(() => {
    if (running || !syncState().token) return; // 동기화 중 합치기로 생긴 저장은 다시 예약하지 않는다
    clearTimeout(timer);
    timer = setTimeout(go, PUSH_DELAY);
  });
  document.addEventListener('visibilitychange', go);
  addEventListener('online', go);
  go();
}
