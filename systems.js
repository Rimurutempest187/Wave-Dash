/* WAVE DASH - systems.js
 * Save data, migration (gems->diamonds, speedBest->time trial), rewards, rank,
 * achievements, checkpoints, equipment and shop logic live in js/app.js (shared game
 * scope). This module documents that boundary for maintainers. */
'use strict';
const Systems = { get save(){ return (typeof window!=='undefined'&&window.__WD_SAVE__)?window.__WD_SAVE__:null; } };
