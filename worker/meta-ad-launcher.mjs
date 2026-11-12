// Meta campaign orchestration.
// Mutations are checkpointed before each request; ambiguous outcomes require reconciliation.
const ID = /^\d{5,30}$/;
const VERSION = /^v\d{1,2}\.\d$/;
export class MetaLaunchError extends Error {
  constructor(code,message,details=null){super(message);this.name='MetaLaunchError';this.code=code;this.details=details;}
}
export function campaignFingerprint(plan) {
  return JSON.stringify({accountId:plan.accountId,country:plan.adSet.targeting.geo_locations.countries,budget:plan.adSet.lifetime_budget,durationMs:Date.parse(plan.adSet.end_time)-Date.parse(plan.adSet.start_time),categories:plan.campaign.special_ad_categories,page:plan.creative.object_story_spec.page_id,instagram:plan.creative.object_story_spec.instagram_user_id});
}
export async function reserveInstagramLaunch(plan,store) {
  const key=plan.campaign.name;
  if (!await store.acquire(key)) throw new MetaLaunchError('locked','This campaign is already being processed.');
  try {
    const state=await store.load(key), fingerprint=campaignFingerprint(plan);
    if (state.pending && state.plan===fingerprint && typeof store.retryRejectedAuth==='function') {
      try { await store.retryRejectedAuth(key,state.pending); return; } catch { /* ambiguous requests are never automatically retried */ }
    }
    if (state.pending==='adset' && state.plan && typeof store.retryRejectedBudget==='function') {
      const before=JSON.parse(state.plan), after=JSON.parse(fingerprint);
      const oldBudget=before.budget, newBudget=after.budget;
      delete before.budget; delete after.budget;
      if (Number.isSafeInteger(oldBudget) && newBudget>oldBudget && JSON.stringify(before)===JSON.stringify(after)) {
        try { await store.retryRejectedBudget(key,fingerprint); return; } catch { /* only an explicit low-budget rejection may be retried */ }
      }
    }
    if (state.pending) throw new MetaLaunchError('needs_review','A prior request has an unknown outcome.');
    if (state.plan && state.plan!==fingerprint) throw new MetaLaunchError('plan_mismatch','This preview already has a different campaign.');
    if (!state.plan) { await store.begin(key,'plan'); await store.finish(key,'plan',fingerprint); }
  } finally { if (typeof store.release==='function') await store.release(key); }
}
export async function runInstagramLaunch({plan,token,version,store,fetchFn=fetch,activate=false}) {
  if (!plan || !ID.test(plan.accountId||'') || typeof token!=='string' || !token || !VERSION.test(version||'')) throw new MetaLaunchError('invalid_config','Meta connection is not configured.');
  if (!Number.isSafeInteger(plan.adSet?.lifetime_budget) || plan.adSet.lifetime_budget<1 || plan.adSet.lifetime_budget>1000) throw new MetaLaunchError('invalid_budget','The advertising budget must be from ¥1 to ¥1,000.');
  const required=['acquire','load','begin','finish','review'];
  if (!store || required.some(k=>typeof store[k]!=='function')) throw new MetaLaunchError('invalid_store','Durable launch storage is required.');
  if (plan.campaign?.status!=='PAUSED'||plan.adSet?.status!=='PAUSED'||plan.ad?.status!=='PAUSED') throw new MetaLaunchError('invalid_plan','Initial objects must be paused.');
  const launchKey=plan.campaign.name;
  if (!await store.acquire(launchKey)) throw new MetaLaunchError('locked','This campaign is already being processed.');
  let state=await store.load(launchKey);
  if (state.pending) { if (typeof store.release==='function') await store.release(launchKey); throw new MetaLaunchError('needs_review','A prior request has an unknown outcome.'); }
  const fingerprint = campaignFingerprint(plan);
  if (state.plan && state.plan !== fingerprint) { if (typeof store.release==='function') await store.release(launchKey); throw new MetaLaunchError('plan_mismatch','This preview already has a different campaign.'); }
  const base='https://graph.facebook.com/'+version+'/';
  async function request(path,params) {
    const body=new URLSearchParams();
    for(const [key,value] of Object.entries(params)) if(value!==null && value!==undefined)body.set(key,typeof value==='object'?JSON.stringify(value):String(value));
    let response;try {response=await fetchFn(base+path,{method:'POST',headers:{'Authorization':'Bearer '+token,'Content-Type':'application/x-www-form-urlencoded'},body,signal:AbortSignal.timeout(25000)});}catch(error) {throw new MetaLaunchError('ambiguous','Meta request outcome is unknown.',String(error?.name||'Error')+': '+String(error?.message||error).split(token).join('[非表示]'));}
    let data;try{data=await response.json()}catch(error){throw new MetaLaunchError('ambiguous','Meta response could not be read.',String(error?.name||'Error')+': '+String(error?.message||error));}
    if(!response.ok) { const details=JSON.stringify(data?.error ?? data).split(token).join('[非表示]'); throw new MetaLaunchError(data?.error?.code===190?'auth_expired':data?.error?.error_subcode===1885272?'budget_too_low':'meta_rejected','Meta rejected this step.',details); }
    return data;
  }
  async function stage(step,path,params,needsId) {
    if(state[step])return state[step];
    await store.begin(launchKey,step);
    try {
      const result=await request(path,params);
      const value=needsId?result.id:result.success;
      if(needsId ? !ID.test(value||'') : value!==true) throw new MetaLaunchError('ambiguous','Meta did not confirm the step.');
      await store.finish(launchKey,step,value);state={...state,[step]:value};return value;
    } catch(error){await store.review(launchKey,step,error.code||'ambiguous',error.details||null);throw error;}
  }
  try {
  if (!state.plan) { await store.begin(launchKey,'plan'); await store.finish(launchKey,'plan',fingerprint); state.plan=fingerprint; }
  const campaignId=await stage('campaign','act_'+plan.accountId+'/campaigns',plan.campaign,true);
  const adsetId=await stage('adset','act_'+plan.accountId+'/adsets',{...plan.adSet,campaign_id:campaignId},true);
  const creativeId=await stage('creative','act_'+plan.accountId+'/adcreatives',plan.creative,true);
  const adId=await stage('ad','act_'+plan.accountId+'/ads',{...plan.ad,adset_id:adsetId,creative:{creative_id:creativeId}},true);
  if(!activate)return {campaignId,adsetId,creativeId,adId,status:'paused'};
  // Activate campaign last: partial failures leave at least one parent paused.
  await stage('ad_active',adId,{status:'ACTIVE'},false);
  await stage('adset_active',adsetId,{status:'ACTIVE'},false);
  await stage('campaign_active',campaignId,{status:'ACTIVE'},false);
  return {campaignId,adsetId,creativeId,adId,status:'submitted_for_review'};
  } finally { if (typeof store.release==='function') await store.release(launchKey); }
}
