/* 紫微斗数工具箱 Service Worker
 * 目标：http(s) 部署时可「安装到桌面」，并在断网刷新后仍能打开（离线单文件版不注册 SW）。
 * 策略：
 *  - install：预缓存应用外壳（index.html / manifest / 图标）
 *  - navigate：网络优先，失败回退缓存的 index.html（HashRouter 单页，所有路由都落到它）
 *  - 同源静态资源：缓存优先 + 后台更新（stale-while-revalidate）
 */
// 构建时由 scripts/stamp-sw.mjs 注入（每次部署都不同，确保浏览器能检测到更新）
const CACHE = 'ziwei-cache-1.5.6-mwa9n5hl';
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-512-maskable.png',
  './icons/icon-180.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// 页面可发消息要求新 SW 立即接管（配合 controllerchange 自动刷新）
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // 页面导航：优先网络（拿到新版本），断网时回退缓存外壳
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req, { cache: 'no-store' })
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put('./index.html', copy));
          return res;
        })
        .catch(() =>
          caches.match('./index.html').then((cached) => cached || caches.match('./')),
        ),
    );
    return;
  }

  // 静态资源：缓存优先，后台更新
  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res && res.status === 200 && res.type === 'basic') {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    }),
  );
});
