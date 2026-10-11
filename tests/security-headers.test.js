/* v0.13.1：ZAP 掃描（2026-10-11）之後的守門。
 *
 * 掃描報告本身在 `~/.hermes/attachments/`（不進版控，見 .gitignore）——這一組測試把
 * 「報告點到的、我們真的該修的東西」變成可驗證的事實，免得下一輪又被同一條問一次：
 *   1. 靜態資源的標頭：nosniff ＋ CSP 要有「沒有回退」的指令（frame-ancestors／form-action／base-uri）
 *      —— 掃描器的 CSP 警示就是抓這個（回應有 CSP 但少了這幾個指令＝等於沒設）。
 *   2. 靜態資源的 CORS：不可以是 `*`（Vercel 平台預設就是 `*`，必須由 vercel.json 釘成自家網域；
 *      ★ 這條的完整理由與歷史見 tests/guards.test.js 的 A-6）。
 *   3. robots.txt／sitemap.xml 真的要存在（以前是 404，會被算成一條中風險 CSP 警示）。
 *   4. 前端的註解不可以命中掃描器的關鍵字（\bQUERY\b 這類）——不是漏洞，但會製造噪音警報。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const vercel = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));

function headerOf(block, key) {
    const hit = (block.headers || []).find((h) => String(h.key).toLowerCase() === key.toLowerCase());
    return hit ? String(hit.value) : '';
}

test('v0.13.1：每一組靜態標頭都有 nosniff，且 CSP 含 frame-ancestors／form-action／base-uri', () => {
    assert.ok(Array.isArray(vercel.headers) && vercel.headers.length >= 2, 'vercel.json 要有靜態資源的標頭設定');
    for (const block of vercel.headers) {
        assert.equal(headerOf(block, 'X-Content-Type-Options'), 'nosniff',
            `${block.source} 少了 X-Content-Type-Options: nosniff`);
        const csp = headerOf(block, 'Content-Security-Policy');
        assert.ok(csp, `${block.source} 少了 Content-Security-Policy`);
        for (const directive of ['frame-ancestors', 'form-action', 'base-uri']) {
            assert.ok(csp.includes(directive),
                `${block.source} 的 CSP 少了 ${directive}（掃描器會報「沒有回退的指令」）`);
        }
    }
});

test('v0.13.1：靜態資源的 ACAO 只能是自己人、絕不是 *', () => {
    for (const block of vercel.headers) {
        const acao = headerOf(block, 'Access-Control-Allow-Origin');
        assert.ok(acao, `${block.source} 少了 ACAO（少了就會落回 Vercel 平台的 *，見 guards.test.js 的 A-6）`);
        assert.equal(acao.includes('*'), false, `${block.source} 的 ACAO 不可以是 *`);
        assert.match(acao, /^https:\/\/[a-z0-9-]+\.vercel\.app$/, `${block.source} 的 ACAO 要是自家網域`);
    }
});

test('v0.13.1：robots.txt 與 sitemap.xml 存在，而且 robots 沒有整站禁止', () => {
    const robots = fs.readFileSync(path.join(ROOT, 'public', 'robots.txt'), 'utf8');
    assert.match(robots, /^User-agent: \*/m, '要有 User-agent: *');
    assert.ok(!/^Disallow: \/$/m.test(robots), '不可以整站禁止索引（學生／老師要搜得到）');
    assert.match(robots, /^Disallow: \/api\/$/m, 'API 不該被索引');

    const sitemap = fs.readFileSync(path.join(ROOT, 'public', 'sitemap.xml'), 'utf8');
    assert.match(sitemap, /<urlset[^>]*>/, '要是合法的 urlset');
    assert.match(sitemap, /<loc>https:\/\/gary-dictionary\.vercel\.app\/<\/loc>/, '要列出正式網址');

    assert.ok(vercel.headers.some((block) => String(block.source).includes('robots')),
        'vercel.json 要覆蓋 robots.txt／sitemap.xml 的標頭（它們是新加的靜態檔，平台的 404 預設標頭不好）');
});

test('v0.13.1：前端註解不可命中掃描器的可疑關鍵字（避免噪音警報）', () => {
    const dirs = ['public/js', 'public/css'];
    const pattern = /\b(TODO|FIXME|HACK|XXX|QUERY|DB)\b/i;
    const files = [];
    for (const dir of dirs) {
        for (const name of fs.readdirSync(path.join(ROOT, dir))) {
            files.push(path.join(ROOT, dir, name));
        }
    }
    assert.ok(files.length > 10, '應該要掃到前端檔案');
    for (const file of files) {
        const lines = fs.readFileSync(file, 'utf8').split('\n');
        for (let i = 0; i < lines.length; i += 1) {
            const line = lines[i];
            /* 只看註解行（ZAP 的規則也是比對註解） */
            if (!/^\s*(\*|\/\/|\/\*)/.test(line)) continue;
            const hit = line.match(pattern);
            assert.equal(hit, null,
                `${path.relative(ROOT, file)}:${i + 1} 出現掃描器的可疑關鍵字「${hit && hit[0]}」：${line.trim().slice(0, 60)}`);
        }
    }
});
