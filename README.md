# WAVE DASH
Mobile-first HTML5 Canvas neon arcade game - vanilla HTML/CSS/JS, no build step, GitHub Pages ready.

## Features
6 modes (Classic / Rank / Endless / Time Trial / Practice / Challenge), Coins+Diamonds economy,
Equipment (skins/trails/death effects/themes), Shop, Achievements (LOCKED->COMPLETED->CLAIMED),
Leaderboard, Rank tiers (Warrior->Mythic), versioned localStorage save with old-save migration.

## Controls
Mobile: hold = rise, release = fall (landscape preferred). Desktop: mouse / Space / click.

## Supabase (optional)
1. Create a project at https://supabase.com
2. Run `supabase/schema.sql` in the SQL editor (tables, RLS, RPC, leaderboards)
3. Edit `js/supabase.js`: set `SUPABASE_URL` + `SUPABASE_ANON_KEY` (public anon key only - never service_role)
Without config the game runs 100% offline with local save.

## GitHub Pages
`.github/workflows/deploy.yml` deploys `main` automatically.
Repo Settings -> Pages -> Source = "GitHub Actions".

## Security
Only the public anon key client-side. Rewards/currency go through server-validated
`security definer` RPC functions; RLS restricts private progress.
