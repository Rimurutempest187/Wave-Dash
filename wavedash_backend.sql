-- ═══════════════════════════════════════════════════════════════════
--  WAVE DASH — ONLINE GLOBAL LEADERBOARD BACKEND
--  Built to match index.html client contract EXACTLY.
--
--  Run this ENTIRE script ONCE in:
--    Supabase Dashboard → SQL Editor → New query → Paste → Run
--
--  Client contract implemented here (read directly from index.html):
--    • Read RPCs   : get_rank_leaderboard / get_classic_leaderboard /
--                    get_endless_leaderboard / get_time_trial_leaderboard /
--                    get_challenge_leaderboard / get_coin_leaderboard /
--                    get_diamond_leaderboard   (args: p_limit int, p_offset int)
--    • Rank RPC    : get_player_rank(p_player_id text, p_board text)
--    • Submit RPCs : submit_classic_result / submit_rank_result /
--                    submit_endless_result / submit_time_trial /
--                    submit_challenge_result / update_player_profile /
--                    claim_achievement_reward  (arg: p jsonb)
--    • Tables      : wd_profiles(player_id, display_name, avatar)
--                    wd_player_stats(player_id, coins, diamonds,
--                      classic_stars, rank_stars, rank_tier, endless_best,
--                      challenge_clears, total_score, total_distance,
--                      levels_completed, best_time_ms)
--                    wave_dash_players(id, display_name, avatar, best_score,
--                      best_distance, best_level, best_mode, total_wins,
--                      games_played, coins, owner_uid)  ← legacy fallback
--    • Player ID format: 'player_' + 16 hex chars  (client generated)
--    • Submit payload keys (jsonb p): player_id, display_name, avatar,
--      coins, diamonds, classic_stars, rank_stars, rank_tier, endless_best,
--      challenge_clears, total_score, total_distance, levels_completed,
--      best_time_ms, mode, level_id, score, progress, time_ms, stars, result
--
--  Security model:
--    • Anonymous sign-ins DISABLED → all calls arrive as role `anon`
--    • No direct table writes for anon (RLS blocks them)
--    • All writes go through SECURITY DEFINER RPCs that validate and
--      clamp every value server-side (anti-cheat basics)
--    • anon gets SELECT on tables (read-only fallback path in client)
--      and EXECUTE on the RPCs only
--    • Only the publishable/anon key is ever used in the frontend.
--      NEVER put the service-role key in index.html.
-- ═══════════════════════════════════════════════════════════════════

BEGIN;

-- ─────────────────────────── 1. TABLES ───────────────────────────

