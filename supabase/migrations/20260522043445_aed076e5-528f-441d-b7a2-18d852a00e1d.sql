
-- Enum de papéis
CREATE TYPE public.app_role AS ENUM ('master', 'vendedor');

-- Enum de status do lead
CREATE TYPE public.lead_status AS ENUM ('novo', 'qualificado', 'proposta', 'negociacao', 'fechado', 'perdido');

-- Enum de status de task
CREATE TYPE public.task_status AS ENUM ('pendente', 'em_andamento', 'concluida', 'cancelada');

-- Enum de status de instancia WA
CREATE TYPE public.wa_instance_status AS ENUM ('desconectado', 'conectando', 'conectado', 'erro');

-- ============================================
-- USERS (autenticação por passcode)
-- ============================================
CREATE TABLE public.app_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  passcode TEXT NOT NULL UNIQUE,
  role app_role NOT NULL DEFAULT 'vendedor',
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Master inicial: Denis
INSERT INTO public.app_users (name, passcode, role) VALUES ('Denis', 'manu2107@', 'master');

-- ============================================
-- PRODUCTS (estoque)
-- ============================================
CREATE TABLE public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sku TEXT,
  description TEXT NOT NULL,
  ncm TEXT,
  unit TEXT NOT NULL DEFAULT 'UN',
  qty_per_box INTEGER NOT NULL DEFAULT 1,
  unit_price NUMERIC(12,4) NOT NULL DEFAULT 0,
  ipi_pct NUMERIC(5,2) NOT NULL DEFAULT 6.5,
  stock INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_products_description ON public.products USING gin (to_tsvector('portuguese', description));

-- ============================================
-- EMAIL recipients & templates
-- ============================================
CREATE TABLE public.email_recipients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  tags TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.email_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================
-- LEADS (CRM)
-- ============================================
CREATE TABLE public.leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT,
  phone TEXT UNIQUE,
  company TEXT,
  cnpj TEXT,
  email TEXT,
  status lead_status NOT NULL DEFAULT 'novo',
  origin TEXT DEFAULT 'manual',
  owner_id UUID REFERENCES public.app_users(id) ON DELETE SET NULL,
  score INTEGER DEFAULT 0,
  next_followup_at TIMESTAMPTZ,
  last_interaction_at TIMESTAMPTZ DEFAULT now(),
  unread_count INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_leads_phone ON public.leads(phone);
CREATE INDEX idx_leads_status ON public.leads(status);
CREATE INDEX idx_leads_followup ON public.leads(next_followup_at);

CREATE TABLE public.lead_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  author_id UUID REFERENCES public.app_users(id) ON DELETE SET NULL,
  kind TEXT NOT NULL DEFAULT 'note', -- note | status_change | system
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_lead_notes_lead ON public.lead_notes(lead_id, created_at DESC);

-- ============================================
-- TASKS (to-dos)
-- ============================================
CREATE TABLE public.tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  lead_id UUID REFERENCES public.leads(id) ON DELETE CASCADE,
  assignee_id UUID REFERENCES public.app_users(id) ON DELETE SET NULL,
  status task_status NOT NULL DEFAULT 'pendente',
  due_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_tasks_due ON public.tasks(due_at);
CREATE INDEX idx_tasks_lead ON public.tasks(lead_id);

-- ============================================
-- WHATSAPP (Evolution API)
-- ============================================
CREATE TABLE public.wa_instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_name TEXT NOT NULL UNIQUE,
  api_token TEXT,
  status wa_instance_status NOT NULL DEFAULT 'desconectado',
  phone_number TEXT,
  owner_id UUID REFERENCES public.app_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.wa_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_name TEXT NOT NULL,
  lead_id UUID REFERENCES public.leads(id) ON DELETE CASCADE,
  remote_jid TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('in','out')),
  message_id TEXT,
  content TEXT,
  message_type TEXT DEFAULT 'text',
  raw JSONB,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_wa_messages_lead ON public.wa_messages(lead_id, timestamp DESC);
CREATE INDEX idx_wa_messages_jid ON public.wa_messages(remote_jid);

-- ============================================
-- ORDERS (migra de localStorage)
-- ============================================
CREATE TABLE public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  number TEXT,
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  client_data JSONB NOT NULL,
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  totals JSONB NOT NULL DEFAULT '{}'::jsonb,
  email_subject TEXT,
  email_body TEXT,
  status TEXT NOT NULL DEFAULT 'rascunho',
  created_by UUID REFERENCES public.app_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_orders_created ON public.orders(created_at DESC);
CREATE INDEX idx_orders_lead ON public.orders(lead_id);

-- ============================================
-- TRIGGER updated_at
-- ============================================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER trg_app_users_updated BEFORE UPDATE ON public.app_users FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_products_updated BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_email_templates_updated BEFORE UPDATE ON public.email_templates FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_leads_updated BEFORE UPDATE ON public.leads FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_tasks_updated BEFORE UPDATE ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_wa_instances_updated BEFORE UPDATE ON public.wa_instances FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_orders_updated BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================
-- RLS — sistema acessa via service role server-side
-- ============================================
ALTER TABLE public.app_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wa_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wa_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

-- Sem policies = sem acesso anônimo. Todo acesso é via server functions com service role.

-- ============================================
-- REALTIME
-- ============================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.leads;
ALTER PUBLICATION supabase_realtime ADD TABLE public.wa_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.tasks;
ALTER PUBLICATION supabase_realtime ADD TABLE public.wa_instances;
