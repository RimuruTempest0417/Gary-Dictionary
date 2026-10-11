/* v0.14.0（F-2 加到主畫面）的守門測試。
 *
 * 這一組把「PWA 能不能真的加到主畫面、離線能不能開」變成可驗證的事實：
 *   1. manifest.json 的內容正確（start_url／display／icons 尺寸與 purpose）
 *   2. 四個 PNG 圖示真的存在、而且**尺寸就是宣稱的那樣**（讀 PNG 檔頭，不看檔名）
 *   3. apple-touch-icon 是不透明的（iOS 不接受透明背景，會變黑邊）
 *   4. index.html 有連到 manifest ＋ iOS 需要的 apple-* meta，而且 apple-touch-icon 指向 PNG 不是 SVG
 *   5. Service Worker：CACHE_VERSION 必須等於 package.json 的版本
 *      ★ 這條是「Service Worker 卡住舊版」這個經典問題的守門 —— 改版忘了改版本，測試就會紅
 *   6. Service Worker 不可以快取 API（生字、權限、稽核都必須即時）
 *   7. 註冊程式碼只在安全來源註冊，而且失敗不影響功能
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'manifest.json'), 'utf8'));
const html = fs.readFileSync(path.join(ROOT, 'public', 'index.html'), 'utf8');
const sw = fs.readFileSync(path.join(ROOT, 'public', 'sw.js'), 'utf8');

function pngSize(file) {
    const buffer = fs.readFileSync(file);
    const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    if (!buffer.slice(0, 8).equals(signature)) return null;
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20), bytes: buffer.length };
}

test('F-2：manifest.json 的內容正確（start_url／display／icons）', () => {
    assert.equal(manifest.start_url, '/');
    assert.equal(manifest.display, 'standalone', '加到主畫面要像 App，不要有瀏覽器介面');
    assert.ok(manifest.name && manifest.short_name, '要有 name 與 short_name');
    assert.match(manifest.theme_color, /^#[0-9a-f]{6}$/i);

    const purposes = new Set();
    for (const icon of manifest.icons) {
        const size = pngSize(path.join(ROOT, 'public', icon.src.replace(/^\//, '')));
        assert.ok(size, `${icon.src} 不是有效的 PNG`);
        assert.equal(`${size.width}x${size.height}`, icon.sizes, `${icon.src} 的實際尺寸與 manifest 不符`);
        assert.equal(icon.type, 'image/png');
        purposes.add(icon.purpose);
    }
    assert.ok(purposes.has('maskable'), 'Android 需要一張 maskable 圖示（會被裁成圓形／水滴形）');
    assert.ok(manifest.icons.some((icon) => icon.sizes === '192x192'), '要有 192×192（Android 主畫面用）');
    assert.ok(manifest.icons.some((icon) => icon.sizes === '512x512'), '要有 512×512（啟動畫面用）');
});

test('F-2：apple-touch-icon 存在、尺寸正確，而且是**不透明**的', () => {
    const size = pngSize(path.join(ROOT, 'public', 'img', 'apple-touch-icon.png'));
    assert.ok(size, 'apple-touch-icon.png 不存在或不是 PNG');
    assert.equal(size.width, 180);
    assert.equal(size.height, 180);

    /* 不透明＝PNG 的顏色型別不能是有 alpha 的（6＝truecolour+alpha、4＝grayscale+alpha）。
     * 為什麼要驗：iOS 不接受透明的 touch icon，透明區域會被填成黑色 → 圖示看起來像壞掉。 */
    const buffer = fs.readFileSync(path.join(ROOT, 'public', 'img', 'apple-touch-icon.png'));
    const colorType = buffer[25];
    assert.ok(colorType !== 6 && colorType !== 4,
        `apple-touch-icon 有 alpha 通道（colorType=${colorType}）→ iOS 會把透明處變黑，請用鋪滿背景的版本`);
});

test('F-2：index.html 連到 manifest 與 iOS 的 apple-* meta，圖示指向 PNG', () => {
    assert.match(html, /<link rel="manifest" href="\/manifest\.json">/);
    assert.match(html, /<meta name="theme-color"/);
    assert.match(html, /<meta name="apple-mobile-web-app-capable" content="yes">/);
    assert.match(html, /<meta name="apple-mobile-web-app-title"/);
    assert.match(html, /<link rel="apple-touch-icon" href="\/img\/apple-touch-icon\.png\?v=/,
        'apple-touch-icon 要指向 PNG（iOS 不支援 SVG 的 touch icon）');
});

test('F-2：Service Worker 的 CACHE_VERSION 必須等於 package.json 的版本', () => {
    const match = sw.match(/const CACHE_VERSION = '([^']+)'/);
    assert.ok(match, 'sw.js 找不到 CACHE_VERSION');
    assert.equal(match[1], pkg.version,
        `sw.js 的 CACHE_VERSION=${match[1]} 與版本 ${pkg.version} 不一致 —— 改版忘了改，Service Worker 會一直端出舊版`);
    /* 預先快取的清單也要用同一個版本組網址，否則快取到的是舊資源 */
    assert.ok(sw.includes('?v=${CACHE_VERSION}'), '外殼清單要用 CACHE_VERSION 組出 ?v= 網址');
});

