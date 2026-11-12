import assert from 'node:assert/strict';
import {prepareInstagramCampaign} from '../worker/meta-ad-plan.mjs';
import {runInstagramLaunch} from '../worker/meta-ad-launcher.mjs';
const plan=prepareInstagramCampaign({accountId:'1404592197968750',pageId:'1298247146714548',instagramId:'17841423915509971',previewId:'11111111-1111-4111-8111-111111111111',country:'AU',advertisingBudgetYen:1000,accountCurrency:'JPY',accountBudgetMinor:1000,adText:'Join the waitlist',specialCategories:[],startAt:'2026-11-06T00:00:00.000Z'});
function memory(){let state={};return {async acquire(){return true},async load(){return {...state}},async begin(_k,step){state.pending=step},async finish(_k,step,value){state[step]=value;delete state.pending},async review(_k,step,code){state.pending=step;state.error=code}}}
let calls=[];const fake=async (url,opts)=>{calls.push({url,body:new URLSearchParams(opts.body)});return Response.json(calls.length<=4?{id:String(100000+calls.length)}:{success:true})};
const store=memory();let result=await runInstagramLaunch({plan,token:'fake',version:'v26.0',store,fetchFn:fake});assert.equal(result.status,'paused');assert.equal(calls.length,4);assert.equal(calls[0].body.get('status'),'PAUSED');assert.equal(calls[3].body.get('status'),'PAUSED');
result=await runInstagramLaunch({plan,token:'fake',version:'v26.0',store,fetchFn:fake,activate:true});assert.equal(result.status,'submitted_for_review');assert.equal(calls.length,7);assert.match(calls[6].url,/100001$/);
const failed=memory();await assert.rejects(runInstagramLaunch({plan,token:'fake',version:'v26.0',store:failed,fetchFn:async()=>{throw Error('timeout')}}),{code:'ambiguous'});await assert.rejects(runInstagramLaunch({plan,token:'fake',version:'v26.0',store:failed,fetchFn:fake}),{code:'needs_review'});
console.log('Paused draft, activation order, duplicate checkpoint, and ambiguous failure checks passed.');
