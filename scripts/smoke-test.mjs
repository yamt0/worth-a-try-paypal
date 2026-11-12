import assert from "node:assert/strict";
import worker from "../worker/index.js";

const originalFetch = globalThis.fetch;
const testEndDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
try {
  globalThis.fetch = async () => {
    throw new Error("Unexpected external request");
  };

  const page = await worker.fetch(new Request("https://example.test/"), {});
  assert.equal(page.status, 200);
  assert.match(page.headers.get("content-security-policy"), /default-src 'self'/);
  const pageHtml = await page.text();
  assert.match(pageHtml, /Founder test fee/);
  assert.match(pageHtml, /<form id="idea-form" method="post" action="\/api\/checkout">/);
  assert.match(pageHtml, /Reach, ad clicks, page requests/);
  assert.match(pageHtml, /No charge now/);
  assert.match(pageHtml, /Founder idea submissions are closed for now/);
  assert.doesNotMatch(pageHtml, /Tell us what you want to make/);
  assert.match(pageHtml, /Don’t include personal data, confidential information, or secrets/);
  assert.match(pageHtml, /id="pay-button" type="submit" disabled/);
  assert.match(pageHtml, /const checkoutEnabled = false/);
  assert.match(pageHtml, /id="idea" name="idea" minlength="12" maxlength="400" required disabled/);
  assert.match(pageHtml, /pay-button:disabled \{ background: #dedfd5; color: #55594f; opacity: 1/);
  assert.match(pageHtml, /textarea::placeholder \{ color: #686c61/);
  assert.match(pageHtml, /try \{ sessionStorage\.setItem\("worth-a-try-draft", idea\); \} catch \{\}/);
  for (const [, script] of pageHtml.matchAll(/<script>([\s\S]*?)<\/script>/g)) {
    assert.doesNotThrow(() => new Function(script));
  }

  const testCheckoutPage = await worker.fetch(new Request("https://example.test/"), { STRIPE_SECRET_KEY: "sk_test_example123", SERVICE_TEST_MODE_ENABLED: "true" });
  const testCheckoutHtml = await testCheckoutPage.text();
  assert.match(testCheckoutHtml, /const checkoutEnabled = true/);
  assert.match(testCheckoutHtml, /Tell us what you want to make/);
  assert.match(testCheckoutHtml, /stored in Stripe Checkout metadata for review/);
  assert.match(testCheckoutHtml, /id="pay-button" type="submit" >Continue to secure checkout/);

  const liveCheckoutPage = await worker.fetch(new Request("https://example.test/"), { STRIPE_SECRET_KEY: "sk_live_example123" });
  assert.match(await liveCheckoutPage.text(), /const checkoutEnabled = false/);
  const closedTestCheckout = await worker.fetch(new Request("https://example.test/api/checkout", {
    method: "POST",
    headers: { Origin: "https://example.test", "Content-Type": "application/json" },
    body: JSON.stringify({ idea: "A useful idea for a small test.", company_website: "" }),
  }), { STRIPE_SECRET_KEY: "sk_test_example123" });
  assert.equal(closedTestCheckout.status, 503);

  const unavailable = await worker.fetch(new Request("https://example.test/api/checkout", {
    method: "POST",
    headers: { Origin: "https://example.test", "Content-Type": "application/json" },
    body: JSON.stringify({ idea: "A useful idea for a small test.", company_website: "" }),
  }), {});
  assert.equal(unavailable.status, 503);
  assert.equal((await unavailable.json()).code, "payments_not_configured");
  const closedCampaign = await worker.fetch(new Request("https://example.test/reserve"), {});
  assert.equal(closedCampaign.status, 404);
  const closedIntent = await worker.fetch(new Request("https://example.test/interest"), {});
  assert.equal(closedIntent.status, 404);

  let checkoutBody;
  globalThis.fetch = async (url, options) => {
    assert.equal(url, "https://api.stripe.com/v1/checkout/sessions");
    assert.equal(options.headers.Authorization, "Bearer sk_test_example123");
    checkoutBody = new URLSearchParams(options.body);
    return Response.json({ url: "https://checkout.stripe.com/c/pay/cs_test_example123" });
  };
  const checkout = await worker.fetch(new Request("https://example.test/api/checkout", {
    method: "POST",
    headers: { Origin: "https://example.test", "Content-Type": "application/json" },
    body: JSON.stringify({ idea: "A useful idea for a small test.", company_website: "" }),
  }), { STRIPE_SECRET_KEY: "sk_test_example123", SERVICE_TEST_MODE_ENABLED: "true" });
  assert.equal(checkout.status, 200);
  assert.equal(checkoutBody.get("line_items[0][price_data][unit_amount]"), "100");
  assert.equal(checkoutBody.get("line_items[1][price_data][unit_amount]"), "30");
  assert.equal(checkoutBody.get("metadata[ad_budget_cents]"), "100");
  assert.equal(checkoutBody.get("metadata[service_fee_cents]"), "30");
  assert.equal(checkoutBody.get("metadata[idea]"), "A useful idea for a small test.");

  globalThis.fetch = async (url, options) => {
    assert.match(url, /\/v1\/checkout\/sessions\/cs_test_example123$/);
    assert.equal(options.headers.Authorization, "Bearer sk_test_example123");
    return Response.json({
      metadata: { product: "worth-a-try-manual-pilot" },
      currency: "usd",
      amount_total: 130,
      payment_status: "paid",
    });
  };
  const verified = await worker.fetch(new Request(
    "https://example.test/api/checkout-status?session_id=cs_test_example123",
  ), { STRIPE_SECRET_KEY: "sk_test_example123" });
  assert.deepEqual(await verified.json(), { paid: true });

  const liveService = await worker.fetch(new Request("https://example.test/api/checkout", {
    method: "POST",
    headers: { Origin: "https://example.test", "Content-Type": "application/json" },
    body: JSON.stringify({ idea: "A useful idea for a small test.", company_website: "" }),
  }), { STRIPE_SECRET_KEY: "sk_live_example123" });
  assert.equal(liveService.status, 503);

  const interestEnv = {
    INTEREST_ENABLED: "true",
    INTEREST_CAMPAIGN_ID: "sample-campaign",
    INTEREST_PRODUCT_NAME: "A useful sample product",
    INTEREST_PRODUCT_DESCRIPTION: "A useful sample product for a short demand test.",
    INTEREST_TEST_END_DATE: testEndDate,
  };
  const originalConsoleLog = console.log;
  const recordedEvents = [];
  console.log = (value) => recordedEvents.push(value);
  const interestPage = await worker.fetch(new Request("https://example.test/interest"), interestEnv);
  assert.equal(interestPage.status, 200);
  const interestHtml = await interestPage.text();
  assert.match(interestHtml, /No payment will be taken/);
  assert.match(interestHtml, /non-binding interest test/);
  assert.match(interestHtml, /don’t collect your name or contact details/);
  assert.doesNotMatch(interestHtml, /\$3|reservation-checkout|Stripe/);
  assert.match(interestHtml, /We log only this campaign and your yes\/no answer/);
  assert.match(interestHtml, /logs are temporary/);
  assert.match(interestHtml, /repeat visits may be counted separately/i);
  assert.doesNotMatch(interestHtml, /aggregate test signal/);
  assert.match(interestHtml, /No order was placed/i);
  assert.match(interestHtml, /No — not for me/);
  assert.match(interestHtml, /\.choice\{[^}]*background:#fff;color:var\(--ink\)/);
  assert.doesNotMatch(interestHtml, /Stripe Checkout/);
  assert.match(interestHtml, /sessionStorage/);
  assert.match(interestHtml, /response.status===429/);
  assert.match(interestHtml, /AbortSignal.timeout\(10000\)/);
  assert.match(interestHtml, /og:title/);
  for (const [, script] of interestHtml.matchAll(/<script>([\s\S]*?)<\/script>/g)) {
    assert.doesNotThrow(() => new Function(script));
  }

  const yesIntent = await worker.fetch(new Request("https://example.test/api/free-preorder-intent", {
    method: "POST",
    headers: { Origin: "https://example.test", "Content-Type": "application/json" },
    body: JSON.stringify({ campaign_id: "sample-campaign", choice: "yes" }),
  }), interestEnv);
  const noIntent = await worker.fetch(new Request("https://example.test/api/free-preorder-intent", {
    method: "POST",
    headers: { Origin: "https://example.test", "Content-Type": "application/json" },
    body: JSON.stringify({ campaign_id: "sample-campaign", choice: "no" }),
  }), interestEnv);
  const rejectedIntent = await worker.fetch(new Request("https://example.test/api/free-preorder-intent", {
    method: "POST",
    headers: { Origin: "https://other.test", "Content-Type": "application/json" },
    body: JSON.stringify({ campaign_id: "sample-campaign", choice: "yes" }),
  }), interestEnv);
  const extraDataIntent = await worker.fetch(new Request("https://example.test/api/free-preorder-intent", {
    method: "POST",
    headers: { Origin: "https://example.test", "Content-Type": "application/json" },
    body: JSON.stringify({ campaign_id: "sample-campaign", choice: "yes", email: "not-collected@example.test" }),
  }), interestEnv);
  console.log = originalConsoleLog;
  assert.equal(yesIntent.status, 200);
  assert.equal(noIntent.status, 200);
  assert.equal(rejectedIntent.status, 403);
  assert.equal(extraDataIntent.status, 400);
  assert.deepEqual(recordedEvents, [
    { event: "campaign_landing_page_request", campaign_id: "sample-campaign" },
    { event: "free_preorder_intent", campaign_id: "sample-campaign", choice: "yes" },
    { event: "free_preorder_intent", campaign_id: "sample-campaign", choice: "no" },
  ]);

  console.log = () => {};
  const unsafeCampaignPage = await worker.fetch(new Request("https://example.test/interest"), {
    ...interestEnv,
    INTEREST_CAMPAIGN_ID: "escaped-campaign",
    INTEREST_PRODUCT_NAME: "<img src=x onerror=alert(1)>",
    INTEREST_PRODUCT_DESCRIPTION: "</p><script>alert(1)</script> A campaign description.",
  });
  const escapedCampaignHtml = await unsafeCampaignPage.text();
  assert.equal(unsafeCampaignPage.status, 200);
  assert.match(escapedCampaignHtml, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.match(escapedCampaignHtml, /&lt;\/p&gt;&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(escapedCampaignHtml, /<img src=x onerror/);
  for (let index = 0; index < 9; index += 1) {
    const limited = await worker.fetch(new Request("https://example.test/api/free-preorder-intent", {
      method: "POST",
      headers: { Origin: "https://example.test", "Content-Type": "application/json", "CF-Connecting-IP": "192.0.2.41" },
      body: JSON.stringify({ campaign_id: "sample-campaign", choice: "yes" }),
    }), interestEnv);
    assert.equal(limited.status, index < 8 ? 200 : 429);
  }
  const separateCheckoutLimit = await worker.fetch(new Request("https://example.test/api/checkout", {
    method: "POST",
    headers: { Origin: "https://example.test", "Content-Type": "application/json", "CF-Connecting-IP": "192.0.2.41" },
    body: JSON.stringify({ idea: "A useful idea for a small test.", company_website: "" }),
  }), {});
  console.log = originalConsoleLog;
  assert.equal(separateCheckoutLimit.status, 503);

  console.log("Smoke checks passed: unconfigured founder checkout is disabled; Stripe test and live payment gates hold; free-preorder intent is logged without crossing rate-limit scopes; founder checkout stays fixed-price.");
} finally {
  globalThis.fetch = originalFetch;
}
