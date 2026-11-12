const api = 'https://api-m.sandbox.paypal.com';

export function sandboxEnabled(env) {
  return Boolean(env.PAYPAL_SANDBOX_CLIENT_ID?.trim() && env.PAYPAL_SANDBOX_CLIENT_SECRET?.trim());
}

export async function sandboxToken(env) {
  const response = await fetch(api + '/v1/oauth2/token', {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + btoa(env.PAYPAL_SANDBOX_CLIENT_ID.trim() + ':' + env.PAYPAL_SANDBOX_CLIENT_SECRET.trim()),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error('PayPal authentication failed');
  const data = await response.json();
  if (!data.access_token) throw new Error('PayPal token missing');
  return data.access_token;
}

async function orders(path, token, { requestId, body } = {}) {
  const headers = { Authorization: 'Bearer ' + token };
  if (requestId) {
    headers['PayPal-Request-Id'] = requestId;
    headers['Content-Type'] = 'application/json';
    headers.Prefer = 'return=representation';
  }
  const response = await fetch(api + '/v2/checkout/orders' + path, {
    method: requestId ? 'POST' : 'GET',
    headers,
    body: requestId ? JSON.stringify(body || {}) : undefined,
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error('PayPal order request failed');
  return response.json();
}

export async function createSandboxOrder(token, price, requestId, returnUrl, cancelUrl, description) {
  const order = await orders('', token, { requestId, body: {
    intent: 'CAPTURE',
    purchase_units: [{ amount: { currency_code: 'JPY', value: String(price) }, description }],
    payment_source: { paypal: { experience_context: {
      user_action: 'CONTINUE', shipping_preference: 'NO_SHIPPING',
      return_url: returnUrl, cancel_url: cancelUrl,
    } } },
  } });
  const link = order.links?.find(entry => ['payer-action', 'approve'].includes(entry.rel));
  if (!/^[A-Z0-9]{1,32}$/.test(order.id || '') || !link?.href) throw new Error('PayPal approval link missing');
  const approval = new URL(link.href);
  if (approval.origin !== 'https://www.sandbox.paypal.com' || approval.username || approval.password) throw new Error('Unexpected PayPal redirect');
  return { id: order.id, approval: approval.href };
}

export async function captureSandboxOrder(token, orderId, requestId, price) {
  const path = '/' + encodeURIComponent(orderId);
  let order;
  try {
    order = await orders(path + '/capture', token, { requestId });
  } catch {
    // Recover when the capture succeeded but its response was lost.
    order = await orders(path, token);
  }
  const capture = order.purchase_units?.[0]?.payments?.captures?.[0];
  if (order.id !== orderId || order.status !== 'COMPLETED' || capture?.status !== 'COMPLETED' ||
      capture.amount?.currency_code !== 'JPY' || capture.amount?.value !== String(price) || !capture.id) {
    throw new Error('PayPal capture is not confirmed');
  }
  return capture.id;
}
