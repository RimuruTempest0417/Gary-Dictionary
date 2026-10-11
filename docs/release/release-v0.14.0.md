# v0.14.0 — F-2 加到主畫面（PWA）

- 發佈日期：2026-10-11
- 線上：https://gary-dictionary.vercel.app
- 上一版：v0.13.2（手機往下滑收起頂部工具列、頂部列溢出防護、兩項小修）

## 這一版做了什麼

### 1. 加到主畫面（manifest ＋ 圖示）

- `public/manifest.json`：`display: standalone`（像 App、沒有瀏覽器介面）、`start_url: /`、
  `theme_color: #0071e3`，以及 192×192／512×512／512×512 maskable 三張圖示。
- **圖示是怎麼來的**（零依賴）：`npm run icons`（`scripts/make-icons.js`）用**無頭 Chrome**
  把 `public/img/favicon.svg` 與 `icon-maskable.svg` 點陣化成四張 PNG。為什麼不用影像處理套件：
  本專案是零建置、零前端依賴，為四張圖引入 sharp／canvas 並不值得，而 Chrome 本來就在機器上。
  - `icon-192.png`、`icon-512.png` → 透明背景（manifest 的 `purpose: any`）
  - `icon-maskable-512.png` → **鋪滿背景**（Android 會裁成圓形／水滴形，安全區約 80%）
  - `apple-touch-icon.png`（180×180）→ **不透明**（★ iOS 不接受透明背景，透明處會被填成黑色）
- `index.html`：`<link rel="manifest">`、`theme-color`、`apple-mobile-web-app-capable`、
  `apple-mobile-web-app-title`，`apple-touch-icon` 改指向 PNG（iOS 不支援 SVG 的 touch icon）。

### 2. 離線也進得去（Service Worker）

`public/sw.js` 的三條策略（刻意挑最安全的一組，不是「全部快取優先」）：

| 對象 | 策略 | 為什麼 |
|---|---|---|
| 文件（HTML） | **network-first** | 網站會改版；快取優先會讓老師看到舊介面、版本也對不上 |
| `/api/` | **完全不攔、不快取** | 生字、權限、稽核必須即時；快取 API 等於端出過期資料 |
| css／js／img | **cache-first** | 網址都帶 `?v=<版本>`，換版本＝換網址，舊快取永遠不會被誤用 |

- 預先快取「應用外殼」（首頁 ＋ 樣式 ＋ 主要腳本 ＋ 圖示）；單一檔案抓不到也不會讓整個安裝失敗。
- **`CACHE_VERSION` 與 `package.json` 的版本綁定** —— `tests/pwa.test.js` 會檢查兩者一致。
  ★ 這是「Service Worker 卡住舊版」這個經典問題的守門：改版忘了改版本，測試就會紅。
- `vercel.json` 給 `/sw.js` 加上 `Cache-Control: max-age=0, must-revalidate`
  與 `Service-Worker-Allowed: /`（不然 Service Worker 的更新會被 CDN 快取卡住）。
- 註冊只在安全來源（https／localhost）才做，失敗（無痕、舊瀏覽器、公司網路）**不影響任何功能**
  —— 離線是加分項，不是必要條件。

### 3. 站內說明

新增一節「加到手機主畫面」（中英）：iPhone 是分享 →「加入主畫面」，Android 是 ⋮ →「安裝應用程式」，
並說明離線副本與收藏只存在該裝置。

## 驗收

| 關卡 | 結果 |
|---|---|
| `npm test` | **202/0**（新增 `tests/pwa.test.js` 5 條） |
| 四個瀏覽器套件 | **392/0**（Service Worker 註冊後沒有影響任何既有行為） |
| `check:syntax` | 全過 |
| 線上 | `live-verify`、訪客視角（真 Chrome，含 PWA 檢查）、`uptime` — 見發版報告 |
| Release | v0.14.0（GitHub Release 已建立並讀回） |

### 這一版踩到、修掉的

- **sw.js 的註解裡出現 `*/`**（寫到「`/api/`」時）→ 整個檔案語法壞掉。
  這個坑之前踩過一次、也記在交接文件裡，這次又中 → 已在技能與交接文件裡改成
  「**註解提到路徑時不要寫出 `*/`**」的明確提醒。
- 測試要墊高頁面才能測捲動時，原本用 `element.style.height` —— 被本專案的 CSP
  （`style-src 'self'`）擋掉並產生違規（而該套件正好會斷言 0 違規）→ 改用 `<br>` 填充，不需要行內樣式。
