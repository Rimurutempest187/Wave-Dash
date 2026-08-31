/* WAVE DASH - app.js : entire game (init-error trap, Save+migration, audio, cosmetics,
 * achievements, levels, engine, UI, modes, boot) in one self-invoking scope.
 * js/systems.js, js/game.js, js/modes.js, js/ui.js, js/supabase.js load FIRST and define
 * the ModeManager/Supabase facades + module docs; this scope uses them at runtime. */
(function(){
(function(){
  'use strict';
  function showErr(stage, msg, loc){
    const p = document.getElementById('errPanel');
    if (p){ p.style.display = 'block'; }
    const s = document.getElementById('errStage'); if (s) s.textContent = 'stage: ' + stage;
    const m = document.getElementById('errMsg');   if (m) m.textContent = String(msg);
    const l = document.getElementById('errLoc');   if (l) l.textContent = loc || '';
    try{ console.error('[WAVE DASH INIT ERROR]', stage, msg); }catch(_){}
  }
  window.__showInitError = showErr;
  window.addEventListener('error', function(e){
    if (window.__WAVE_DASH_READY__) return;
    showErr('window.error',
      (e.error && e.error.message) || e.message || 'unknown',
      (e.filename || '') + (e.lineno ? (':'+e.lineno + (e.colno ? (':'+e.colno) : '')) : ''));
  });
  window.addEventListener('unhandledrejection', function(e){
    if (window.__WAVE_DASH_READY__) return;
    showErr('unhandledrejection',
      (e.reason && (e.reason.message || e.reason.toString())) || 'unknown', '');
  });
})();
'use strict';
(function(){
const $=id=>document.getElementById(id);
const clamp=(v,a,b)=>v<a?a:v>b?b:v;
const lerp=(a,b,t)=>a+(b-a)*t;
const fmt=n=>Number.isFinite(+n)?Math.round(+n).toLocaleString('en-US'):'0';
function hexA(hex,a){if(hex==='rainbow')hex='#00e5ff';const n=parseInt(hex.slice(1),16);return 'rgba('+((n>>16)&255)+','+((n>>8)&255)+','+(n&255)+','+a+')';}
function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
function fmtTime(ms){if(!Number.isFinite(+ms)||+ms<=0)return '—';return ((+ms)/1000).toFixed(3)+'s';}
function esc(s){const d=document.createElement('div');d.textContent=String(s==null?'':s);return d.innerHTML;}
function starStr(n){n=clamp(n|0,0,3);return '★'.repeat(n)+'☆'.repeat(3-n);}

/* ============================================================
 * CONFIG
 * ============================================================ */
const SAVE_VERSION=2;
const GAME_MODES={
  classic:{id:'classic',name:'CLASSIC',desc:'Complete levels and earn 1–3 stars.',icon:'▶️',leaderboardType:'classic',rewardsEnabled:true,starsEnabled:true,rankStarsEnabled:false,timerEnabled:false,checkpointEnabled:false,procedural:false,competitive:true},
  rank:{id:'rank',name:'RANK',desc:'Competitive star-based progression.',icon:'🏅',leaderboardType:'rank',rewardsEnabled:true,starsEnabled:false,rankStarsEnabled:true,timerEnabled:false,checkpointEnabled:false,procedural:false,competitive:true},
  endless:{id:'endless',name:'ENDLESS',desc:'Survive forever. Score never stops.',icon:'♾️',leaderboardType:'endless',rewardsEnabled:true,starsEnabled:false,rankStarsEnabled:false,timerEnabled:false,checkpointEnabled:false,procedural:true,competitive:true},
  time_trial:{id:'time_trial',name:'TIME TRIAL',desc:'Finish the level as fast as you can.',icon:'⏱️',leaderboardType:'trial',rewardsEnabled:true,starsEnabled:false,rankStarsEnabled:false,timerEnabled:true,checkpointEnabled:false,procedural:false,competitive:true},
  practice:{id:'practice',name:'PRACTICE',desc:'Train with checkpoints. No rewards.',icon:'🎯',leaderboardType:null,rewardsEnabled:false,starsEnabled:false,rankStarsEnabled:false,timerEnabled:false,checkpointEnabled:true,procedural:false,competitive:false},
  challenge:{id:'challenge',name:'CHALLENGE',desc:'Special modifiers. Clear them all.',icon:'⚡️',leaderboardType:'challenge',rewardsEnabled:true,starsEnabled:false,rankStarsEnabled:false,timerEnabled:false,checkpointEnabled:false,procedural:false,competitive:true}
};
const RANK_TIERS=[
  {id:'warrior',name:'Warrior',icon:'🏅',need:0},
  {id:'elite',name:'Elite',icon:'💠',need:50},
  {id:'master',name:'Master',icon:'🔥',need:100},
  {id:'grandmaster',name:'Grandmaster',icon:'⚡️',need:175},
  {id:'epic',name:'Epic',icon:'👑',need:275},
  {id:'legends',name:'Legends',icon:'🌟',need:400},
  {id:'mythic',name:'Mythic',icon:'💎',need:550}
];
const RANK_STAR_AWARD={1:1,2:2,3:3};
const CLASSIC_CONFIG={
  minCoinsFor2:3,
  coinRatioFor2:0.5,
  rewards:{0:{coins:0,diamonds:0},1:{coins:100,diamonds:1},2:{coins:175,diamonds:2},3:{coins:300,diamonds:3}},
  evaluateStars(g){
    let stars=1;
    const coins=g.coins,total=g.getCoinTotal(),starsGot=g.stars,starTotal=g.getStarTotal();
    if(coins>=Math.max(this.minCoinsFor2,Math.floor(total*this.coinRatioFor2)))stars=2;
    if(starTotal>0&&starsGot>=starTotal)stars=3;
    else if(stars===2&&coins>=total)stars=3;
    return clamp(stars,1,3);
  }
};
const TIME_TRIAL_CONFIG={
  minValidMs:1200,
  maxValidMs:30*60*1000,
  bonuses:[
    {maxMs:45000,coins:80,diamonds:1},
    {maxMs:30000,coins:150,diamonds:2},
    {maxMs:20000,coins:220,diamonds:3}
  ]
};
const CHALLENGES=[
  {id:'mirror',name:'MIRROR CONTROL',desc:'Hold and release are inverted.',modifier:{invertHold:true},difficulty:'Normal',levelId:2,reward:{coins:150,diamonds:2},active:true},
  {id:'gravity',name:'GRAVITY',desc:'Heavier wave — commit to every move.',modifier:{gravMul:1.55},difficulty:'Hard',levelId:3,reward:{coins:180,diamonds:2},active:true},
  {id:'fast',name:'FAST',desc:'The corridor does not wait.',modifier:{speedMul:1.38},difficulty:'Hard',levelId:4,reward:{coins:200,diamonds:3},active:true},
  {id:'lowgrav',name:'LOW GRAVITY',desc:'Floatier wave, tighter timing.',modifier:{gravMul:0.55},difficulty:'Normal',levelId:3,reward:{coins:160,diamonds:2},active:true},
  {id:'reverse',name:'REVERSE',desc:'Gravity starts flipped.',modifier:{startGrav:-1},difficulty:'Hard',levelId:5,reward:{coins:220,diamonds:3},active:true},
  {id:'chaos',name:'CHAOS',desc:'Inverted, faster, heavier. All at once.',modifier:{invertHold:true,speedMul:1.25,gravMul:1.25},difficulty:'Insane',levelId:6,reward:{coins:350,diamonds:5},active:true}
];
const ModeSys={
  cfg(m){return GAME_MODES[m]||GAME_MODES.classic;},
  isCompetitive(m){return !!this.cfg(m).competitive;},
  isReward(m){return !!this.cfg(m).rewardsEnabled;},
  isLeaderboard(m){return !!this.cfg(m).leaderboardType;},
  isPractice(m){return m==='practice';},
  normalize(m){
    if(m==='level'||m==='classic')return 'classic';
    if(m==='speed'||m==='time_trial'||m==='trial')return 'time_trial';
    if(GAME_MODES[m])return m;
    return 'classic';
  }
};
const RankSys={
  fromStars(s){
    s=Math.max(0,+s||0);
    let cur=RANK_TIERS[0], next=RANK_TIERS[1]||null;
    for(let i=0;i<RANK_TIERS.length;i++){
      if(s>=RANK_TIERS[i].need){cur=RANK_TIERS[i];next=RANK_TIERS[i+1]||null;}
    }
    return {
      rank_id:cur.id,rank_name:cur.name,rank_index:RANK_TIERS.indexOf(cur),
      icon:cur.icon,current_stars:s,
      next_rank:next?next.name:null,next_id:next?next.id:null,
      next_required_stars:next?next.need:null,
      stars_to_next:next?Math.max(0,next.need-s):0,
      max:!next
    };
  }
};

/* ---------------- Save ---------------- */
const Save={KEY:'wavedash_v1',data:null,
  def(){return{version:SAVE_VERSION,coins:0,diamonds:0,gems:0,
    classicStars:0,rankStars:0,rankTier:'warrior',
    ownedSkins:['classic'],skin:'classic',ownedTrails:['basic'],trail:'basic',
    ownedDeaths:['explosion'],death:'explosion',ownedThemes:['cyber'],menuTheme:'cyber',
    colors:{primary:'#00e5ff',secondary:'#ff2d95',trail:'#00e5ff'},glow:14,
    levels:{},classic:{},rankProgress:{},timeTrial:{},challenges:{},achClaimed:{},
    stats:{score:0,dist:0,done:0,coins:0,stars:0,deaths:0,plays:0,gems:0,diamonds:0},
    endlessBest:0,speedBest:0,ach:{},daily:{last:'',streak:0},
    selectedClassic:1,playerName:'',pendingRuns:[],
    settings:{music:true,sfx:true,vibration:true,particles:true,shake:true,reduced:false,showFps:false,sensitivity:1,quality:'auto',
      preset:'classic',vStr:1,smooth:50,maxVy:620,wave:560,gameSpeed:1,trailFx:true,camSmooth:50,trailIntensity:1}};},
  migrate(d){
    const base=this.def();
    if(!d||typeof d!=='object')return base;
    d=Object.assign(base,d);
    const ver=+d.version||1;
    if(ver<2){
      const gemVal=Math.max(0,Math.floor(+d.diamonds||0),Math.floor(+d.gems||0));
      d.diamonds=gemVal;
      d.classic=d.classic&&typeof d.classic==='object'?d.classic:{};
      d.levels=d.levels&&typeof d.levels==='object'?d.levels:{};
      for(const [id,rec] of Object.entries(d.levels)){
        if(!d.classic[id])d.classic[id]=Object.assign({coinsRewarded:0,diamondsRewarded:0},rec);
      }
      if(!d.classicStars)d.classicStars=Object.values(d.classic).reduce((a,l)=>a+(l.rating||0),0);
      d.rankStars=Math.max(0,+d.rankStars||0);
      d.rankProgress=d.rankProgress&&typeof d.rankProgress==='object'?d.rankProgress:{};
      d.timeTrial=d.timeTrial&&typeof d.timeTrial==='object'?d.timeTrial:{};
      d.challenges=d.challenges&&typeof d.challenges==='object'?d.challenges:{};
      d.achClaimed=d.achClaimed&&typeof d.achClaimed==='object'?d.achClaimed:{};
      d.pendingRuns=Array.isArray(d.pendingRuns)?d.pendingRuns:[];
      d.version=2;
    }
    d.diamonds=Math.max(0,Math.floor(+d.diamonds||0),Math.floor(+d.gems||0));
    d.gems=d.diamonds;
    const info=RankSys.fromStars(d.rankStars||0);
    d.rankTier=info.rank_id;
    return d;
  },
  load(){let d=this.def();
    try{const raw=localStorage.getItem(this.KEY);
      if(raw){const p=JSON.parse(raw);if(p&&typeof p==='object'){
        d=this.migrate(Object.assign(this.def(),p));
        d.settings=Object.assign(this.def().settings,p.settings||{});
        d.colors=Object.assign(this.def().colors,p.colors||{});
        d.stats=Object.assign(this.def().stats,p.stats||{});
        d.daily=Object.assign({last:'',streak:0},p.daily||{});
      }}}catch(e){d=this.def();}
    const base=this.def();
    for(const k of ['coins','diamonds','gems','glow','endlessBest','speedBest','classicStars','rankStars'])if(!Number.isFinite(+d[k])||+d[k]<0)d[k]=base[k];
    d.coins=Math.floor(d.coins);d.diamonds=Math.floor(d.diamonds);d.gems=d.diamonds;d.glow=clamp(d.glow,4,30);
    for(const k of ['score','dist','done','coins','stars','deaths','plays','gems','diamonds'])if(!Number.isFinite(+d.stats[k])||+d.stats[k]<0)d.stats[k]=base.stats[k]||0;
    for(const k of ['ownedSkins','ownedTrails','ownedDeaths','ownedThemes'])if(!Array.isArray(d[k]))d[k]=base[k].slice();
    d.settings=Object.assign(base.settings,d.settings&&typeof d.settings==='object'?d.settings:{});
    const st=d.settings;
    st.sensitivity=clamp(+st.sensitivity||1,.5,2);
    st.vStr=clamp(+st.vStr||1,.5,1.5);
    st.smooth=clamp(Number.isFinite(+st.smooth)?+st.smooth:50,0,100);
    st.maxVy=clamp(Number.isFinite(+st.maxVy)?+st.maxVy:620,420,900);
    st.wave=clamp(Number.isFinite(+st.wave)?+st.wave:560,420,760);
    st.gameSpeed=clamp(+st.gameSpeed||1,.8,1.2);
    st.camSmooth=clamp(Number.isFinite(+st.camSmooth)?+st.camSmooth:50,0,100);
    st.trailIntensity=clamp(+st.trailIntensity||1,.5,2);
    if(!['casual','classic','precise','fast','custom'].includes(st.preset))st.preset='custom';
    if(typeof st.trailFx!=='boolean')st.trailFx=true;
    d.colors=Object.assign(base.colors,d.colors&&typeof d.colors==='object'?d.colors:{});
    d.levels=d.levels&&typeof d.levels==='object'&&!Array.isArray(d.levels)?d.levels:{};
    d.classic=d.classic&&typeof d.classic==='object'&&!Array.isArray(d.classic)?d.classic:{};
    d.rankProgress=d.rankProgress&&typeof d.rankProgress==='object'?d.rankProgress:{};
    d.timeTrial=d.timeTrial&&typeof d.timeTrial==='object'?d.timeTrial:{};
    d.challenges=d.challenges&&typeof d.challenges==='object'?d.challenges:{};
    d.ach=d.ach&&typeof d.ach==='object'&&!Array.isArray(d.ach)?d.ach:{};
    d.achClaimed=d.achClaimed&&typeof d.achClaimed==='object'?d.achClaimed:{};
    d.pendingRuns=Array.isArray(d.pendingRuns)?d.pendingRuns:[];
    d.stats.diamonds=d.stats.diamonds||d.stats.gems||0;
    this.data=d;this.save();},
  save(){try{if(this.data){this.data.gems=this.data.diamonds;this.data.version=SAVE_VERSION;}localStorage.setItem(this.KEY,JSON.stringify(this.data));}catch(e){}},
  reset(){try{localStorage.removeItem(this.KEY);}catch(e){}this.data=this.def();this.save();}};

function addCoins(n){n=Math.floor(+n||0);if(!n)return 0;Save.data.coins=Math.max(0,Save.data.coins+n);return n;}
function addDiamonds(n){n=Math.floor(+n||0);if(!n)return 0;Save.data.diamonds=Math.max(0,(Save.data.diamonds||0)+n);Save.data.gems=Save.data.diamonds;Save.data.stats.diamonds=(Save.data.stats.diamonds||0)+Math.max(0,n);Save.data.stats.gems=Save.data.stats.diamonds;return n;}

/* ---------------- Audio ---------------- */
const AM={ctx:null,mus:null,sfx:null,noise:null,timer:null,next:0,step:0,
  unlock(){if(this.ctx){if(this.ctx.state==='suspended')this.ctx.resume();return;}
    try{const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return;
      this.ctx=new AC();this.mus=this.ctx.createGain();this.sfx=this.ctx.createGain();
      this.mus.gain.value=Save.data.settings.music?.14:0;this.sfx.gain.value=Save.data.settings.sfx?.5:0;
      this.mus.connect(this.ctx.destination);this.sfx.connect(this.ctx.destination);
      const L=this.ctx.sampleRate*.4,b=this.ctx.createBuffer(1,L,this.ctx.sampleRate),d=b.getChannelData(0);
      for(let i=0;i<L;i++)d[i]=Math.random()*2-1;this.noise=b;
      this.startMus();}catch(e){this.ctx=null;}},
  t(f,d,ty,v,to,when){if(!this.ctx)return;const t=when||this.ctx.currentTime;
    try{const o=this.ctx.createOscillator(),g=this.ctx.createGain();o.type=ty||'square';o.frequency.setValueAtTime(f,t);
      if(to)o.frequency.exponentialRampToValueAtTime(Math.max(20,to),t+d);
      g.gain.setValueAtTime(v,t);g.gain.exponentialRampToValueAtTime(.0001,t+d);
      o.connect(g);g.connect(this.sfx);o.start(t);o.stop(t+d+.02);}catch(e){}},
  ns(d,v,fq){if(!this.ctx||!this.noise)return;const t=this.ctx.currentTime;
    try{const s=this.ctx.createBufferSource();s.buffer=this.noise;const g=this.ctx.createGain(),fl=this.ctx.createBiquadFilter();
      fl.type='lowpass';fl.frequency.value=fq||3000;g.gain.setValueAtTime(v,t);g.gain.exponentialRampToValueAtTime(.0001,t+d);
      s.connect(fl);fl.connect(g);g.connect(this.sfx);s.start(t);s.stop(t+d);}catch(e){}},
  play(n){if(!this.ctx||!Save.data.settings.sfx)return;const T=this.ctx.currentTime;
    switch(n){
      case'click':this.t(660,.06,'square',.25);break;
      case'hover':this.t(440,.04,'sine',.12);break;
      case'coin':this.t(880,.08,'square',.25);this.t(1320,.12,'square',.22,0,T+.07);break;
      case'star':this.t(1046,.1,'triangle',.3);this.t(1568,.14,'triangle',.25,0,T+.09);this.t(2093,.2,'triangle',.2,0,T+.18);break;
      case'gem':this.t(1200,.1,'sine',.3);this.t(1800,.16,'sine',.25,0,T+.08);break;
      case'portal':this.t(300,.25,'sawtooth',.22,1200);break;
      case'death':this.ns(.4,.5,2500);this.t(220,.4,'sawtooth',.35,50);break;
      case'win':[523,659,784,1046,1318].forEach((f,i)=>this.t(f,.18,'triangle',.28,0,T+i*.09));break;
      case'ach':this.t(784,.12,'sine',.3);this.t(1175,.2,'sine',.28,0,T+.1);break;
      case'cp':this.t(523,.08,'square',.2);this.t(784,.1,'square',.2,0,T+.07);break;
      case'unlock':[440,554,659].forEach((f,i)=>this.t(f,.1,'square',.22,0,T+i*.06));break;
      case'err':this.t(200,.15,'square',.25,140);break;}},
  setMus(o){if(this.mus)this.mus.gain.value=o?.14:0;},
  setSfx(o){if(this.sfx)this.sfx.gain.value=o?.5:0;},
  soundOn(){return !!(Save.data.settings.music||Save.data.settings.sfx);},
  setSound(on){Save.data.settings.music=!!on;Save.data.settings.sfx=!!on;this.setMus(on);this.setSfx(on);Save.save();},
  startMus(){if(!this.ctx||this.timer)return;this.next=this.ctx.currentTime+.1;this.step=0;
    this.timer=setInterval(()=>this.tick(),40);},
  tick(){if(!this.ctx)return;const ct=this.ctx.currentTime,SPB=60/150/2;
    while(this.next<ct+.12){this.pl(this.step,this.next);this.step=(this.step+1)%64;this.next+=SPB;}},
  pl(s,t){const B=[55,55,65.4,55,49,55,65.4,73.4];
    if(s%2===0)this.mm(B[(s>>3)%8]*(s%16<8?1:2),.19,'triangle',.30,t);
    if(s%4===2){try{const n=this.ctx.createBufferSource();n.buffer=this.noise;const g=this.ctx.createGain(),f=this.ctx.createBiquadFilter();
      f.type='highpass';f.frequency.value=6000;g.gain.setValueAtTime(.10,t);g.gain.exponentialRampToValueAtTime(.001,t+.05);
      n.connect(f);f.connect(g);g.connect(this.mus);n.start(t);n.stop(t+.06);}catch(e){}}
    if(s%16===0){this.mm(110,.12,'sawtooth',.35,t,55);this.mm(110,.12,'sawtooth',.35,t+.1,55);}},
  mm(f,d,ty,v,t,sl){try{const o=this.ctx.createOscillator(),g=this.ctx.createGain();
    o.type=ty;o.frequency.setValueAtTime(f,t);if(sl)o.frequency.exponentialRampToValueAtTime(sl,t+d);
    g.gain.setValueAtTime(v,t);g.gain.exponentialRampToValueAtTime(.001,t+d);
    o.connect(g);g.connect(this.mus);o.start(t);o.stop(t+d+.02);}catch(e){}}};

/* ---------------- Cosmetics ---------------- */
const SKINS=[
 {id:'classic',name:'Classic',c:'#00e5ff',c2:'#ffffff',price:0},
 {id:'neon',name:'Neon',c:'#ff2d95',c2:'#00e5ff',price:150},
 {id:'plasma',name:'Plasma',c:'#7b5cff',c2:'#ff7bf3',price:300},
 {id:'cyber',name:'Cyber',c:'#ffe94d',c2:'#00e5ff',price:400},
 {id:'galaxy',name:'Galaxy',c:'#5c7bff',c2:'#ff2d95',price:500},
 {id:'fire',name:'Fire',c:'#ff5a2d',c2:'#ffe94d',price:600},
 {id:'ice',name:'Ice',c:'#7ddcff',c2:'#ffffff',price:600},
 {id:'toxic',name:'Toxic',c:'#5dff5d',c2:'#c8ff00',price:750},
 {id:'shadow',name:'Shadow',c:'#4a5170',c2:'#9aa3c8',price:800},
 {id:'solar',name:'Solar',c:'#ffb300',c2:'#ff5a2d',price:900},
 {id:'void',name:'Void',c:'#b02dff',c2:'#2d0a4a',price:1000},
 {id:'rainbow',name:'Rainbow',c:'rainbow',c2:'#ffffff',price:8,gem:true}];
const TRAILS=[
 {id:'basic',name:'Basic',price:0,kind:'stroke'},
 {id:'neon',name:'Neon',price:200,kind:'rich'},
 {id:'pulse',name:'Pulse',price:300,kind:'pulse'},
 {id:'particle',name:'Particle',price:350,kind:'particles'},
 {id:'lightning',name:'Lightning',price:500,kind:'lightning'},
 {id:'rainbow',name:'Rainbow',price:6,gem:true,kind:'rainbow'},
 {id:'plasma',name:'Plasma',price:8,gem:true,kind:'plasma'},
 {id:'fire',name:'Fire',price:600,kind:'fire'},
 {id:'pixel',name:'Pixel',price:450,kind:'pixel'}];
const DEATHS=[{id:'explosion',name:'Explosion',price:0},{id:'particles',name:'Particles',price:250},
 {id:'pixel',name:'Pixel Burst',price:400},{id:'shockwave',name:'Shockwave',price:550},{id:'dissolve',name:'Dissolve',price:5,gem:true}];
const THEMES=[{id:'cyber',name:'Cyber Grid',acc:'#00e5ff',price:0},{id:'space',name:'Space',acc:'#7b5cff',price:0},
 {id:'city',name:'Neon City',acc:'#ff2d95',price:300},{id:'void',name:'Digital Void',acc:'#b02dff',price:400},
 {id:'plasma',name:'Plasma',acc:'#ff7bf3',price:450},{id:'galaxy',name:'Galaxy',acc:'#5c7bff',price:500},
 {id:'matrix',name:'Matrix',acc:'#5dff5d',price:350},{id:'sunset',name:'Sunset Neon',acc:'#ff5a2d',price:6,gem:true}];
const COLOR_PRESETS=['#00e5ff','#ff2d95','#ffe94d','#5dff9d','#7b5cff','#ff5a2d','#ffffff','#5dff5d','#ff7bf3','#ffb300'];

/* ---------------- Achievements ---------------- */
const ACHS=[
 {id:'first_flight',name:'First Flight',desc:'Start your first run',ic:'🚀',need:1,get:()=>Save.data.stats.plays,reward:{coins:50,diamonds:0}},
 {id:'first_victory',name:'First Victory',desc:'Complete any level',ic:'🏁',need:1,get:()=>Save.data.stats.done,reward:{coins:100,diamonds:1}},
 {id:'survivor',name:'Survivor',desc:'Reach 50% on any level',ic:'🛡️',need:1,get:()=>Object.values(Save.data.classic).some(l=>l.bestPct>=50)||Object.values(Save.data.levels).some(l=>l.bestPct>=50)?1:0,reward:{coins:80,diamonds:1}},
 {id:'coin_collector',name:'Coin Collector',desc:'Collect 100 coins',ic:'🪙',need:100,get:()=>Save.data.stats.coins,reward:{coins:50,diamonds:0}},
 {id:'star_hunter',name:'Star Hunter',desc:'Collect 10 stars',ic:'⭐',need:10,get:()=>Save.data.stats.stars,reward:{coins:80,diamonds:1}},
 {id:'speed_demon',name:'Speed Demon',desc:'Reach x2.0 in a fast run',ic:'⚡',need:1,get:()=>Save.data.ach._speed2?1:0,reward:{coins:120,diamonds:1}},
 {id:'wave_master',name:'Wave Master',desc:'Complete 5 different levels',ic:'🌊',need:5,get:()=>Save.data.stats.done,reward:{coins:150,diamonds:2}},
 {id:'perfect_run',name:'Perfect Run',desc:'Complete a level with 3 stars',ic:'💫',need:1,get:()=>Object.values(Save.data.classic).some(l=>l.rating>=3)||Object.values(Save.data.levels).some(l=>l.rating>=3)?1:0,reward:{coins:200,diamonds:2}},
 {id:'endless_survivor',name:'Endless Survivor',desc:'Score 5,000 in Endless',ic:'♾️',need:5000,get:()=>Save.data.endlessBest,reward:{coins:150,diamonds:2}},
 {id:'hardcore',name:'Hardcore',desc:'Complete a Hard+ level',ic:'🔥',need:1,get:()=>LEVELS.some(L=>((Save.data.classic[L.id]||Save.data.levels[L.id]||{}).done)&&(L.diffRank>=6))?1:0,reward:{coins:180,diamonds:2}},
 {id:'millionaire',name:'Millionaire',desc:'Hold 1,000 coins at once',ic:'💰',need:1000,get:()=>Save.data.coins,reward:{coins:100,diamonds:1}},
 {id:'shopper',name:'Big Spender',desc:'Buy any shop item',ic:'🛍️',need:1,get:()=>Save.data.ach._bought?1:0,reward:{coins:50,diamonds:0}},
 {id:'stylist',name:'Stylist',desc:'Own 5 skins',ic:'🎨',need:5,get:()=>Save.data.ownedSkins.length,reward:{coins:80,diamonds:1}},
 {id:'daily_grind',name:'Daily Grind',desc:'Claim a daily reward',ic:'📅',need:1,get:()=>Save.data.daily.streak,reward:{coins:40,diamonds:0}},
 {id:'persistent',name:'Persistent',desc:'Die 50 times',ic:'💀',need:50,get:()=>Save.data.stats.deaths,reward:{coins:50,diamonds:0}},
 {id:'marathon',name:'Marathon',desc:'Travel 10,000 m total',ic:'📡',need:10000,get:()=>Save.data.stats.dist,reward:{coins:120,diamonds:1}},
 {id:'gem_hoarder',name:'Diamond Hoarder',desc:'Collect 20 diamonds',ic:'💎',need:20,get:()=>Save.data.stats.diamonds||Save.data.stats.gems,reward:{coins:100,diamonds:2}},
 {id:'combo_king',name:'Combo King',desc:'Reach a 15x combo',ic:'👑',need:15,get:()=>Save.data.ach._comboMax||0,reward:{coins:90,diamonds:1}},
 {id:'extreme',name:'Extreme',desc:'Complete level 9',ic:'☄️',need:1,get:()=>((Save.data.classic[9]||Save.data.levels[9]||{}).done)?1:0,reward:{coins:250,diamonds:3}},
 {id:'legend',name:'Wave Dash Legend',desc:'Complete the Final Challenge',ic:'🏆',need:1,get:()=>((Save.data.classic[10]||Save.data.levels[10]||{}).done)?1:0,reward:{coins:500,diamonds:5}}];
function checkAch(){let c=false;for(const a of ACHS){if(Save.data.ach[a.id])continue;
  if(a.get()>=a.need){Save.data.ach[a.id]=true;c=true;UI.toast(a.ic+' '+a.name+'  🎁 Reward available');AM.play('ach');}}if(c)Save.save();}
function claimAch(id){
  const a=ACHS.find(x=>x.id===id);if(!a)return;
  if(!Save.data.ach[a.id]){UI.toast('Not completed yet');return;}
  if(Save.data.achClaimed[a.id]){UI.toast('Already claimed');return;}
  Save.data.achClaimed[a.id]=true;
  const rw=a.reward||{};
  addCoins(rw.coins||0);addDiamonds(rw.diamonds||0);
  Save.save();AM.play('unlock');updateMenu();
  UI.toast('Claimed 🪙'+(rw.coins||0)+'  💎'+(rw.diamonds||0));
  renderAch();
  if(window.WaveDashLeaderboard)WaveDashLeaderboard.submit('ach-claim');
}

/* ---------------- Collision ---------------- */
function circRect(cx,cy,cr,rx,ry,rw,rh){const nx=clamp(cx,rx,rx+rw),ny=clamp(cy,ry,ry+rh);const dx=cx-nx,dy=cy-ny;return dx*dx+dy*dy<=cr*cr;}
function circTri(cx,cy,cr,ax,ay,bx,by,dx2,dy2){function seg(px,py,qx,qy){const dx=qx-px,dy=qy-py;const L2=dx*dx+dy*dy||1;
  let t=((cx-px)*dx+(cy-py)*dy)/L2;t=clamp(t,0,1);const nx=px+dx*t-cx,ny=py+dy*t-cy;return nx*nx+ny*ny<=cr*cr;}
  return seg(ax,ay,bx,by)||seg(bx,by,dx2,dy2)||seg(dx2,dy2,ax,ay);}

/* ---------------- Level builder ---------------- */
function LB(){const o=[];let x=800;
  return{
    x:()=>x,go(d){x+=Number.isFinite(+d)?+d:0;return this;},
    spike(y,size){size=size||42;o.push({t:'spike',x:x,y:y,s:size});x+=size+6;return this;},
    doubleSpike(y,s){s=s||38;o.push({t:'spike',x:x,y:y,s:s});o.push({t:'spike',x:x+s+4,y:y,s:s});x+=s*2+10;return this;},
    wall(y,w,h){o.push({t:'wall',x:x,y:y,w:w,h:h});x+=w+8;return this;},
    block(y,w,h){o.push({t:'block',x:x,y:y,w:w,h:h});x+=w+8;return this;},
    saw(y,r){r=r||28;o.push({t:'saw',x:x,y:y,r:r});x+=r*2+16;return this;},
    mover(y,w,h,amp,spd){o.push({t:'mover',x:x,y:y,w:w,h:h,amp:amp,spd:spd||1,ph:0});x+=w+12;return this;},
    coin(y){o.push({t:'coin',x:x,y:y});x+=44;return this;},
    coinRow(y,n){for(let i=0;i<n;i++){o.push({t:'coin',x:x,y:y});x+=42;}return this;},
    star(y){o.push({t:'star',x:x,y:y});x+=50;return this;},
    gem(y){o.push({t:'gem',x:x,y:y});x+=50;return this;},
    portal(kind,y){o.push({t:'portal',kind:kind,x:x,y:y});x+=90;return this;},
    tunnel(y,gap,len){o.push({t:'tunnel',x:x,y:y,gap:gap,len:len});x+=len+10;return this;},
    fake(y){o.push({t:'fake',x:x,y:y});x+=50;return this;},
    gap(d){x+=d;return this;},
    build:(len)=>({objects:o,length:len||x+400})};}

/* ---------------- Levels (10) ---------------- */
const LEVELS=(function(){
  const L=[];
  {let b=LB();b.gap(200);
    for(let i=0;i<4;i++)b.coin(0);b.gap(300).spike(0).gap(200).spike(0).gap(200).star(0).gap(150);
    for(let i=0;i<3;i++)b.spike(0);b.gap(200).coinRow(0,5).gap(200).spike(60).spike(-60).gap(300).star(0);
    b.gap(200).spike(0).gap(150).spike(0).gap(150).spike(0).gap(400).coinRow(0,4).gap(200).star(0).gap(300);
    L.push(Object.assign(b.build(6500),{id:1,name:'First Flight',diff:'Tutorial',diffRank:1,speed:180,theme:'cyber'}));}
  {let b=LB();b.gap(150);
    for(let i=0;i<3;i++)b.spike(0).gap(50);b.coinRow(-40,4).gap(150).doubleSpike(0).gap(200).star(0);
    b.gap(150).spike(0).spike(80).gap(150).coinRow(0,5).gap(200).spike(0).gap(100).spike(-60).gap(200).star(0);
    b.gap(200).doubleSpike(0).gap(200).spike(-60).spike(60).gap(200).coinRow(40,4).gap(200).star(0).gap(200);
    for(let i=0;i<4;i++)b.spike(0).gap(60);b.gap(300);
    L.push(Object.assign(b.build(8500),{id:2,name:'Neon Rush',diff:'Easy',diffRank:2,speed:210,theme:'space'}));}
  {let b=LB();b.gap(200);
    b.block(120,80,60).gap(100).block(-120,80,60).gap(150).spike(0).spike(-80).gap(150).star(0);
    b.gap(150).coinRow(0,6).gap(150).saw(0).gap(150).spike(0).gap(80).spike(60).gap(150).portal('speedUp',0);
    b.gap(100).spike(0).spike(-70).gap(100).spike(0).gap(100).star(0).gap(200).coinRow(-50,5);
    b.gap(150).doubleSpike(0).gap(150).saw(-40).gap(150).spike(0).gap(150).star(0).gap(300);
    L.push(Object.assign(b.build(10500),{id:3,name:'Pulse Corridor',diff:'Normal',diffRank:3,speed:240,theme:'city'}));}
  {let b=LB();b.gap(200);
    b.tunnel(0,180,600).gap(200).star(0).gap(150).spike(0).spike(-60).spike(60).gap(120).coinRow(0,5);
    b.gap(150).saw(0).saw(-80).gap(200).mover(0,60,60,80,1.4).gap(150).spike(0).gap(200).portal('gravity',0);
    b.gap(200).spike(0).gap(120).star(0).gap(150).doubleSpike(-40).gap(150).tunnel(0,150,500).gap(200);
    b.coinRow(0,6).gap(200).spike(0).spike(80).spike(-80).gap(150).gem(0).gap(300);
    L.push(Object.assign(b.build(11500),{id:4,name:'Digital Storm',diff:'Normal+',diffRank:4,speed:260,theme:'void'}));}
  {let b=LB();b.gap(200);
    for(let i=0;i<3;i++)b.spike(0).gap(70);b.gap(100).saw(0).gap(80).saw(-60).gap(120).star(0);
    b.gap(150).tunnel(0,140,500).gap(150).mover(0,50,50,100,1.8).gap(120).spike(0).spike(70).spike(-70);
    b.gap(150).portal('speedUp',0).gap(200).spike(0).gap(80).spike(0).gap(80).spike(0).gap(150).coinRow(-40,5);
    b.gap(150).saw(0).saw(80).gap(150).star(0).gap(150).doubleSpike(0).gap(150).tunnel(0,130,600).gap(200).gem(0).gap(300);
    L.push(Object.assign(b.build(12500),{id:5,name:'Chromatic Void',diff:'Hard',diffRank:5,speed:280,theme:'plasma'}));}
  {let b=LB();b.gap(200);
    b.spike(0).spike(-70).gap(100).saw(0).gap(100).spike(60).spike(-60).gap(120).star(0);
    b.gap(120).tunnel(0,120,600).gap(150).mover(0,60,60,120,2).gap(120).saw(0).saw(-70).gap(150);
    b.portal('gravity',0).gap(150).spike(0).gap(80).spike(0).gap(80).saw(0).gap(150).coinRow(0,6);
    b.gap(150).doubleSpike(0).gap(100).doubleSpike(-50).gap(150).tunnel(0,110,700).gap(200).gem(0);
    b.gap(200).saw(0).saw(60).saw(-60).gap(150).star(0).gap(300);
    L.push(Object.assign(b.build(13500),{id:6,name:'Prism Cascade',diff:'Hard+',diffRank:6,speed:300,theme:'galaxy'}));}
  {let b=LB();b.gap(200);
    for(let i=0;i<4;i++)b.spike(0).gap(55);b.gap(80).saw(0).saw(-60).saw(60).gap(120).star(0);
    b.gap(120).tunnel(0,110,700).gap(120).mover(0,60,60,140,2.2).gap(100).spike(0).spike(70).spike(-70);
    b.gap(120).portal('speedUp',0).gap(120).saw(0).gap(70).saw(0).gap(70).saw(0).gap(140).coinRow(-40,6);
    b.gap(140).doubleSpike(0).gap(80).doubleSpike(60).gap(80).doubleSpike(-60).gap(150).tunnel(0,100,800);
    b.gap(200).gem(0).gap(150).star(0).gap(300);
    L.push(Object.assign(b.build(14500),{id:7,name:'Hypersync',diff:'Insane',diffRank:7,speed:320,theme:'matrix'}));}
  {let b=LB();b.gap(200);
    b.saw(0).gap(60).saw(-50).gap(60).saw(50).gap(120).star(0);b.gap(100).tunnel(0,100,800);
    b.gap(120).spike(0).spike(70).spike(-70).spike(0).gap(120).mover(0,70,70,150,2.5);
    b.gap(120).portal('gravity',0).gap(120).saw(0).saw(-60).saw(60).gap(150).coinRow(0,6);
    b.gap(130).doubleSpike(0).gap(70).doubleSpike(50).gap(70).doubleSpike(-50).gap(150).tunnel(0,95,900);
    b.gap(200).gem(0).gap(120).saw(0).saw(60).saw(-60).gap(180).star(0).gap(300);
    L.push(Object.assign(b.build(15500),{id:8,name:'Quantum Drive',diff:'Insane+',diffRank:8,speed:340,theme:'sunset'}));}
  {let b=LB();b.gap(200);
    for(let i=0;i<5;i++)b.spike(0).gap(45);b.gap(80).saw(0).saw(-50).saw(50).saw(0).gap(120).star(0);
    b.gap(100).tunnel(0,90,1000).gap(120).mover(0,60,60,160,2.8).mover(0,60,60,160,2.8).gap(120);
    b.spike(0).spike(70).spike(-70).spike(0).spike(60).gap(100).portal('speedUp',0);
    b.gap(120).saw(0).gap(50).saw(-60).gap(50).saw(60).gap(50).saw(0).gap(130).coinRow(0,7);
    b.gap(120).doubleSpike(0).doubleSpike(50).doubleSpike(-50).doubleSpike(0).gap(150).tunnel(0,85,1000);
    b.gap(200).gem(0).gap(150).star(0).gap(300);
    L.push(Object.assign(b.build(17000),{id:9,name:'Neon Requiem',diff:'Extreme',diffRank:9,speed:360,theme:'void'}));}
  {let b=LB();b.gap(200);
    b.spike(0).spike(-60).spike(60).gap(80).saw(0).saw(-50).saw(50).gap(100).star(0);
    b.gap(100).tunnel(0,80,1200).gap(120).mover(0,70,70,170,3).mover(0,70,70,170,3).gap(120);
    b.spike(0).spike(70).spike(-70).spike(0).spike(60).spike(-60).gap(100).portal('gravity',0);
    b.gap(120).saw(0).saw(60).saw(-60).saw(0).saw(50).gap(130).coinRow(0,8);
    b.gap(120).doubleSpike(0).doubleSpike(50).doubleSpike(-50).gap(80).doubleSpike(0).gap(150).tunnel(0,75,1200);
    b.gap(150).portal('speedUp',0).gap(120).saw(0).saw(-60).saw(60).saw(0).gap(150).gem(0);
    b.gap(150).spike(0).spike(70).spike(-70).spike(60).spike(-60).spike(0).gap(200).star(0).gap(400);
    L.push(Object.assign(b.build(19500),{id:10,name:'Final Challenge',diff:'Final',diffRank:10,speed:400,theme:'plasma'}));}
  return L;
})();

function isLevelUnlocked(i){
  if(i<=0)return true;
  const prev=LEVELS[i-1];
  const rec=Save.data.classic[prev.id]||Save.data.levels[prev.id]||{};
  return (rec.bestPct||0)>=40||!!rec.done||i<Save.data.stats.done;
}
function firstUnlockedLevel(){
  for(let i=LEVELS.length-1;i>=0;i--)if(isLevelUnlocked(i))return LEVELS[i].id;
  return 1;
}

/* The remainder of the original engine (TrailSys, WallSys, drawTrailEnhanced,
 * Camera, PS, Player, backgrounds, obstacles, ProcGen, Input, ShopPreview)
 * is preserved below — identical gameplay. */

const TrailSys={
  MAX:60,particles:[],MAX_PARTICLES:120,deathFreeze:0,portalT:0,
  reset(){this.particles.length=0;this.deathFreeze=0;this.portalT=0;},
  qScale(){const q=Save.data&&Save.data.settings?Save.data.settings.quality:'auto';
    return q==='low'?0.55:q==='med'?0.8:1;},
  maxParticles(){return Math.round(this.MAX_PARTICLES*this.qScale());},
  push(player,dt){
    if(player.dead)return;
    dt=dt||1/60;
    const st=Save.data.settings;
    const inten=clamp(+st.trailIntensity||1,.5,2);
    const t=player.trail;
    if(!t.length){t.unshift({x:player.x,y:player.y,t:performance.now()});}
    else{const head=t[0];const dx=player.x-head.x,dy=player.y-head.y;
      if(dx*dx+dy*dy>=2.5)t.unshift({x:player.x,y:player.y,t:performance.now()});}
    const spd=Math.abs(player.vy);
    const maxLen=Math.min(Math.round(this.MAX*this.qScale()*inten), 28+Math.round(spd/22));
    if(t.length>maxLen)t.length=maxLen;
    if(st.particles && !st.reduced && st.trailFx){
      const n=Math.min(5, Math.max(1, Math.round((1+spd/320)*inten)));
      const extColor=Save.data.colors.trail;
      const maxP=this.maxParticles();
      for(let i=0;i<n;i++){
        if(this.particles.length>=maxP)break;
        this.particles.push({
          x:player.x+(Math.random()-.5)*10,y:player.y+(Math.random()-.5)*10,
          vx:-60-Math.random()*90 + player.vy*0.05,vy:(Math.random()-.5)*40,
          life:0.35+Math.random()*0.5,size:0.7+Math.random()*1.7,
          color:extColor=='rainbow'?null:extColor,a:1
        });
      }
    }
    if(this.portalT>0){
      this.portalT=Math.max(0,this.portalT-dt);
      if(this.particles.length<this.maxParticles()){
        for(let i=0;i<3;i++) this.particles.push({
          x:player.x+(Math.random()-.5)*14,y:player.y+(Math.random()-.5)*14,
          vx:(Math.random()-.5)*220,vy:(Math.random()-.5)*220,
          life:0.55,size:2.2,color:Save.data.colors.trail=='rainbow'?null:Save.data.colors.trail,a:1
        });
      }
    }
  },
  freezeDeath(){this.deathFreeze=1.2;},
  portalPulse(){this.portalT=0.6;},
  update(dt){
    for(let i=this.particles.length-1;i>=0;i--){
      const p=this.particles[i];p.life-=dt;
      if(p.life<=0){this.particles.splice(i,1);continue;}
      p.x+=p.vx*dt;p.y+=p.vy*dt;
      p.vx*=Math.pow(0.9,dt*60);p.vy*=Math.pow(0.9,dt*60);
      p.a=Math.min(1,Math.max(0,p.life/0.7));
    }
    if(this.deathFreeze>0)this.deathFreeze-=dt;
  },
  drawParticles(cam,color){
    if(!Save.data.settings.particles)return;
    if(this.particles.length===0)return;
    const c=ctx,glow=Math.min(14,Save.data.glow*0.5);
    c.save();
    for(const p of this.particles){
      if(p.a<=0)continue;
      const sx=p.x-cam.x+cam.shakeX,sy=p.y-cam.y+cam.shakeY;
      c.globalAlpha=Math.max(0,p.a)*0.9;
      c.shadowBlur=glow; c.shadowColor=p.color||'#ffffff';
      c.fillStyle=p.color||('hsl('+(performance.now()/5|0)%360+',100%,60%)');
      c.beginPath();c.arc(sx,sy,p.size*p.a+0.4,0,Math.PI*2);c.fill();
    }
    c.globalAlpha=1;c.shadowBlur=0;c.restore();
  }
};

const WallSys={
  _flashTopUntil:0,_flashBotUntil:0,_cache:{},
  recalcBounds(){this._cache={};},
  boundsFor(level){
    const h=innerHeight||720;
    const key=level?String(level.id):'__none';
    let e=this._cache[key];
    if(e&&e.h===h)return e.b;
    let b;
    if(!level)b={top:Math.round(h*0.13),bot:Math.round(h*0.87)};
    else{const r=level.diffRank||3;
      if(r<=2)b={top:Math.round(h*0.18),bot:Math.round(h*0.82)};
      else if(r<=4)b={top:Math.round(h*0.14),bot:Math.round(h*0.86)};
      else if(r<=6)b={top:Math.round(h*0.12),bot:Math.round(h*0.88)};
      else if(r<=8)b={top:Math.round(h*0.10),bot:Math.round(h*0.90)};
      else b={top:Math.round(h*0.09),bot:Math.round(h*0.91)};}
    this._cache[key]={h:h,b:b};
    return b;
  },
  reset(){this._flashTopUntil=0;this._flashBotUntil=0;},
  draw(cam,level,scroll,playerAlive){
    const w=innerWidth,h=innerHeight;
    const {top,bot}=this.boundsFor(level);
    const theme=THEMES.find(t=>t.id===(level&&level.theme||'cyber'))||THEMES[0];
    const acc=theme.acc;
    const sTop=top-cam.y+cam.shakeY;
    const sBot=bot-cam.y+cam.shakeY;
    const thick=22;
    const now=performance.now();
    const c=ctx;
    if(sTop>-thick*2 && sTop<h+thick){
      c.save();
      c.globalCompositeOperation='lighter';
      const g1=c.createLinearGradient(0,sTop-thick,0,sTop+6);
      g1.addColorStop(0,hexA(acc,0));g1.addColorStop(1,hexA(acc,0.55));
      c.fillStyle=g1;c.fillRect(0,sTop-thick,w,thick+6);
      c.globalCompositeOperation='source-over';
      c.strokeStyle=acc;c.lineWidth=2;c.shadowColor=acc;c.shadowBlur=18;
      c.beginPath();
      const off=(scroll*0.35)%28;
      for(let x=-40;x<w+40;x+=28){c.moveTo(x+off, sTop-2);c.lineTo(x+14+off, sTop-thick+2);}
      c.stroke();
      for(let i=0;i<Math.ceil(w/22);i++){
        const x=(i*22+(scroll*0.6)%22);
        const a=0.55+0.45*Math.sin(now/220+i*0.7);
        c.globalAlpha=a;c.fillStyle='#ffffff';c.beginPath();c.arc(x,sTop-thick/2+2,1.6,0,Math.PI*2);c.fill();
      }
      c.globalAlpha=1;c.shadowColor=acc;c.shadowBlur=22;c.strokeStyle=acc;c.lineWidth=2.5;
      c.beginPath();c.moveTo(0,sTop);c.lineTo(w,sTop);c.stroke();
      c.shadowBlur=0;c.lineWidth=1;c.strokeStyle='#ffffff';c.globalAlpha=0.85;
      c.beginPath();c.moveTo(0,sTop-1);c.lineTo(w,sTop-1);c.stroke();c.globalAlpha=1;
      if(this._flashTopUntil>now){
        const f=(this._flashTopUntil-now)/220;
        c.globalAlpha=f;c.shadowColor='#ffffff';c.shadowBlur=40;
        c.fillStyle='#ffffff';c.fillRect(0,sTop-thick,w,thick+6);c.shadowBlur=0;c.globalAlpha=1;
      }
      c.restore();
    }
    if(sBot>-thick && sBot<h+thick*2){
      c.save();
      c.globalCompositeOperation='lighter';
      const g2=c.createLinearGradient(0,sBot-6,0,sBot+thick);
      g2.addColorStop(0,hexA(acc,0.55));g2.addColorStop(1,hexA(acc,0));
      c.fillStyle=g2;c.fillRect(0,sBot-6,w,thick+6);
      c.globalCompositeOperation='source-over';
      c.strokeStyle=acc;c.lineWidth=2;c.shadowColor=acc;c.shadowBlur=18;
      c.beginPath();
      const off=(scroll*0.35)%28;
      for(let x=-40;x<w+40;x+=28){c.moveTo(x-off, sBot+2);c.lineTo(x-14-off, sBot+thick-2);}
      c.stroke();
      for(let i=0;i<Math.ceil(w/22);i++){
        const x=(i*22-(scroll*0.6)%22);
        const a=0.55+0.45*Math.sin(now/220+i*0.7+1.7);
        c.globalAlpha=a;c.fillStyle='#ffffff';c.beginPath();c.arc(x,sBot+thick/2-2,1.6,0,Math.PI*2);c.fill();
      }
      c.globalAlpha=1;c.shadowColor=acc;c.shadowBlur=22;c.strokeStyle=acc;c.lineWidth=2.5;
      c.beginPath();c.moveTo(0,sBot);c.lineTo(w,sBot);c.stroke();
      c.shadowBlur=0;c.lineWidth=1;c.strokeStyle='#ffffff';c.globalAlpha=0.85;
      c.beginPath();c.moveTo(0,sBot+1);c.lineTo(w,sBot+1);c.stroke();c.globalAlpha=1;
      if(this._flashBotUntil>now){
        const f=(this._flashBotUntil-now)/220;
        c.globalAlpha=f;c.shadowColor='#ffffff';c.shadowBlur=40;
        c.fillStyle='#ffffff';c.fillRect(0,sBot-6,w,thick+6);c.shadowBlur=0;c.globalAlpha=1;
      }
      c.restore();
    }
  },
  checkHit(player,level){
    if(player.dead)return null;
    const {top,bot}=this.boundsFor(level);
    const m=player.r+2;
    if(player.y-m<top){this._flashTopUntil=performance.now()+220;return'top';}
    if(player.y+m>bot){this._flashBotUntil=performance.now()+220;return'bottom';}
    return null;
  }
};
function attachLevelBoundaries(){for(const L of LEVELS){const b=WallSys.boundsFor(L);L.topBoundary=b.top;L.bottomBoundary=b.bot;}}
attachLevelBoundaries();

function drawTrailEnhanced(player,cam,trailId,color,g){
  const c=g||ctx;const t=player.trail;if(!t||!t.length)return;
  const now=performance.now();const base=clamp(Math.abs(player.vy)/700,0,1);const w0=4+base*3;const b0=10+base*16;
  if(!g)TrailSys.drawParticles(cam,color);
  if(trailId==='basic'||trailId==='stroke'){
    c.save();c.strokeStyle=color==='rainbow'?'#ffffff':color;c.lineWidth=w0;c.lineCap='round';
    c.shadowColor=color==='rainbow'?'#ffffff':color;c.shadowBlur=b0*0.5;c.beginPath();
    for(let i=t.length-1;i>=0;i--){const p=t[i];const sx=p.x-cam.x+cam.shakeX,sy=p.y-cam.y+cam.shakeY;
      c.globalAlpha=(1-i/t.length)*0.85;if(i===t.length-1)c.moveTo(sx,sy);else c.lineTo(sx,sy);}
    c.stroke();c.globalAlpha=1;c.restore();
  }else if(trailId==='neon'||trailId==='rich'){
    c.save();const layers=[{w:w0+10,a:0.35,blur:b0+10},{w:w0+5,a:0.55,blur:b0+4},{w:w0+1,a:0.95,blur:b0*0.5}];
    for(const L of layers){c.strokeStyle=color==='rainbow'?'#ffffff':color;c.lineWidth=L.w;c.lineCap='round';c.globalAlpha=L.a;
      c.shadowColor=color==='rainbow'?'#ffffff':color;c.shadowBlur=L.blur;c.beginPath();
      for(let i=t.length-1;i>=0;i--){const p=t[i];const sx=p.x-cam.x+cam.shakeX,sy=p.y-cam.y+cam.shakeY;
        if(i===t.length-1)c.moveTo(sx,sy);else c.lineTo(sx,sy);}c.stroke();}
    c.shadowBlur=0;c.globalAlpha=1;c.restore();
  }else if(trailId==='pulse'){
    c.save();for(let i=t.length-1;i>=0;i--){const p=t[i];const sx=p.x-cam.x+cam.shakeX,sy=p.y-cam.y+cam.shakeY;const k=i/t.length;
      const r=(1-k)*5+2+Math.sin(now/180+i*0.4)*1.8*(1-k);
      c.strokeStyle=color==='rainbow'?('hsl('+(now/4|0)%360+',100%,60%)'):color;c.lineWidth=2+(1-k)*2;c.globalAlpha=(1-k)*0.95;
      c.shadowColor=c.strokeStyle;c.shadowBlur=b0*0.5;c.beginPath();c.arc(sx,sy,r,0,Math.PI*2);c.stroke();}
    c.globalAlpha=1;c.shadowBlur=0;c.restore();
  }else if(trailId==='plasma'){
    c.save();c.globalCompositeOperation='lighter';
    const layers=[{w:w0+12,c:'#00e5ff',b:b0+12,a:0.55},{w:w0+7,c:'#7b5cff',b:b0+6,a:0.6},{w:w0+2,c:'#ff2d95',b:b0,a:0.85}];
    for(const L of layers){c.fillStyle=L.c;c.shadowColor=L.c;c.shadowBlur=L.b;c.lineWidth=L.w;c.strokeStyle=L.c;c.beginPath();
      for(let i=t.length-1;i>=0;i--){const p=t[i];const sx=p.x-cam.x+cam.shakeX,sy=p.y-cam.y+cam.shakeY;const k=i/t.length;
        c.globalAlpha=(1-k)*L.a;if(i===t.length-1)c.moveTo(sx,sy);else c.lineTo(sx,sy);}c.stroke();c.globalAlpha=1;}
    c.globalCompositeOperation='source-over';c.restore();
  }else if(trailId==='rainbow'){
    c.save();c.lineWidth=w0+1;c.lineCap='round';
    for(let i=t.length-1;i>0;i--){const p=t[i],q=t[i-1];const hue=((now/6)+i*14)%360;
      c.strokeStyle='hsla('+hue+',100%,60%,'+(1-i/t.length)+')';c.shadowColor='hsl('+hue+',100%,60%)';c.shadowBlur=b0*0.6;
      c.beginPath();c.moveTo(p.x-cam.x+cam.shakeX,p.y-cam.y+cam.shakeY);c.lineTo(q.x-cam.x+cam.shakeX,q.y-cam.y+cam.shakeY);c.stroke();}
    c.shadowBlur=0;c.restore();
  }else if(trailId==='lightning'){
    c.save();c.lineWidth=w0*0.6;c.lineCap='round';c.strokeStyle=color==='rainbow'?'#ffffff':color;c.shadowColor=color==='rainbow'?'#ffffff':color;c.shadowBlur=b0+10;
    for(let i=t.length-1;i>0;i--){const p=t[i],q=t[i-1];
      const sx1=p.x-cam.x+cam.shakeX,sy1=p.y-cam.y+cam.shakeY,sx2=q.x-cam.x+cam.shakeX,sy2=q.y-cam.y+cam.shakeY;
      c.globalAlpha=(1-i/t.length)*0.95;c.beginPath();c.moveTo(sx1,sy1);
      const segs=4;for(let s=1;s<=segs;s++){const tt=s/segs;c.lineTo(lerp(sx1,sx2,tt)+(Math.random()-.5)*(1-tt)*11,lerp(sy1,sy2,tt)+(Math.random()-.5)*(1-tt)*11);}c.stroke();}
    c.globalAlpha=1;c.restore();
  }else if(trailId==='particles'||trailId==='particle'){
    c.save();c.shadowColor=color==='rainbow'?'#ffffff':color;c.shadowBlur=b0*0.5;
    for(let i=t.length-1;i>=0;i--){const p=t[i];const k=i/t.length;const r=(1-k)*4+0.9;
      c.globalAlpha=(1-k)*0.85;c.fillStyle=color==='rainbow'?'#ffffff':color;
      c.beginPath();c.arc(p.x-cam.x+cam.shakeX,p.y-cam.y+cam.shakeY,r,0,Math.PI*2);c.fill();}
    c.globalAlpha=1;c.restore();
  }else if(trailId==='fire'){
    c.save();c.globalCompositeOperation='lighter';
    for(let i=t.length-1;i>=0;i--){const p=t[i];const k=i/t.length;
      const sx=p.x-cam.x+cam.shakeX,sy=p.y-cam.y+cam.shakeY;const hue=lerp(48,12,k);const r=(1-k)*5+1;
      c.globalAlpha=(1-k)*0.9;c.shadowColor='hsl('+hue+',100%,55%)';c.shadowBlur=b0*0.7;
      c.fillStyle='hsl('+hue+',100%,'+(60-k*15)+'%)';c.beginPath();c.arc(sx,sy+Math.sin(now/90+i)*1.5*(1-k),r,0,Math.PI*2);c.fill();}
    c.globalAlpha=1;c.shadowBlur=0;c.globalCompositeOperation='source-over';c.restore();
  }else if(trailId==='pixel'){
    c.save();
    for(let i=t.length-1;i>=0;i--){const p=t[i];const k=i/t.length;const s=Math.max(2,Math.round((1-k)*8));
      const sx=p.x-cam.x+cam.shakeX,sy=p.y-cam.y+cam.shakeY;c.globalAlpha=(1-k)*0.95;
      c.fillStyle=color==='rainbow'?('hsl('+(i*28+(now/8|0))%360+',100%,60%)'):color;
      c.fillRect(Math.round(sx/3)*3-s/2,Math.round(sy/3)*3-s/2,s,s);}
    c.globalAlpha=1;c.restore();
  }
}
function drawTrailFallback(player,cam){
  try{const t=player&&player.trail;if(!t||!t.length)return;const c=ctx;
    c.save();c.strokeStyle='#00e5ff';c.shadowColor='#00e5ff';c.shadowBlur=10;c.lineWidth=4;c.lineCap='round';c.beginPath();
    let started=false;
    for(let i=0;i<t.length;i++){const p=t[i];if(!p)continue;const x=+p.x,y=+p.y;
      if(!Number.isFinite(x)||!Number.isFinite(y))continue;
      c.globalAlpha=Math.max(0,1-i/Math.max(1,t.length));
      const sx=x-cam.x+(cam.shakeX||0),sy=y-cam.y+(cam.shakeY||0);
      if(!started){c.moveTo(sx,sy);started=true;}else c.lineTo(sx,sy);}
    c.stroke();c.restore();}catch(_){}}
function drawPlayerFallback(player,cam){
  try{const c=ctx;c.save();
    c.translate(player.x-cam.x+(cam.shakeX||0),player.y-cam.y+(cam.shakeY||0));c.rotate(player.rot||0);
    c.shadowColor='#00e5ff';c.shadowBlur=14;c.fillStyle='#00e5ff';c.strokeStyle='#ffffff';c.lineWidth=2;const r=player.r||14;
    c.beginPath();c.moveTo(r*1.4,0);c.lineTo(-r*1.1,-r*.95);c.lineTo(-r*.4,0);c.lineTo(-r*1.1,r*.95);c.closePath();
    c.fill();c.stroke();c.restore();}catch(_){}}

const cv=$('cv'),ctx=cv.getContext('2d');
let W=0,H=0,DPR=1,SCALE=1;
function resize(){
  const q=Save.data?Save.data.settings.quality:'auto';
  DPR=q==='low'?1:q==='med'?Math.min(1.5,devicePixelRatio||1):q==='high'?Math.min(2.5,devicePixelRatio||1):Math.min(2,devicePixelRatio||1);
  const w=innerWidth,h=innerHeight;cv.width=Math.floor(w*DPR);cv.height=Math.floor(h*DPR);
  cv.style.width=w+'px';cv.style.height=h+'px';W=cv.width;H=cv.height;SCALE=DPR;ctx.setTransform(DPR,0,0,DPR,0,0);
  try{WallSys.recalcBounds();attachLevelBoundaries();}catch(e){}
  if(Game&&Game.player&&!Number.isFinite(Game.player.y))Game.player.y=h/2;
  const rot=$('rotate');rot.style.display=(h>w&&w<430&&Game.state==='PLAYING')?'flex':'none';}
addEventListener('resize',resize);addEventListener('orientationchange',()=>setTimeout(resize,120));

class Camera{
  constructor(){this.x=0;this.y=0;this.targetX=0;this.targetY=0;this.smoothness=.08;this.shakeX=0;this.shakeY=0;this.shakePower=0;this.shakeTime=0;this.minY=-120;this.maxY=120;}
  update(player,level,dt,speed){
    const focus=innerWidth*.30;this.targetX=player.x-focus;this.x=this.targetX;
    const zone=Math.max(70,Math.min(135,innerHeight*.14));
    const top=this.y+innerHeight*.5-zone,bottom=this.y+innerHeight*.5+zone;
    if(player.y<top)this.targetY=player.y-(innerHeight*.5-zone);
    else if(player.y>bottom)this.targetY=player.y-(innerHeight*.5+zone);
    else this.targetY=this.y;
    const wb=WallSys.boundsFor(level);
    const camMinY=wb.top-innerHeight*0.5+70;const camMaxY=wb.bot-innerHeight*0.5-70;
    this.minY=camMinY;this.maxY=camMaxY;
    this.targetY=clamp(this.targetY,Math.min(camMinY,camMaxY),Math.max(camMinY,camMaxY));
    const sm=clamp(Save.data?(+Save.data.settings.camSmooth||50):50,0,100);
    const rate=clamp(clamp(4+(speed||0)/250,4,9)*lerp(1.5,0.65,sm/100),2.5,14);
    this.y=lerp(this.y,this.targetY,1-Math.exp(-rate*dt));
    if(this.shakeTime>0){this.shakeTime=Math.max(0,this.shakeTime-dt);this.shakePower*=Math.pow(.08,dt);this.shakeX=(Math.random()-.5)*this.shakePower;this.shakeY=(Math.random()-.5)*this.shakePower;}
    else{this.shakeX=lerp(this.shakeX,0,1-Math.exp(-18*dt));this.shakeY=lerp(this.shakeY,0,1-Math.exp(-18*dt));}
  }
  shake(intensity,duration){if(!Save.data.settings.shake)return;this.shakePower=Math.max(this.shakePower,intensity);this.shakeTime=Math.max(this.shakeTime,duration);}
  reset(){this.x=0;this.y=0;this.targetX=0;this.targetY=0;this.shakeX=this.shakeY=0;this.shakePower=this.shakeTime=0;}
}

const PS={pool:[],active:[],MAX_ACTIVE:500,
  spawn(x,y,vx,vy,life,color,size,g,fade){if(!Save.data.settings.particles||this.active.length>=this.MAX_ACTIVE)return;
    const p=this.pool.pop()||{};p.x=x;p.y=y;p.vx=vx;p.vy=vy;p.life=life;p.max=life;p.c=color;p.s=size;p.g=g||0;p.f=fade!==false;p.a=1;this.active.push(p);},
  update(dt){for(let i=this.active.length-1;i>=0;i--){const p=this.active[i];p.life-=dt;
    if(p.life<=0){this.active.splice(i,1);if(this.pool.length<200)this.pool.push(p);continue;}
    p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=p.g*dt;p.a=p.f?p.life/p.max:1;}},
  draw(cam){const c=ctx;c.save();for(const p of this.active){c.globalAlpha=p.a;c.fillStyle=p.c;c.beginPath();c.arc(p.x-cam.x+cam.shakeX,p.y-cam.y+cam.shakeY,p.s,0,Math.PI*2);c.fill();}
    c.globalAlpha=1;c.restore();},
  burst(x,y,color,n,spd,life){for(let i=0;i<n;i++){const a=Math.random()*Math.PI*2,s=spd*(.4+Math.random()*.9);
    this.spawn(x,y,Math.cos(a)*s,Math.sin(a)*s,life||.6,color,1+Math.random()*3,0);}},
  clear(){this.active.length=0;}};

class Player{
  constructor(){this.reset();}
  reset(){this.x=0;this.y=innerHeight/2;this.vy=0;this.rot=0;this.r=14;this.dead=false;this.grav=1;this.trail=[];this.squash=1;this.pulse=0;}
  hold(h,dt){const st=Save.data.settings;const ch=Game.challengeMod||{};
    if(ch.invertHold)h=!h;
    const S=st.sensitivity||1;const gMul=ch.gravMul||1;
    const target=clamp((h?-st.wave:st.wave)*S*this.grav*st.vStr*gMul,-st.maxVy,st.maxVy);
    const rate=lerp(16,5,clamp(st.smooth,0,100)/100);
    const k=1-Math.exp(-rate*dt);
    this.vy=lerp(this.vy,target,k);this.y+=this.vy*dt;
    const tgtRot=clamp(this.vy/(st.maxVy||620),-1,1)*.82;
    this.rot=lerp(this.rot,tgtRot,1-Math.exp(-14*dt));
    TrailSys.push(this,dt);this.pulse+=dt*8;this.squash=lerp(this.squash,1,1-Math.exp(-12*dt));}
  draw(cam,skinId,glow,cols){
    const c=ctx;const sk=SKINS.find(s=>s.id===skinId)||SKINS[0];
    let col=cols.primary,col2=cols.secondary;
    if(sk.id==='rainbow'||col==='rainbow'){const h=(performance.now()/6)%360;col=`hsl(${h},100%,60%)`;col2=`hsl(${(h+120)%360},100%,70%)`;}
    c.save();c.translate(this.x-cam.x+cam.shakeX,this.y-cam.y+cam.shakeY);c.rotate(this.rot);
    c.shadowColor=col;c.shadowBlur=glow;const r=this.r;c.fillStyle=col;c.strokeStyle=col2;c.lineWidth=2;
    c.beginPath();c.moveTo(r*1.4,0);c.lineTo(-r*1.1,-r*.95);c.lineTo(-r*.4,0);c.lineTo(-r*1.1,r*.95);c.closePath();
    c.fill();c.stroke();c.shadowBlur=0;c.fillStyle=col2;c.globalAlpha=.9;c.beginPath();c.arc(0,0,r*.35,0,Math.PI*2);c.fill();c.globalAlpha=1;c.restore();}
}

function drawBG(theme,cam,scroll){
  const c=ctx,w=innerWidth,h=innerHeight;const T=THEMES.find(t=>t.id===theme)||THEMES[0];const acc=T.acc;
  const grad=c.createLinearGradient(0,0,0,h);
  if(theme==='cyber'){grad.addColorStop(0,'#050a1e');grad.addColorStop(1,'#0a0525');}
  else if(theme==='space'){grad.addColorStop(0,'#02021a');grad.addColorStop(1,'#0a0230');}
  else if(theme==='city'){grad.addColorStop(0,'#1a0524');grad.addColorStop(1,'#050515');}
  else if(theme==='void'){grad.addColorStop(0,'#08001a');grad.addColorStop(1,'#1a0030');}
  else if(theme==='plasma'){grad.addColorStop(0,'#200a3a');grad.addColorStop(1,'#0a0525');}
  else if(theme==='galaxy'){grad.addColorStop(0,'#02021a');grad.addColorStop(1,'#0a0a3a');}
  else if(theme==='matrix'){grad.addColorStop(0,'#000a05');grad.addColorStop(1,'#001a10');}
  else if(theme==='sunset'){grad.addColorStop(0,'#3a0a1a');grad.addColorStop(1,'#1a0530');}
  else {grad.addColorStop(0,'#050a1e');grad.addColorStop(1,'#0a0525');}
  c.fillStyle=grad;c.fillRect(0,0,w,h);
  c.save();for(let i=0;i<40;i++){const sx=((i*137+scroll*.2)%(w+50))-25;const sy=(i*83)%h;
    c.fillStyle=hexA('#ffffff',.15+(i%5)*.06);c.fillRect(sx,sy,1.5,1.5);}c.restore();
  if(theme==='cyber'||theme==='matrix'||theme==='city'){
    c.save();c.strokeStyle=hexA(acc,.13);c.lineWidth=1;const gs=60;const off=(scroll*.6)%gs;
    for(let x=-off;x<w+gs;x+=gs){c.beginPath();c.moveTo(x,0);c.lineTo(x,h);c.stroke();}
    for(let y=0;y<h;y+=gs){c.beginPath();c.moveTo(0,y);c.lineTo(w,y);c.stroke();}
    c.strokeStyle=hexA(acc,.35);c.beginPath();c.moveTo(0,h*.75);c.lineTo(w,h*.75);c.stroke();c.restore();
  }
  if(theme==='space'||theme==='galaxy'||theme==='void'){
    c.save();for(let i=0;i<8;i++){const sx=((i*211-scroll*.3)%(w+200))-100;const sy=(i*79)%h;
      const r=8+(i%4)*8;c.fillStyle=hexA(acc,.06);c.beginPath();c.arc(sx,sy,r,0,Math.PI*2);c.fill();}c.restore();
  }
  if(theme==='plasma'||theme==='sunset'){
    c.save();c.globalCompositeOperation='lighter';for(let i=0;i<5;i++){
      const sx=((i*311-scroll*.4)%(w+300))-150;const sy=h*.3+Math.sin((scroll+i*400)/300)*60;
      const g=c.createRadialGradient(sx,sy,0,sx,sy,180);g.addColorStop(0,hexA(acc,.25));g.addColorStop(1,hexA(acc,0));
      c.fillStyle=g;c.fillRect(sx-180,sy-180,360,360);}c.restore();
  }
  c.fillStyle=hexA(acc,.08);c.fillRect(0,h-4,w,4);c.fillStyle=hexA(acc,.5);c.fillRect(0,h-2,w,2);c.fillStyle=hexA(acc,.5);c.fillRect(0,0,w,2);
}
function drawSpike(o,cam,cy,acc,flip){
  const c=ctx;const s=o.s;const x=o.x-cam.x+cam.shakeX;const y=(flip?-o.y:o.y)+cy+cam.shakeY;
  c.save();c.fillStyle=acc;c.strokeStyle='#ffffff';c.lineWidth=1.5;c.shadowColor=acc;c.shadowBlur=10;
  c.beginPath();if(flip){c.moveTo(x,y+s);c.lineTo(x+s/2,y);c.lineTo(x+s,y+s);}
  else{c.moveTo(x,y);c.lineTo(x+s/2,y-s);c.lineTo(x+s,y);}c.closePath();c.fill();c.stroke();c.restore();}
function drawBlock(o,cam,cy,acc){const c=ctx;const x=o.x-cam.x+cam.shakeX,y=o.y+cy+cam.shakeY-o.h/2;
  c.save();c.fillStyle=hexA(acc,.35);c.strokeStyle=acc;c.lineWidth=2;c.shadowColor=acc;c.shadowBlur=12;
  c.fillRect(x,y,o.w,o.h);c.strokeRect(x,y,o.w,o.h);c.restore();}
function drawSaw(o,cam,cy,acc){const c=ctx;const x=o.x-cam.x+cam.shakeX,y=o.y+cy+cam.shakeY;const r=o.r,t=performance.now()/120;
  c.save();c.translate(x,y);c.rotate(t);c.strokeStyle=acc;c.fillStyle='#101020';c.lineWidth=2;c.shadowColor=acc;c.shadowBlur=14;
  c.beginPath();for(let i=0;i<10;i++){const a=i*Math.PI/5;const r2=i%2?r:r*.65;c.lineTo(Math.cos(a)*r2,Math.sin(a)*r2);}c.closePath();c.fill();c.stroke();
  c.fillStyle=acc;c.beginPath();c.arc(0,0,r*.25,0,Math.PI*2);c.fill();c.restore();}
function drawCoin(o,cam,cy){const c=ctx;const x=o.x-cam.x+cam.shakeX,y=o.y+cy+cam.shakeY;const t=performance.now()/300;
  c.save();c.translate(x,y);c.scale(Math.cos(t)*.4+.6,1);c.fillStyle='#ffe94d';c.strokeStyle='#ffb300';c.lineWidth=1.5;
  c.shadowColor='#ffe94d';c.shadowBlur=14;c.beginPath();c.arc(0,0,10,0,Math.PI*2);c.fill();c.stroke();c.restore();}
function drawStar(o,cam,cy){const c=ctx;const x=o.x-cam.x+cam.shakeX,y=o.y+cy+cam.shakeY;const t=performance.now()/500;
  c.save();c.translate(x,y);c.rotate(t);c.fillStyle='#ffe94d';c.strokeStyle='#ffffff';c.lineWidth=1.5;c.shadowColor='#ffe94d';c.shadowBlur=20;
  c.beginPath();for(let i=0;i<10;i++){const a=i*Math.PI/5-Math.PI/2;const r=i%2?6:14;c.lineTo(Math.cos(a)*r,Math.sin(a)*r);}c.closePath();c.fill();c.stroke();c.restore();}
function drawGem(o,cam,cy){const c=ctx;const x=o.x-cam.x+cam.shakeX,y=o.y+cy+cam.shakeY;
  c.save();c.translate(x,y);c.rotate(performance.now()/400);c.fillStyle='#ff2d95';c.strokeStyle='#ffffff';c.lineWidth=1.5;
  c.shadowColor='#ff2d95';c.shadowBlur=20;c.beginPath();c.moveTo(0,-12);c.lineTo(10,0);c.lineTo(0,12);c.lineTo(-10,0);c.closePath();c.fill();c.stroke();c.restore();}
function drawPortal(o,cam,cy){const c=ctx;const x=o.x-cam.x+cam.shakeX,y=cy+cam.shakeY;const col=o.kind==='speedUp'?'#5dff9d':o.kind==='speedDown'?'#ff8a44':o.kind==='gravity'?'#b02dff':'#00e5ff';
  c.save();c.translate(x,y);c.strokeStyle=col;c.lineWidth=3;c.shadowColor=col;c.shadowBlur=18;
  const t=performance.now()/200;for(let i=0;i<3;i++){c.globalAlpha=1-i*.25;c.beginPath();c.ellipse(0,0,20+i*4+Math.sin(t+i)*3,80+Math.sin(t+i)*4,0,0,Math.PI*2);c.stroke();}c.globalAlpha=1;
  c.fillStyle=hexA(col,.15);c.beginPath();c.ellipse(0,0,18,78,0,0,Math.PI*2);c.fill();c.restore();}
function drawTunnel(o,cam,cy){const c=ctx;const x=o.x-cam.x+cam.shakeX,y=cy+cam.shakeY;const g=o.gap;
  c.save();c.fillStyle=hexA('#00e5ff',.15);c.strokeStyle='#00e5ff';c.lineWidth=2;c.shadowColor='#00e5ff';c.shadowBlur=8;
  c.fillRect(x,y-cy+2,o.len,cy-g/2-8);c.strokeRect(x,y-cy+2,o.len,cy-g/2-8);
  c.fillRect(x,y+g/2+8,o.len,cy-g/2-10);c.strokeRect(x,y+g/2+8,o.len,cy-g/2-10);c.restore();}

const UI={
  levelPickMode:'classic',
  show(id){document.querySelectorAll('.screen').forEach(s=>{if(!s.classList.contains('overlay'))s.classList.remove('active');});
    const t=$('scr-'+id);if(t)t.classList.add('active');
    if(typeof ShopPreview!=='undefined')ShopPreview.onScreen(id);},
  hide(id){const el=$('scr-'+id);if(el)el.classList.remove('active');},
  toast(msg){const t=$('toast');t.textContent=msg;t.classList.add('show');clearTimeout(this._tt);this._tt=setTimeout(()=>t.classList.remove('show'),2200);},
  confirm(msg,cb){$('cfMsg').textContent=msg;$('scr-confirm').classList.add('active');
    const y=$('cfYes'),n=$('cfNo'),done=(v)=>{y.onclick=null;n.onclick=null;$('scr-confirm').classList.remove('active');cb(v);};
    y.onclick=()=>done(true);n.onclick=()=>done(false);}
};

function showResult(opts){
  $('rsTitle').textContent=opts.title||'RESULT';
  $('rsTitle').className='big '+(opts.dead?'dead':'win');
  $('rsRating').textContent=opts.rating||'';
  $('rsRec').style.display=opts.record?'block':'none';
  $('rsRec').textContent=opts.recordText||' NEW RECORD ';
  $('rsNoRew').style.display=opts.noRewards?'block':'none';
  const body=$('rsBody');body.innerHTML='';
  (opts.rows||[]).forEach(([k,v])=>{
    const row=document.createElement('div');row.className='kv';
    const a=document.createElement('span');a.textContent=k;
    const b=document.createElement('b');b.textContent=String(v);
    row.appendChild(a);row.appendChild(b);body.appendChild(row);
  });
  const box=$('rsBtns');box.innerHTML='';
  (opts.buttons||[]).forEach(b=>{
    const el=document.createElement('button');el.className='btn'+(b.primary?' primary':'');
    el.textContent=b.label;el.onclick=b.fn;box.appendChild(el);
  });
  $('hud').classList.remove('active');
  document.querySelectorAll('.screen.overlay').forEach(s=>{if(s.id!=='scr-result')s.classList.remove('active');});
  $('scr-result').classList.add('active');
  Game.state=opts.dead?'GAME_OVER':'LEVEL_COMPLETE';
}

const Game={
  state:'BOOT',level:null,mode:'classic',cam:null,scroll:0,worldY:0,elapsed:0,
  selfTest(){const checks=[
    ['Canvas',!!cv&&!!ctx],['Game',true],['Player',!!this.player&&Array.isArray(this.player.trail)],
    ['Trail',!!TrailSys&&Number.isFinite(TrailSys.MAX)],['Camera',!!this.cam],['Walls',!!WallSys&&LEVELS.every(l=>Number.isFinite(l.topBoundary)&&Number.isFinite(l.bottomBoundary))],
    ['Levels',Array.isArray(LEVELS)&&LEVELS.length===10&&LEVELS.every(l=>Array.isArray(l.objects)&&Number.isFinite(l.length))],
    ['Shop',Array.isArray(SKINS)&&Array.isArray(TRAILS)&&SKINS.length>0&&TRAILS.length===9],
    ['Save',!!Save.data&&typeof Save.data==='object'],['Audio',!!AM],['Input',!!Input]];
    const lines=['WAVE DASH SYSTEM CHECK'];for(const [name,ok] of checks)lines.push(name.padEnd(12,'.')+' '+(ok?'PASS':'FAIL'));return{ok:checks.every(x=>x[1]),text:lines.join('\n')};},
  player:null,score:0,coins:0,stars:0,gems:0,progress:0,combo:0,comboT:0,startTime:0,practice:false,invincible:false,
  checkpoints:[],cpIdx:-1,shake:0,flashT:0,speedMul:1,gravity:1,ended:false,
  challengeMod:null,challenge:null,_rewarded:false,_submitted:false,
  init(){this.player=new Player();this.cam=new Camera();},
  start(levelId,mode,practice,challengeId){
    AM.unlock();Input.release();
    mode=ModeSys.normalize(mode||'classic');
    this.mode=mode;this.practice=!!practice||mode==='practice';
    if(this.practice)this.mode='practice';
    this.invincible=false;this.challengeMod=null;this.challenge=null;
    this._rewarded=false;this._submitted=false;this._leaderboardRunSubmitted=false;
    if(mode==='challenge'){
      const ch=CHALLENGES.find(c=>c.id===challengeId)||CHALLENGES[0];
      this.challenge=ch;this.challengeMod=Object.assign({},ch.modifier||{});
      this.level=LEVELS.find(l=>l.id===ch.levelId)||LEVELS[2];
      ProcGen.fillLevel(this.level);
    }else if(mode==='endless'){
      this.level={id:'E',name:'Endless',diff:'Endless',diffRank:4,speed:250,theme:'space',objects:[],length:Infinity,endless:true};
      ProcGen.reset(280);
    }else{
      this.level=LEVELS.find(l=>l.id===levelId)||LEVELS[0];
      ProcGen.fillLevel(this.level);
      if(mode==='classic')Save.data.selectedClassic=this.level.id;
    }
    const b=WallSys.boundsFor(this.level);this.level.topBoundary=b.top;this.level.bottomBoundary=b.bot;
    this.cam.reset();this.scroll=0;this.elapsed=0;this.score=0;this.coins=0;this.stars=0;this.gems=0;this.progress=0;
    this.combo=0;this.comboT=0;this.startTime=performance.now();this.shake=0;this.flashT=0;
    this.speedMul=1;this.gravity=1;this.ended=false;
    this.player.reset();
    if(this.challengeMod&&this.challengeMod.startGrav)this.player.grav=this.challengeMod.startGrav;
    this.player.x=innerWidth*.30;this.player.y=innerHeight/2;this.cam.reset();this.cam.x=this.player.x-innerWidth*.30;
    this.checkpoints=[];this.cpIdx=-1;this._lastCp=0;this._comboPop=0;
    TrailSys.reset();PS.clear();WallSys.reset();this.state='PLAYING';$('hud').classList.add('active');
    $('scr-result').classList.remove('active');$('scr-over').classList.remove('active');$('scr-win').classList.remove('active');
    this.updateHUD(true);
    $('hudHint').style.display=Save.data.stats.plays<2?'block':'none';
    Save.data.stats.plays++;checkAch();Save.save();
    for(const o of this.level.objects){if(o.t==='mover')o.ph=0;if(o.t==='coin'||o.t==='star'||o.t==='gem'||o.t==='portal')o.taken=false;}
  },
  die(source){source=source||'obstacle';
    if(this.ended)return;
    if(this.practice&&this.cpIdx>=0){this.respawnCP();return;}
    if(this.invincible)return;
    this.ended=true;this.player.dead=true;Input.release();
    const isWall=source.indexOf('wall-')===0;
    AM.play(isWall?'err':'death');
    this.cam.shake(isWall?18:14,isWall?.34:.28);
    this.shake=isWall?22:18;this.flashT=.5;
    TrailSys.freezeDeath();
    if(isWall){PS.burst(this.player.x,this.player.y,'#ff5064',28,300,.8);PS.burst(this.player.x,this.player.y,'#ffffff',18,500,.6);}
    Save.data.stats.deaths++;
    const d=Save.data.death;const col=Save.data.colors.primary;
    if(d==='explosion'){PS.burst(this.player.x,this.player.y,'#ff5064',30,340,.9);PS.burst(this.player.x,this.player.y,'#ffe94d',20,240,.7);}
    else if(d==='particles'){PS.burst(this.player.x,this.player.y,col,40,300,1);}
    else if(d==='pixel'){for(let i=0;i<24;i++){const a=Math.random()*Math.PI*2,s=100+Math.random()*250;PS.spawn(this.player.x,this.player.y,Math.cos(a)*s,Math.sin(a)*s,.8,col,4,300);}}
    else if(d==='shockwave'){PS.burst(this.player.x,this.player.y,col,60,500,.6);}
    else if(d==='dissolve'){PS.burst(this.player.x,this.player.y,col,50,150,1.4);}
    if(Save.data.settings.vibration&&navigator.vibrate)try{navigator.vibrate(80);}catch(e){}
    Save.save();
    setTimeout(()=>this.finishDeath(),700);
  },
  respawnCP(){if(this.cpIdx<0)return;const cp=this.checkpoints[this.cpIdx];
    Input.release();
    this.scroll=cp.scroll;this.player.x=cp.scroll+innerWidth*.30;
    this.player.y=cp.py;this.player.vy=0;this.player.rot=0;this.player.trail.length=0;this.player.dead=false;
    this.cam.x=cp.camX;this.cam.y=cp.camY;this.cam.targetX=this.cam.x;this.cam.targetY=this.cam.y;
    this.gravity=cp.g;this.speedMul=cp.sp;this.player.grav=cp.pg||this.player.grav;
    this.combo=0;PS.burst(this.player.x,this.player.y,'#00e5ff',20,200,.5);AM.play('cp');UI.toast('CHECKPOINT!');},
  finishDeath(){
    const dist=Math.floor(this.scroll/10);
    Save.data.stats.score+=this.score;Save.data.stats.dist+=dist;
    Save.data.stats.coins+=this.coins;Save.data.stats.stars+=this.stars;Save.data.stats.gems+=this.gems;
    let awardCoins=0,record=false;
    if(this.mode==='endless'){
      record=this.score>Save.data.endlessBest;
      if(record)Save.data.endlessBest=this.score;
      if(ModeSys.isReward(this.mode)&&!this._rewarded){
        awardCoins=Math.min(250,Math.floor(dist/40));addCoins(awardCoins);this._rewarded=true;
      }
    }else if(this.mode==='classic'){
      const L=this.level;const rec=Save.data.classic[L.id]||Save.data.levels[L.id]||{bestPct:0,bestScore:0,rating:0,done:false};
      const pct=Math.floor(this.progress*100);
      if(pct>rec.bestPct){rec.bestPct=pct;record=true;}
      if(this.score>rec.bestScore){rec.bestScore=this.score;record=true;}
      Save.data.classic[L.id]=rec;Save.data.levels[L.id]=rec;
    }
    Save.data.coins+=this.coins;Save.data.diamonds+=this.gems;Save.data.gems=Save.data.diamonds;
    Save.save();checkAch();this.submitRun('death');
    const retry=()=>{AM.play('click');$('scr-result').classList.remove('active');
      if(this.mode==='endless')this.start(null,'endless');
      else if(this.mode==='challenge')this.start(null,'challenge',false,this.challenge&&this.challenge.id);
      else this.start(this.level.id,this.mode,this.practice);};
    if(this.mode==='endless'){
      showResult({dead:true,title:'RUN OVER',record,rows:[
        ['Score',fmt(this.score)],['Best',fmt(Save.data.endlessBest)],
        ['Distance',dist+' m'],['🪙 Coins',this.coins+awardCoins]
      ],buttons:[
        {label:'↻ RETRY',primary:true,fn:retry},
        {label:'⌂ MAIN MENU',fn:()=>{AM.play('click');exitToMenu();}}
      ]});
    }else if(this.mode==='time_trial'){
      showResult({dead:true,title:'TIME TRIAL FAILED',rows:[
        ['Time',this.elapsed.toFixed(3)+'s'],['Best',fmtTime(bestTrialMs(this.level.id))],
        ['Progress',Math.floor(this.progress*100)+'%']
      ],buttons:[
        {label:'↻ RETRY',primary:true,fn:retry},
        {label:'⌂ MAIN MENU',fn:()=>{AM.play('click');exitToMenu();}}
      ]});
    }else if(this.mode==='practice'){
      showResult({dead:true,title:'PRACTICE OVER',noRewards:true,rows:[
        ['Progress',Math.floor(this.progress*100)+'%'],['Checkpoints',String(this.checkpoints.length)]
      ],buttons:[
        {label:'↻ RETRY',primary:true,fn:retry},
        {label:'⌂ MAIN MENU',fn:()=>{AM.play('click');exitToMenu();}}
      ]});
    }else{
      const rec=Save.data.classic[this.level.id]||{};
      showResult({dead:true,title:'DEATH',record,rows:[
        ['Score',fmt(this.score)],['Best',fmt(rec.bestScore||0)],
        ['Progress',Math.floor(this.progress*100)+'%'],['🪙 Coins',this.coins]
      ],buttons:[
        {label:'↻ RETRY',primary:true,fn:retry},
        {label:'LEVEL SELECT',fn:()=>{AM.play('click');$('scr-result').classList.remove('active');openLevelSelect(this.mode);}},
        {label:'⌂ MAIN MENU',fn:()=>{AM.play('click');exitToMenu();}}
      ]});
    }
  },
  win(){
    if(this.ended)return;this.ended=true;this.state='LEVEL_COMPLETE';Input.release();AM.play('win');this.cam.shake(7,.22);this.flashT=.35;
    const t=Math.max(0.001,this.elapsed);const timeMs=Math.round(t*1000);
    const L=this.level;const stars=CLASSIC_CONFIG.evaluateStars(this);
    let rows=[],title='LEVEL COMPLETE!',rating='',record=false,recordText=' NEW RECORD ',noRewards=false;
    let buttons=[];
    const retry=()=>{AM.play('click');$('scr-result').classList.remove('active');
      if(this.mode==='challenge')this.start(null,'challenge',false,this.challenge&&this.challenge.id);
      else this.start(L.id,this.mode,this.practice);};
    const toMenu=()=>{AM.play('click');exitToMenu();};

    if(this.mode==='practice'){
      noRewards=true;title='CHECKPOINT RUN COMPLETE';
      rows=[['Time',t.toFixed(1)+'s'],['Score',fmt(this.score)],['Checkpoints',String(this.checkpoints.length)]];
      buttons=[{label:'↻ RETRY',primary:true,fn:retry},{label:'⌂ MAIN MENU',fn:toMenu}];
    }else if(this.mode==='time_trial'){
      title='TIME TRIAL COMPLETE!';
      const prev=bestTrialMs(L.id);record=!prev||(timeMs<prev);
      if(record){Save.data.timeTrial[L.id]=Save.data.timeTrial[L.id]||{attempts:0};Save.data.timeTrial[L.id].bestTimeMs=timeMs;recordText=' NEW BEST TIME ';}
      Save.data.timeTrial[L.id]=Save.data.timeTrial[L.id]||{bestTimeMs:timeMs,attempts:0};
      Save.data.timeTrial[L.id].attempts=(Save.data.timeTrial[L.id].attempts||0)+1;
      let bCoins=0,bDia=0;
      if(record&&ModeSys.isReward(this.mode)&&!this._rewarded){
        const sorted=TIME_TRIAL_CONFIG.bonuses.slice().sort((a,b)=>a.maxMs-b.maxMs);
        for(const b of sorted){if(timeMs<=b.maxMs){bCoins=b.coins;bDia=b.diamonds;break;}}
        addCoins(bCoins);addDiamonds(bDia);this._rewarded=true;
      }
      rows=[['TIME',fmtTime(timeMs)],['BEST',fmtTime(bestTrialMs(L.id))],['🪙 Coins',bCoins],['💎 Diamonds',bDia]];
      buttons=[
        {label:'↻ RETRY',primary:true,fn:retry},
        {label:'NEXT LEVEL',fn:()=>{AM.play('click');$('scr-result').classList.remove('active');const i=LEVELS.findIndex(x=>x.id===L.id);if(i>=0&&i<LEVELS.length-1)this.start(LEVELS[i+1].id,'time_trial');else openLevelSelect('time_trial');}},
        {label:'⌂ MAIN MENU',fn:toMenu}
      ];
    }else if(this.mode==='challenge'){
      title='CHALLENGE CLEAR!';rating=this.challenge?this.challenge.name:'';
      const id=this.challenge&&this.challenge.id;
      const rec=Save.data.challenges[id]||{cleared:false};
      let c=0,d=0;
      if(!rec.cleared&&ModeSys.isReward(this.mode)&&!this._rewarded){
        const rw=(this.challenge&&this.challenge.reward)||{coins:100,diamonds:1};
        c=rw.coins;d=rw.diamonds;addCoins(c);addDiamonds(d);this._rewarded=true;rec.cleared=true;rec.clearedAt=Date.now();
      }
      rec.bestScore=Math.max(rec.bestScore||0,this.score);Save.data.challenges[id]=rec;
      rows=[['Challenge',this.challenge?this.challenge.name:'—'],['Status',rec.cleared?'CLEARED':'—'],['🪙 Coins',c],['💎 Diamonds',d]];
      buttons=[
        {label:'↻ RETRY',fn:retry},
        {label:'CHALLENGES',primary:true,fn:()=>{AM.play('click');$('scr-result').classList.remove('active');renderChallenges();UI.show('challenges');}},
        {label:'⌂ MAIN MENU',fn:toMenu}
      ];
    }else if(this.mode==='rank'){
      title='RANK COMPLETE!';rating=starStr(stars);
      const rec=Save.data.rankProgress[L.id]||{bestScore:0,stars:0,rankStarsEarned:0,completed:false};
      const prevStars=rec.stars||0;
      let gained=0;
      if(stars>prevStars){
        for(let s=prevStars+1;s<=stars;s++)gained+=(RANK_STAR_AWARD[s]||0);
      }
      if(gained&&!this._rewarded){
        Save.data.rankStars=(Save.data.rankStars||0)+gained;
        const before=RankSys.fromStars(Save.data.rankStars-gained);
        const after=RankSys.fromStars(Save.data.rankStars);
        Save.data.rankTier=after.rank_id;
        if(after.rank_index>before.rank_index)UI.toast(after.icon+' PROMOTED TO '+after.rank_name.toUpperCase());
        this._rewarded=true;
      }
      rec.stars=Math.max(prevStars,stars);rec.bestScore=Math.max(rec.bestScore||0,this.score);
      rec.completed=true;rec.rankStarsEarned=(rec.rankStarsEarned||0)+gained;
      Save.data.rankProgress[L.id]=rec;
      const info=RankSys.fromStars(Save.data.rankStars);
      const rw=CLASSIC_CONFIG.rewards[stars]||{coins:0,diamonds:0};
      const prevR=CLASSIC_CONFIG.rewards[prevStars]||{coins:0,diamonds:0};
      const dc=Math.max(0,rw.coins-prevR.coins),dd=Math.max(0,rw.diamonds-prevR.diamonds);
      if((dc||dd)&&gained>=0){addCoins(dc);addDiamonds(dd);}
      rows=[
        ['Rank Stars','+'+gained],['Current Rank',info.icon+' '+info.rank_name],
        ['Progress',info.max?'MAX RANK':(info.current_stars+' / '+info.next_required_stars)],
        ['Next Rank',info.max?'💎 MAX RANK':info.next_rank],
        ['🪙 Coins',dc],['💎 Diamonds',dd]
      ];
      buttons=[
        {label:'CONTINUE',primary:true,fn:()=>{AM.play('click');$('scr-result').classList.remove('active');renderRankHub();UI.show('rankhub');}},
        {label:'↻ RETRY',fn:retry},{label:'⌂ MAIN MENU',fn:toMenu}
      ];
    }else{
      /* classic */
      const rec=Save.data.classic[L.id]||Save.data.levels[L.id]||{bestPct:0,bestScore:0,rating:0,done:false,coinsRewarded:0,diamondsRewarded:0};
      const prev=rec.rating||0;
      rating=starStr(stars);
      if(this.score>rec.bestScore){rec.bestScore=this.score;record=true;}
      if(!rec.done){record=true;Save.data.stats.done++;}
      rec.done=true;rec.bestPct=100;rec.rating=Math.max(prev,stars);
      const rw=CLASSIC_CONFIG.rewards[rec.rating]||{coins:0,diamonds:0};
      const prevRw=CLASSIC_CONFIG.rewards[prev]||{coins:0,diamonds:0};
      const dc=Math.max(0,rw.coins-prevRw.coins);
      const dd=Math.max(0,rw.diamonds-prevRw.diamonds);
      const ds=Math.max(0,rec.rating-prev);
      if(!this._rewarded){addCoins(dc+50);addDiamonds(dd+1);Save.data.classicStars=(Save.data.classicStars||0)+ds;this._rewarded=true;}
      rec.coinsRewarded=(rec.coinsRewarded||0)+dc;rec.diamondsRewarded=(rec.diamondsRewarded||0)+dd;
      Save.data.classic[L.id]=rec;Save.data.levels[L.id]=rec;
      rows=[['Score',fmt(this.score)],['Best',fmt(rec.bestScore)],['Progress','100%'],
        ['🪙 Coins',dc+50],['💎 Diamonds',dd+1],['⭐ Classic Stars','+'+ds],['Time',t.toFixed(1)+'s']];
      buttons=[
        {label:'NEXT LEVEL',primary:true,fn:()=>{AM.play('click');$('scr-result').classList.remove('active');
          const i=LEVELS.findIndex(x=>x.id===L.id);if(i>=0&&i<LEVELS.length-1)this.start(LEVELS[i+1].id,'classic');else openLevelSelect('classic');}},
        {label:'↻ RETRY',fn:retry},
        {label:'LEVEL SELECT',fn:()=>{AM.play('click');$('scr-result').classList.remove('active');openLevelSelect('classic');}},
        {label:'⌂ MAIN MENU',fn:toMenu}
      ];
    }
    Save.data.stats.score+=this.score;Save.data.stats.dist+=Math.floor(this.scroll/10);
    Save.data.stats.coins+=this.coins;Save.data.stats.stars+=this.stars;
    Save.save();checkAch();this.submitRun('win');
    PS.burst(innerWidth/2,innerHeight/2,'#ffe94d',60,400,1.2);
    setTimeout(()=>showResult({title,rating,record,recordText,noRewards,rows,buttons}),400);
  },
  submitRun(reason){
    if(this._submitted)return;this._submitted=true;
    if(!ModeSys.isLeaderboard(this.mode))return;
    if(window.WaveDashLeaderboard)WaveDashLeaderboard.submit(reason||this.mode);
  },
  getCoinTotal(){return this.level.objects.filter(o=>o.t==='coin').length||1;},
  getStarTotal(){return this.level.objects.filter(o=>o.t==='star').length;},
  update(dt){
    if(this.state!=='PLAYING')return;
    const held=Input.held;
    const gSpd=Save.data.settings.gameSpeed||1;
    const chSpd=(this.challengeMod&&this.challengeMod.speedMul)||1;
    const spd=this.level.speed*this.speedMul*gSpd*chSpd;
    this.scroll+=spd*dt;this.elapsed+=dt;
    this.player.x=this.scroll+innerWidth*.30;
    if(!this.ended)this.player.hold(held,dt);
    this.cam.update(this.player,this.level,dt,spd);
    const wallHit=WallSys.checkHit(this.player,this.level);
    if(wallHit==='top')return this.die('wall-top');
    if(wallHit==='bottom')return this.die('wall-bottom');
    if(this.level.endless){ProcGen.update(this.cam.x,this.level,spd);}
    const cy=innerHeight/2;
    if(!this.ended)
    for(let i=this.level.objects.length-1;i>=0;i--){const o=this.level.objects[i];
      if(o.x<this.cam.x-300){if(this.level.endless)this.level.objects.splice(i,1);continue;}
      if(o.x>this.cam.x+innerWidth+400)continue;
      if(o.t==='mover'){o.ph+=dt*o.spd;}
      const px=this.player.x,py=this.player.y,pr=this.player.r*.75;
      if(o.t==='spike'){const s=o.s;const ay=(o.y<0?-o.y:o.y);const flip=o.y<0;const yBase=flip?(cy+ay):(cy+o.y);
        if(flip){if(circTri(px,py,pr,o.x,yBase+s,o.x+s/2,yBase,o.x+s,yBase+s))return this.die();}
        else{if(circTri(px,py,pr,o.x,yBase,o.x+s/2,yBase-s,o.x+s,yBase))return this.die();}}
      else if(o.t==='block'||o.t==='wall'){if(circRect(px,py,pr,o.x,cy+o.y-o.h/2,o.w,o.h))return this.die();}
      else if(o.t==='saw'){const dx=px-o.x,dy=py-(cy+o.y);if(dx*dx+dy*dy<(o.r*.85+pr)*(o.r*.85+pr))return this.die();}
      else if(o.t==='mover'){const yy=cy+o.y+Math.sin(o.ph)*o.amp;if(circRect(px,py,pr,o.x,yy-o.h/2,o.w,o.h))return this.die();}
      else if(o.t==='tunnel'){
        if(circRect(px,py,pr,o.x,2,o.len,cy-o.gap/2-8)||circRect(px,py,pr,o.x,cy+o.gap/2+8,o.len,cy-o.gap/2-10))return this.die();}
      else if(o.t==='coin'&&!o.taken){const dx=px-o.x,dy=py-(cy+o.y);if(dx*dx+dy*dy<400){o.taken=true;this.coins++;this.score+=10*(1+this.combo*.1);this.combo++;this.comboT=1.2;AM.play('coin');PS.burst(o.x,cy+o.y,'#ffe94d',10,180,.5);Save.data.ach._comboMax=Math.max(Save.data.ach._comboMax||0,this.combo);}}
      else if(o.t==='star'&&!o.taken){const dx=px-o.x,dy=py-(cy+o.y);if(dx*dx+dy*dy<600){o.taken=true;this.stars++;this.score+=100;AM.play('star');PS.burst(o.x,cy+o.y,'#ffe94d',20,280,.8);}}
      else if(o.t==='gem'&&!o.taken){const dx=px-o.x,dy=py-(cy+o.y);if(dx*dx+dy*dy<600){o.taken=true;this.gems++;this.score+=200;AM.play('gem');PS.burst(o.x,cy+o.y,'#ff2d95',24,300,.9);}}
      else if(o.t==='portal'&&!o.taken){const dx=px-o.x;if(Math.abs(dx)<20&&Math.abs(py-cy)<80){o.taken=true;AM.play('portal');this.flashT=.25;TrailSys.portalPulse();
        if(o.kind==='speedUp')this.speedMul=Math.min(2,this.speedMul+.4);
        else if(o.kind==='speedDown')this.speedMul=Math.max(.7,this.speedMul-.3);
        else if(o.kind==='gravity')this.player.grav*=-1;
        if(this.practice)this.addCheckpoint();
        PS.burst(o.x,cy,'#00e5ff',20,300,.7);}}
    }
    if(this.practice&&this.elapsed>0&&Math.floor(this.elapsed)%4===0&&(!this._lastCp||this.elapsed-this._lastCp>3.5)){this._lastCp=this.elapsed;this.addCheckpoint();}
    this.score+=dt*20*(1+this.combo*.05);
    if(this.comboT>0){this.comboT-=dt;if(this.comboT<=0)this.combo=0;}
    if(!this.level.endless){
      this.progress=clamp((this.player.x-innerWidth*.30)/this.level.length,0,1);
      if(!Number.isFinite(this.progress))this.progress=0;
      if(this.progress>=1)return this.win();
    }else this.progress=Math.min(1,this.elapsed/120);
    if(this.shake>0)this.shake=Math.max(0,this.shake-dt*40);
    if(this.flashT>0)this.flashT-=dt;
    if(!Number.isFinite(this.player.y)||!Number.isFinite(this.player.vy)){this.player.y=innerHeight/2;this.player.vy=0;}
    if(!Number.isFinite(this.scroll)||this.scroll<0)this.scroll=0;
    if(!Number.isFinite(this.cam.y))this.cam.y=0;
    if(!Number.isFinite(this.speedMul)||this.speedMul<=0)this.speedMul=1;
    this.updateHUD();
  },
  addCheckpoint(){this.checkpoints.push({py:this.player.y,camX:this.cam.x,camY:this.cam.y,scroll:this.scroll,g:this.gravity,sp:this.speedMul,pg:this.player.grav});
    this.cpIdx=this.checkpoints.length-1;AM.play('cp');UI.toast('CHECKPOINT!');},
  updateHUD(force){
    const mode=this.mode;const info=RankSys.fromStars(Save.data.rankStars);
    let left='LEVEL 01',pct=Math.floor(clamp(this.progress,0,1)*100)+'%',scoreHTML='';
    if(mode==='classic'){left='LEVEL '+String(this.level&&this.level.id||1).padStart(2,'0');
      scoreHTML='SCORE <b>'+fmt(this.score)+'</b><br>BEST <span>'+fmt(this.getBest())+'</span>';}
    else if(mode==='rank'){left=(info.icon+' '+info.rank_name).toUpperCase();
      pct=(info.current_stars)+' ★';
      scoreHTML='SCORE <b>'+fmt(this.score)+'</b><br>RANK ★ <span>'+info.current_stars+'</span>';}
    else if(mode==='endless'){left='ENDLESS';pct=Math.floor(this.scroll/10)+' m';
      scoreHTML='SCORE <b>'+fmt(this.score)+'</b><br>BEST <span>'+fmt(Save.data.endlessBest)+'</span>';}
    else if(mode==='time_trial'){left='TIME TRIAL';
      scoreHTML='TIME <b>'+this.elapsed.toFixed(3)+'s</b><br>BEST <span>'+fmtTime(bestTrialMs(this.level&&this.level.id))+'</span>';}
    else if(mode==='practice'){left='PRACTICE';pct='CP '+(this.cpIdx+1);
      scoreHTML='NO REWARDS<br>TRAINING';}
    else if(mode==='challenge'){left=(this.challenge&&this.challenge.name)||'CHALLENGE';
      scoreHTML='SCORE <b>'+fmt(this.score)+'</b><br>'+esc((this.challenge&&this.challenge.difficulty)||'');}
    const key=left+'|'+pct+'|'+scoreHTML;
    if(force||this._hudKey!==key){this._hudKey=key;
      $('hudLevel').textContent=left;
      $('hudProg').firstElementChild.style.width=(clamp(this.progress,0,1)*100)+'%';
      $('hudPct').textContent=pct;
      $('hudScore').innerHTML=scoreHTML;}
    const cb=$('hudCombo');if(this.combo>=2){cb.textContent=this.combo+'x';cb.style.opacity=Math.min(1,this.comboT);
      if(!this._comboPop){this._comboPop=1;cb.classList.add('pop');setTimeout(()=>{cb.classList.remove('pop');this._comboPop=0;},300);}}
    else{cb.style.opacity=0;this._comboPop=0;}
  },
  getBest(){if(this.mode==='classic')return(Save.data.classic[this.level.id]||Save.data.levels[this.level.id]||{}).bestScore||0;
    if(this.mode==='endless')return Save.data.endlessBest;
    if(this.mode==='rank')return(Save.data.rankProgress[this.level.id]||{}).bestScore||0;
    return 0;},
  draw(){
    const w=innerWidth,h=innerHeight;let sx=0,sy=0;
    if(this.shake>0&&Save.data.settings.shake){sx=(Math.random()-.5)*this.shake;sy=(Math.random()-.5)*this.shake;}
    ctx.save();ctx.translate(sx,sy);
    drawBG(this.level.theme,this.cam.x,this.scroll);
    const cy=h/2-this.cam.y;
    WallSys.draw(this.cam,this.level,this.scroll,!this.ended);
    for(const o of this.level.objects){
      if(o.x<this.cam.x-100||o.x>this.cam.x+w+100)continue;
      const acc=(THEMES.find(t=>t.id===this.level.theme)||THEMES[0]).acc;
      if(o.t==='spike')drawSpike(o,this.cam,cy,o.y<0?'#ff2d95':'#ff5064',o.y<0);
      else if(o.t==='block'||o.t==='wall')drawBlock(o,this.cam,cy,acc);
      else if(o.t==='saw')drawSaw(o,this.cam,cy,'#ff5064');
      else if(o.t==='mover'){const yy=o.y+Math.sin(o.ph)*o.amp;drawBlock({x:o.x,y:yy,w:o.w,h:o.h},this.cam,cy,'#7b5cff');}
      else if(o.t==='coin'&&!o.taken)drawCoin(o,this.cam,cy);
      else if(o.t==='star'&&!o.taken)drawStar(o,this.cam,cy);
      else if(o.t==='gem'&&!o.taken)drawGem(o,this.cam,cy);
      else if(o.t==='portal'&&!o.taken)drawPortal(o,this.cam,cy);
      else if(o.t==='tunnel')drawTunnel(o,this.cam,cy);
    }
    if(!this.level.endless&&Number.isFinite(this.level.length)){
      const fx=this.level.length+innerWidth*.30-this.cam.x+this.cam.shakeX;
      if(fx>-60&&fx<w+60){
        const now2=performance.now();ctx.save();ctx.globalCompositeOperation='lighter';
        ctx.strokeStyle='#ffe94d';ctx.shadowColor='#ffe94d';ctx.shadowBlur=22;ctx.lineWidth=3;ctx.globalAlpha=.75+.25*Math.sin(now2/160);
        ctx.beginPath();ctx.moveTo(fx,0);ctx.lineTo(fx,h);ctx.stroke();ctx.globalCompositeOperation='source-over';
        const cs=14;for(let yy=0;yy<h;yy+=cs){for(let xx=0;xx<2;xx++){if(((yy/cs)+xx)%2===0){ctx.globalAlpha=.9;ctx.fillStyle='#ffffff';ctx.fillRect(fx+2+xx*cs,yy,cs,cs);}}}
        ctx.globalAlpha=1;ctx.shadowBlur=0;ctx.restore();
      }
    }
    PS.draw(this.cam);
    try{drawTrailEnhanced(this.player,this.cam,Save.data.trail,Save.data.colors.trail);}catch(e){drawTrailFallback(this.player,this.cam);}
    if(!this.ended){try{this.player.draw(this.cam,Save.data.skin,Save.data.glow,Save.data.colors);}catch(e){drawPlayerFallback(this.player,this.cam);}}
    ctx.restore();
    if(this.flashT>0){ctx.save();ctx.globalAlpha=Math.min(1,this.flashT*2)*.5;ctx.fillStyle='#ffffff';ctx.fillRect(0,0,w,h);ctx.restore();}
  }
};

function bestTrialMs(id){const r=Save.data.timeTrial[id];return r&&Number.isFinite(+r.bestTimeMs)?+r.bestTimeMs:0;}
function challengeClears(){return Object.values(Save.data.challenges||{}).filter(c=>c.cleared).length;}

const ProcGen={cur:0,rng:null,diff:0,reset(sp){this.cur=800;this.diff=0;
    this.rng=mulberry32((Date.now()^0x9e3779b9)>>>0);
    for(let i=0;i<25;i++)this.emit(Game.level,Game.level&&Game.level.speed||sp||250);},
  update(cam,L,spd){spd=spd||L.speed||250;while(this.cur<cam+innerWidth*2)this.emit(L,spd);},
  gapFor(spd){return clamp(spd*(0.55-this.diff*0.18),110,260)+this.rng()*50;},
  emit(L,spd){spd=spd||250;const x=this.cur;const o=L.objects;const d=this.diff;const roll=this.rng();
    if(roll<.14){o.push({t:'spike',x:x,y:this.rng()<.5?0:(this.rng()<.5?-70:70),s:38});this.cur+=60+this.gapFor(spd);}
    else if(roll<.26){o.push({t:'spike',x:x,y:0,s:36});o.push({t:'spike',x:x+42,y:0,s:36});this.cur+=90+this.gapFor(spd);}
    else if(roll<.38){o.push({t:'spike',x:x,y:-60,s:36});o.push({t:'spike',x:x+52,y:60,s:36});this.cur+=100+this.gapFor(spd);}
    else if(roll<.48){const yy=(this.rng()-.5)*120;o.push({t:'saw',x:x+30,y:yy,r:26});
      if(d>.35&&this.rng()<.6)o.push({t:'saw',x:x+120,y:-yy*.6,r:24});this.cur+=(d>.35?150:80)+this.gapFor(spd);}
    else if(roll<.58){const yy=(this.rng()-.5)*110;const n=3+Math.floor(this.rng()*3);
      for(let i=0;i<n;i++)o.push({t:'coin',x:x+i*42,y:yy});this.cur+=n*42+40+this.gapFor(spd)*.55;}
    else if(roll<.68){o.push({t:'mover',x:x,y:0,w:56,h:56,amp:60+this.rng()*(70+d*40),spd:1.3+this.rng()*(0.8+d),ph:this.rng()*6});this.cur+=90+this.gapFor(spd);}
    else if(roll<.80){const g=clamp(170-d*70,100,170);const len=Math.round(380+this.rng()*320+d*160);
      o.push({t:'tunnel',x:x,y:(this.rng()-.5)*40,gap:g,len:len});this.cur+=len+30+this.gapFor(spd);}
    else if(roll<.92){let xx=x;const n=2+Math.floor(this.rng()*(2+d*2));
      for(let i=0;i<n;i++){o.push({t:'spike',x:xx,y:i%2?60:-60,s:36});xx+=70;}this.cur+=(xx-x)+40+this.gapFor(spd);}
    else{const yy=this.rng()>.5?110:-110;o.push({t:'block',x:x,y:yy,w:70,h:60});o.push({t:'coin',x:x+110,y:-yy*.6});this.cur+=160+this.gapFor(spd);}
    if(this.rng()<.06){o.push({t:'star',x:this.cur+40,y:(this.rng()-.5)*70});this.cur+=90;}
    if(this.rng()<.03){o.push({t:'gem',x:this.cur+40,y:(this.rng()-.5)*70});this.cur+=90;}
    this.diff=Math.min(1,this.diff+0.006);},
  fillLevel(L){if(!L||L.endless||!Array.isArray(L.objects))return;
    if(!Number.isFinite(L.length)||L.length<=0)return;
    const finishAt=L.length*0.95;let maxX=800;for(const ob of L.objects)if(ob.x>maxX)maxX=ob.x;
    if(maxX>=finishAt-200)return;
    const savedCur=this.cur,savedRng=this.rng,savedDiff=this.diff;
    this.cur=maxX+Math.max(120,(L.speed||250)*0.6);
    this.rng=mulberry32((L.id*2654435761)>>>0);
    this.diff=clamp((L.diffRank||1)/10,0.05,0.95);
    let guard=0;const OB=['spike','block','saw','mover','tunnel','wall'];
    const lastOb=()=>{let m=0;for(const ob of L.objects)if(OB.indexOf(ob.t)>=0&&ob.x>m)m=ob.x;return m;};
    while(guard++<900){this.emit(L,L.speed||250);if(lastOb()>=finishAt-120)break;}
    this.cur=savedCur;this.rng=savedRng;this.diff=savedDiff;}};

const Input={held:false,debugSeq:[],
  release(){this.held=false;},
  init(){
    const press=(e)=>{if(Game.state==='PLAYING'){this.held=true;AM.unlock();}};
    addEventListener('keydown',(e)=>{
      if(['Space','ArrowUp','KeyW'].includes(e.code)){e.preventDefault();if(!e.repeat)press(e);}
      if(e.code==='Escape'&&Game.state==='PLAYING')pauseGame();
      if(e.code==='KeyD'){this.debugSeq.push(performance.now());this.debugSeq=this.debugSeq.filter(t=>performance.now()-t<800);
        if(this.debugSeq.length>=3){Game.debug=!Game.debug;$('debug').style.display=Game.debug?'block':'none';this.debugSeq=[];}}
    });
    addEventListener('keyup',(e)=>{if(['Space','ArrowUp','KeyW'].includes(e.code))this.held=false;});
    cv.addEventListener('pointerdown',(e)=>{if(Game.state==='PLAYING'){e.preventDefault();this.held=true;AM.unlock();try{cv.setPointerCapture(e.pointerId);}catch(_){}}});
    addEventListener('pointerup',()=>{this.held=false;});
    addEventListener('pointercancel',()=>{this.held=false;});
    addEventListener('blur',()=>{this.held=false;});
    document.addEventListener('visibilitychange',()=>{if(document.hidden){this.held=false;if(Game.state==='PLAYING')pauseGame();}});
    document.addEventListener('contextmenu',(e)=>{if(Game.state==='PLAYING')e.preventDefault();});
    if(!window.PointerEvent){
      cv.addEventListener('touchstart',(e)=>{if(Game.state==='PLAYING'){e.preventDefault();this.held=true;AM.unlock();}},{passive:false});
      addEventListener('touchend',()=>{this.held=false;});addEventListener('touchcancel',()=>{this.held=false;});
    }
    cv.addEventListener('touchmove',(e)=>{if(Game.state==='PLAYING')e.preventDefault();},{passive:false});
    document.addEventListener('gesturestart',(e)=>e.preventDefault());
  }};

const ShopPreviewRenderer={
  prep(canvas){
    const dpr=Math.min(window.devicePixelRatio||1,2);
    let w=canvas.clientWidth,h=canvas.clientHeight;
    if(!w||!h){const p=canvas.parentElement;w=p?Math.max(120,p.clientWidth-20):160;h=96;}
    const bw=Math.max(1,Math.round(w*dpr)),bh=Math.max(1,Math.round(h*dpr));
    if(canvas.width!==bw||canvas.height!==bh){canvas.width=bw;canvas.height=bh;}
    const c=canvas.getContext('2d');c.setTransform(dpr,0,0,dpr,0,0);c.clearRect(0,0,w,h);return{c,w,h};
  },
  render(e,now){
    const p=this.prep(e.canvas),c=p.c,w=p.w,h=p.h;
    if(e.type==='skin')this.renderSkin(c,w,h,e.item,now);
    else if(e.type==='trail')this.renderTrail(c,w,h,e.item,now);
    else if(e.type==='death')this.renderDeathEffect(c,w,h,e.item,now);
    else if(e.type==='theme')this.renderTheme(c,w,h,e.item,now);
  },
  arrow(c,r,col,col2,glow){
    c.save();c.shadowColor=col;c.shadowBlur=glow;c.fillStyle=col;c.strokeStyle=col2;c.lineWidth=2;
    c.beginPath();c.moveTo(r*1.4,0);c.lineTo(-r*1.1,-r*.95);c.lineTo(-r*.4,0);c.lineTo(-r*1.1,r*.95);c.closePath();
    c.fill();c.stroke();c.shadowBlur=0;c.globalAlpha=.92;c.fillStyle=col2;c.beginPath();c.arc(0,0,r*.34,0,Math.PI*2);c.fill();c.globalAlpha=1;c.restore();
  },
  skinColors(skin,now){
    let col=skin.c,col2=skin.c2;
    if(col==='rainbow'||skin.id==='rainbow'){const hu=(now/6)%360;col='hsl('+hu+',100%,60%)';col2='hsl('+((hu+120)%360)+',100%,70%)';}
    return[col,col2];
  },
  renderSkin(c,w,h,skin,now){
    const t=now/1000,cx=w/2,cy=h/2+Math.sin(t*2)*2,r=16;const cc=this.skinColors(skin,now),col=cc[0],col2=cc[1];
    c.save();c.translate(cx,cy);this.arrow(c,r,col,col2,skin.id==='neon'?16:13);c.restore();
  },
  renderTrail(c,w,h,trail,now){
    const t=now/1000;const col=Save.data.colors.trail;const amp=h*.2,cy=h/2;
    const headX=w*.68+Math.sin(t*1.1)*w*.06;const headY=cy+Math.sin(t*2.2)*amp;const pts=[];
    for(let i=0;i<26;i++)pts.push({x:headX-i*(w*.014+2.4),y:cy+Math.sin(t*2.2-i*.26)*amp*(1-i/46)});
    const fake={trail:pts,x:headX,y:headY,vy:260*Math.cos(t*2.2),r:11,rot:0};
    const cam={x:0,y:0,shakeX:0,shakeY:0};
    drawTrailEnhanced(fake,cam,trail.id,col,c);
    c.save();c.translate(headX,headY);c.rotate(clamp(fake.vy/620,-1,1)*.7);
    let ac=col,ac2='#ffffff';if(col==='rainbow'){const hu=(now/6)%360;ac='hsl('+hu+',100%,60%)';ac2='hsl('+((hu+120)%360)+',100%,70%)';}
    this.arrow(c,10,ac,ac2,10);c.restore();
  },
  renderDeathEffect(c,w,h,death,now){
    const t=now/1000,cx=w/2,cy=h/2,col='#00e5ff',id=death.id;c.save();
    if(id==='explosion'){const p=(t%1.4)/1.4;c.globalCompositeOperation='lighter';
      for(let i=0;i<12;i++){const a=i/12*Math.PI*2;const R=(8+p*34)*(.8+(i%3)*.15);
        c.globalAlpha=(1-p)*.9;c.fillStyle=i%2?'#ffe94d':'#ff5064';c.beginPath();c.arc(cx+Math.cos(a)*R,cy+Math.sin(a)*R,4*(1-p)+1,0,Math.PI*2);c.fill();}}
    else if(id==='shockwave'){c.strokeStyle=col;c.shadowColor=col;c.shadowBlur=13;
      for(let i=0;i<3;i++){const p=((t*.9)+i/3)%1;c.globalAlpha=(1-p)*.9;c.lineWidth=3-p*2;c.beginPath();c.arc(cx,cy,6+p*32,0,Math.PI*2);c.stroke();}}
    else{c.globalCompositeOperation='lighter';c.shadowColor=col;c.shadowBlur=9;
      for(let i=0;i<16;i++){const a=i*2.4+t;const R=6+i*1.4;c.globalAlpha=.7;c.fillStyle=col;c.beginPath();c.arc(cx+Math.cos(a)*R,cy+Math.sin(a)*R*.7,2,0,Math.PI*2);c.fill();}}
    c.restore();c.globalAlpha=1;
  },
  renderTheme(c,w,h,theme,now){
    const t=now/1000;const g=c.createLinearGradient(0,0,0,h);
    g.addColorStop(0,'#050a20');g.addColorStop(1,hexA(theme.acc,.55));c.fillStyle=g;c.fillRect(0,0,w,h);
    c.strokeStyle=hexA(theme.acc,.45);c.lineWidth=1;const off=(t*22)%12;
    for(let i=0;i<6;i++){const y=h*.35+i*11+(i>0?off*(i/6):0);if(y<h){c.beginPath();c.moveTo(0,y);c.lineTo(w,y);c.stroke();}}
    c.fillStyle=hexA(theme.acc,.9);c.fillRect(0,h-3,w,3);
  }
};
const ShopPreview={
  entries:[],activeScreen:null,running:false,raf:0,lastFrame:0,
  reset(screen){this.entries=this.entries.filter(e=>e.screen!==screen);},
  add(screen,canvas,type,item){if(!canvas||!item||!item.id)return;this.entries.push({screen,canvas,type,item,checked:false,failed:false});},
  onScreen(id){if(id==='shop'||id==='garage'){this.activeScreen=id;this.start();}else this.stop();},
  start(){if(this.running)return;this.running=true;this.lastFrame=0;
    const step=(now)=>{if(!this.running)return;if(now-this.lastFrame>=33){this.lastFrame=now;this.tick(now);}this.raf=requestAnimationFrame(step);};
    this.raf=requestAnimationFrame(step);},
  stop(){this.running=false;if(this.raf)cancelAnimationFrame(this.raf);this.raf=0;},
  tick(now){for(let i=this.entries.length-1;i>=0;i--){const e=this.entries[i];
      if(!e.canvas.isConnected){this.entries.splice(i,1);continue;}
      if(e.screen!==this.activeScreen)continue;
      try{ShopPreviewRenderer.render(e,now);}catch(err){if(!e.failed){e.failed=true;console.error('[SHOP PREVIEW ERROR]',e.item&&e.item.id,err);}}}
  }
};

function openLevelSelect(mode){
  UI.levelPickMode=ModeSys.normalize(mode||'classic');
  renderLevels();UI.show('levels');
}
function renderModes(){
  const box=$('modeList');box.innerHTML='';
  const info=RankSys.fromStars(Save.data.rankStars);
  const stats={
    classic:'⭐ '+ (Save.data.classicStars||0)+' Classic Stars',
    rank:info.icon+' '+info.rank_name.toUpperCase()+' · '+(info.current_stars)+' ★',
    endless:'BEST '+fmt(Save.data.endlessBest),
    time_trial:bestOverallTrial(),
    practice:'NO REWARDS',
    challenge:challengeClears()+' / '+CHALLENGES.length+' cleared'
  };
  Object.keys(GAME_MODES).forEach(id=>{
    const m=GAME_MODES[id];const el=document.createElement('div');
    el.className='modecard'+(id==='practice'?' practice norew':'');
    el.innerHTML=`<div class="ic">${m.icon}</div><div><div class="nm">${m.name}</div><div class="ds">${m.desc}</div><div class="st">${esc(stats[id]||'')}</div></div>`;
    el.onclick=()=>{AM.play('click');
      if(id==='classic')openLevelSelect('classic');
      else if(id==='rank'){renderRankHub();UI.show('rankhub');}
      else if(id==='endless'){Game.start(null,'endless');UI.hide('modes');}
      else if(id==='time_trial')openLevelSelect('time_trial');
      else if(id==='practice')openLevelSelect('practice');
      else if(id==='challenge'){renderChallenges();UI.show('challenges');}
    };
    box.appendChild(el);
  });
}
function bestOverallTrial(){
  let best=0;for(const r of Object.values(Save.data.timeTrial||{})){const t=+r.bestTimeMs||0;if(t>0&&(!best||t<best))best=t;}
  return best?('BEST '+fmtTime(best)):'Beat your best time';
}
function renderRankHub(){
  const info=RankSys.fromStars(Save.data.rankStars);
  const hero=$('rankHero');
  hero.innerHTML=`<div style="font-size:36px">${info.icon}</div>
    <div class="rankname">${esc(info.rank_name.toUpperCase())}</div>
    <div class="rankstars">${info.max?'💎 MAX RANK':('⭐ '.repeat(Math.min(5,1+info.rank_index))+' '+info.current_stars+' / '+info.next_required_stars)}</div>
    <div class="ranknext">${info.max?'YOU HAVE REACHED MYTHIC':('NEXT: '+info.next_rank+' · Need '+info.next_required_stars+' rank stars to promote')}</div>`;
  $('rankPlay').onclick=()=>{AM.play('click');
    const id=Save.data.selectedClassic||firstUnlockedLevel();
    Game.start(id,'rank');UI.hide('rankhub');};
  $('rankSelect').onclick=()=>{AM.play('click');openLevelSelect('rank');};
}
function renderChallenges(){
  const box=$('chList');box.innerHTML='';
  CHALLENGES.filter(c=>c.active).forEach(ch=>{
    const rec=Save.data.challenges[ch.id]||{};
    const el=document.createElement('div');el.className='chcard'+(rec.cleared?' cleared':'');
    el.innerHTML=`<div class="nm">${esc(ch.name)} · ${esc(ch.difficulty)}</div>
      <div class="ds">${esc(ch.desc)}</div>
      <div class="rw">${rec.cleared?'✓ CLEARED':'🪙 '+ch.reward.coins+'   💎 '+ch.reward.diamonds}</div>`;
    el.onclick=()=>{AM.play('click');Game.start(ch.levelId,'challenge',false,ch.id);UI.hide('challenges');};
    box.appendChild(el);
  });
}
function renderLevels(){
  const mode=UI.levelPickMode||'classic';
  const titles={classic:'SELECT CLASSIC LEVEL',rank:'SELECT RANK LEVEL',time_trial:'SELECT TIME TRIAL',practice:'SELECT PRACTICE LEVEL'};
  $('lvTitle').textContent=titles[mode]||'SELECT LEVEL';
  const t=$('lvTrack');t.innerHTML='';
  LEVELS.forEach((L,i)=>{
    const rec=Save.data.classic[L.id]||Save.data.levels[L.id]||{bestPct:0,bestScore:0,rating:0,done:false};
    const unlocked=isLevelUnlocked(i);
    const el=document.createElement('div');el.className='lvcard'+(unlocked?'':' locked');
    const stars=starStr(rec.rating||0);
    let extra='';
    if(mode==='time_trial')extra='<br>Best time: <b>'+fmtTime(bestTrialMs(L.id))+'</b>';
    if(mode==='rank'){const rp=Save.data.rankProgress[L.id]||{};extra='<br>Rank ★ '+ (rp.stars||0);}
    if(mode==='practice')extra='<br><span style="color:#ffe94d">NO REWARDS</span>';
    const rw=CLASSIC_CONFIG.rewards[3];
    el.innerHTML=`<div class="num">${String(L.id).padStart(2,'0')}</div><div class="nm">${L.name}</div>
      <div class="df" style="color:${rec.done?'#5dff9d':'#00e5ff'}">${L.diff}</div>
      <div class="stat">⭐ ${stars}<br>Best: <b>${fmt(rec.bestScore||0)}</b><br>Progress: <b>${rec.bestPct||0}%</b>
      ${mode==='classic'?'<br>Reward: 🪙'+rw.coins+' 💎'+rw.diamonds:''}${extra}</div>
      <div class="stars" style="color:#ffe94d">${unlocked?'▶️ PLAY':'🔒 LOCKED'}</div>${unlocked?'':'<div class="lock">🔒</div>'}`;
    if(unlocked)el.onclick=()=>{AM.play('click');
      if(mode==='practice'){Game.start(L.id,'practice',true);UI.hide('levels');}
      else if(mode==='rank'){Game.start(L.id,'rank');UI.hide('levels');}
      else if(mode==='time_trial'){Game.start(L.id,'time_trial');UI.hide('levels');}
      else{Game.start(L.id,'classic');UI.hide('levels');}
    };
    else el.onclick=()=>{AM.play('err');UI.toast('Complete previous level first');};
    t.appendChild(el);
  });
}
function renderGarage(){
  ShopPreview.reset('garage');
  const s=$('skinGrid');s.innerHTML='';
  for(const k of SKINS){const own=Save.data.ownedSkins.includes(k.id);const eq=Save.data.skin===k.id;
    const el=document.createElement('div');el.className='item'+(eq?' sel equipped':'')+(own?'':' locked');
    const cv2=document.createElement('canvas');cv2.className='pv';el.appendChild(cv2);
    const info=document.createElement('div');
    info.innerHTML=`<div class="nm">${k.name}</div>`+(own?(eq?'<div class="eq">✓ EQUIPPED</div>':'<div class="own">OWNED</div>'):`<div class="pr">${k.gem?'💎':'🪙'} ${k.price}</div>`);
    el.appendChild(info);ShopPreview.add('garage',cv2,'skin',k);
    el.onclick=()=>{AM.play('click');if(own){Save.data.skin=k.id;Save.save();renderGarage();updateMenu();}else UI.toast('Buy in Shop');};
    s.appendChild(el);}
  const t=$('trailGrid');t.innerHTML='';
  for(const k of TRAILS){const own=Save.data.ownedTrails.includes(k.id);const eq=Save.data.trail===k.id;
    const el=document.createElement('div');el.className='item'+(eq?' sel equipped':'')+(own?'':' locked');
    const cv2=document.createElement('canvas');cv2.className='pv';el.appendChild(cv2);
    const info=document.createElement('div');
    info.innerHTML=`<div class="nm">${k.name}</div>`+(own?(eq?'<div class="eq">✓ EQUIPPED</div>':'<div class="own">OWNED</div>'):`<div class="pr">${k.gem?'💎':'🪙'} ${k.price}</div>`);
    el.appendChild(info);ShopPreview.add('garage',cv2,'trail',k);
    el.onclick=()=>{AM.play('click');if(own){Save.data.trail=k.id;Save.save();renderGarage();}else UI.toast('Buy in Shop');};
    t.appendChild(el);}
  const d=$('deathGrid');d.innerHTML='';
  for(const k of DEATHS){const own=Save.data.ownedDeaths.includes(k.id);const eq=Save.data.death===k.id;
    const el=document.createElement('div');el.className='item'+(eq?' sel equipped':'')+(own?'':' locked');
    const cv2=document.createElement('canvas');cv2.className='pv';el.appendChild(cv2);
    const info=document.createElement('div');
    info.innerHTML=`<div class="nm">${k.name}</div>`+(own?(eq?'<div class="eq">✓ EQUIPPED</div>':'<div class="own">OWNED</div>'):`<div class="pr">${k.gem?'💎':'🪙'} ${k.price}</div>`);
    el.appendChild(info);ShopPreview.add('garage',cv2,'death',k);
    el.onclick=()=>{AM.play('click');if(own){Save.data.death=k.id;Save.save();renderGarage();}else UI.toast('Buy in Shop');};
    d.appendChild(el);}
  const build=(elid,key)=>{const c=$(elid);c.innerHTML='';for(const col of COLOR_PRESETS){const s2=document.createElement('div');
    s2.className='swatch'+(Save.data.colors[key]===col?' sel':'');s2.style.background=col;
    s2.onclick=()=>{AM.play('click');Save.data.colors[key]=col;Save.save();renderGarage();};c.appendChild(s2);}};
  build('swPrimary','primary');build('swSecondary','secondary');build('swTrail','trail');
  $('glowRange').value=Save.data.glow;$('glowVal').textContent=Save.data.glow;
  $('glowRange').oninput=(e)=>{Save.data.glow=+e.target.value;$('glowVal').textContent=Save.data.glow;Save.save();};
}
function renderShop(){
  ShopPreview.reset('shop');
  $('shCoins').textContent=Save.data.coins;$('shGems').textContent=Save.data.diamonds;
  const build=(gridId,list,ownArr,type,isEq,onBuy,onTap)=>{const g=$(gridId);g.innerHTML='';
    for(const k of list){const own=ownArr.includes(k.id);const eq=!!isEq(k);
      const el=document.createElement('div');el.className='item'+(own?' sel':'')+(eq?' equipped':'');
      const cv2=document.createElement('canvas');cv2.className='pv';el.appendChild(cv2);
      const info=document.createElement('div');
      info.innerHTML=`<div class="nm">${k.name}</div>`+(own?(eq?'<div class="eq">✓ EQUIPPED</div>':'<div class="own">OWNED</div>'):`<div class="pr">${k.gem?'💎':'🪙'} ${k.price}</div>`);
      el.appendChild(info);ShopPreview.add('shop',cv2,type,k);
      el.onclick=()=>{AM.play('click');
        if(own){if(onTap){onTap(k);}else UI.toast('Already owned');return;}
        const cur=k.gem?'diamonds':'coins';
        if(!Number.isFinite(Save.data[cur])||Save.data[cur]<k.price){AM.play('err');UI.toast('Not enough '+(k.gem?'diamonds':'coins'));return;}
        Save.data[cur]=Math.max(0,Save.data[cur]-k.price);if(cur==='diamonds')Save.data.gems=Save.data.diamonds;
        onBuy(k);Save.data.ach._bought=1;Save.save();AM.play('unlock');
        UI.toast('Unlocked: '+k.name);renderShop();renderGarage();updateMenu();checkAch();};
      g.appendChild(el);}};
  build('shopSkins',SKINS,Save.data.ownedSkins,'skin',(k)=>Save.data.skin===k.id,(k)=>{Save.data.ownedSkins.push(k.id);},(k)=>{Save.data.skin=k.id;Save.save();AM.play('unlock');UI.toast('Equipped: '+k.name);renderShop();renderGarage();updateMenu();});
  build('shopTrails',TRAILS,Save.data.ownedTrails,'trail',(k)=>Save.data.trail===k.id,(k)=>{Save.data.ownedTrails.push(k.id);},(k)=>{Save.data.trail=k.id;Save.save();AM.play('unlock');UI.toast('Equipped: '+k.name);renderShop();renderGarage();});
  build('shopDeaths',DEATHS,Save.data.ownedDeaths,'death',(k)=>Save.data.death===k.id,(k)=>{Save.data.ownedDeaths.push(k.id);},(k)=>{Save.data.death=k.id;Save.save();AM.play('unlock');UI.toast('Equipped: '+k.name);renderShop();renderGarage();});
  build('shopThemes',THEMES,Save.data.ownedThemes,'theme',(k)=>Save.data.menuTheme===k.id,(k)=>{Save.data.ownedThemes.push(k.id);Save.data.menuTheme=k.id;},(k)=>{Save.data.menuTheme=k.id;Save.save();AM.play('unlock');UI.toast('Theme: '+k.name);renderShop();renderGarage();});
}
function renderAch(){const l=$('achList');l.innerHTML='';let un=0;
  for(const a of ACHS){const done=!!Save.data.ach[a.id];if(done)un++;const claimed=!!Save.data.achClaimed[a.id];
    const cur=Math.min(a.need,a.get());const el=document.createElement('div');el.className='ach'+(done?' un':'');
    let right='LOCKED',sub='';
    if(claimed)right='✓ CLAIMED';
    else if(done)right='🎁 CLAIM';
    else right=cur+'/'+a.need;
    el.innerHTML=`<div class="ic">${a.ic}</div><div class="inf"><div class="nm">${a.name}</div><div class="ds">${a.desc}</div>
      <div class="bar"><i style="width:${Math.min(100,cur/a.need*100)}%"></i></div>
      ${done&&!claimed?'<button class="btn small claim" data-ach="'+a.id+'">🎁 CLAIM REWARD</button>':''}
      </div><div class="pc">${right}</div>`;
    l.appendChild(el);}
  l.querySelectorAll('[data-ach]').forEach(b=>b.onclick=()=>{AM.play('click');claimAch(b.dataset.ach);});
  $('achCount').textContent=un+' / '+ACHS.length;}
const PRESETS={
  casual:{sensitivity:0.85,vStr:0.9,smooth:65,maxVy:560,wave:520,gameSpeed:0.9},
  classic:{sensitivity:1,vStr:1,smooth:50,maxVy:620,wave:560,gameSpeed:1},
  precise:{sensitivity:1.15,vStr:1,smooth:35,maxVy:600,wave:560,gameSpeed:1},
  fast:{sensitivity:1.3,vStr:1.1,smooth:25,maxVy:680,wave:600,gameSpeed:1.1}};
function applyPreset(name){const p=PRESETS[name];if(!p)return;Object.assign(Save.data.settings,p);Save.data.settings.preset=name;Save.save();renderSettings();}
function renderSettings(){const st=Save.data.settings;
  document.querySelectorAll('.tgl').forEach(t=>{const k=t.dataset.set;t.classList.toggle('on',!!st[k]);
    t.onclick=()=>{AM.play('click');st[k]=!st[k];t.classList.toggle('on',st[k]);Save.save();
      if(k==='music')AM.setMus(st.music);if(k==='sfx')AM.setSfx(st.sfx);
      if(k==='showFps')$('fps').style.display=st.showFps?'block':'none';updatePauseSound();};});
  $('presetSel').value=st.preset;$('presetSel').onchange=(e)=>{AM.play('click');applyPreset(e.target.value);};
  const bind=(rng,val,get,set,fmtF)=>{const r=$(rng),v=$(val);if(!r||!v)return;
    r.value=get();v.textContent=fmtF(get());
    r.oninput=(e)=>{const n=+e.target.value;set(n);v.textContent=fmtF(n);st.preset='custom';$('presetSel').value='custom';Save.save();};};
  bind('sensRange','sensVal',()=>st.sensitivity,n=>st.sensitivity=clamp(n,.5,2),n=>n.toFixed(2));
  bind('vStrRange','vStrVal',()=>st.vStr,n=>st.vStr=clamp(n,.5,1.5),n=>n.toFixed(2));
  bind('smoothRange','smoothVal',()=>st.smooth,n=>st.smooth=clamp(n,0,100),n=>Math.round(n)+'%');
  bind('maxVyRange','maxVyVal',()=>st.maxVy,n=>st.maxVy=clamp(n,420,900),n=>Math.round(n));
  bind('waveRange','waveVal',()=>st.wave,n=>st.wave=clamp(n,420,760),n=>Math.round(n));
  bind('gspdRange','gspdVal',()=>st.gameSpeed,n=>st.gameSpeed=clamp(n,.8,1.2),n=>Math.round(n*100)+'%');
  bind('camSmRange','camSmVal',()=>st.camSmooth,n=>st.camSmooth=clamp(n,0,100),n=>Math.round(n)+'%');
  bind('trailFxRange','trailFxVal',()=>st.trailIntensity,n=>st.trailIntensity=clamp(n,.5,2),n=>Math.round(n*100)+'%');
  $('qualitySel').value=st.quality;$('qualitySel').onchange=(e)=>{st.quality=e.target.value;Save.save();resize();};}
function renderProfile(){
  const info=RankSys.fromStars(Save.data.rankStars);
  $('pfScore').textContent=fmt(Save.data.stats.score);$('pfDist').textContent=fmt(Save.data.stats.dist)+' m';
  $('pfDone').textContent=Save.data.stats.done;$('pfCoins').textContent=fmt(Save.data.coins);
  $('pfGems').textContent=fmt(Save.data.diamonds);
  $('pfAch').textContent=Object.keys(Save.data.ach).filter(k=>ACHS.find(a=>a.id===k)).length+' / '+ACHS.length;
  $('pfEndless').textContent=fmt(Save.data.endlessBest);
  $('pfSkin').textContent=(SKINS.find(s=>s.id===Save.data.skin)||{}).name||'Classic';
  $('pfCStars').textContent=Save.data.classicStars||0;
  $('pfRankStars').textContent=info.current_stars;
  $('pfTier').textContent=info.icon+' '+info.rank_name;
  $('pfCh').textContent=challengeClears()+' / '+CHALLENGES.length;
  $('pfTrial').textContent=bestOverallTrial().replace('BEST ','');
  const n=$('pfName');if(n)n.textContent=Save.data.playerName||(window.WaveDashLeaderboard&&WaveDashLeaderboard.getPlayerName&&WaveDashLeaderboard.getPlayerName())||'Pilot';
}
function updateMenu(){
  $('mCoins').textContent=fmt(Save.data.coins);
  $('mDiamonds').textContent=fmt(Save.data.diamonds);
  $('mStars').textContent=Save.data.classicStars||0;
  const info=RankSys.fromStars(Save.data.rankStars);
  $('mRank').textContent=info.rank_name;
}
function todayKey(){const d=new Date();return d.getFullYear()+'-'+(d.getMonth()+1)+'-'+d.getDate();}
function openDaily(){const k=todayKey();const claimed=Save.data.daily.last===k;const streak=Save.data.daily.streak||0;
  const nextR=[100,150,200,250,300,400,500][Math.min(6,streak)];const gemR=streak>=6?1:0;
  $('dailyBody').innerHTML=`Streak: <b>${streak}</b> day${streak===1?'':'s'}<br>Today's reward:<br><span style="font-size:22px">🪙 ${nextR}${gemR?' + 💎 '+gemR:''}</span>`;
  const btn=$('dailyClaim');btn.disabled=claimed;btn.textContent=claimed?' Claimed Today':'Claim ';
  btn.onclick=()=>{if(claimed)return;addCoins(nextR);addDiamonds(gemR);
    Save.data.daily.streak=streak+1;Save.data.daily.last=k;Save.save();AM.play('unlock');
    UI.toast('Reward claimed');updateMenu();checkAch();openDaily();};}

function pauseGame(){if(Game.state!=='PLAYING')return;Game.state='PAUSED';Input.release();updatePauseSound();$('scr-pause').classList.add('active');AM.play('click');}
function resumeGame(){if(Game.state!=='PAUSED')return;Input.release();$('scr-pause').classList.remove('active');Game.state='PLAYING';AM.play('click');}
function updatePauseSound(){const b=$('pSound');if(b)b.textContent=AM.soundOn()?'🔊 SOUND ON':'🔇 SOUND OFF';}
function exitToMenu(){Game.state='MAIN_MENU';Input.release();$('hud').classList.remove('active');
  document.querySelectorAll('.screen.overlay').forEach(s=>s.classList.remove('active'));UI.show('menu');updateMenu();}
function toggleFS(){try{if(!document.fullscreenElement)(document.documentElement.requestFullscreen||document.documentElement.webkitRequestFullscreen).call(document.documentElement);else(document.exitFullscreen||document.webkitExitFullscreen).call(document);}catch(e){}}

let last=performance.now(),fpsCount=0,fpsT=0,fpsShown=0;
function loop(now){requestAnimationFrame(loop);
  let dt=(now-last)/1000;last=now;if(dt>.06)dt=.06;
  fpsCount++;fpsT+=dt;if(fpsT>=1){fpsShown=fpsCount;fpsCount=0;fpsT=0;$('fps').textContent='FPS '+fpsShown;}
  PS.update(dt);TrailSys.update(dt);
  if(Game.state==='PLAYING')Game.update(dt);
  if(Game.state==='PLAYING'||Game.state==='PAUSED'){ctx.clearRect(0,0,innerWidth,innerHeight);Game.draw();}
  else{ctx.clearRect(0,0,innerWidth,innerHeight);drawBG(Save.data.menuTheme,0,performance.now()/8);}
  if(Game.debug){const wb=Game.level?WallSys.boundsFor(Game.level):{top:'?',bot:'?'};$('debug').textContent=(Game.selfTestText||'')+'\n\n'+
    `state ${Game.state}\nmode ${Game.mode}\nfps ${fpsShown}\nplayer y=${Game.player?Game.player.y.toFixed(0):'-'}\n`+
    `scroll ${Game.scroll.toFixed(0)}\nprog ${(Game.progress*100).toFixed(1)}%\nlb ${Game.leaderboardStatus||'OFFLINE'}`;}
}

function initUI(){
  document.querySelectorAll('[data-go]').forEach(b=>b.addEventListener('click',()=>{
    const g=b.dataset.go;AM.play('click');AM.unlock();
    document.querySelectorAll('.screen.overlay').forEach(s=>s.classList.remove('active'));
    if(g==='menu'){exitToMenu();return;}
    if(g==='modes'){renderModes();UI.show('modes');return;}
    if(g==='garage'){renderGarage();UI.show('garage');return;}
    if(g==='shop'){renderShop();UI.show('shop');return;}
    if(g==='ach'){renderAch();UI.show('ach');return;}
    if(g==='settings'){renderSettings();UI.show('settings');return;}
  }));
  $('btnPlayClassic').onclick=()=>{AM.play('click');AM.unlock();
    const id=Save.data.selectedClassic||firstUnlockedLevel();
    const idx=LEVELS.findIndex(L=>L.id===id);
    Game.start(isLevelUnlocked(Math.max(0,idx))?id:firstUnlockedLevel(),'classic');};
  $('setBack').onclick=()=>{AM.play('click');if(Game.state==='PAUSED'){$('scr-settings').classList.remove('active');$('scr-pause').classList.add('active');}else{UI.show('menu');updateMenu();}};
  $('btnDaily').onclick=()=>{AM.play('click');openDaily();UI.show('daily');};
  $('btnProfile').onclick=()=>{AM.play('click');renderProfile();UI.show('profile');};
  $('btnFS').onclick=()=>{AM.play('click');toggleFS();};
  $('lvPrev').onclick=()=>{$('lvTrack').scrollBy({left:-260,behavior:'smooth'});};
  $('lvNext').onclick=()=>{$('lvTrack').scrollBy({left:260,behavior:'smooth'});};
  $('pauseBtn').onclick=(e)=>{e.stopPropagation();pauseGame();};
  $('pResume').onclick=resumeGame;
  $('pRestart').onclick=()=>{AM.play('click');const L=Game.level;$('scr-pause').classList.remove('active');
    if(Game.mode==='endless')Game.start(null,'endless');
    else if(Game.mode==='challenge')Game.start(null,'challenge',false,Game.challenge&&Game.challenge.id);
    else Game.start(L.id,Game.mode,Game.practice);};
  $('pSound').onclick=()=>{AM.play('click');AM.setSound(!AM.soundOn());updatePauseSound();};
  $('pExit').onclick=()=>{AM.play('click');exitToMenu();};
  $('ovRetry').onclick=()=>{AM.play('click');$('scr-over').classList.remove('active');
    if(Game.mode==='endless')Game.start(null,'endless');else Game.start(Game.level.id,Game.mode,Game.practice);};
  $('ovLevels').onclick=()=>{AM.play('click');$('scr-over').classList.remove('active');openLevelSelect(Game.mode==='classic'?'classic':Game.mode);};
  $('wRetry').onclick=()=>{AM.play('click');$('scr-win').classList.remove('active');Game.start(Game.level.id,Game.mode,Game.practice);};
  $('wLevels').onclick=()=>{AM.play('click');$('scr-win').classList.remove('active');openLevelSelect('classic');};
  $('wNext').onclick=()=>{AM.play('click');$('scr-win').classList.remove('active');
    const cur=LEVELS.findIndex(L=>L.id===Game.level.id);if(cur>=0&&cur<LEVELS.length-1)Game.start(LEVELS[cur+1].id,'classic');
    else openLevelSelect('classic');};
  $('btnReset').onclick=()=>{UI.confirm('Are you sure you want to delete all progress?',(yes)=>{if(yes){Save.reset();AM.play('unlock');UI.toast('Progress reset');updateMenu();renderSettings();}});};
  document.body.addEventListener('click',()=>AM.unlock(),{once:true});
  document.body.addEventListener('touchstart',()=>AM.unlock(),{once:true,passive:true});
  const check=Game.selfTest();console.info(check.text);Game.selfTestText=check.text;
}

/* ============================================================
 * LEADERBOARD + SUPABASE (v2, offline-safe)
 * ============================================================ */
(function(){
  'use strict';
  const SUPABASE_CONFIG={
    url:'https://einkvxbteupjmipmlsng.supabase.co',
    anonKey:'sb_publishable_w-0_FDl6jFnR4HsyWKR5PA_f-FRZ7iH'
  };
  const ID_KEY='wavedash_player_id_v1';
  const NAME_KEY='wavedash_player_name_v1';
  const LB_CACHE_KEY='wavedash_lb_v2_';
  const LB_PAGE=40;
  let supabaseClient=null,supabaseLoading=null,submitting=false;
  let state={board:'rank',page:0,loading:false,hasMore:true,rows:[],myRank:null,status:'OFFLINE',lastRequest:0};

  const BOARDS=[
    {id:'rank',label:'RANK',cols:['Rank','Player','Tier','⭐ Stars']},
    {id:'classic',label:'CLASSIC',cols:['Rank','Player','Classic ⭐','Levels']},
    {id:'endless',label:'ENDLESS',cols:['Rank','Player','Score','Distance']},
    {id:'trial',label:'TRIAL',cols:['Rank','Player','Best Time','Level']},
    {id:'challenge',label:'CHALLENGE',cols:['Rank','Player','Clears','Score']},
    {id:'coins',label:'COINS',cols:['Rank','Player','🪙 Coins']},
    {id:'diamonds',label:'DIAMONDS',cols:['Rank','Player','💎 Diamonds']}
  ];

  function sanitizeName(value){
    return String(value||'').normalize('NFKC').replace(/[\u0000-\u001F\u007F]/g,'').replace(/[<>`"'\\]/g,'').replace(/\s+/g,' ').trim().slice(0,16);
  }
  function validName(v){return /^[A-Za-z0-9 _.-]{3,16}$/.test(v);}
  function makePlayerId(){
    const bytes=new Uint8Array(8);
    if(window.crypto&&crypto.getRandomValues){crypto.getRandomValues(bytes);return 'player_'+Array.from(bytes).map(x=>x.toString(16).padStart(2,'0')).join('');}
    return 'player_'+Math.random().toString(36).slice(2,12);
  }
  function getPlayerId(){
    let id='';try{id=localStorage.getItem(ID_KEY)||'';}catch(e){}
    if(!/^player_[a-z0-9]{8,32}$/i.test(id)){id=makePlayerId();try{localStorage.setItem(ID_KEY,id);}catch(e){}}
    return id;
  }
  function getPlayerName(){
    let name='';try{name=sanitizeName(localStorage.getItem(NAME_KEY)||Save.data.playerName||'');}catch(e){}
    return validName(name)?name:'';
  }
  function setPlayerName(name){
    const clean=sanitizeName(name);if(!validName(clean))return false;
    try{localStorage.setItem(NAME_KEY,clean);}catch(e){}
    Save.data.playerName=clean;Save.save();return true;
  }
  const NameModal=(function(){
    let resolver=null,allowCancel=true;
    function showError(msg){const e=$('nameErr');if(e)e.textContent=msg||'';const inp=$('nameInput');if(inp)inp.classList.toggle('bad',!!msg);}
    function close(value){const m=$('nameModal');if(m)m.classList.remove('open');document.removeEventListener('keydown',onKey,true);const r=resolver;resolver=null;if(r)r(value);}
    function confirm(){const inp=$('nameInput');const clean=sanitizeName(inp?inp.value:'');
      if(!validName(clean)){showError('Callsign must be 3–16 characters: letters, numbers, spaces, ".", "-" or "_".');try{if(inp)inp.focus();}catch(_){}return;}
      showError('');close(clean);}
    function onKey(e){if(e.key==='Enter'){e.preventDefault();confirm();}else if(e.key==='Escape'){e.preventDefault();if(allowCancel)close(null);}}
    function open(opts){
      opts=opts||{};const m=$('nameModal');if(!m)return Promise.resolve(null);
      allowCancel=opts.allowCancel!==false;
      const title=$('nameTitle');if(title)title.textContent=opts.title||'NEW PILOT';
      const inp=$('nameInput');if(inp){inp.value=opts.value||'';inp.classList.remove('bad');}showError('');
      const cancelBtn=$('nameCancel');if(cancelBtn){cancelBtn.style.display=allowCancel?'':'none';cancelBtn.onclick=()=>close(null);}
      const okBtn=$('nameOk');if(okBtn)okBtn.onclick=confirm;
      m.onclick=(e)=>{if(e.target===m&&allowCancel)close(null);};
      if(inp)inp.oninput=()=>showError('');
      m.classList.add('open');document.addEventListener('keydown',onKey,true);
      setTimeout(()=>{try{if(inp){inp.focus();inp.select();}}catch(_){}},60);
      return new Promise(res=>{resolver=res;});
    }
    return{open};
  })();
  async function askPlayerName(force){
    const existing=getPlayerName();if(existing&&!force)return existing;
    const entered=await NameModal.open({title:existing?'EDIT CALLSIGN':'NEW PILOT',value:existing||'',allowCancel:!!existing});
    if(entered){setPlayerName(entered);return entered;}
    if(existing)return existing;setPlayerName('Pilot');return 'Pilot';
  }

  function withTimeout(promise,ms,fallback){return Promise.race([Promise.resolve(promise).catch(()=>fallback),new Promise(res=>setTimeout(()=>res(fallback),ms))]);}
  async function loadSupabase(){
    if(supabaseClient)return supabaseClient;
    if(!SUPABASE_CONFIG.url||!SUPABASE_CONFIG.anonKey)return null;
    if(supabaseLoading)return supabaseLoading;
    supabaseLoading=new Promise(resolve=>{
      function make(){try{supabaseClient=window.supabase.createClient(SUPABASE_CONFIG.url,SUPABASE_CONFIG.anonKey,{auth:{persistSession:true,autoRefreshToken:true}});resolve(supabaseClient);}catch(e){resolve(null);}}
      if(window.supabase){make();return;}
      const script=document.createElement('script');script.src='https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';script.async=true;
      script.onload=make;script.onerror=()=>resolve(null);
      setTimeout(()=>{if(!supabaseClient)resolve(null);},12000);
      document.head.appendChild(script);
    });
    return supabaseLoading;
  }
  async function ensureAnonymousSession(client){
    if(!client)return null;
    try{
      const session=await withTimeout(client.auth.getSession(),8000,null);
      if(session&&session.data&&session.data.session&&session.data.session.user)return session.data.session.user.id;
      const result=await withTimeout(client.auth.signInAnonymously(),10000,null);
      if(result&&result.data&&result.data.session&&result.data.session.user)return result.data.session.user.id;
      if(result&&result.data&&result.data.user)return result.data.user.id;
      return null;
    }catch(e){return null;}
  }

  function localPayload(){
    const info=RankSys.fromStars(Save.data.rankStars);
    let bestTime=null;for(const r of Object.values(Save.data.timeTrial||{})){const t=+r.bestTimeMs||0;if(t>0&&(bestTime==null||t<bestTime))bestTime=t;}
    return {
      player_id:getPlayerId(),
      display_name:getPlayerName()||'Pilot',
      avatar:/^[a-z0-9_-]{1,32}$/i.test(String(Save.data.skin||'classic'))?String(Save.data.skin):'classic',
      coins:Math.max(0,Math.floor(Save.data.coins||0)),
      diamonds:Math.max(0,Math.floor(Save.data.diamonds||0)),
      classic_stars:Math.max(0,Math.floor(Save.data.classicStars||0)),
      rank_stars:Math.max(0,Math.floor(Save.data.rankStars||0)),
      rank_tier:info.rank_id,
      endless_best:Math.max(0,Math.floor(Save.data.endlessBest||0)),
      challenge_clears:challengeClears(),
      total_score:Math.max(0,Math.floor(Save.data.stats.score||0)),
      total_distance:Math.max(0,Math.floor(Save.data.stats.dist||0)),
      levels_completed:Math.max(0,Math.floor(Save.data.stats.done||0)),
      best_time_ms:bestTime,
      mode:Game.mode||'classic',
      level_id:(Game.level&&Number.isFinite(+Game.level.id))?+Game.level.id:0,
      score:Math.max(0,Math.floor(Game.score||0)),
      progress:Math.max(0,Math.min(100,Math.floor((Game.progress||0)*100))),
      time_ms:Math.max(0,Math.round((Game.elapsed||0)*1000)),
      stars:clamp(CLASSIC_CONFIG.evaluateStars(Game),0,3),
      result:Game.state==='LEVEL_COMPLETE'?'win':'death'
    };
  }

  async function submitLeaderboardRecord(reason){
    if(submitting)return;if(!Save||!Save.data)return;
    if(ModeSys.isPractice(Game.mode)&&reason!=='profile'&&reason!=='ach-claim'&&reason!=='boot-retry')return;
    submitting=true;
    const payload=localPayload();
    try{
      const client=await loadSupabase();
      if(!client){queue(payload,reason);return;}
      const uid=await ensureAnonymousSession(client);
      const fn=rpcNameFor(Game.mode,reason);
      let result=null;
      if(fn){result=await withTimeout(client.rpc(fn,{p:Object.assign({owner_uid:uid},payload)}),12000,null);}
      if(!result||result.error){
        result=await withTimeout(client.from('wave_dash_players').upsert({
          id:payload.player_id,display_name:payload.display_name,avatar:payload.avatar,
          best_score:payload.score,best_distance:payload.total_distance,best_level:payload.levels_completed,
          best_mode:payload.mode==='classic'?'classic':payload.mode,total_wins:payload.levels_completed,
          games_played:Save.data.stats.plays||0,coins:payload.coins,owner_uid:uid||undefined
        },{onConflict:'id'}),12000,null);
      }
      if(!result||result.error){queue(payload,reason);state.status='ERROR';}
      else{Save.data._pendingSync=false;state.status='SUCCESS';Save.save();}
    }catch(e){queue(payload,reason);state.status='ERROR';}
    finally{submitting=false;}
  }
  function rpcNameFor(mode,reason){
    if(reason==='ach-claim')return 'claim_achievement_reward';
    if(reason==='profile')return 'update_player_profile';
    if(mode==='classic')return 'submit_classic_result';
    if(mode==='rank')return 'submit_rank_result';
    if(mode==='endless')return 'submit_endless_result';
    if(mode==='time_trial')return 'submit_time_trial';
    if(mode==='challenge')return 'submit_challenge_result';
    return 'submit_classic_result';
  }
  function queue(payload,reason){
    Save.data._pendingSync=true;
    Save.data.pendingRuns=(Save.data.pendingRuns||[]).slice(-20).concat([{reason,payload,at:Date.now()}]);
    Save.save();
  }

  function renderTabs(){
    const t=$('lbTabs');if(!t|| t.childElementCount) return;
    t.innerHTML='';
    BOARDS.forEach(b=>{
      const el=document.createElement('button');el.className='lbtab'+(state.board===b.id?' on':'');el.textContent=b.label;
      el.onclick=()=>{AM.play('click');state.board=b.id;document.querySelectorAll('.lbtab').forEach(x=>x.classList.toggle('on',x.textContent===b.label));loadLeaderboard(true);};
      t.appendChild(el);
    });
  }
  function setStatus(msg,err){
    const s=$('lbStatus');if(!s)return;s.textContent=msg;s.style.color=err?'#ff8a96':'';
    const r=$('lbRetry');if(r)r.style.display=err?'':'none';
    const chip=$('lbOnline');if(chip)chip.textContent=state.status;
  }
  function cache(rows){try{localStorage.setItem(LB_CACHE_KEY+state.board,JSON.stringify({savedAt:Date.now(),rows:rows.slice(0,100)}));}catch(e){}}
  function readCache(){try{const p=JSON.parse(localStorage.getItem(LB_CACHE_KEY+state.board)||'null');if(p&&Array.isArray(p.rows))return p.rows;}catch(e){}return null;}

  function paintRows(rows,append){
    const root=$('lbRows');if(!root)return;
    if(!append)root.innerHTML='';
    const board=BOARDS.find(b=>b.id===state.board)||BOARDS[0];
    const head=$('lbHead');if(head)head.innerHTML=board.cols.map(c=>'<div>'+esc(c)+'</div>').join('');
    const myId=getPlayerId();
    rows.forEach((row,index)=>{
      const rank=Number(row.rank)||(state.page*LB_PAGE+index+1);
      const el=document.createElement('div');
      el.className='lbrow'+(row.player_id===myId||row.id===myId?' lbme':'')+(rank===1?' lbtop1':rank===2?' lbtop2':rank===3?' lbtop3':'');
      const name=sanitizeName(row.display_name||row.player||'')||'Pilot';
      let cells=['#'+rank,name];
      if(state.board==='rank')cells=[rank===1?'🥇':rank===2?'🥈':rank===3?'🥉':'#'+rank,name,(row.rank_tier||row.tier||'warrior').toUpperCase(),String(row.rank_stars||row.stars||0)];
      else if(state.board==='classic')cells=['#'+rank,name,String(row.classic_stars||0),String(row.levels_completed||0)];
      else if(state.board==='endless')cells=['#'+rank,name,fmt(row.endless_best||row.best_score||0),fmt(row.total_distance||row.best_distance||0)+' m'];
      else if(state.board==='trial')cells=[rank===1?'🥇':rank===2?'🥈':rank===3?'🥉':'#'+rank,name,fmtTime(row.best_time_ms||row.time_ms),String(row.level_id||'')];
      else if(state.board==='challenge')cells=['#'+rank,name,String(row.challenge_clears||0),fmt(row.total_score||0)];
      else if(state.board==='coins')cells=['#'+rank,name,fmt(row.coins||0)];
      else if(state.board==='diamonds')cells=['#'+rank,name,fmt(row.diamonds||0)];
      cells.forEach((v,i)=>{const d=document.createElement('div');if(i===0)d.className='lbrank';if(i===1)d.className='lbname';if(i===2)d.className='lbscore';d.textContent=String(v);el.appendChild(d);});
      root.appendChild(el);
    });
  }
  function paintYou(rank,metric){
    const el=$('lbYou');if(!el)return;
    const name=getPlayerName()||'Pilot';
    el.textContent=rank==null?('YOUR RANK  —  '+name):('YOUR RANK  #'+rank+'  '+name+(metric?('  ·  '+metric):''));
  }

  async function loadLeaderboard(reset){
    if(state.loading)return;if(Date.now()-state.lastRequest<700)return;
    state.lastRequest=Date.now();state.loading=true;renderTabs();
    if(reset){state.page=0;state.rows=[];state.hasMore=true;$('lbRows').innerHTML='';}
    setStatus(reset?'LOADING RANKING':'LOADING MORE',false);
    const client=await loadSupabase();
    const rpc={'rank':'get_rank_leaderboard','classic':'get_classic_leaderboard','endless':'get_endless_leaderboard','trial':'get_time_trial_leaderboard','challenge':'get_challenge_leaderboard','coins':'get_coin_leaderboard','diamonds':'get_diamond_leaderboard'}[state.board];
    try{
      if(!client)throw new Error('offline');
      let rows=[];
      const result=await withTimeout(client.rpc(rpc,{p_limit:LB_PAGE,p_offset:state.page*LB_PAGE}),12000,null);
      if(result&&!result.error&&Array.isArray(result.data))rows=result.data;
      else{
        const q=await withTimeout(client.from('wd_player_stats').select('player_id,coins,diamonds,classic_stars,rank_stars,rank_tier,endless_best,challenge_clears,total_score,total_distance,levels_completed,best_time_ms,wd_profiles(display_name)').limit(LB_PAGE).range(state.page*LB_PAGE,state.page*LB_PAGE+LB_PAGE-1),12000,null);
        if(q&&!q.error&&Array.isArray(q.data))rows=q.data.map((r,i)=>({rank:state.page*LB_PAGE+i+1,player_id:r.player_id,display_name:r.wd_profiles&&r.wd_profiles.display_name,...r}));
        else{
          const legacy=await withTimeout(client.from('wave_dash_players').select('id,display_name,best_score,best_distance,best_level,coins,total_wins').order('best_score',{ascending:false}).range(state.page*LB_PAGE,state.page*LB_PAGE+LB_PAGE-1),12000,null);
          if(legacy&&!legacy.error&&Array.isArray(legacy.data))rows=legacy.data.map((r,i)=>({rank:state.page*LB_PAGE+i+1,player_id:r.id,display_name:r.display_name,endless_best:r.best_score,total_distance:r.best_distance,levels_completed:r.best_level,coins:r.coins,classic_stars:r.total_wins}));
          else throw (result&&result.error)||new Error('unavailable');
        }
      }
      if(reset)state.rows=rows;else state.rows=state.rows.concat(rows);
      paintRows(rows,!reset);cache(state.rows);
      state.hasMore=rows.length===LB_PAGE;state.page++;state.status='SUCCESS';
      setStatus(state.rows.length?'RANKING UPDATED':'NO PLAYERS YET',false);
      if(Save.data._pendingSync)submitLeaderboardRecord('retry');
      await loadMyRank(true);
    }catch(e){
      const cached=readCache();
      if(reset&&cached&&cached.length){state.rows=cached;paintRows(cached,false);state.status='OFFLINE';setStatus('OFFLINE  SHOWING LAST SAVED RANKING',false);}
      else{state.status='ERROR';setStatus('Leaderboard is temporarily unavailable. Check your connection and retry.',true);}
      paintYou(null);
    }
    state.loading=false;
  }
  async function loadMyRank(silent){
    const client=await loadSupabase();
    if(!client){paintYou(null);return null;}
    try{
      const result=await withTimeout(client.rpc('get_player_rank',{p_player_id:getPlayerId(),p_board:state.board}),9000,null);
      const value=result&&(Array.isArray(result.data)?result.data[0]:result.data);
      const rank=Number(value&&(value.rank||value.player_rank||value.position));
      state.myRank=Number.isFinite(rank)?rank:null;
      const pf=$('pfRank');if(pf)pf.textContent=state.myRank!=null?('#'+state.myRank):'—';
      paintYou(state.myRank);
      if(!silent&&state.myRank!=null)UI.toast('Your rank: #'+state.myRank);
      return state.myRank;
    }catch(e){paintYou(null);return null;}
  }

  function install(){
    renderTabs();
    $('btnLeaderboard').onclick=()=>{AM.play('click');UI.show('leaderboard');loadLeaderboard(true);};
    $('lbRefresh').onclick=()=>{if(Date.now()-state.lastRequest<1500)return;loadLeaderboard(true);};
    $('lbMore').onclick=()=>{if(!state.loading&&state.hasMore)loadLeaderboard(false);};
    $('lbRetry').onclick=()=>{$('lbRetry').style.display='none';loadLeaderboard(true);};
    const btn=$('pfEditName');
    if(btn)btn.onclick=()=>{AM.play('click');NameModal.open({title:'EDIT CALLSIGN',value:getPlayerName()||'Pilot',allowCancel:true}).then(name=>{
      if(!name)return;setPlayerName(name);renderProfile();UI.toast('Callsign updated: '+name);submitLeaderboardRecord('profile');
    });};
    const name=getPlayerName();
    if(!name)setTimeout(()=>{askPlayerName(false);},1200);
    else{Save.data.playerName=name;Save.save();}
    Object.defineProperty(Game,'leaderboardStatus',{configurable:true,get(){return state.status;},set(){}});
    window.WaveDashLeaderboard={
      open(){UI.show('leaderboard');loadLeaderboard(true);},
      refresh(){loadLeaderboard(true);},
      submit(reason){return submitLeaderboardRecord(reason||'manual');},
      getPlayerId,getPlayerName,rename(){return askPlayerName(true);},
      status:()=>state.status
    };
  }
  const originalInitUI=initUI;
  initUI=function(){originalInitUI();install();};
})();

let INIT_STAGE='BOOT';
(function boot(){
  setTimeout(function(){if(!window.__WAVE_DASH_READY__)if(typeof window.__showInitError==='function')window.__showInitError('WATCHDOG','Initialization timed out. Check your connection and reload.','');},15000);
  function setStage(s){INIT_STAGE=s;const el=document.getElementById('bootTxt');if(el)el.textContent=s.replace(/_/g,' ')+'...';}
  function fatal(stage,err){const msg=(err&&(err.message||err.toString()))||String(err);console.error('[WAVE DASH INIT ERROR]',stage,err);
    if(typeof window.__showInitError==='function')window.__showInitError(stage,msg,'');}
  function stage(id,fn){setStage(id);fn();}
  try{stage('SAVE',function(){Save.load();});}catch(e){return fatal('SAVE',e);}
  try{stage('RESIZE',function(){resize();});}catch(e){return fatal('RESIZE',e);}
  try{stage('GAME_INIT',function(){Game.init&&Game.init();});}catch(e){return fatal('GAME_INIT',e);}
  try{stage('INPUT_INIT',function(){Input.init&&Input.init();});}catch(e){return fatal('INPUT_INIT',e);}
  try{stage('UI_INIT',function(){initUI();});}catch(e){return fatal('UI_INIT',e);}
  try{setStage('READY');$('fps').style.display=Save.data.settings.showFps?'block':'none';
    setTimeout(function(){$('scr-boot').classList.remove('active');UI.show('menu');updateMenu();Game.state='MAIN_MENU';},0);
    window.__WAVE_DASH_READY__=true;requestAnimationFrame(loop);
    setTimeout(function(){try{if(Save.data&&Save.data._pendingSync&&window.WaveDashLeaderboard)WaveDashLeaderboard.submit('boot-retry');}catch(e){}},4000);
  }catch(e){return fatal('READY',e);}
})();
})();
})();
