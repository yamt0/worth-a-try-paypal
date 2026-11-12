import assert from 'node:assert/strict';
import worker from '../worker/index.js';
const env={STRIPE_SECRET_KEY:'sk_test_example123',SERVICE_TEST_MODE_ENABLED:'true'};
const origin='https://example.test';const headers={Origin:origin,'Content-Type':'application/json','CF-Connecting-IP':'192.0.2.9'};
let lastForm;let lookup;
const original=globalThis.fetch;
globalThis.fetch=async (url,opts)=>{if(String(url).includes('/checkout/sessions/') && !opts.method)return Response.json(lookup);lastForm=new URLSearchParams(opts.body);return Response.json({url:'https://checkout.stripe.com/c/pay/test'});};
async function create(amount){return worker.fetch(new Request(origin+'/api/checkout',{method:'POST',headers,body:JSON.stringify({idea:'A useful neighborhood garden tool service.',ad_budget_yen:amount,ad_country:'AU'})}),env)}
assert.equal((await create(399)).status,400);
assert.equal((await create(400)).status,200);assert.equal(lastForm.get('line_items[0][price_data][currency]'),'jpy');assert.equal(lastForm.get('line_items[0][price_data][unit_amount]'),'400');assert.equal(lastForm.get('line_items[1][price_data][unit_amount]'),'120');assert.equal(lastForm.get('metadata[total_yen]'),'520');
assert.equal((await create(1000)).status,200);assert.equal(lastForm.get('metadata[ad_budget_yen]'),'1000');assert.equal(lastForm.get('metadata[total_yen]'),'1300');
lastForm=undefined;assert.equal((await create(1001)).status,400);assert.equal(lastForm,undefined);
const owner='a'.repeat(64), idea='A useful neighborhood garden tool service.', id='11111111-1111-4111-8111-111111111111';
const ownerHash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(owner))),x=>x.toString(16).padStart(2,'0')).join('');
const ownedEnv={...env,DB:{prepare(){return {bind(){return {async first(){return {idea,owner_hash:ownerHash}}}}}}}};
async function owned(token){return worker.fetch(new Request(origin+'/api/checkout',{method:'POST',headers,body:JSON.stringify({idea,preview_id:id,preview_owner_token:token,ad_budget_yen:400,ad_country:'AU'})}),ownedEnv)}
assert.equal((await owned('wrong')).status,400);assert.equal((await owned(owner)).status,200);
const status=()=>worker.fetch(new Request(origin+'/api/checkout-status?session_id=cs_test_abcdefgh',{headers:{Origin:origin,'CF-Connecting-IP':'192.0.2.10'}}),env);
lookup={payment_status:'paid',currency:'jpy',amount_total:50,metadata:{product:'worth-a-try-manual-pilot',ad_budget_yen:'1',service_fee_yen:'0',adjustment_yen:'49',total_yen:'50'}};assert.equal((await (await status()).json()).paid,true);
lookup={...lookup,amount_total:51};assert.equal((await (await status()).json()).paid,false);
lookup={payment_status:'paid',currency:'jpy',amount_total:200,metadata:{product:'worth-a-try-manual-pilot',ad_budget_yen:'1',service_fee_yen:'0',adjustment_yen:'199',total_yen:'200',minimum_total_yen:'200'}};assert.equal((await (await status()).json()).paid,true);
lookup={payment_status:'paid',currency:'usd',amount_total:130,metadata:{product:'worth-a-try-manual-pilot',ad_budget_cents:'100',service_fee_cents:'30',total_cents:'130'}};assert.equal((await (await status()).json()).paid,true);
globalThis.fetch=original;console.log('JPY checkout, minimum adjustment, rounding and old USD order checks passed.');
