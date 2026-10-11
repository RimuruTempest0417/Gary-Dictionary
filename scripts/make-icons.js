/* 產生主畫面／PWA 用的 PNG 圖示：`npm run icons`
 *
 * 為什麼用無頭 Chrome 而不是影像處理套件：本專案是「零建置、零前端依賴」，
 * 為了四張圖引入 sharp／canvas 並不值得；而 Chrome 本來就在機器上（瀏覽器驗收用它），
 * 用它把 SVG 點陣化最單純，而且產物與瀏覽器實際渲染的樣子一致。
 *
 * 產物（都在 public/img/）：
 *   icon-192.png、icon-512.png                 → manifest 的一般圖示（透明背景）
 *   icon-maskable-512.png、apple-touch-icon.png → 鋪滿背景（Android 裁形／iOS 不能用透明）
 *
 * ★ 改了 public/img/favicon.svg 或 icon-maskable.svg 之後要重跑這支。
 *   （`tests/pwa.test.js` 會檢查四張 PNG 存在、尺寸正確，忘記跑就會紅。）
 */
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const CANDIDATES = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser'
];
const CHROME = CANDIDATES.find((file) => fs.existsSync(file));
if (!CHROME) {
    console.error('找不到 Chrome／Chromium／Edge，無法產生圖示（這支腳本需要一個 Chromium 系瀏覽器）');
    process.exit(1);
}

const ROOT = path.resolve(__dirname, '..');
const IMG = path.join(ROOT, 'public', 'img');

const JOBS = [
    { src: 'favicon.svg', out: 'icon-192.png', size: 192, transparent: true },
    { src: 'favicon.svg', out: 'icon-512.png', size: 512, transparent: true },
    { src: 'icon-maskable.svg', out: 'icon-maskable-512.png', size: 512, transparent: false },
    { src: 'icon-maskable.svg', out: 'apple-touch-icon.png', size: 180, transparent: false }
];

let failures = 0;
for (const job of JOBS) {
    const source = path.join(IMG, job.src);
    if (!fs.existsSync(source)) {
        console.error(`✖ 缺少來源 ${job.src}`);
        failures += 1;
        continue;
    }
    const out = path.join(IMG, job.out);
    const args = [
        '--headless',
        '--disable-gpu',
        '--hide-scrollbars',
        '--force-device-scale-factor=1',
        `--window-size=${job.size},${job.size}`,
        `--screenshot=${out}`
    ];
    if (job.transparent) args.push('--default-background-color=00000000');
    args.push(`file://${source}`);
    execFileSync(CHROME, args, { stdio: 'ignore' });

    /* 驗證產物：PNG 檔頭 ＋ 實際尺寸（不符就當失敗，不要留下半成品） */
    const buffer = fs.readFileSync(out);
    const isPng = buffer.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    const width = isPng ? buffer.readUInt32BE(16) : 0;
    const height = isPng ? buffer.readUInt32BE(20) : 0;
    const ok = isPng && width === job.size && height === job.size;
    console.log(`${ok ? '✔' : '✖'} ${job.out}：${width}×${height}（${(buffer.length / 1024).toFixed(1)} KB）`);
    if (!ok) failures += 1;
}

if (failures) {
    console.error(`\n有 ${failures} 張圖示沒有正確產生`);
    process.exit(1);
}
console.log('\n圖示全部產生完成（來源：public/img/favicon.svg、icon-maskable.svg）');