-- 1.1 Player profile (display name + avatar shown on the boards)
CREATE TABLE IF NOT EXISTS public.wd_profiles (
  player_id    text PRIMARY KEY,
  display_name text NOT NULL DEFAULT 'Pilot',
  avatar       text NOT NULL DEFAULT 'classic',
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- 1.2 Aggregated player statistics (drives every leaderboard board)
CREATE TABLE IF NOT EXISTS public.wd_player_stats (
  player_id        text PRIMARY KEY REFERENCES public.wd_profiles(player_id) ON DELETE CASCADE,
  coins            integer   NOT NULL DEFAULT 0 CHECK (coins >= 0),
  diamonds         integer   NOT NULL DEFAULT 0 CHECK (diamonds >= 0),
  classic_stars    integer   NOT NULL DEFAULT 0 CHECK (classic_stars >= 0),
  rank_stars       integer   NOT NULL DEFAULT 0 CHECK (rank_stars >= 0),
  rank_tier        text      NOT NULL DEFAULT 'warrior',
  endless_best     integer   NOT NULL DEFAULT 0 CHECK (endless_best >= 0),
  challenge_clears integer   NOT NULL DEFAULT 0 CHECK (challenge_clears >= 0),
  total_score      bigint    NOT NULL DEFAULT 0 CHECK (total_score >= 0),
  total_distance   bigint    NOT NULL DEFAULT 0 CHECK (total_distance >= 0),
  levels_completed integer   NOT NULL DEFAULT 0 CHECK (levels_completed >= 0),
  best_time_ms     integer   CHECK (best_time_ms IS NULL OR best_time_ms > 0),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- 1.3 Individual run history (per-mode score log: audit + anti-cheat trail)
CREATE TABLE IF NOT EXISTS public.wd_runs (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  player_id  text NOT NULL REFERENCES public.wd_profiles(player_id) ON DELETE CASCADE,
  mode       text NOT NULL CHECK (mode IN ('classic','rank','endless','time_trial','challenge')),
  level_id   integer NOT NULL DEFAULT 0,
  score      integer NOT NULL DEFAULT 0 CHECK (score >= 0),
  progress   integer NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  time_ms    integer NOT NULL DEFAULT 0 CHECK (time_ms >= 0),
  stars      integer NOT NULL DEFAULT 0 CHECK (stars BETWEEN 0 AND 3),
  result     text NOT NULL DEFAULT 'death' CHECK (result IN ('win','death')),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 1.4 Legacy table the client falls back to when RPCs are unreachable.
--     (The client selects id,display_name,best_score,best_distance,
--      best_level,best_mode,total_wins,games_played,coins from it.)
CREATE TABLE IF NOT EXISTS public.wave_dash_players (
  id            text PRIMARY KEY,
  display_name  text NOT NULL DEFAULT 'Pilot',
  avatar        text NOT NULL DEFAULT 'classic',
  best_score    integer NOT NULL DEFAULT 0 CHECK (best_score >= 0),
  best_distance bigint  NOT NULL DEFAULT 0 CHECK (best_distance >= 0),
  best_level    integer NOT NULL DEFAULT 0 CHECK (best_level >= 0),
  best_mode     text    NOT NULL DEFAULT 'classic',
  total_wins    integer NOT NULL DEFAULT 0 CHECK (total_wins >= 0),
  games_played  integer NOT NULL DEFAULT 0 CHECK (games_played >= 0),
  coins         integer NOT NULL DEFAULT 0 CHECK (coins >= 0),
  owner_uid     uuid,
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- ─────────────────────────── 2. INDEXES ───────────────────────────
-- Ranking sort orders, all high → low (best_time_ms: low → high)

CREATE INDEX IF NOT EXISTS wd_stats_rank_stars_idx       ON public.wd_player_stats (rank_stars DESC, player_id);
CREATE INDEX IF NOT EXISTS wd_stats_classic_stars_idx    ON public.wd_player_stats (classic_stars DESC, levels_completed DESC, player_id);
CREATE INDEX IF NOT EXISTS wd_stats_endless_best_idx     ON public.wd_player_stats (endless_best DESC, player_id);
CREATE INDEX IF NOT EXISTS wd_stats_challenge_idx        ON public.wd_player_stats (challenge_clears DESC, total_score DESC, player_id);
CREATE INDEX IF NOT EXISTS wd_stats_coins_idx            ON public.wd_player_stats (coins DESC, player_id);
CREATE INDEX IF NOT EXISTS wd_stats_diamonds_idx         ON public.wd_player_stats (diamonds DESC, player_id);
CREATE INDEX IF NOT EXISTS wd_stats_best_time_idx        ON public.wd_player_stats (best_time_ms ASC) WHERE best_time_ms IS NOT NULL;
CREATE INDEX IF NOT EXISTS wd_runs_player_mode_idx       ON public.wd_runs (player_id, mode, created_at DESC);
CREATE INDEX IF NOT EXISTS wdp_best_score_idx            ON public.wave_dash_players (best_score DESC, id);

-- ─────────────────── 3. ROW LEVEL SECURITY (RLS) ───────────────────

ALTER TABLE public.wd_profiles       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wd_player_stats   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wd_runs           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wave_dash_players ENABLE ROW LEVEL SECURITY;

-- Everyone (anon, publishable key) may READ leaderboards
DROP POLICY IF EXISTS wd_profiles_select   ON public.wd_profiles;
CREATE POLICY wd_profiles_select ON public.wd_profiles
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS wd_stats_select      ON public.wd_player_stats;
CREATE POLICY wd_stats_select ON public.wd_player_stats
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS wd_runs_select       ON public.wd_runs;
CREATE POLICY wd_runs_select ON public.wd_runs
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS wdp_select           ON public.wave_dash_players;
CREATE POLICY wdp_select ON public.wave_dash_players
  FOR SELECT TO anon, authenticated USING (true);

-- NO INSERT/UPDATE/DELETE policies for anon: direct writes are DENIED.
-- All mutations flow through the SECURITY DEFINER RPCs below, which
-- validate + clamp every value before touching the tables.

-- ───────────────── 4. INTERNAL UPSERT (shared by all submits) ─────────────────

CREATE OR REPLACE FUNCTION public._wd_upsert(p jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id     text := left(COALESCE(p->>'player_id',''), 64);
  v_name   text;
  v_avatar text;
  v_time   integer;
BEGIN
  -- Validate player identity (client generates 'player_' + hex)
  IF v_id !~ '^player_[a-zA-Z0-9]{6,32}$' THEN
    RAISE EXCEPTION 'invalid player_id';
  END IF;

  -- Sanitize display name the same way the client does (3–16 safe chars)
  v_name := left(btrim(regexp_replace(COALESCE(p->>'display_name','Pilot'),'[<>`"''\\]','','g')), 16);
  IF v_name = '' THEN v_name := 'Pilot'; END IF;
  v_avatar := left(regexp_replace(COALESCE(p->>'avatar','classic'),'[^a-zA-Z0-9_-]','','g'), 32);
  IF v_avatar = '' THEN v_avatar := 'classic'; END IF;

  -- Clamp incoming time (0 means "no time")
  v_time := NULLIF(GREATEST(LEAST(COALESCE((p->>'best_time_ms')::int,0), 3600000),0),0);

  -- Profile (name / avatar always refresh)
  INSERT INTO public.wd_profiles (player_id, display_name, avatar, updated_at)
  VALUES (v_id, v_name, v_avatar, now())
  ON CONFLICT (player_id) DO UPDATE
    SET display_name = EXCLUDED.display_name,
        avatar       = EXCLUDED.avatar,
        updated_at   = now();

  -- Stats: monotonic "best-so-far" merge — scores can only improve
  INSERT INTO public.wd_player_stats AS s (
    player_id, coins, diamonds, classic_stars, rank_stars, rank_tier,
    endless_best, challenge_clears, total_score, total_distance,
    levels_completed, best_time_ms, updated_at
  ) VALUES (
    v_id,
    LEAST(GREATEST(COALESCE((p->>'coins')::int,0),0), 100000000),
    LEAST(GREATEST(COALESCE((p->>'diamonds')::int,0),0), 100000000),
    LEAST(GREATEST(COALESCE((p->>'classic_stars')::int,0),0), 10000),
    LEAST(GREATEST(COALESCE((p->>'rank_stars')::int,0),0), 10000),
    left(COALESCE(p->>'rank_tier','warrior'), 32),
    LEAST(GREATEST(COALESCE((p->>'endless_best')::int,0),0), 1000000000),
    LEAST(GREATEST(COALESCE((p->>'challenge_clears')::int,0),0), 10000),
    LEAST(GREATEST(COALESCE((p->>'total_score')::bigint,0),0), 1000000000000),
    LEAST(GREATEST(COALESCE((p->>'total_distance')::bigint,0),0), 1000000000000),
    LEAST(GREATEST(COALESCE((p->>'levels_completed')::int,0),0), 10000),
    v_time,
    now()
  )
  ON CONFLICT (player_id) DO UPDATE SET
    coins            = GREATEST(s.coins,            EXCLUDED.coins),
    diamonds         = GREATEST(s.diamonds,         EXCLUDED.diamonds),
    classic_stars    = GREATEST(s.classic_stars,    EXCLUDED.classic_stars),
    rank_stars       = GREATEST(s.rank_stars,       EXCLUDED.rank_stars),
    rank_tier        = EXCLUDED.rank_tier,
    endless_best     = GREATEST(s.endless_best,     EXCLUDED.endless_best),
    challenge_clears = GREATEST(s.challenge_clears, EXCLUDED.challenge_clears),
    total_score      = GREATEST(s.total_score,      EXCLUDED.total_score),
    total_distance   = GREATEST(s.total_distance,   EXCLUDED.total_distance),
    levels_completed = GREATEST(s.levels_completed, EXCLUDED.levels_completed),
    best_time_ms     = CASE
                         WHEN s.best_time_ms IS NULL THEN EXCLUDED.best_time_ms
                         WHEN EXCLUDED.best_time_ms IS NULL THEN s.best_time_ms
                         ELSE LEAST(s.best_time_ms, EXCLUDED.best_time_ms)
                       END,
    updated_at       = now();

  -- Legacy fallback table (kept in sync so the client's 3rd path works)
  INSERT INTO public.wave_dash_players AS w (
    id, display_name, avatar, best_score, best_distance, best_level,
    best_mode, total_wins, games_played, coins, updated_at
  ) VALUES (
    v_id, v_name, v_avatar,
    LEAST(GREATEST(COALESCE((p->>'score')::int,0),0), 1000000000),
    LEAST(GREATEST(COALESCE((p->>'total_distance')::bigint,0),0), 1000000000000),
    LEAST(GREATEST(COALESCE((p->>'levels_completed')::int,0),0), 10000),
    left(COALESCE(p->>'mode','classic'), 20),
    LEAST(GREATEST(COALESCE((p->>'levels_completed')::int,0),0), 10000),
    1,
    LEAST(GREATEST(COALESCE((p->>'coins')::int,0),0), 100000000),
    now()
  )
  ON CONFLICT (id) DO UPDATE SET
    display_name  = EXCLUDED.display_name,
    avatar        = EXCLUDED.avatar,
    best_score    = GREATEST(w.best_score,    EXCLUDED.best_score),
    best_distance = GREATEST(w.best_distance, EXCLUDED.best_distance),
    best_level    = GREATEST(w.best_level,    EXCLUDED.best_level),
    best_mode     = EXCLUDED.best_mode,
    total_wins    = GREATEST(w.total_wins,    EXCLUDED.total_wins),
    games_played  = w.games_played + 1,
    coins         = GREATEST(w.coins,         EXCLUDED.coins),
    updated_at    = now();
END;
$$;

-- ───────────── 5. SCORE SUBMIT FUNCTIONS (RPC, one per mode) ─────────────
-- All take the full jsonb payload `p` exactly as the client sends it.

CREATE OR REPLACE FUNCTION public._wd_submit(p jsonb, v_mode text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public._wd_upsert(p);
  -- Record the individual run (skip for pure profile / achievement calls)
  IF v_mode IN ('classic','rank','endless','time_trial','challenge') THEN
    INSERT INTO public.wd_runs (player_id, mode, level_id, score, progress, time_ms, stars, result)
    VALUES (
      left(p->>'player_id', 64),
      v_mode,
      GREATEST(LEAST(COALESCE((p->>'level_id')::int,0), 100000), 0),
      LEAST(GREATEST(COALESCE((p->>'score')::int,0),0), 1000000000),
      GREATEST(LEAST(COALESCE((p->>'progress')::int,0), 100), 0),
      GREATEST(LEAST(COALESCE((p->>'time_ms')::int,0), 3600000), 0),
      GREATEST(LEAST(COALESCE((p->>'stars')::int,0), 3), 0),
      CASE WHEN p->>'result' = 'win' THEN 'win' ELSE 'death' END
    );
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_classic_result(p jsonb)    RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$ BEGIN PERFORM public._wd_submit(p, 'classic');    END; $$;
CREATE OR REPLACE FUNCTION public.submit_rank_result(p jsonb)       RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$ BEGIN PERFORM public._wd_submit(p, 'rank');       END; $$;
CREATE OR REPLACE FUNCTION public.submit_endless_result(p jsonb)    RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$ BEGIN PERFORM public._wd_submit(p, 'endless');    END; $$;
CREATE OR REPLACE FUNCTION public.submit_time_trial(p jsonb)        RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$ BEGIN PERFORM public._wd_submit(p, 'time_trial'); END; $$;
CREATE OR REPLACE FUNCTION public.submit_challenge_result(p jsonb)  RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$ BEGIN PERFORM public._wd_submit(p, 'challenge');  END; $$;
CREATE OR REPLACE FUNCTION public.update_player_profile(p jsonb)    RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$ BEGIN PERFORM public._wd_upsert(p); END; $$;
CREATE OR REPLACE FUNCTION public.claim_achievement_reward(p jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$ BEGIN PERFORM public._wd_upsert(p); END; $$;

-- ───────────── 6. LEADERBOARD FETCH FUNCTIONS (RPC, 7 boards) ─────────────
-- Each matches the column names the client's paintRows() reads.
-- Rank is computed server-side, highest score first (time trial: fastest first).

-- 6.1 RANK board — rank_stars DESC  → cols: rank, player_id, display_name, rank_tier, rank_stars
CREATE OR REPLACE FUNCTION public.get_rank_leaderboard(p_limit int DEFAULT 40, p_offset int DEFAULT 0)
RETURNS TABLE (rank bigint, player_id text, display_name text, rank_tier text, rank_stars integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT ROW_NUMBER() OVER (ORDER BY s.rank_stars DESC, s.total_score DESC, s.player_id),
         s.player_id, p.display_name, s.rank_tier, s.rank_stars
  FROM public.wd_player_stats s
  JOIN public.wd_profiles p ON p.player_id = s.player_id
  ORDER BY s.rank_stars DESC, s.total_score DESC, s.player_id
  LIMIT LEAST(GREATEST(p_limit,1),100) OFFSET GREATEST(p_offset,0);
$$;

-- 6.2 CLASSIC board — classic_stars DESC, levels_completed DESC → cols: rank, player_id, display_name, classic_stars, levels_completed
CREATE OR REPLACE FUNCTION public.get_classic_leaderboard(p_limit int DEFAULT 40, p_offset int DEFAULT 0)
RETURNS TABLE (rank bigint, player_id text, display_name text, classic_stars integer, levels_completed integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT ROW_NUMBER() OVER (ORDER BY s.classic_stars DESC, s.levels_completed DESC, s.player_id),
         s.player_id, p.display_name, s.classic_stars, s.levels_completed
  FROM public.wd_player_stats s
  JOIN public.wd_profiles p ON p.player_id = s.player_id
  ORDER BY s.classic_stars DESC, s.levels_completed DESC, s.player_id
  LIMIT LEAST(GREATEST(p_limit,1),100) OFFSET GREATEST(p_offset,0);
$$;

-- 6.3 ENDLESS board — endless_best DESC → cols: rank, player_id, display_name, endless_best, total_distance
CREATE OR REPLACE FUNCTION public.get_endless_leaderboard(p_limit int DEFAULT 40, p_offset int DEFAULT 0)
RETURNS TABLE (rank bigint, player_id text, display_name text, endless_best integer, total_distance bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT ROW_NUMBER() OVER (ORDER BY s.endless_best DESC, s.player_id),
         s.player_id, p.display_name, s.endless_best, s.total_distance
  FROM public.wd_player_stats s
  JOIN public.wd_profiles p ON p.player_id = s.player_id
  ORDER BY s.endless_best DESC, s.player_id
  LIMIT LEAST(GREATEST(p_limit,1),100) OFFSET GREATEST(p_offset,0);
$$;

-- 6.4 TIME TRIAL board — best_time_ms ASC (fastest first) → cols: rank, player_id, display_name, best_time_ms, level_id
CREATE OR REPLACE FUNCTION public.get_time_trial_leaderboard(p_limit int DEFAULT 40, p_offset int DEFAULT 0)
RETURNS TABLE (rank bigint, player_id text, display_name text, best_time_ms integer, level_id integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT ROW_NUMBER() OVER (ORDER BY s.best_time_ms ASC, s.player_id),
         s.player_id, p.display_name, s.best_time_ms, 0
  FROM public.wd_player_stats s
  JOIN public.wd_profiles p ON p.player_id = s.player_id
  WHERE s.best_time_ms IS NOT NULL
  ORDER BY s.best_time_ms ASC, s.player_id
  LIMIT LEAST(GREATEST(p_limit,1),100) OFFSET GREATEST(p_offset,0);
$$;

-- 6.5 CHALLENGE board — challenge_clears DESC → cols: rank, player_id, display_name, challenge_clears, total_score
CREATE OR REPLACE FUNCTION public.get_challenge_leaderboard(p_limit int DEFAULT 40, p_offset int DEFAULT 0)
RETURNS TABLE (rank bigint, player_id text, display_name text, challenge_clears integer, total_score bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT ROW_NUMBER() OVER (ORDER BY s.challenge_clears DESC, s.total_score DESC, s.player_id),
         s.player_id, p.display_name, s.challenge_clears, s.total_score
  FROM public.wd_player_stats s
  JOIN public.wd_profiles p ON p.player_id = s.player_id
  ORDER BY s.challenge_clears DESC, s.total_score DESC, s.player_id
  LIMIT LEAST(GREATEST(p_limit,1),100) OFFSET GREATEST(p_offset,0);
$$;

-- 6.6 COINS board — coins DESC → cols: rank, player_id, display_name, coins
CREATE OR REPLACE FUNCTION public.get_coin_leaderboard(p_limit int DEFAULT 40, p_offset int DEFAULT 0)
RETURNS TABLE (rank bigint, player_id text, display_name text, coins integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT ROW_NUMBER() OVER (ORDER BY s.coins DESC, s.player_id),
         s.player_id, p.display_name, s.coins
  FROM public.wd_player_stats s
  JOIN public.wd_profiles p ON p.player_id = s.player_id
  ORDER BY s.coins DESC, s.player_id
  LIMIT LEAST(GREATEST(p_limit,1),100) OFFSET GREATEST(p_offset,0);
$$;

-- 6.7 DIAMONDS board — diamonds DESC → cols: rank, player_id, display_name, diamonds
CREATE OR REPLACE FUNCTION public.get_diamond_leaderboard(p_limit int DEFAULT 40, p_offset int DEFAULT 0)
RETURNS TABLE (rank bigint, player_id text, display_name text, diamonds integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT ROW_NUMBER() OVER (ORDER BY s.diamonds DESC, s.player_id),
         s.player_id, p.display_name, s.diamonds
  FROM public.wd_player_stats s
  JOIN public.wd_profiles p ON p.player_id = s.player_id
  ORDER BY s.diamonds DESC, s.player_id
  LIMIT LEAST(GREATEST(p_limit,1),100) OFFSET GREATEST(p_offset,0);
$$;

-- ─────────────────── 7. PLAYER RANK FUNCTION ───────────────────
-- Returns the caller's rank on any board (client: loadMyRank)
-- Boards: rank | classic | endless | trial | challenge | coins | diamonds

CREATE OR REPLACE FUNCTION public.get_player_rank(p_player_id text, p_board text DEFAULT 'rank')
RETURNS TABLE (rank bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  CASE p_board
    WHEN 'rank' THEN
      RETURN QUERY SELECT t.r FROM (
        SELECT s.player_id, ROW_NUMBER() OVER (ORDER BY s.rank_stars DESC, s.total_score DESC, s.player_id) AS r
        FROM public.wd_player_stats s) t WHERE t.player_id = p_player_id;
    WHEN 'classic' THEN
      RETURN QUERY SELECT t.r FROM (
        SELECT s.player_id, ROW_NUMBER() OVER (ORDER BY s.classic_stars DESC, s.levels_completed DESC, s.player_id) AS r
        FROM public.wd_player_stats s) t WHERE t.player_id = p_player_id;
    WHEN 'endless' THEN
      RETURN QUERY SELECT t.r FROM (
        SELECT s.player_id, ROW_NUMBER() OVER (ORDER BY s.endless_best DESC, s.player_id) AS r
        FROM public.wd_player_stats s) t WHERE t.player_id = p_player_id;
    WHEN 'trial' THEN
      RETURN QUERY SELECT t.r FROM (
        SELECT s.player_id, ROW_NUMBER() OVER (ORDER BY s.best_time_ms ASC, s.player_id) AS r
        FROM public.wd_player_stats s WHERE s.best_time_ms IS NOT NULL) t WHERE t.player_id = p_player_id;
    WHEN 'challenge' THEN
      RETURN QUERY SELECT t.r FROM (
        SELECT s.player_id, ROW_NUMBER() OVER (ORDER BY s.challenge_clears DESC, s.total_score DESC, s.player_id) AS r
        FROM public.wd_player_stats s) t WHERE t.player_id = p_player_id;
    WHEN 'coins' THEN
      RETURN QUERY SELECT t.r FROM (
        SELECT s.player_id, ROW_NUMBER() OVER (ORDER BY s.coins DESC, s.player_id) AS r
        FROM public.wd_player_stats s) t WHERE t.player_id = p_player_id;
    WHEN 'diamonds' THEN
      RETURN QUERY SELECT t.r FROM (
        SELECT s.player_id, ROW_NUMBER() OVER (ORDER BY s.diamonds DESC, s.player_id) AS r
        FROM public.wd_player_stats s) t WHERE t.player_id = p_player_id;
    ELSE
      RETURN; -- unknown board → no rows → client shows "—"
  END CASE;
END;
$$;

-- ───────────────────── 8. PERMISSIONS (GRANTS) ─────────────────────
-- anon = the publishable key role used by the frontend.

-- Read-only table access (client fallback paths)
GRANT SELECT ON public.wd_profiles        TO anon, authenticated;
GRANT SELECT ON public.wd_player_stats    TO anon, authenticated;
GRANT SELECT ON public.wd_runs            TO anon, authenticated;
GRANT SELECT ON public.wave_dash_players  TO anon, authenticated;

-- RPC execution
GRANT EXECUTE ON FUNCTION public.submit_classic_result(jsonb)          TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_rank_result(jsonb)             TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_endless_result(jsonb)          TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_time_trial(jsonb)              TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_challenge_result(jsonb)        TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_player_profile(jsonb)          TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_achievement_reward(jsonb)       TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_rank_leaderboard(int,int)         TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_classic_leaderboard(int,int)      TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_endless_leaderboard(int,int)      TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_time_trial_leaderboard(int,int)   TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_challenge_leaderboard(int,int)    TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_coin_leaderboard(int,int)         TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_diamond_leaderboard(int,int)      TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_player_rank(text,text)            TO anon, authenticated;

-- Internal helpers stay NON-executable for anon (defense in depth)
REVOKE EXECUTE ON FUNCTION public._wd_upsert(jsonb)        FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._wd_submit(jsonb,text)   FROM anon, authenticated;

COMMIT;

-- ─────────────────────────── VERIFICATION ───────────────────────────
-- Run these afterwards (optional) to confirm everything exists:
--   SELECT routine_name FROM information_schema.routines
--     WHERE routine_schema='public' AND routine_name LIKE '%leaderboard%'
--        OR routine_name LIKE 'submit_%'  ORDER BY 1;
--   SELECT public.get_rank_leaderboard(10, 0);
--   SELECT public.submit_classic_result('{"player_id":"player_abc123","display_name":"SmokeTest","score":50,"mode":"classic","level_id":1,"progress":10,"time_ms":5000,"stars":1,"result":"death","coins":3,"diamonds":0,"classic_stars":1,"rank_stars":0,"rank_tier":"warrior","endless_best":0,"challenge_clears":0,"total_score":50,"total_distance":120,"levels_completed":0,"best_time_ms":null}'::jsonb);
--   SELECT * FROM public.get_classic_leaderboard(10,0);
--   -- cleanup the smoke-test row:
--   DELETE FROM public.wd_profiles WHERE player_id='player_abc123';
--   DELETE FROM public.wave_dash_players WHERE id='player_abc123';
