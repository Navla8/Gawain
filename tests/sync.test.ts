import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// 두 기기를 흉내 낸다: 기기마다 localStorage가 따로고, Gist(가짜 GitHub API)는 하나
const devices = { phone: new Map<string, string>(), pad: new Map<string, string>() };
let mem = devices.phone;
Object.assign(globalThis, {
  localStorage: { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) },
});

const TOKEN = 'test-token';
let gists: Record<string, { files: Record<string, { content: string }> }> = {};
let calls: string[] = [];
let offline = false;
let made = 0;
globalThis.fetch = (async (url: string, init: RequestInit = {}) => {
  if (offline) throw new TypeError('Failed to fetch');
  const method = init.method ?? 'GET';
  calls.push(`${method} ${url.replace('https://api.github.com', '')}`);
  const json = (status: number, b: unknown) => new Response(JSON.stringify(b), { status });
  if ((init.headers as Record<string, string>).Authorization !== `Bearer ${TOKEN}`) return json(401, {});
  const path = new URL(url).pathname;
  if (path === '/gists' && method === 'GET') return json(200, Object.entries(gists).map(([id, g]) => ({ id, files: g.files })));
  if (path === '/gists' && method === 'POST') {
    const id = `g${++made}`;
    gists[id] = { files: JSON.parse(init.body as string).files };
    return json(201, { id });
  }
  const id = path.split('/')[2];
  if (!gists[id]) return json(404, {});
  if (method === 'PATCH') { Object.assign(gists[id].files, JSON.parse(init.body as string).files); return json(200, {}); }
  return json(200, { files: gists[id].files });
}) as typeof fetch;

const { record, load, addSeconds, setFavorite, favoriteIds } = await import('../src/store.ts');
const { sync, syncState, disconnect, SyncError } = await import('../src/sync.ts');
const att = (i: number) => ({ at: `2026-11-1${i}T00:00:00Z`, problemId: `p${i}`, answer: [], pitchScore: 1, rhythmScore: 1, plays: 1, seconds: 1 });
const on = (d: Map<string, string>) => (mem = d);

beforeEach(() => {
  devices.phone.clear(); devices.pad.clear(); gists = {}; calls = []; offline = false; made = 0; on(devices.phone);
});

test('처음 연결한 기기가 비공개 Gist를 만들고, 두 번째 기기는 그것을 찾아 합친다', async () => {
  record(att(1));
  await sync(TOKEN);
  assert.equal(Object.keys(gists).length, 1);
  assert.equal(syncState().gistId, 'g1');

  on(devices.pad);
  record(att(2));
  assert.equal(await sync(TOKEN), 1); // 폰의 기록 1개가 들어옴
  assert.equal(Object.keys(gists).length, 1, '새 Gist를 또 만들지 않는다');
  assert.deepEqual(load().attempts.map((a) => a.problemId), ['p1', 'p2']);

  on(devices.phone);
  assert.equal(await sync(), 1); // 패드의 기록이 폰으로
  assert.deepEqual(load().attempts.map((a) => a.problemId), ['p1', 'p2']);
});

test('받기만 하고 새 기록이 없으면 올리지 않는다', async () => {
  record(att(1));
  await sync(TOKEN);
  calls = [];
  await sync();
  assert.deepEqual(calls, ['GET /gists/g1']);
});

test('하루 연습 시간은 기기를 오가며 이어서 쌓인다', async () => {
  addSeconds(300);
  await sync(TOKEN);
  on(devices.pad);
  await sync(TOKEN);
  const total = addSeconds(200);
  assert.equal(total, 500);
  await sync();
  on(devices.phone);
  await sync();
  assert.equal(Object.values(load().seconds)[0], 500);
});

test('토큰이 틀리면 저장하지 않고, 오프라인이면 기록은 그대로 둔다', async () => {
  await assert.rejects(sync('wrong'), (e) => e instanceof SyncError && e.kind === 'auth');
  assert.equal(syncState().token, undefined);

  record(att(1));
  await sync(TOKEN);
  offline = true;
  record(att(2));
  await assert.rejects(sync(), (e) => e instanceof SyncError && e.kind === 'network');
  assert.equal(load().attempts.length, 2);
  offline = false;
  await sync();
  assert.equal(JSON.parse(gists.g1.files['gawain-records.json'].content).attempts.length, 2);
});

test('Gist가 지워졌으면 새로 만들고, 연결을 끊으면 토큰을 지운다', async () => {
  await sync(TOKEN);
  delete gists.g1;
  record(att(1));
  await sync();
  assert.equal(syncState().gistId, 'g2');
  disconnect();
  assert.deepEqual(syncState(), {});
  assert.equal(load().attempts.length, 1);
});

test('즐겨찾기 켜기·해제가 기기 사이에 동기화된다', async () => {
  setFavorite('g1a', true);
  await sync(TOKEN);
  on(devices.pad);
  assert.equal(await sync(TOKEN), 1);
  assert.deepEqual(favoriteIds(), ['g1a']);
  // 받기만 한 기기는 다시 올리지 않는다
  calls = [];
  await sync();
  assert.deepEqual(calls, ['GET /gists/g1']);
  // pad에서 해제하면 phone에도 해제가 반영된다
  await new Promise((r) => setTimeout(r, 5));
  setFavorite('g1a', false);
  await sync();
  on(devices.phone);
  assert.equal(await sync(), 1);
  assert.deepEqual(favoriteIds(), []);
});
