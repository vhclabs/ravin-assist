
-- Agent settings (singleton-ish key/value) + pending confirmation state per phone
CREATE TABLE IF NOT EXISTS public.kv_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.kv_settings ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.agent_pending (
  phone text PRIMARY KEY,
  action jsonb NOT NULL,
  summary text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.agent_pending ENABLE ROW LEVEL SECURITY;

-- Seed master phone for Denis
INSERT INTO public.kv_settings(key, value) VALUES
  ('agent_master_phone', '"5512991899010"'::jsonb)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
