# v0.13.1 — ZAP 掃描（2026-10-11）之後的修復

- 發佈日期：2026-10-11
- 線上：https://gary-dictionary.vercel.app
- 上一版：v0.13.0（列印學習單 B-9、學生端小功能 F-5）
- 掃描報告：`2026-10-11-ZAP-Report-.html`（ZAP 2.17.0，被動掃描，只掃 `https://gary-dictionary.vercel.app`）

## 先講最重要的：報告裡沒有任何憑證

掃描器會把完整的請求和回應寫進報告。逐份檢查（含 `~/.hermes/attachments/` 裡同一個資料夾的
其他四份舊報告）的結果：**明碼密碼 0 組、JWT 0 枚、Bearer 0 枚、Set-Cookie 0 個**。
所以這一輪**不需要改任何密碼或輪替任何金鑰**。

順手做的兩件衛生工作：
- `.gitignore` 加上 `*ZAP-Report*.html` 等樣式 —— 報告一旦提交就等於把憑證寫進版本歷史（撤不掉）。
- 確認報告本身沒有落在專案目錄裡（它在 `~/.hermes/attachments/`）。

**另外四份舊報告不屬於本站**：`2026-09-27-ZAP-Report-*.html` 掃的是
`competition-manager-hazel.vercel.app`、`old-trees-kappa.vercel.app`，還跟到第三方主機
（`edgedl.me.gvt1.com`、`content-autofill.googleapis.com`）。判讀時要分開看，
也提醒一句：**掃描範圍含別人的服務有授權問題**，被動掃描（只觀察既有流量）才是生產環境該用的方式。

## 掃描結果：8 條告警、0 高風險

| 風險 | 條數 | 告警類型 |
|---|---|---|
| 中 | 2 | CSP: Failure to Define Directive with No Fallback（2）、跨域配置錯誤（1） |
| 低 | 1 | X-Content-Type-Options Header Missing（5 個回應） |
| 提示 | 5 | 可疑註解（7）、Retrieved from Cache（5）、Tech Detected ×3 |

## 修了什麼（真的屬於我們的）

### 1. 靜態資源缺 `X-Content-Type-Options: nosniff` → 已修
我們的 Express 有 `SECURITY_HEADERS`（動態回應都有 nosniff），但 **`/js` `/css` `/img` 是 Vercel CDN 直接送出的，
不會經過 Express** → 少 nosniff、也少 CSP。
修法：`vercel.json` 的靜態標頭規則補上 `nosniff` 與
`Content-Security-Policy: default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`。
**實測（線上）**：`/css/print.css` → `x-content-type-options: nosniff` ✓ ＋ 上面那條 CSP ✓。

### 2. CSP「沒有回退的指令」 → 已修
那條告警命中的是 `/sitemap.xml` 的 **404**：平台對 404 回 `Content-Security-Policy: default-src 'none'`，
少了 `frame-ancestors`／`form-action`／`base-uri`（這幾個指令不會回退到 `default-src`）。
修法：**讓它們不再 404** —— 新增 `public/robots.txt` 與 `public/sitemap.xml`，
並用 vercel.json 給它們完整的標頭。
**實測**：`/robots.txt` → 200 ＋ nosniff ＋ 完整 CSP ✓；`/sitemap.xml` → 200 ✓。

### 3. 可疑註解（\bQUERY\b） → 已修
命中的是 `public/js/errorlog.js` 的**中文註解裡那個英文單字**（「不帶 query」）。判定是**誤報**
（註解不含憑證、路徑或帳號），但改一個字就能讓掃描器閉嘴 → 改成「不帶網址參數」。
**實測**：線上 `errorlog.js` 已命中 0 次。

## 刻意保留、不修（附理由，免得下一輪重問）

| 告警 | 為什麼不處理 |
|---|---|
| `/_vercel/insights/script.js` 的 `Access-Control-Allow-Origin: *`（跨域配置錯誤） | 那是 **Vercel Web Analytics 的平台腳本**（本站刻意使用：`public/js/analytics.js` 是它的同源 shim）。內容是公開 JS、**不含任何資料**。要收掉只能整個關掉 Web Analytics —— 那是功能取捨，不是漏洞修補。 |
| 我們自己靜態資源的 `Access-Control-Allow-Origin`（掃描器沒報，但順帶說明） | 平台預設是 `*`，由 vercel.json **釘成自家網域**（比 `*` 嚴格）。★ 不可以改成「不設」——那會落回平台的 `*`。理由與守門見 `tests/guards.test.js` 的 A-6。 |
| Retrieved from Cache（有 `Age` 標頭） | 命中的是**靜態資源**（CSS／JS），本來就該被 CDN 快取，內容也不含個資 → **誤報**。 |
| Tech Detected - HSTS／Vercel／Vercel Analytics | 技術指紋，不是問題（HSTS 是好事）。 |

## 掃描範圍與限制（不要以為掃過就安全）

- 這次是**被動掃描**（passive：只觀察既有流量、不對正式站送攻擊請求）→ 適合生產環境，但
  **看不到登入後的問題**：`/api/*`、後台、權限、稽核匯出這些完全不在報告涵蓋範圍內。
- 報告實際掃到的只有 22 個端點，幾乎都是靜態資源（HTML／JS／CSS／圖示）＋ `/`、`/robots.txt`、`/sitemap.xml`。
  **API 端點、要執行 JS 才出現的畫面（生字表、☆ 我的清單、列印選項）都不在其中** ——
  那些由專案自己的驗收覆蓋：`npm test`（197）、`npm run check:browser`（335）、
  `npm run check:live-browser`（23）、`node scripts/live-verify.js`（25）。

## 驗收

| 關卡 | 結果 |
|---|---|
| 語法 | 86/86 |
| `npm test` | **197/0**（新增 `tests/security-headers.test.js` 4 條：靜態標頭、ACAO 不是 `*`、robots/sitemap 存在、掃描器關鍵字） |
| 本機真瀏覽器 | **335 通過 / 0 失敗** |
| 線上標頭實測 | `/css/print.css`、`/robots.txt` 都有 `nosniff` ＋ 完整 CSP；`/robots.txt`、`/sitemap.xml` 都回 200 |
| 線上功能（Chrome 訪客視角、真 Chrome） | 見下一節的跨瀏覽器驗收 |
| 四個網址 | 全部 `0.13.1` |

## 跨瀏覽器與手機

- **Chrome（桌面，真 Chrome）**：`npm run check:live-browser` 訪客視角全數通過。
- **Safari（macOS，真 Safari）**：AppleScript 開啟正式站 → 文件標題讀回
  `Study — Gary-Dictionary v0.13.1`（標題是前端 JS 依目前單元動態設定的 → 證明 Safari 裡前端有正常啟動）。
- **iPhone（iOS 27 模擬器，真 iOS Safari）**：`xcrun simctl openurl` 開正式站 → 截圖檢查（用完即刪）：
  書架正常、`S2 · 2 units · 75 words`、頁尾 `Gary-Dictionary v0.13.1 · Data: Neon (PostgreSQL)`、
  沒有破版或橫向溢出。
  ★ 模擬器**只能看，不能自動點**（`simctl` 沒有點擊 API）→ 單元內頁（生字列、☆、列印選項）在
  iOS 上的實際操作仍是待辦 F-1：可以在模擬器上手動點，或用真機。
- 註：macOS Safari 的「響應式設計模式」與真機（USB 連線 → Safari → 開發 → 選 iPhone）也都可以，
  前者需要手動開「開發」選單，後者需要插線並在 iPhone 上開「網頁檢閱器」。
