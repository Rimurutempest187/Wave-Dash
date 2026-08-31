/* WAVE DASH - game.js
 * The core engine (single requestAnimationFrame loop, player physics, collision,
 * camera, particles, trail, rendering, HUD) is implemented in js/app.js as the `Game`
 * object inside the shared scope, to preserve exact working behavior. Exactly ONE
 * authoritative gameplay loop exists. This module documents that boundary. */
'use strict';
