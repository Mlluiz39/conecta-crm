-- Captação de leads por formulário/landing/anúncio + supressão (opt-out).
--
-- 1) `lead_capture_sources`: uma fonte pública por organização, com token opaco.
--    O endereço é `/api/captacao/<token>` e aceita POST JSON ou form-urlencoded.
--    O token é a credencial da fonte: quem tem a URL cria lead naquela organização.
--    A tela permite desativar e apagar a fonte sem perder os leads já captados.
--
-- 2) `contact_suppressions`: quem pediu para não receber mais. Vale para telefone
--    e e-mail, não só para o contato atual — se o mesmo número voltar por uma
--    importação nova, continua bloqueado até alguém remover a supressão de propósito.
--
-- RLS: fonte é configuração (membro lê, admin/gerente administra). Supressão é
-- operação (qualquer membro lê e gerencia), porque quem atende também precisa
-- conseguir marcar "não contatar" e desfazer um engano.

create table if not exists public.lead_capture_sources (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name            text not null,
  token           text not null unique,
  stage_id        uuid references public.pipeline_stages(id) on delete set null,
  is_active       boolean not null default true,
  created_by      uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists lead_capture_sources_org_idx
  on public.lead_capture_sources (organization_id, created_at desc);

create table if not exists public.contact_suppressions (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  contact_id      uuid references public.contacts(id) on delete set null,
  phone           text,
  email           text,
  reason          text not null default 'pedido_do_lead',
  source          text not null default 'manual'
                  check (source in ('whatsapp', 'email', 'manual', 'import')),
  created_by      uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  -- A linha precisa identificar alguém: contato, telefone ou e-mail.
  constraint contact_suppressions_alvo
    check (contact_id is not null or phone is not null or email is not null)
);

create unique index if not exists contact_suppressions_org_phone_uq
  on public.contact_suppressions (organization_id, phone) where phone is not null;

create unique index if not exists contact_suppressions_org_email_uq
  on public.contact_suppressions (organization_id, lower(email)) where email is not null;

create index if not exists contact_suppressions_contact_idx
  on public.contact_suppressions (organization_id, contact_id);

drop trigger if exists trg_lead_capture_sources_updated on public.lead_capture_sources;
create trigger trg_lead_capture_sources_updated
  before update on public.lead_capture_sources
  for each row execute function public.set_updated_at();

alter table public.lead_capture_sources enable row level security;

drop policy if exists lead_capture_sources_select on public.lead_capture_sources;
create policy lead_capture_sources_select on public.lead_capture_sources
  for select to authenticated
  using (public.is_org_member(organization_id));

drop policy if exists lead_capture_sources_manage on public.lead_capture_sources;
create policy lead_capture_sources_manage on public.lead_capture_sources
  for all to authenticated
  using (public.has_org_role(organization_id, array['admin','gerente']::user_role[]))
  with check (public.has_org_role(organization_id, array['admin','gerente']::user_role[]));

alter table public.contact_suppressions enable row level security;

drop policy if exists contact_suppressions_member_all on public.contact_suppressions;
create policy contact_suppressions_member_all on public.contact_suppressions
  for all to authenticated
  using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));
