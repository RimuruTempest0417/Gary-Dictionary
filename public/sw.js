/* Service Worker（v0.14.0，F-2「加到主畫面」）
 *
 * 目的：老師和學生把網站加到主畫面之後，
 *   ① 開起來像 App（沒有瀏覽器介面）—— 這部分靠 manifest.json
 *   ② **沒網路時也開得起來**，而且已看過的生字還在 —— 這部分靠這支檔案
 *
 * ★ 快取策略（三條，刻意挑最安全的那一組）：
 *   1. **文件（HTML）→ network-first**：一定先用網路拿最新的，離線才用快取。
 *      為什麼不改用快取優先：網站會改版，快取優先會讓老師看到舊介面（而且「版本」會對不上）。
 *   2. **API 路徑完全不介入**：不攔、不快取。生字、權限、稽核必須即時；快取 API 等於端出過期資料。
 *   3. **靜態資源（css／js／img）→ cache-first**：它們的網址都帶 `?v=<版本>`，
 *      換版本就是換網址，所以舊快取永遠不會被誤用（也才有資格用快取優先來省流量）。
 *
 * ★ 改版時一定要改 CACHE_VERSION（`tests/pwa.test.js` 會檢查它與 package.json 的版本一致，
 *   忘記改的話測試會紅 —— 那正是「Service Worker 卡住舊版」這個經典問題的守門）。
 */
const CACHE_VERSION = '0.14.0';
const CACHE_NAME = `gary-dictionary-shell-${CACHE_VERSION}`;

/* 預先快取「應用外殼」：離線時要能開起來的最小集合（頁面 ＋ 樣式 ＋ 主要腳本 ＋ 圖示）。
 * 版本化的資源用 CACHE_VERSION 組出網址，和 index.html 的 ?v= 完全一致。 */
const SHELL = [
    '/',
    '/manifest.json',
    '/img/favicon.svg',
    '/img/icon-192.png',
    '/img/icon-512.png',
    '/img/icon-maskable-512.png',
    `/css/tokens.css?v=${CACHE_VERSION}`,
    `/css/app.css?v=${CACHE_VERSION}`,
    `/css/print.css?v=${CACHE_VERSION}`,
    `/js/i18n.js?v=${CACHE_VERSION}`,
    `/js/api.js?v=${CACHE_VERSION}`,
    `/js/ui.js?v=${CACHE_VERSION}`,
    `/js/auth.js?v=${CACHE_VERSION}`,
    `/js/errorlog.js?v=${CACHE_VERSION}`,
    `/js/audio.js?v=${CACHE_VERSION}`,
    `/js/playlist.js?v=${CACHE_VERSION}`,
    `/js/vocab.js?v=${CACHE_VERSION}`,
    `/js/xlsx.js?v=${CACHE_VERSION}`,
    `/js/admin.js?v=${CACHE_VERSION}`,
    `/js/users.js?v=${CACHE_VERSION}`,
    `/js/guide.js?v=${CACHE_VERSION}`,
    `/js/app.js?v=${CACHE_VERSION}`
];

self.addEventListener('install', (event) => {
    event.waitUntil((async () => {
        const cache = await caches.open(CACHE_NAME);
        /* 個別 add 而不是 addAll：任何一個檔案 404 都不該讓整個安裝失敗（addAll 會整批拒絕）。
         * 這裡刻意逐個 try —— 少一個檔案只是離線時少一個資源，不是災難。 */
        await Promise.all(SHELL.map((url) => cache.add(new Request(url, { cache: 'reload' })).catch(() => {})));
        await self.skipWaiting();
    })());
});

self.addEventListener('activate', (event) => {
    event.waitUntil((async () => {
        const names = await caches.keys();
        await Promise.all(names
            .filter((name) => name.startsWith('gary-dictionary-shell-') && name !== CACHE_NAME)
            .map((name) => caches.delete(name)));
        await self.clients.claim();
    })());
});

async function networkFirst(request) {
    const cache = await caches.open(CACHE_NAME);
    try {
        const response = await fetch(request);
        if (response && response.ok) cache.put(request, response.clone());
        return response;
    } catch (err) {
        const cached = await cache.match(request);
        if (cached) return cached;
        /* 離線又沒有這一頁的快取 → 至少把首頁外殼端出去（應用會自己顯示「沒有網路」的提示） */
        const shell = await cache.match('/');
        if (shell) return shell;
        throw err;
    }
}

async function cacheFirst(request) {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request);
    if (cached) return cached;
    const response = await fetch(request);
    if (response && response.ok) cache.put(request, response.clone());
    return response;
}

self.addEventListener('fetch', (event) => {
    const request = event.request;
    if (request.method !== 'GET') return;                       /* 寫入一律直接出去，不經過快取 */
    const url = new URL(request.url);
    if (url.origin !== self.location.origin) return;            /* 別人的資源不碰 */
    if (url.pathname.startsWith('/api/')) return;               /* API 即時、可能含個資 → 絕不快取 */
    if (url.pathname === '/sw.js') return;                      /* 這支檔案本身要能更新 */
    if (request.mode === 'navigate' || url.pathname === '/' || url.pathname.endsWith('.html')) {
        event.respondWith(networkFirst(request));
        return;
    }
    event.respondWith(cacheFirst(request));
});
