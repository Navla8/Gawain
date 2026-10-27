import { defineConfig, type Plugin } from 'vite';

// 빌드 결과 파일 목록을 서비스 워커에 넣어, 첫 방문 때 전부 캐시해 오프라인에서도 열리게 한다.
function serviceWorker(): Plugin {
  return {
    name: 'gawain-sw',
    apply: 'build',
    generateBundle(_, bundle) {
      const publicFiles = ['manifest.webmanifest', 'icon-180.png', 'icon-192.png', 'icon-512.png'];
      const files = ['./', ...[...Object.keys(bundle), ...publicFiles].map((f) => './' + f)];
      const version = Date.now().toString(36);
      this.emitFile({
        type: 'asset',
        fileName: 'sw.js',
        source: `const CACHE = 'gawain-${version}';
const FILES = ${JSON.stringify(files)};
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  // 앱 열기(페이지 이동)는 네트워크 먼저, 오프라인이면 캐시한 첫 화면. 나머지 파일은 캐시 먼저
  if (e.request.mode === 'navigate') {
    e.respondWith(fetch(e.request).catch(() => caches.match('./')));
    return;
  }
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then((r) => r || fetch(e.request)));
});
`,
      });
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [serviceWorker()],
  build: { sourcemap: false },
});
