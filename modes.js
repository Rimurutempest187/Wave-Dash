/* WAVE DASH - modes.js : canonical registry for all six modes + ModeManager facade.
 * Runtime Game.mode stays authoritative inside js/app.js; this facade delegates to it. */
'use strict';
const MODES = {
  CLASSIC:{id:'classic',name:'CLASSIC',desc:'Level progression',rewards:{classicStars:true,rankStars:false,coins:true,diamonds:true},leaderboard:'stars'},
  RANK:{id:'rank',name:'RANK',desc:'Competitive',rewards:{classicStars:false,rankStars:true,coins:true,diamonds:true},leaderboard:'rank_stars'},
  ENDLESS:{id:'endless',name:'ENDLESS',desc:'Infinite run',rewards:{classicStars:false,rankStars:false,coins:true,diamonds:false},leaderboard:'score'},
  TIME_TRIAL:{id:'timetrial',name:'TIME TRIAL',desc:'Fastest finish',rewards:{classicStars:false,rankStars:false,coins:true,diamonds:true},leaderboard:'time_ms',lowerIsBetter:true},
  PRACTICE:{id:'practice',name:'PRACTICE',desc:'Checkpoint training - NO REWARDS',rewards:{classicStars:false,rankStars:false,coins:false,diamonds:false},leaderboard:null},
  CHALLENGE:{id:'challenge',name:'CHALLENGE',desc:'Special modifiers',rewards:{classicStars:false,rankStars:false,coins:true,diamonds:true},leaderboard:'clears'}
};
const CHALLENGE_DEFS=[
  {id:'mirror',name:'Mirror Control',mods:{mirror:true}},{id:'gravity',name:'Gravity',mods:{gravity:1.6}},
  {id:'fast',name:'Fast',mods:{speed:1.4}},{id:'lowgravity',name:'Low Gravity',mods:{gravity:0.55}},
  {id:'reverse',name:'Reverse',mods:{reverse:true}},{id:'chaos',name:'Chaos',mods:{mirror:true,gravity:1.3,speed:1.25}}
];
const ModeManager={defs:MODES,challenges:CHALLENGE_DEFS,_mode:'classic',
  get current(){return (typeof window!=='undefined'&&window.__WD_MODE__)?window.__WD_MODE__:this._mode;},
  set(id){this._mode=id;},is(id){return this.current===id;},rewards(id){return (MODES[id]||MODES.CLASSIC).rewards;}};
