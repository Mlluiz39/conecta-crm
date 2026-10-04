-- ════════════════════════════════════════════════════════════════════
-- RLS multi-tenant por organization_id
-- Helpers SECURITY DEFINER STABLE (bypassam RLS, evitam recursão em profiles)
-- ════════════════════════════════════════════════════════════════════
create schema if not exists app;

create or replace function app.current_org_id() returns uuid
language sql stable security definer set search_path = public as $$
  select organization_id from profiles where id = auth.uid()
$$;

create or replace function app.current_role() returns user_role
language sql stable security definer set search_path = public as $$
  select role from profiles where id = auth.uid()
$$;

create or replace function app.is_org_member(org uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and organization_id = org and is_active
  )
$$;

create or replace function app.has_role(org uuid, roles user_role[]) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and organization_id = org and is_active and role = any(roles)
  )
$$;

grant usage on schema app to authenticated;
grant execute on all functions in schema app to authenticated;

-- ── Trigger: novo auth.users → profiles ─────────────────────────────
-- Single-org: todo convidado cai na organização provisionada (UUID do seed).
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  seeded_org uuid;
  desired_role user_role;
begin
  -- Se só existe uma org (single-org provisionada), usa ela.
  select id into seeded_org from organizations order by created_at limit 1;

  desired_role := coalesce(
    (new.raw_user_meta_data->>'role')::user_role,
    'atendente'
  );

  insert into profiles (id, organization_id, role, full_name, email)
  values (
    new.id,
    seeded_org,
    desired_role,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    new.email
  )
  on conflict (id) do nothing;

  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ════════════════════════════════════════════════════════════════════
-- Policies — member (select/insert/update) + admin/gerente (delete)
-- ════════════════════════════════════════════════════════════════════
do $$
declare
  t text;
  member_tables text[] := array[
    'contacts','tags','contact_tags','activities','opportunities',
    'conversations','conversation_tags','messages','appointments',
    'appointment_reminders'
  ];
begin
  foreach t in array member_tables loop
    execute format('alter table %I enable row level security', t);
    execute format($f$
      create policy %1$s_select on %1$I for select
        using (app.is_org_member(organization_id));
      create policy %1$s_insert on %1$I for insert
        with check (app.is_org_member(organization_id));
      create policy %1$s_update on %1$I for update
        using (app.is_org_member(organization_id))
        with check (app.is_org_member(organization_id));
      create policy %1$s_delete on %1$I for delete
        using (app.has_role(organization_id, array['admin','gerente']::user_role[]));
    $f$, t);
  end loop;
end $$;

-- ── Configuração: escrita só admin|gerente, leitura member ──────────
do $$
declare
  t text;
  admin_write text[] := array[
    'agents','agent_prompt_versions','agent_channels','agent_tools',
    'agent_handoff_rules','whatsapp_templates','reminder_rules',
    'kb_collections','kb_documents','custom_field_defs','loss_reasons',
    'pipeline_stages'
  ];
begin
  foreach t in array admin_write loop
    execute format('alter table %I enable row level security', t);
    execute format($f$
      create policy %1$s_select on %1$I for select
        using (app.is_org_member(organization_id));
      create policy %1$s_write on %1$I for all
        using (app.has_role(organization_id, array['admin','gerente']::user_role[]))
        with check (app.has_role(organization_id, array['admin','gerente']::user_role[]));
    $f$, t);
  end loop;
end $$;

-- ── profiles ────────────────────────────────────────────────────────
alter table profiles enable row level security;
create policy profiles_select on profiles for select
  using (id = auth.uid() or app.is_org_member(organization_id));
create policy profiles_update_self on profiles for update
  using (id = auth.uid()) with check (id = auth.uid());
create policy profiles_admin on profiles for all
  using (app.has_role(organization_id, array['admin']::user_role[]))
  with check (app.has_role(organization_id, array['admin']::user_role[]));

-- ── organizations / integrations: só admin escreve ──────────────────
alter table organizations enable row level security;
create policy organizations_select on organizations for select
  using (app.is_org_member(id));
create policy organizations_admin on organizations for all
  using (app.has_role(id, array['admin']::user_role[]))
  with check (app.has_role(id, array['admin']::user_role[]));

alter table integrations enable row level security;
create policy integrations_select on integrations for select
  using (app.has_role(organization_id, array['admin','gerente']::user_role[]));
create policy integrations_admin on integrations for all
  using (app.has_role(organization_id, array['admin']::user_role[]))
  with check (app.has_role(organization_id, array['admin']::user_role[]));

-- ── Leitura pública (presets e templates globais) ───────────────────
alter table business_presets enable row level security;
create policy business_presets_read on business_presets for select using (true);

alter table agent_templates enable row level security;
create policy agent_templates_read on agent_templates for select
  using (organization_id is null or app.is_org_member(organization_id));
create policy agent_templates_write on agent_templates for all
  using (organization_id is not null and app.has_role(organization_id, array['admin','gerente']::user_role[]))
  with check (organization_id is not null and app.has_role(organization_id, array['admin','gerente']::user_role[]));

-- ── Server-only (RLS ligada, SEM policy p/ authenticated) ───────────
-- Escrita via service_role apenas (webhook, engine, cron).
alter table webhook_events  enable row level security;
alter table message_outbox  enable row level security;
alter table ai_runs         enable row level security;
-- leitura admin|gerente para auditoria
create policy ai_runs_select on ai_runs for select
  using (app.has_role(organization_id, array['admin','gerente']::user_role[]));
create policy webhook_events_select on webhook_events for select
  using (organization_id is not null and app.has_role(organization_id, array['admin','gerente']::user_role[]));
