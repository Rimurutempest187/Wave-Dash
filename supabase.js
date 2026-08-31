/* WAVE DASH - supabase.js : OPTIONAL backend. Game is fully playable OFFLINE.
 * Activates only with a valid PUBLIC anon key + URL below. NEVER a service_role key. */
'use strict';
const SUPABASE_URL='';       /* https://YOUR-PROJECT.supabase.co */
const SUPABASE_ANON_KEY='';  /* public anon / publishable key ONLY */
const Supabase={enabled:false,client:null,
  init(){try{if(!SUPABASE_URL||!SUPABASE_ANON_KEY){this.enabled=false;return false;}
    if(typeof supabase==='undefined'||!supabase.createClient){this.enabled=false;return false;}
    this.client=supabase.createClient(SUPABASE_URL,SUPABASE_ANON_KEY);this.enabled=true;return true;}catch(e){this.enabled=false;return false;}},
  async rpc(fn,p){if(!this.enabled)return{offline:true};try{return await this.client.rpc(fn,p);}catch(e){return{error:e};}},
  async leaderboard(m){const map={rank:'get_rank_leaderboard',classic:'get_classic_leaderboard',endless:'get_endless_leaderboard',trial:'get_time_trial_leaderboard',challenge:'get_challenge_leaderboard',coins:'get_coin_leaderboard',diamonds:'get_diamond_leaderboard'};
    if(!this.enabled)return{offline:true,rows:[]};try{const r=await this.client.rpc(map[m]||map.rank);return{rows:(r&&r.data)||[]};}catch(e){return{error:e,rows:[]};}},
  submitClassic(r){return this.rpc('submit_classic_result',r);},submitRank(r){return this.rpc('submit_rank_result',r);},
  submitEndless(r){return this.rpc('submit_endless_result',r);},submitTimeTrial(r){return this.rpc('submit_time_trial',r);},
  submitChallenge(r){return this.rpc('submit_challenge_result',r);},claimAchievement(id){return this.rpc('claim_achievement_reward',{achievement_id:id});}};
try{Supabase.init();}catch(_){Supabase.enabled=false;}
