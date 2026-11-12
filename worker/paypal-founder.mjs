import { page } from './price-test-page.mjs';
import { sandboxEnabled, sandboxToken, createSandboxOrder, captureSandboxOrder } from './paypal-sandbox.mjs';

const root = '/paypal/founder/';
const yen = value => '¥' + value.toLocaleString('en-US');
const sameOriginPost = request => request.method === 'POST' && request.headers.get('Origin') === new URL(request.url).origin;
const validId = value => /^[0-9a-f-]{36}$/.test(value || '');

export async function startFounderPayPal(request, env, hashToken) {
  const fail = (error, status) => Response.json({ error }, { status });
  if (!sameOriginPost(request)) return fail('リクエストが正しくありません。', 403);
  if (!env.DB || !sandboxEnabled(env)) return fail('PayPal Sandboxは現在利用できません。', 503);
  if (!request.headers.get('Content-Type')?.startsWith('application/json')) return fail('リクエストが正しくありません。', 415);
  try {
    const { preview_id: previewId, preview_owner_token: token, ad_budget_yen: budget } = await request.json();
    if (!validId(previewId) || !/^[a-f0-9]{64}$/.test(token || '')) return fail('続ける前にLPと広告を生成してください。', 400);
    if (!Number.isInteger(budget) || budget < 400 || budget > 1000) return fail('広告予算を400〜1,000円の整数で入力してください。', 400);
    const db = env.DB;
    const preview = await db.prepare('SELECT owner_hash FROM idea_previews WHERE id = ?').bind(previewId).first();
    if (!preview?.owner_hash || await hashToken(token) !== preview.owner_hash) return fail('プレビューを確認できませんでした。もう一度生成してください。', 403);
    const locale = request.headers.get('X-WAT-Language') === 'en' ? 'en' : 'ja';
    const fee = Math.floor((budget * 30 + 50) / 100);
    await db.prepare('INSERT INTO paypal_founder_orders (id, preview_id, budget, fee, locale) VALUES (?, ?, ?, ?, ?) ON CONFLICT(preview_id, budget) DO NOTHING')
      .bind(crypto.randomUUID(), previewId, budget, fee, locale).run();
    const saved = await db.prepare('SELECT * FROM paypal_founder_orders WHERE preview_id = ? AND budget = ?').bind(previewId, budget).first();
    const path = root + saved.id;
    const origin = new URL(request.url).origin;
    let checkoutUrl = saved.capture_id ? origin + path + '/complete' : saved.approval_url;
    if (!checkoutUrl) {
      const order = await createSandboxOrder(await sandboxToken(env), saved.budget + saved.fee, saved.id,
        origin + path + '/return', origin + (locale === 'en' ? '/en#start' : '/#start'),
        'Worth A Try test: ad budget JPY ' + saved.budget + ' + service fee JPY ' + saved.fee);
      await db.prepare('UPDATE paypal_founder_orders SET order_id = ?, approval_url = ? WHERE id = ?')
        .bind(order.id, order.approval, saved.id).run();
      checkoutUrl = order.approval;
    }
    return Response.json({ checkoutUrl }, { headers: {
      'Cache-Control': 'no-store',
      'Set-Cookie': 'wat_founder_paypal=' + saved.id + '; Path=' + path + '; Max-Age=86400; Secure; HttpOnly; SameSite=Lax',
    } });
  } catch {
    return fail('PayPalの処理を確認できませんでした。', 502);
  }
}

export async function returnFounderPayPal(request, env, id, action) {
  const cookie = request.headers.get('Cookie')?.match(/(?:^|;\s*)wat_founder_paypal=([0-9a-f-]{36})(?:;|$)/)?.[1];
  if (!env.DB || !sandboxEnabled(env) || cookie !== id || !validId(id)) return new Response('PayPal test session not found.', { status: 404 });
  if (action === 'capture' ? !sameOriginPost(request) : request.method !== 'GET') return new Response('Invalid request.', { status: 403 });
  const saved = await env.DB.prepare('SELECT * FROM paypal_founder_orders WHERE id = ?').bind(id).first();
  if (!saved?.order_id) return new Response('PayPal test order not found.', { status: 404 });
  const path = root + id;
  const isEnglish = saved.locale === 'en';
  const show = (body, status = 200) => page('Worth A Try · PayPal Sandbox', body +
    '<p><a href="' + (isEnglish ? '/en#start' : '/#start') + '">' +
    (isEnglish ? 'Back to Worth A Try' : 'Worth A Tryに戻る') + '</a></p>', { status, locale: saved.locale });
  const complete = () => show(isEnglish
    ? '<h1>PayPal test payment complete</h1><p>No real charge was made and no ad was submitted.</p>'
    : '<h1>PayPalのテスト決済が完了しました。</h1><p>実際の請求や広告出稿は行われません。</p>');
  if (saved.capture_id) return complete();
  const orderId = action === 'return' ? new URL(request.url).searchParams.get('token') : new URLSearchParams(await request.text()).get('order');
  if (action === 'complete' || orderId !== saved.order_id || !/^[A-Z0-9]{1,32}$/.test(orderId || '')) {
    return show('<h1>PayPalの注文を確認できません。</h1>', 403);
  }
  if (action === 'return') {
    const detail = isEnglish ? 'Ad budget ' + yen(saved.budget) + ' + service fee ' + yen(saved.fee) : '広告費 ' + yen(saved.budget) + ' ＋ 手数料 ' + yen(saved.fee);
    return show('<h1>テスト決済を確定</h1><p>' + detail + ' = ' + yen(saved.budget + saved.fee) +
      '</p><p>PayPal Sandboxのテスト決済です。実際の請求はありません。</p><form method="post" action="' + path +
      '/capture"><input type="hidden" name="order" value="' + orderId + '"><button>テスト決済を確定</button></form>');
  }
  try {
    const capture = await captureSandboxOrder(await sandboxToken(env), orderId, id, saved.budget + saved.fee);
    await env.DB.prepare('UPDATE paypal_founder_orders SET capture_id = ? WHERE id = ? AND order_id = ?').bind(capture, id, orderId).run();
    return new Response(null, { status: 303, headers: { Location: path + '/complete', 'Cache-Control': 'no-store' } });
  } catch {
    return show('<h1>PayPalの処理を確認できませんでした。</h1><p>時間をおいて同じブラウザで再度お試しください。</p>', 502);
  }
}
