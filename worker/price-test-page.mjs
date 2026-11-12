import { automaticPrices, manualPrices } from './price-experiment.mjs';
import { english } from './english.mjs';
import { sandboxEnabled, sandboxToken, createSandboxOrder, captureSandboxOrder } from './paypal-sandbox.mjs';

const root = '/price-test';
const yen = new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY' });
const escape = value => String(value).replace(/[&<>"']/g, c => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[c]);

export async function campaignPriceOffer(request, db, id, paypal = false) {
  const experiment = await db.prepare('SELECT prices FROM price_experiments WHERE id = ?').bind(id).first();
  if (!experiment) return {};
  const prices = JSON.parse(experiment.prices);
  const url = new URL(request.url);
  const isPreview = url.searchParams.get('owner') === '1' || url.searchParams.get('embedded') === '1';
  if (isPreview) return { html: '<p class="note">検証価格：' + prices.map(price => yen.format(price)).join('、') + '</p>' };
  const existing = campaignVisitor(request);
  const visitor = existing || crypto.randomUUID();
  const price = prices[Math.floor(Math.random() * prices.length)];
  await db.prepare('INSERT INTO price_visitors (experiment_id, visitor_id, price) VALUES (?, ?, ?) ON CONFLICT DO NOTHING').bind(id, visitor, price).run();
  const assigned = await db.prepare('SELECT price, interested FROM price_visitors WHERE experiment_id = ? AND visitor_id = ?').bind(id, visitor).first();
  const path = '/preview/' + id;
  const payment = paypal && await campaignOrder(db, id, visitor);
  const button = payment?.capture_id
    ? '<p>PayPalのテスト決済が完了しました。</p>'
    : paypal
      ? '<form action="' + path + '/paypal/start" method="post"><button>PayPalでテスト決済へ進む</button></form>'
      : (assigned.interested ? '<p>申込意思を記録しました。</p>' : '<form action="' + path + '/price-interest" method="post"><button>この価格なら申し込みたい</button></form>');
  return {
    cookie: existing ? undefined : 'wat_campaign_price=' + visitor + '; Path=' + path + '; Max-Age=2592000; HttpOnly; SameSite=Lax; Secure',
    html: '<section class="section"><h2>検討中の価格 ' + yen.format(assigned.price) + '</h2>' +
      (paypal ? '<p>PayPal Sandboxのテスト決済です。実際の請求はありません。</p>' : '<p>提供前のサービスです。お支払いは発生しません。</p>') +
      button + '</section>',
  };
}

function campaignVisitor(request) {
  return request.headers.get('Cookie')?.match(/(?:^|;\s*)wat_campaign_price=([0-9a-f-]{36})(?:;|$)/)?.[1];
}

export async function recordCampaignPriceInterest(request, db, id) {
  const url = new URL(request.url);
  const visitor = campaignVisitor(request);
  if (request.method !== 'POST' || request.headers.get('Origin') !== url.origin || !db || !visitor) {
    return errorPage('操作を確認できません。', 403);
  }
  await db.prepare('UPDATE price_visitors SET interested = 1 WHERE experiment_id = ? AND visitor_id = ?').bind(id, visitor).run();
  return new Response(null, { status: 303, headers: { Location: '/preview/' + id, 'Cache-Control': 'no-store' } });
}

function campaignOrder(db, id, visitor) {
  return db.prepare('SELECT * FROM paypal_price_orders WHERE experiment_id = ? AND visitor_id = ?').bind(id, visitor).first();
}

export async function campaignPayPal(request, env, id, action) {
  const url = new URL(request.url);
  const visitor = campaignVisitor(request);
  const path = '/preview/' + id;
  const db = env.DB;
  if (!db || !sandboxEnabled(env)) return errorPage('PayPal Sandboxは現在利用できません。', 503);
  if (!visitor || (action === 'return' ? request.method !== 'GET' :
    request.method !== 'POST' || request.headers.get('Origin') !== url.origin)) {
    return errorPage('操作を確認できません。', 403);
  }
  const campaign = await db.prepare('SELECT content FROM idea_previews WHERE id = ?').bind(id).first();
  const locale = campaign && JSON.parse(campaign.content).locale;
  const show = (body, status = 200) => page('PayPal Sandbox', body + '<p><a href="' + path + '">紹介ページへ戻る</a></p>', { status, locale });
  const assigned = await db.prepare('SELECT price FROM price_visitors WHERE experiment_id = ? AND visitor_id = ?').bind(id, visitor).first();
  if (!campaign || !assigned) return show('<h1>価格を確認できません。</h1>', 404);
  const back = () => new Response(null, { status: 303, headers: { Location: path, 'Cache-Control': 'no-store' } });
  const note = '<p>' + yen.format(assigned.price) + ' · PayPal Sandboxのテスト決済です。実際の請求はありません。</p>';
  try {
    if (action === 'start') {
      await db.prepare('INSERT INTO paypal_price_orders (experiment_id, visitor_id, request_id) VALUES (?, ?, ?) ON CONFLICT DO NOTHING')
        .bind(id, visitor, crypto.randomUUID()).run();
      const saved = await campaignOrder(db, id, visitor);
      if (saved.capture_id) return back();
      let approval = saved.approval_url;
      if (!approval) {
        const token = await sandboxToken(env);
        const order = await createSandboxOrder(token, assigned.price, saved.request_id, url.origin + path + '/paypal/return', url.origin + path);
        await db.prepare('UPDATE paypal_price_orders SET order_id = ?, approval_url = ? WHERE experiment_id = ? AND visitor_id = ?')
          .bind(order.id, order.approval, id, visitor).run();
        approval = order.approval;
      }
      return show('<h1>PayPalでテスト決済</h1>' + note + '<p><a href="' + escape(approval) + '" rel="noreferrer">PayPal Sandboxを開く ↗</a></p>');
    }
    const saved = await campaignOrder(db, id, visitor);
    const orderId = action === 'return' ? url.searchParams.get('token') : new URLSearchParams(await request.text()).get('order');
    if (!saved?.order_id || saved.order_id !== orderId) return show('<h1>PayPalの注文を確認できません。</h1>', 403);
    if (saved.capture_id) return back();
    if (action === 'return') {
      return show('<h1>テスト決済を確定</h1>' + note + '<form method="post" action="' + path +
        '/paypal/capture"><input type="hidden" name="order" value="' + escape(orderId) + '"><button>テスト決済を確定</button></form>');
    }
    const captureId = await captureSandboxOrder(await sandboxToken(env), orderId, saved.request_id, assigned.price);
    await db.prepare('UPDATE paypal_price_orders SET capture_id = ? WHERE experiment_id = ? AND visitor_id = ? AND order_id = ?')
      .bind(captureId, id, visitor, orderId).run();
    return back();
  } catch {
    return show('<h1>PayPalの処理を確認できませんでした。</h1><p>時間をおいて同じブラウザで再度お試しください。</p>', 502);
  }
}

export async function campaignPriceResults(db, id, paypal = false) {
  const experiment = await db.prepare('SELECT prices FROM price_experiments WHERE id = ?').bind(id).first();
  if (!experiment) return [];
  const query = paypal
    ? 'SELECT v.price, COUNT(*) AS visitors, SUM(v.interested) AS interested, COUNT(o.order_id) AS checkout_started, COUNT(o.capture_id) AS checkout_completed FROM price_visitors v LEFT JOIN paypal_price_orders o ON o.experiment_id = v.experiment_id AND o.visitor_id = v.visitor_id WHERE v.experiment_id = ? GROUP BY v.price'
    : 'SELECT price, COUNT(*) AS visitors, SUM(interested) AS interested FROM price_visitors WHERE experiment_id = ? GROUP BY price';
  const { results } = await db.prepare(query).bind(id).all();
  return JSON.parse(experiment.prices).map(price => results.find(row => row.price === price) ||
    { price, visitors: 0, interested: 0, ...(paypal ? { checkout_started: 0, checkout_completed: 0 } : {}) });
}

export function page(title, body, { status = 200, cookie, script, locale } = {}) {
  const nonce = crypto.randomUUID();
  const headers = {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
    'Referrer-Policy': 'same-origin',
    'X-Robots-Tag': 'noindex, nofollow',
    'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-" + nonce + "'; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
  };
  if (cookie) headers['Set-Cookie'] = cookie;
  const html = '<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' +
    escape(title) + '</title><style>' + styles + '</style><header><a href="/">Worth A Try?</a></header><main>' +
    body + '</main>' + (script ? '<script nonce="' + nonce + '">' + script + '</script>' : '') + '</html>';
  return new Response(locale === 'en' ? english(html) : html, { status, headers });
}

const styles = '*,*:before,*:after{box-sizing:border-box}body{margin:0;background:#f9f8f3;color:#14271e;font:16px/1.65 system-ui,sans-serif}header,main{max-width:820px;margin:auto;padding:20px}header{border-bottom:1px solid #d8ded5;font-weight:750}a{color:#193f2d}main{padding-top:42px}h1{font-size:clamp(30px,5vw,48px);line-height:1.15;margin:0 0 18px}form,.panel{background:#fff;border:1px solid #d8ded5;border-radius:14px;padding:clamp(16px,4vw,32px);margin:20px 0}label{display:block;font-weight:700;margin-top:14px}input,textarea{display:block;width:100%;padding:11px;margin:5px 0 10px;border:1px solid #a9b7a7;border-radius:7px;font:inherit}button{background:#193f2d;color:white;border:0;border-radius:7px;padding:11px 17px;font:inherit;font-weight:700;cursor:pointer}.secondary{background:#e5eee2;color:#193f2d}.range{display:grid;grid-template-columns:1fr 1fr;gap:12px}p{margin:0 0 13px}.muted{color:#506558}.price{font-size:36px;font-weight:800}.copy{white-space:pre-wrap;overflow-wrap:anywhere}.table-wrap{overflow:auto}table{border-collapse:collapse;width:100%;white-space:nowrap}th,td{padding:10px;text-align:right;border-bottom:1px solid #d8ded5}th:first-child,td:first-child{text-align:left}';

function setupBrowser() {
  const form = document.querySelector('form');
  const notice = document.querySelector('#notice');
  document.querySelector('#suggest').onclick = () => {
    try {
      const prices = automaticPrices(Number(form.elements.minimum.value), Number(form.elements.maximum.value));
      form.elements.prices.value = prices.join(', ');
      notice.textContent = prices.length + '件の候補を作成しました。';
    } catch {
      notice.textContent = '最低価格と最高価格を正しく入力してください。';
    }
  };
}

function setup() {
  return page('価格テストを作る', '<h1>価格テストを作る</h1><p>同じ紹介ページで、表示価格だけを変えて反応を比べます。</p>' +
    '<form action="/price-test" method="post"><label for="title">サービス名</label><input id="title" name="title" maxlength="100" required>' +
    '<label for="description">紹介文</label><textarea id="description" name="description" rows="4" maxlength="1200" required></textarea>' +
    '<div class="range"><div><label for="minimum">最低価格（円）</label><input id="minimum" name="minimum" type="number" min="1" max="100000000" value="500"></div>' +
    '<div><label for="maximum">最高価格（円）</label><input id="maximum" name="maximum" type="number" min="1" max="100000000" value="1500"></div></div>' +
    '<button class="secondary" id="suggest" type="button">価格候補を自動生成</button><p id="notice" role="status"></p>' +
    '<label for="prices">価格候補（円）</label><input id="prices" name="prices" maxlength="110" value="' + automaticPrices(500, 1500).join(', ') + '" required>' +
    '<p class="muted">カンマ区切りで編集できます。固定価格なら1件だけ入力してください。作成後、紹介文と価格は固定されます。</p><button>価格テストを作成</button></form>',
    { script: automaticPrices.toString() + '\n(' + setupBrowser.toString() + ')();' });
}

async function digest(value) {
  const buffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(buffer), byte => byte.toString(16).padStart(2, '0')).join('');
}

function errorPage(message, status) {
  return page('価格テスト', '<h1>' + escape(message) + '</h1><a href="' + root + '">価格テスト設定へ</a>', { status });
}

async function create(request, db) {
  const raw = await request.text();
  if (raw.length > 20000) return errorPage('入力が長すぎます。', 413);
  const form = new URLSearchParams(raw);
  const title = form.get('title')?.trim();
  const description = form.get('description')?.trim();
  const inputs = (form.get('prices') || '').trim().split(/[,、\s]+/);
  let prices;
  try {
    if (inputs.some(input => !/^\d+$/.test(input))) throw new Error();
    prices = manualPrices(inputs.map(Number));
  } catch {
    return errorPage('価格は1〜10件の正の整数で入力してください。', 400);
  }
  if (!title || title.length > 100 || !description || description.length > 1200) return errorPage('サービス名と紹介文を確認してください。', 400);
  const id = crypto.randomUUID();
  const ownerKey = crypto.randomUUID() + crypto.randomUUID();
  await db.prepare('INSERT INTO price_experiments (id, owner_hash, title, description, prices) VALUES (?, ?, ?, ?, ?)')
    .bind(id, await digest(ownerKey), title, description, JSON.stringify(prices)).run();
  return new Response(null, {
    status: 303,
    headers: { Location: root + '/' + id + '/results#' + ownerKey, 'Cache-Control': 'no-store' },
  });
}

function resultsBrowser() {
  const key = location.hash.slice(1);
  const status = document.querySelector('#status');
  const table = document.querySelector('table');
  const tbody = table.querySelector('tbody');
  document.querySelector('#refresh').addEventListener('click', refresh);
  async function refresh() {
    if (!key) { status.textContent = '作成時に発行された結果リンクを開いてください。'; return; }
    status.textContent = '読み込み中…';
    try {
      const response = await fetch(location.pathname + '/data', { headers: { Authorization: 'Bearer ' + key } });
      if (!response.ok) throw new Error();
      const rows = await response.json();
      tbody.replaceChildren(...rows.map(row => {
        const tr = document.createElement('tr');
        const rate = row.visitors ? (100 * row.interested / row.visitors).toFixed(1) + '%' : '—';
        for (const value of ['¥' + row.price.toLocaleString('ja-JP'), row.visitors, row.interested, rate]) {
          const td = document.createElement('td');
          td.textContent = value;
          tr.append(td);
        }
        return tr;
      }));
      table.hidden = false;
      status.textContent = rows.some(row => row.visitors) ? '' : 'まだ計測された閲覧はありません。';
    } catch {
      table.hidden = true;
      status.textContent = '結果を取得できません。作成時に発行された結果リンクを確認してください。';
    }
  }
  refresh();
}

function resultsPage(id, experiment) {
  const shareUrl = root + '/' + id;
  return page('価格テストの結果', '<h1>価格テストの結果</h1><p>' + escape(experiment.title) + '</p>' +
    '<section class="panel"><label for="share">共有・広告用リンク</label><input id="share" readonly>' +
    '<a href="' + shareUrl + '" target="_blank" rel="noopener">訪問者向けページを開く ↗</a><p class="muted">この結果ページのURLは管理用です。保存しておいてください。</p></section>' +
    '<button class="secondary" id="refresh">結果を更新</button><p id="status" role="status"></p>' +
    '<div class="table-wrap"><table hidden><thead><tr><th>表示価格</th><th>閲覧ブラウザ</th><th>申込意思</th><th>申込意思率</th></tr></thead><tbody></tbody></table></div>' +
    '<p class="muted">申込意思率はボタンを押したブラウザ数 ÷ 同じ価格を見たブラウザ数です。実際の決済は発生しません。</p>',
    { script: 'document.querySelector("#share").value = location.origin + ' + JSON.stringify(shareUrl) + ';(' + resultsBrowser.toString() + ')();' });
}

export async function priceTestPage(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;
  if (!env.DB) return errorPage('価格テストに接続できません。', 503);
  const db = env.DB;
  if (request.method === 'POST' && request.headers.get('Origin') !== url.origin) return errorPage('操作を確認できません。', 403);
  try {
    if (path === root) {
      if (request.method === 'GET') return setup();
      if (request.method === 'POST' && request.headers.get('Content-Type')?.startsWith('application/x-www-form-urlencoded')) return await create(request, db);
    }
    const match = /^\/price-test\/([0-9a-f-]{36})(?:\/(results(?:\/data)?|interest))?$/.exec(path);
    if (!match) return errorPage('価格テストが見つかりません。', 404);
    const [, id, action] = match;
    const experiment = await db.prepare('SELECT * FROM price_experiments WHERE id = ? AND NOT EXISTS (SELECT 1 FROM idea_previews WHERE idea_previews.id = price_experiments.id)').bind(id).first();
    if (!experiment) return errorPage('価格テストが見つかりません。', 404);
    const prices = JSON.parse(experiment.prices);
    if (action === 'results' && request.method === 'GET') return resultsPage(id, experiment);
    if (action === 'results/data' && request.method === 'GET') {
      const key = request.headers.get('Authorization')?.match(/^Bearer ([0-9a-f-]{72})$/)?.[1];
      if (!key || await digest(key) !== experiment.owner_hash) return Response.json({ error: 'Unauthorized' }, { status: 403 });
      const { results } = await db.prepare('SELECT price, COUNT(*) AS visitors, SUM(interested) AS interested FROM price_visitors WHERE experiment_id = ? GROUP BY price').bind(id).all();
      return Response.json(prices.map(price => results.find(row => row.price === price) || { price, visitors: 0, interested: 0 }), {
        headers: { 'Cache-Control': 'no-store' },
      });
    }
    const visitor = request.headers.get('Cookie')?.match(/(?:^|;\s*)wat_price=([0-9a-f-]{36})(?:;|$)/)?.[1];
    if (action === 'interest' && request.method === 'POST' && visitor) {
      await db.prepare('UPDATE price_visitors SET interested = 1 WHERE experiment_id = ? AND visitor_id = ?').bind(id, visitor).run();
      return new Response(null, { status: 303, headers: { Location: root + '/' + id, 'Cache-Control': 'no-store' } });
    }
    if (action || request.method !== 'GET') return errorPage('この操作は利用できません。', 405);
    const visitorId = visitor || crypto.randomUUID();
    const price = prices[Math.floor(Math.random() * prices.length)];
    await db.prepare('INSERT INTO price_visitors (experiment_id, visitor_id, price) VALUES (?, ?, ?) ON CONFLICT DO NOTHING').bind(id, visitorId, price).run();
    const assigned = await db.prepare('SELECT price, interested FROM price_visitors WHERE experiment_id = ? AND visitor_id = ?').bind(id, visitorId).first();
    const cookie = visitor ? '' : 'wat_price=' + visitorId + '; Path=' + root + '/' + id + '; Max-Age=2592000; HttpOnly; SameSite=Lax; Secure';
    return page(experiment.title, '<h1>' + escape(experiment.title) + '</h1><p class="copy">' + escape(experiment.description) + '</p>' +
      '<section class="panel"><p class="muted">検討中の価格</p><p class="price">' + yen.format(assigned.price) + '</p>' +
      '<p>提供前の価格テストです。申込意思を記録します。支払いは発生しません。</p>' +
      (assigned.interested ? '<strong>申込意思を記録しました。</strong>' : '<form action="' + root + '/' + id + '/interest" method="post"><button>この価格なら申し込みたい</button></form>') +
      '</section>', { cookie });
  } catch {
    return errorPage('価格テストを処理できませんでした。時間をおいて再度お試しください。', 503);
  }
}
