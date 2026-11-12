// D1 store for a single preview's ad launch; timed-out or interrupted requests stay pending.
export function submissionState(row, now=Date.now()) {
  if (!row) return 'not_started';
  const state=JSON.parse(row.state);
  if (row.error_code || (row.pending && now-Number(row.updated_at)>120000)) return 'needs_attention';
  if (state.campaign_active) return 'submitted_for_review';
  return 'preparing';
}
export function createLaunchStore(db, {leaseMs=120000, now=()=>Date.now(), owner=crypto.randomUUID()}={}) {
  if (!db || !Number.isSafeInteger(leaseMs) || leaseMs < 30000) throw Error('Invalid durable store');
  const changes=r=>r?.meta?.changes||0;
  return {
    async acquire(key) {
      await db.prepare("INSERT INTO meta_ad_launches (launch_key,state,updated_at) VALUES (?, '{}', ?) ON CONFLICT(launch_key) DO NOTHING").bind(key,now()).run();
      const r=await db.prepare("UPDATE meta_ad_launches SET lock_owner=?, lock_until=?, updated_at=? WHERE launch_key=? AND (lock_until IS NULL OR lock_until < ? OR lock_owner=?)").bind(owner,now()+leaseMs,now(),key,now(),owner).run();
      return changes(r)===1;
    },
    async load(key) {
      const row=await db.prepare('SELECT state,pending FROM meta_ad_launches WHERE launch_key=? AND lock_owner=?').bind(key,owner).first();
      if(!row)throw Error('Launch lock lost');
      const state=JSON.parse(row.state);if(row.pending)state.pending=row.pending;return state;
    },
    async begin(key,step) {
      if(!/^[a-z_]+$/.test(step))throw Error('Invalid step');
      const r=await db.prepare('UPDATE meta_ad_launches SET pending=?,lock_until=?,updated_at=? WHERE launch_key=? AND lock_owner=? AND pending IS NULL').bind(step,now()+leaseMs,now(),key,owner).run();
      if(changes(r)!==1)throw Error('Launch lock lost or prior step pending');
    },
    async finish(key,step,value) {
      const r=await db.prepare("UPDATE meta_ad_launches SET state=json_set(state, ?, json(?)), pending=NULL, lock_until=?, updated_at=? WHERE launch_key=? AND lock_owner=? AND pending=?").bind('$."'+step+'"',JSON.stringify(value),now()+leaseMs,now(),key,owner,step).run();
      if(changes(r)!==1)throw Error('Could not persist completed Meta operation');
    },
    async review(key,step,code,details=null) {
      await db.prepare("UPDATE meta_ad_launches SET error_code=?, state=json_set(state,'$.last_error',json(?)),updated_at=? WHERE launch_key=? AND lock_owner=? AND pending=?").bind(String(code).slice(0,60),JSON.stringify(details),now(),key,owner,step).run();
    },
    async retryRejectedBudget(key,fingerprint) {
      const r=await db.prepare("UPDATE meta_ad_launches SET state=json_set(state,'$.plan',json(?)),pending=NULL,error_code=NULL,updated_at=? WHERE launch_key=? AND lock_owner=? AND pending='adset' AND error_code='budget_too_low' AND json_extract(state,'$.adset') IS NULL").bind(JSON.stringify(fingerprint),now(),key,owner).run();
      if(changes(r)!==1)throw Error('Cannot safely retry this campaign');
    },
    async retryRejectedAuth(key,step) {
      const r=await db.prepare("UPDATE meta_ad_launches SET pending=NULL,error_code=NULL,updated_at=? WHERE launch_key=? AND lock_owner=? AND pending=? AND error_code='auth_expired'").bind(now(),key,owner,step).run();
      if(changes(r)!==1)throw Error('Cannot safely retry this campaign');
    },
    async release(key) {
      await db.prepare('UPDATE meta_ad_launches SET lock_owner=NULL,lock_until=NULL,updated_at=? WHERE launch_key=? AND lock_owner=?').bind(now(),key,owner).run();
    }
  };
}
