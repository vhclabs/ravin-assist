CREATE TABLE IF NOT EXISTS public.webhook_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  level text NOT NULL DEFAULT 'info',
  source text NOT NULL DEFAULT 'whatsapp',
  event text,
  instance_name text,
  phone text,
  message_id text,
  stage text NOT NULL,
  summary text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb
);

ALTER TABLE public.webhook_logs ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_webhook_logs_created_at ON public.webhook_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_phone_created_at ON public.webhook_logs(phone, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_stage_created_at ON public.webhook_logs(stage, created_at DESC);