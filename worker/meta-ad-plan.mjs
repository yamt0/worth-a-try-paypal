// Draft request construction only. This module does not call Meta or activate ads.
const META_CATEGORIES = new Set(['CREDIT','EMPLOYMENT','HOUSING','ISSUES_ELECTIONS_POLITICS']);
const ID = /^\d{5,30}$/;
const PREVIEW = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
export function prepareInstagramCampaign({accountId,pageId,instagramId,previewId,country,advertisingBudgetYen,accountCurrency,accountBudgetMinor,adText,specialCategories,startAt}) {
  if (![accountId,pageId,instagramId].every(x=>typeof x==='string' && ID.test(x))) throw new Error('Meta account, page, and Instagram IDs are required.');
  if (!PREVIEW.test(previewId||'')) throw new Error('A generated landing page is required.');
  if (!/^[A-Z]{2}$/.test(country||'')) throw new Error('Select a country.');
  if (!Number.isSafeInteger(advertisingBudgetYen)||advertisingBudgetYen<1||advertisingBudgetYen>1000) throw new Error('Invalid selected advertising budget.');
  // Meta's account is JPY, a zero-decimal currency. The submitted lifetime budget must match exactly.
  if (accountCurrency!=='JPY'||accountBudgetMinor!==advertisingBudgetYen) throw new Error('Advertising account currency must match the selected JPY budget.');
  if (!Array.isArray(specialCategories)||specialCategories.some(x=>!META_CATEGORIES.has(x))) throw new Error('Explicit advertising categories are required.');
  if (typeof adText!=='string'||!adText.trim()||adText.length>2000) throw new Error('Advertising text is required.');
  const start=new Date(startAt); if(!Number.isFinite(start.getTime()))throw new Error('Invalid start time.');
  const end=new Date(start.getTime()+48*60*60*1000);
  const url='https://worthatry.everyonesai.org/preview/'+previewId;
  return {
    accountId,
    campaign:{name:'Worth A Try '+previewId,objective:'OUTCOME_TRAFFIC',special_ad_categories:specialCategories,status:'PAUSED',buying_type:'AUCTION',is_adset_budget_sharing_enabled:false},
    adSet:{name:'Instagram · '+country,campaign_id:null,optimization_goal:'LINK_CLICKS',billing_event:'IMPRESSIONS',bid_strategy:'LOWEST_COST_WITHOUT_CAP',lifetime_budget:accountBudgetMinor,start_time:start.toISOString(),end_time:end.toISOString(),targeting:{geo_locations:{countries:[country]},publisher_platforms:['instagram']},status:'PAUSED'},
    creative:{name:'Worth A Try '+previewId,object_story_spec:{page_id:pageId,instagram_user_id:instagramId,link_data:{message:adText,link:url,picture:url+'/creative',call_to_action:{type:'LEARN_MORE'}}}},
    ad:{name:'Worth A Try '+previewId,adset_id:null,creative:{creative_id:null},status:'PAUSED'}
  };
}
