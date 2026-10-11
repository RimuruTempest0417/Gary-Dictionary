# v0.14.3 — 修：Service Worker 讓 iPhone 一直載不到頁面（真機實測後的第 2 輪修法）

- 發佈日期：2026-10-11
- 線上：https://gary-dictionary.vercel.app
- 上一版：v0.14.2（修：SW 失敗時不再丟錯誤頁）

## 症狀（使用者的 iPhone）

v0.14.2 之後，重新載入看到的**不再是**瀏覽器錯誤頁，而是我們自己的離線頁「暫時沒有網路」，
但**按「重新載入」還是一樣** —— 而同一部手機開 `apple.com` 完全正常 →
確定是 Service Worker 在 iOS Safari 上的問題（不是網路、不是伺服器）。

## 根因（v0.14.0 引入）

`networkFirst()` 對**導覽請求**也做了 `cache.put(request, response.clone())`。
WebKit（iOS Safari 的引擎）對 `mode: 'navigate'` 的請求執行 `Cache.put()` 會拋錯，
而那一行原本**沒有 await、也沒有 try/catch** → 變成未處理的 rejection，
讓整個 fetch 事件收不到有效回應（使用者端就是一直看到錯誤／離線頁）。

## 修法（三層）

1. **導覽一律不快取**：`if (response && response.ok && request.mode !== 'navigate')` ——
   離線時改為使用 `install` 階段就預先快取的首頁外殼（`/`）。
2. **`cache.put` 改為 `await` 並包在 `try/catch`**：快取寫入失敗只影響「下次能不能離線」，
   絕不影響「這一次能不能開頁」。
3. ★ **自救機制（kill switch）**：離線頁本身內嵌一小段程式，用 `sessionStorage` 累計
   「連續出現幾次離線頁」；**連續兩次就把自己的 Service Worker 解除註冊並重新載入**。
   頁面正常載入時（`app.js`）把計數器歸零。
   → 理由：Service Worker 活在**使用者的瀏覽器**裡，我們無法從伺服器關掉它。
   萬一未來任何一版在特定裝置上出錯，這條路保證使用者**永遠不會被鎖在錯誤頁**。

## 使用者的手動逃生口（寫進文件與交接）

iPhone → **設定 → Safari → 進階 → 網站資料 → 刪除 `gary-dictionary.vercel.app`**
（或「清除所有網站資料」）→ 重新開網站即恢復正常，代價只是離線快取重建。

## 守門（tests/pwa.test.js 新增 2 條，共 9 條）

- `networkFirst` 的 `cache.put` **必須**排除 `mode === 'navigate'`，且必須 `await` + `try/catch`
- 不可以再出現「未包錯誤處理的裸 `cache.put(request…)`」
- 離線頁必須有連續失敗計數器（`pd.offlineHits`）、`getRegistrations()`、`unregister()`、門檻 `hits >= 2`
- `app.js` 必須在頁面正常載入時把計數器歸零

## 教訓（已寫進技能與交接文件）

1. **Service Worker 的 `respondWith()` 永遠不可以收到 rejected promise**（v0.14.2 的教訓）。
2. **`Cache.put()` 不要用在導覽請求上**（WebKit 直接拋錯，且是那種「只有真機才會中」的錯）。
3. **凡是「裝在使用者裝置上、我們無法遠端關掉」的功能，都必須內建自救／退場機制** ——
   這次是離線頁自帶的解註冊邏輯。這條規則適用於未來的任何 Service Worker、快取、本機資料庫。
4. **真機驗證不可取代**：這三個 bug（按鈕被裁、離線頁、導覽快取）在桌面 Chrome 全部看不出來。

## 驗收

| 關卡 | 結果 |
|---|---|
| `npm test` | 206/0（pwa 9 條） |
| 四個瀏覽器套件 | 全綠 |
| 線上 | 四個網址 `0.14.3`；使用者真機重新載入後由助手截圖確認 |
| Release | v0.14.3 |
