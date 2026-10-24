-- Notificação push: uma linha por aparelho inscrito.
--
-- O CRM avisa o time quando o lead responde. Guardar isso em coluna jsonb
-- (organizations.settings) economizaria uma tabela, mas o endpoint do push
-- precisa ser único (a mesma inscrição não pode entrar duas vezes) e o aparelho
-- morto precisa sair da lista sozinho — as duas coisas pedem índice e chave.
--
-- Acesso: só pelo service role (as rotas /api/push usam o admin client). Sem
-- policy de RLS, o `authenticated` não enxerga as inscrições de ninguém.

create table if not exists public.push_subscriptions (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id         uuid references auth.users(id) on delete set null,
  endpoint        text not null,
  p256dh          text not null,
  auth            text not null,
  aparelho        text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create unique index if not exists push_subscriptions_endpoint_uq
  on public.push_subscriptions (endpoint);

create index if not exists push_subscriptions_org_idx
  on public.push_subscriptions (organization_id);

alter table public.push_subscriptions enable row level security;