test('F-2：Service Worker 絕不快取 API，而且只在安全來源註冊', () => {
    assert.match(sw, /url\.pathname\.startsWith\('\/api\/'\)\)\s*return;/,
        'API 必須直接放行（不快取）—— 生字、權限、稽核都要即時');
    assert.match(sw, /request\.method !== 'GET'/,
        '非 GET（寫入）一律不經過快取');
    assert.match(sw, /if \(url\.pathname === '\/sw\.js'\) return;/, 'sw.js 本身要能更新，不能被自己的快取擋住');

    const app = fs.readFileSync(path.join(ROOT, 'public', 'js', 'app.js'), 'utf8');
    assert.match(app, /navigator\.serviceWorker\.register\('\/sw\.js'\)/);
    assert.match(app, /window\.isSecureContext/, '只在安全來源註冊（瀏覽器規定）');
});

test('v0.14.2：Service Worker 的失敗路徑一定要回「真正的回應」，不可以往外丟錯誤', () => {
    /* 真機症狀（使用者的 iPhone）：重新載入時 Safari 只顯示
     * 「FetchEvent.respondWith received an error: TypeError: Load failed」——
     * 因為舊版在「網路失敗 + 快取沒命中」時 throw，respondWith 收到 rejected promise。
     * 這一組測試把「永遠有畫面可看」變成可驗證的事實。 */
    assert.ok(!/throw err;/.test(sw),
        'sw.js 不可以在 fetch handler 裡把錯誤往外丟（respondWith 會失敗、使用者只看到錯誤頁）');
    assert.match(sw, /function offlineResponse\(/, '要有離線頁函式');
    assert.match(sw, /return cached \|\| offlineResponse\(\)/,
        'networkFirst 的失敗路徑要先試快取、最後回離線頁');
    assert.match(sw, /new Response\('', \{ status: 504/, 'cacheFirst 失敗時要回 504 而不是丟錯');
    assert.match(sw, /連不上網路|No network connection/, '離線頁要給人看得懂的說明');
});

test('v0.14.2：離線頁本身不依賴任何外部資源（沒有網路時才看得到它）', () => {
    const offline = sw.slice(sw.indexOf('function offlineResponse'));
    /* v0.14.3：離線頁現在內嵌一段自救程式（連續兩次就解除 Service Worker），
     * 所以規則要精確到「不可以引用**外部**資源」，而不是「不可以有 script」。 */
    assert.ok(!/<script[^>]+src=/i.test(offline), '離線頁不可以引用外部 script');
    assert.ok(!/<link/i.test(offline), '離線頁不可以引用外部樣式表');
    assert.ok(!/https?:\/\//.test(offline.slice(offline.indexOf('<body>'))),
        '離線頁的內容不可以有外部網址（沒有網路時才看得到它）');
    assert.match(offline, /<style>/, '樣式要內嵌（這個回應沒有加 CSP，行內樣式是安全的）');
    assert.match(offline, /location\.reload\(\)/, '要有一個「重新載入」的按鈕');
});

test('v0.14.3：Service Worker 不可以把「導覽請求」寫進快取（WebKit 會拋錯）', () => {
    /* 真機症狀（使用者 iPhone）：重新載入一直只看到錯誤／離線頁。
     * 原因之一是 cache.put() 對 mode:'navigate' 的請求在 WebKit 上會拋錯 →
     * 導覽的回應必須直接回傳，不寫快取（離線靠 install 預先快取的首頁外殼）。 */
    assert.match(sw, /request\.mode !== 'navigate'/,
        'networkFirst 的 cache.put 必須排除導覽請求');
    assert.match(sw, /await cache\.put\(request, response\.clone\(\)\)/,
        'cache.put 必須被 await 並包在 try/catch 裡（不能留下未處理的 rejection）');
    /* 不可以再出現「沒有包 try/catch 的裸 cache.put」 */
    assert.ok(!/^\s*cache\.put\(request/m.test(sw),
        '不可以有未包錯誤處理的裸 cache.put');
});

test('v0.14.3：離線頁要能自救（連續兩次就把 Service Worker 解除並重載）', () => {
    const offline = sw.slice(sw.indexOf('function offlineResponse'));
    assert.match(offline, /pd\.offlineHits/, '離線頁要有連續失敗計數器');
    assert.match(offline, /getRegistrations\(\)/, '要能取得自己的 Service Worker 註冊');
    assert.match(offline, /unregister\(\)/, '連續失敗時要解除註冊（使用者不可以被鎖在錯誤頁）');
    assert.match(offline, /hits >= 2/, '門檻是連續兩次');

    const app = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'app.js'), 'utf8');
    assert.match(app, /removeItem\('pd\.offlineHits'\)/,
        '頁面正常載入時要歸零計數器，否則零星斷線也會把 Service Worker 解除');
});
