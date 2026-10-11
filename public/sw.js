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
const CACHE_VERSION = '0.14.2';
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

/* 離線／失敗時的最後一道防線：一定要回一個「真正的回應」。
 * ★ v0.14.2（真機症狀）：使用者重新載入時 Safari 只顯示
 *   「FetchEvent.respondWith received an error: TypeError: Load failed」——
 *   因為舊版在「網路失敗 + 快取也沒命中」時把錯誤往外丟，respondWith 收到 rejected promise，
 *   瀏覽器就沒有畫面可顯示（連一句「沒有網路」都看不到）。
 *   現在一律回一個看得懂的離線頁（503），永遠不讓 respondWith 失敗。
 * ★ 這個頁面沒有加 CSP 標頭，所以用行內樣式是安全的（一般頁面仍由 Express 的嚴格 CSP 保護）。 */
function offlineResponse() {
    const html = `<!DOCTYPE html>
<html lang="zh-Hant">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>暫時沒有網路 — Gary-Dictionary</title>
<style>
    body { margin: 0; padding: 2rem 1.25rem; font-family: -apple-system, "Helvetica Neue", "PingFang TC", sans-serif;
           line-height: 1.7; color: #1d1d1f; background: #f5f5f7; }
    h1 { font-size: 1.15rem; margin: 0 0 0.5rem; }
    p { margin: 0 0 0.75rem; color: #515154; }
    button { font: inherit; padding: 0.6rem 1rem; border-radius: 999px; border: 1px solid #0071e3;
             background: #0071e3; color: #fff; }
    .en { color: #86868b; font-size: 0.9rem; }
</style>
</head>
<body>
    <h1>暫時沒有網路</h1>
    <p>這個裝置現在連不上網路，而且這一頁還沒有存到離線快取。</p>
    <p class="en">No network connection, and this page has not been saved for offline use yet.</p>
    <button onclick="location.reload()">重新載入 / Reload</button>
</body>
</html>`;
    return new Response(html, {
        status: 503,
        headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }
    });
}

async function networkFirst(request) {
    const cache = await caches.open(CACHE_NAME);
    try {
        const response = await fetch(request);
        if (response && response.ok) cache.put(request, response.clone());
        return response;
    } catch (err) {
        /* 網路失敗 → 先看這一頁的快取，再看首頁外殼，最後給離線頁。絕不把錯誤往外丟。 */
        const cached = (await cache.match(request)) || (await cache.match('/'));
        return cached || offlineResponse();
    }
}

async function cacheFirst(request) {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request);
    if (cached) return cached;
    try {
        const response = await fetch(request);
        if (response && response.ok) cache.put(request, response.clone());
        return response;
    } catch (err) {
        /* 靜態資源抓不到（離線）→ 回 504 而不是讓 respondWith 失敗。
         * 畫面本來就缺這個資源，但至少整頁不會變成錯誤頁。 */
        return new Response('', { status: 504, statusText: 'Offline' });
    }
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
