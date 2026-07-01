-- Run this entire file in the Supabase SQL Editor (once).
-- It creates the api_logs table and the api_stats() function used by GET /api/v1/stats.

CREATE TABLE public.api_logs (
  id           bigserial PRIMARY KEY,
  created_at   timestamptz DEFAULT now() NOT NULL,
  endpoint     text NOT NULL,
  query_params jsonb,
  result_count integer,
  response_ms  integer,
  ip           text
);

CREATE INDEX api_logs_created_at_idx ON public.api_logs (created_at DESC);

-- After running this script, enable RLS on api_logs via the Supabase UI:
-- Table Editor → api_logs → toggle "Enable RLS" in the top-right.

CREATE OR REPLACE FUNCTION api_stats() RETURNS json AS $$
  SELECT json_build_object(
    'requests_per_hour_last_24h', COALESCE(
      (SELECT json_agg(r ORDER BY r.hour DESC) FROM (
        SELECT date_trunc('hour', created_at) AS hour, COUNT(*) AS count
        FROM api_logs WHERE created_at > now() - interval '24 hours'
        GROUP BY hour
      ) r),
      '[]'::json
    ),
    'totals', (
      SELECT json_build_object(
        'last_24h', COUNT(*) FILTER (WHERE created_at > now() - interval '24 hours'),
        'last_7d',  COUNT(*) FILTER (WHERE created_at > now() - interval '7 days')
      ) FROM api_logs
    ),
    'avg_response_ms_last_24h', (
      SELECT ROUND(AVG(response_ms))
      FROM api_logs
      WHERE created_at > now() - interval '24 hours'
        AND response_ms IS NOT NULL
    ),
    'top_endpoints_last_7d', COALESCE(
      (SELECT json_agg(t ORDER BY t.count DESC) FROM (
        SELECT endpoint, COUNT(*) AS count
        FROM api_logs
        WHERE created_at > now() - interval '7 days'
        GROUP BY endpoint
        ORDER BY count DESC
        LIMIT 10
      ) t),
      '[]'::json
    )
  );
$$ LANGUAGE sql STABLE;
