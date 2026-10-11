# v0.14.2 — 修：Service Worker 失敗時讓整頁變成錯誤頁（使用者在真機重新載入時撞到）

- 發佈日期：2026-10-11
- 線上：https://gary-dictionary.vercel.app
- 上一版：v0.14.1（修生字卡操作按鈕被裁）

## 症狀（使用者的 iPhone，重新載入時）

Safari 只顯示一行：

> Safari 無法打開網頁。錯誤碼為：「FetchEvent.respondWith received an error: TypeError: Load failed」

連一句「沒有網路」都沒有 —— 整頁變成瀏覽器錯誤頁。

## 根因（v0.14.0 的 Service Worker）

`networkFirst()` 在「網路請求失敗 **且** 快取也沒命中」時把錯誤往外丟：

```js
catch (err) {
    const cached = await cache.match(request);
    if (cached) return cached;
    const shell = await cache.match('/');
    if (shell) return shell;
    throw err;          // ← respondWith 收到 rejected promise → 瀏覽器只能顯示錯誤頁
}
```

`cacheFirst()` 也有同一個問題：`await fetch()` 一失敗就直接往外拋。

## 修法

- 新增 `offlineResponse()`：一個**完全自足**的離線頁（503、標題「暫時沒有網路」、中英雙語說明、
  一個「重新載入」按鈕、樣式內嵌），**不依賴任何外部資源**。
- `networkFirst`：網路失敗 → 這一頁的快取 → 首頁外殼 → **離線頁**（永遠回一個真正的回應）。
- `cacheFirst`：抓不到就回 `504`，不讓 `respondWith` 失敗（畫面頂多少一個資源，不會整頁變錯誤頁）。

## 守門（tests/pwa.test.js 新增 2 條）

- `sw.js` **不可以**出現 `throw err;`（在 fetch handler 裡把錯誤往外丟）
- 必須有 `offlineResponse()`、`networkFirst` 的失敗路徑要回離線頁、`cacheFirst` 要回 504
- 離線頁**不可以引用外部 script／樣式表**（它就是給「沒有網路」用的）
- 離線頁要有「重新載入」按鈕

## 教訓（寫進技能與交接文件）

**Service Worker 的 `respondWith()` 永遠不可以收到 rejected promise。**
只要有一條路徑會 throw，使用者在網路不穩時就會看到瀏覽器的錯誤頁 —— 而且那**不是**我們的頁面，
所以我們的錯誤記錄、錯誤畫面通通看不到（最難查的那種）。每個 `fetch` handler 的最後一行都要有
「一定會回一個 Response」的保證。

## 驗收

| 關卡 | 結果 |
|---|---|
| `npm test` | 204/0（新增 pwa 2 條） |
| 四個瀏覽器套件 | 全綠 |
| 線上 | 四個網址 `0.14.2`；使用者真機重新載入後由助手截圖確認 |
| Release | v0.14.2 |
