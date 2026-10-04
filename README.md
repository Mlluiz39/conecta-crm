# ConectaCRM

CRM multicanal com agentes de IA para PMEs brasileiras. Atende WhatsApp, Instagram e Messenger numa caixa de entrada unificada; agentes de IA configuráveis qualificam leads, agendam visitas e fazem handoff para atendentes humanos. Adaptável por tipo de negócio (imobiliária, e-commerce, clínica, agência) via presets.

## Stack

- **Frontend**: Next.js 14 (App Router), TypeScript, Tailwind CSS, Recharts, dnd-kit
- **Backend/Dados**: Next.js Route Handlers + Supabase (PostgreSQL, Auth, Realtime, RLS)
- **Mensageria**: camada abstrata `MessageProvider` + adapter Cernio (stub até credenciais)
- **IA**: Claude API (`@anthropic-ai/sdk`) com tool use; modelo configurável por agente
- **Calendário**: Google Calendar API (OAuth 2.0) — fase 2
- **Deploy**: Vercel

## Estrutura

```
src/
  app/                     # rotas (App Router)
    (auth)/login           # login e-mail+senha
    (dashboard)/           # shell com sidebar; guard de sessão
    api/webhooks/          # entrada Cernio
  components/              # ui, layout, módulos
  lib/
    supabase/              # client (browser), server (RLS), admin (service role)
    auth/                  # actions + session
  services/                # messaging, agents (engine/tools), calendar, knowledge
supabase/
  migrations/              # schema, RLS
  seed.sql                 # presets, templates de agente, org demo
```

## Setup local

```bash
npm install
cp .env.example .env.local     # preencha as chaves

# Supabase local (requer Supabase CLI)
supabase start
supabase db reset              # aplica migrations + seed
```

`db reset` cria a organização provisionada (single-org) e os presets. Crie o primeiro usuário admin:

```sql
-- Supabase Studio → Authentication → Add user (e-mail + senha),
-- depois promova a admin:
update profiles set role = 'admin' where email = 'voce@empresa.com.br';
```

```bash
npm run dev        # http://localhost:3000
```

## Deploy na Vercel

1. Importe o repositório na Vercel (framework detectado: Next.js).
2. Configure as variáveis de ambiente (Project → Settings → Environment Variables) a partir de `.env.example`:
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
   - `ANTHROPIC_API_KEY`, `ANTHROPIC_DEFAULT_MODEL`
   - `CERNIO_API_URL`, `CERNIO_API_KEY`, `CERNIO_WEBHOOK_SECRET`
   - `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`
   - `NEXT_PUBLIC_APP_URL`, `CRON_SECRET`
3. No Supabase → Authentication → URL Configuration, adicione o domínio da Vercel em Redirect URLs.
4. Deploy. Aponte o webhook da Cernio para `https://<seu-dominio>/api/webhooks/cernio`.

## Custos de referência

| Serviço | Plano inicial | Quando escalar |
|---|---|---|
| Vercel | Hobby (grátis) | Pro US$20/mês ao passar limites de banda/funções |
| Supabase | Free (500 MB, pausas) | Pro US$25/mês ao passar ~80% de DB/egress |
| Cernio | US$6/mês (até 3 canais) | conforme canais |
| Claude API | ~US$100/mês por volume | usar `claude-sonnet-5-5` / effort baixo em alto volume |

Estimativa inicial de operação: **< US$30/mês** até tração.

## Roadmap

- **Etapa 0 — Fundação** ✅ scaffold, schema+RLS, auth, layout
- **Etapa 1 — MVP** ✅ Inbox + Contatos + Pipeline + Agente IA end-to-end
- **Etapa 2** ✅ Calendário/Google + Relatórios
- **Etapa 3** ✅ Templates WhatsApp
- **Etapa 4** ✅ Presets multi-nicho + playground/"melhorar prompt" + preparação multi-org

## Documentação

- [Guia de integração — Cernio](docs/integracao-cernio.md)
- [Manual do cliente final](docs/manual-do-cliente.md)
