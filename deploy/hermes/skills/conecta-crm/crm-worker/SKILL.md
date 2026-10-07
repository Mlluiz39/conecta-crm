---
name: crm-worker
description: "Use when working with the MLLuiz ConectaCRM (Next.js + Supabase + Hermes Agent)."
version: 1.0.0
author: Hermes Agent
license: MIT
platforms: [linux]
metadata:
  hermes:
    tags: [crm, worker, prospecting, leads, whatsapp, hermes]
---

# CRM Worker — MLLuiz DevTech (ConectaCRM)

## Visão Geral

O CRM fica em `/home/mlluiz/Development/github/conecta-crm`. O servidor dev roda em `http://localhost:8081` (a 3001 fica ocupada por outro projeto). Stack: Next.js 14 App Router + Supabase (RLS, service-role) + outbox de mensagens.

**Arquitetura atual (migração Hermes):** o **Hermes Agent** é o cérebro do WhatsApp (gateway local, bridge Baileys na porta 3005); o CRM guarda histórico, contatos, pipeline e dispara prospecção. A Evolution API ficou dormant (webhook desativado) como fallback.

- HERMES_HOME do projeto: `/home/mlluiz/Development/github/conecta-crm/.hermes-home/.hermes`
- Binário: `.hermes-home/.local/bin/hermes` (exportado como `HERMES_BIN` no `.env.local`)
- Gateway: `hermes gateway run` (sessão WhatsApp persiste — não re-parear sem necessidade)

## Arquivos Principais

- `src/services/messaging/hermes.adapter.ts` — provider Hermes (envio via `hermes send` CLI)
- `src/services/messaging/evolution.adapter.ts` — provider Evolution (dormant, fallback)
- `src/services/messaging/inbound.service.ts` — webhook inbound + `flushOutbox()` (delay 1.5s entre envios)
- `src/services/messaging/index.ts` — registry: `hermes > evolution > zernio`
- `src/services/agents/engine.ts` — agente de resposta do CRM (conversas manuais/playground)
- `src/lib/data/actions.ts` — `prospectContacts()` (prospecção em lote, MAX 50), `sendHumanMessage`
- `src/app/(dashboard)/prospeccao/page.tsx` + `src/components/prospecting/ProspectPanel.tsx` — tela de prospecção
- `.env.local` — todos os secrets (Supabase, ANTHROPIC/9router, EVOLUTION_*, HERMES_*)
- `supabase/migrations/schema.sql` — schema completo (contacts, conversations, messages, channels)

## Comandos Essenciais

### Ambiente
```bash
export PATH=$PATH:/home/mlluiz/.nvm/versions/node/v24.21.0/bin
export npm_config_cache=/tmp/npm-cache
export HOME=/home/mlluiz/Development/github/conecta-crm/.hermes-home   # só p/ comandos hermes
```

### Subir o CRM (porta 8081)
```bash
cd /home/mlluiz/Development/github/conecta-crm && npx next dev -p 8081
```

### Validação (NUNCA rode `next build` com o dev rodando — corrompe `.next`)
```bash
npx tsc --noEmit                                        # typecheck
npx -y tsx src/services/agents/prompt.test.ts           # 5 testes
npx -y tsx src/services/agents/sanitizer.test.ts        # 5 testes
# build: mate o dev, rm -rf .next se preciso, depois:
npx -y next build
```

### Esvaziar outbox (mensagens pendentes → provedor)
```bash
curl -s http://localhost:8081/api/cron/outbox            # {"ok":true,"sent":N}
```

### Enviar mensagem direto pelo Hermes (sem LLM)
```bash
hermes send --to whatsapp:5511999999999@s.whatsapp.net "texto"
# jid completo (@lid/@s.whatsapp.net) passa direto; dígitos ganham 55 + @s.whatsapp.net
```

### Ler histórico real do Hermes (state.db — fonte da verdade)
```bash
node -e "
const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync(process.env.HERMES_HOME + '/state.db', { readOnly: true });
console.log(db.prepare('SELECT id, chat_id, display_name FROM sessions ORDER BY started_at DESC').all());
"
# sessions: source='whatsapp', session_key='agent:main:whatsapp:dm:<fone>'
# messages: role user|assistant, content, message_uid (dedupe)
```

### Status do gateway/bridge
```bash
curl -s http://127.0.0.1:3005/health    # {"status":"connected",...}
hermes gateway run                      # foreground (Ctrl+C p/ parar)
```

## Rotas da API

| Método | Rota | Auth | Descrição |
|---|---|---|---|
| POST | `/api/webhooks/[provider]` | assinatura/apikey | Inbound mensagens (evolution/zernio) |
| GET | `/api/cron/outbox` | `CRON_SECRET` Bearer | Flush da fila de saída (batch 20, 1.5s/envio) |
| GET | `/api/cron/reminders` | Bearer | Lembretes de calendário |
| POST | `/api/ai/playground` | sessão | Teste de agente no CRM |
| POST | `/api/ai/improve-prompt` | sessão | Reescrita de prompt |
| GET | `/api/export` | sessão | Exportação de dados |

## Fluxos

### Outbox (padrão)
1. Ação grava mensagem `status='pendente'` → 2. `flushOutbox(n)` lê fila (order created_at) → 3. `provider.sendText()` → 4. ok = `enviada` (com `external_id`), erro = tentativa+1 em `media.attempts` (máx 3) → 5. cron/outbox cobre resto.

### Prospecção
1. Tela `/prospeccao` → 2. `prospectContacts(ids, texto)` (renderiza `{{nome}}`/`{{primeiro_nome}}`) → 3. upsert conversa `manual_<contactId>` → 4. insere `pendente` → 5. `flushOutbox(min(n,50))` → 6. banner "X na fila · Y enviadas".

### WhatsApp via Hermes (novo caminho)
1. Cliente manda msg → 2. bridge Hermes (Baileys, porta 3005) → 3. agente Hermes responde (persona SOUL.md + skills) → 4. tudo grava em `~/.hermes/state.db` → 5. CRM espelha via sync (pendente: `hermes-sync`).

## Pitfalls

- **`next build` com dev rodando** corrompe `.next` (`Cannot find module './chunks/vendor-chunks/next.js'`). Mate o dev, `rm -rf .next`, build, suba de novo.
- **Porta 3000 e 3001 ocupadas** (serviços externos). CRM = 8081, bridge Hermes = 3005 (`platforms.whatsapp.extra.bridge_port`).
- **WhatsApp LID**: replies chegam como `9139723972837@lid`; envio aceita o jid completo; dígitos puros dão `400 exists:false`. Matching de contato: exato → sufixo 9 dígitos → nome (ilike).
- **Evento Evolution** chega `messages.upsert` (ponto) — parser normaliza com `.replace(/\./g,"_")`.
- **Baileys desconecta em rajada** — por isso o delay de 1.5s no outbox; Evolution oscilava `open↔close` (motivo da migração ao Hermes).
- **Nunca parear WhatsApp de novo** sem derrubar a sessão anterior — linked device duplicado derruba o anterior.
- Skills do Hermes em `.hermes-home/.hermes/skills/<categoria>/<skill>/SKILL.md` (frontmatter `name/description` + corpo).
- `.hermes/` (código-fonte do Hermes) e `.hermes-home/` são locais — não commitar (ver `.gitignore`).

## Segurança

- `SUPABASE_SERVICE_ROLE_KEY` só server-side (`createAdminClient`); nunca em componente client.
- `CRON_SECRET` obrigatório nas rotas cron (Bearer).
- Tokens Hermes (`~/.hermes/.env`) nunca em logs/respostas.
- RLS sempre ativa nas tabelas; o service-role é a única exceção auditada.

## Estado conhecido

- Org única: `00000000-0000-0000-0000-000000000001`.
- Canal "WhatsApp Evolution" (`b34d08fa-…`) ainda com `config.provider='evolution'` — trocar para `hermes` quando a prospecção usar o Hermes.
- Webhook Evolution desativado (não duplicar respostas).
- Pendências: sync `state.db`→Supabase, provider prospecção Hermes, log de debug do webhook (`rawBody < 4000`).

---

# Prospecção com agente (novo)

## Importar leads
Tela `/prospeccao` → painel **Importar leads** (colar lista ou CSV).
Formato: `Nome; Telefone; E-mail; Empresa; Cidade` (também aceita vírgula/tab; cabeçalho ignorado;
telefone normalizado para `55...`). Duplicados (telefone ou e-mail) são pulados.
Parser em `src/lib/data/lead-parser.ts` (testes: `lead-parser.test.ts`, roda com `node --test`).

## Agente prospecta
Painel **Agente prospecta por mim**: informa oferta/objetivo/instruções → o agente escreve a
primeira abordagem por lead (Hermes CLI one-shot) e envia.
- Com telefone → WhatsApp via outbox (`messages.status='pendente'` → `flushOutbox`).
- Sem telefone e com e-mail → Gmail API (requer migration `20261005_email_channel_gmail_tokens.sql`
  aplicada e Google reconectado em `/conexoes`).
- Quem já recebeu mensagem nossa (`direction='out'`) **não** é recontatado.
- Máx. 10 leads por rodada: cada mensagem é gerada na hora (~5-20s por lead).

## Follow-up de fechamento
`GET /api/cron/prospect-followup?hours=24&limit=5[&dryRun=1&offer=...&goal=...]`
Retoma leads que receberam o primeiro contato e não responderam (1 retomada por lead; controle em
`contacts.custom_fields.followup`). Regras puras em `src/services/prospecting/followup-rules.ts`
(testes: `followup-rules.test.ts`). Também disponível na UI (botão "ver quem é elegível" / "enviar follow-up").
Agendado no `vercel.json` a cada 6h.

## Arquivos-chave
- `src/services/prospecting/agent-outreach.ts` — gera primeira mensagem, e-mail (assunto+corpo) e follow-up.
- `src/services/prospecting/followup.service.ts` — seleção/enfileiramento dos follow-ups.
- `src/services/email/gmail.ts` — envio por Gmail + refresh de token + `gmailStatus`.
- `src/lib/data/actions.ts` — `importLeads`, `prospectWithAgent`, `runProspectFollowups`.

## Pitfalls aprendidos
- Rotas de cron **precisam** de `revalidate = 0` e `fetchCache = "force-no-store"`: sem isso o Next
  devolve a resposta anterior e a fila do outbox não drena.
- O `flushOutbox` aplica 1,5s de delay entre envios (anti-flood): 20 mensagens ≈ 35s.
- Canal de e-mail depende do valor `email` no enum `channel_type` (migration pendente).

## Atualizações (rodadas 3-4)
- **Thread única por contato**: a prospecção grava na conversa de `external_id = <fone-E164>@s.whatsapp.net`
  (mesmo id que o sync do Hermes usa). Antes criava `manual_<contato>` e a resposta do lead caía em
  outra conversa. Nova função: `ensureProspectConversation()` em `src/lib/data/actions.ts`.
- **Badge "já contatado"** na lista (`getContactedContactIds`) e **métricas no topo** da tela
  (`getProspectStats`: leads, contatados, responderam, aguardando follow-up).
- Import validado em volume sob RLS: **100 leads em ~300ms** (insert em lote), duplicados pulados.
- E-mail (Gmail) ainda depende de migration: aplicar com
  `node scripts/apply-email-migration.mjs "postgresql://postgres.<ref>:<senha>@<host>:5432/postgres"`
  (dependência `pg` já instalada) e depois reconectar o Google em `/conexoes`.

## Indicador "digitando…" (pausado — investigado em 05/10)
Status: **não funciona com este bridge**; a UI está no lugar mas não recebe eventos.

O que foi feito (tudo aditivo, pode ficar):
- patch no bridge (`hermes-src/scripts/whatsapp-bridge/bridge.js`, marcado `[conecta-crm patch]`):
  `GET /presence`, `POST /presence/subscribe`, handler `presence.update`, assinatura de **PN + LID**
  (LID via `phoneToLid` construído dos `lid-mapping-*_reverse.json`), `sendPresenceUpdate('available')`.
- CRM: `src/app/api/presence/route.ts`, hook `components/conversas/useTyping.ts` (polling 3s),
  badge no Inbox e em `components/dashboard/RecentConversations.tsx`.
- Já funcionava: `POST /typing` do bridge (CRM → cliente vê "digitando").

Evidência de que é limitação do protocolo: assinatura confirmada nos logs
(`[presence] subscribed ...@s.whatsapp.net` e `...@lid`) e **zero** eventos
(`grep "\[presence\]\[raw\]" bridge.log` = 0) mesmo com o contato digitando.
Se retomar: testar outra versão do Baileys, ou trocar por outra estratégia de presença.

## Central de prospecção (v2 — 05/10)
Tela `/prospeccao` reorganizada em 3 blocos:
1. **Buscar empresas** — escolhe o método (**Apify** = Google Maps, ou **AISA** = Apollo),
   informa nicho/local/máx, busca e **salva os leads no CRM na hora** (dedupe por telefone,
   e-mail ou nome). Mostra selo "salvo" / "já existia" / "sem telefone".
   - Rota: `POST /api/prospecting/search` `{provider, nicho, local, max}` (autenticada).
   - Serviços: `src/services/prospecting/apify.ts` (actor configurável em
     `APIFY_GOOGLE_MAPS_ACTOR`, padrão `compass~crawler-google-places`) e
     `src/services/prospecting/aisa.ts` (`POST https://api.aisa.one/apis/v1/apollo/mixed_companies/search`).
   - Campos salvos em `contacts.custom_fields`: site, endereco, cidade, estado, categoria, nota,
     origem e `busca: { provider, nicho, local, at }`.
   - Apify leva 1–3 min e cobra por resultado; AISA responde em segundos e traz telefone quando existe.
2. **Disparar nova prospecção** (manual) — para quando você vê um cliente em potencial em algum
   lugar: nome + telefone/e-mail + oferta/objetivo; cria o contato se não existir e o agente
   escreve e envia a abordagem na hora. Action: `prospectManualLead`.
3. **Buscas recentes** — histórico derivado de `contacts.custom_fields.busca` com botão
   "buscar de novo" (deriva de `getRecentSearches`).

Abaixo segue o bloco antigo: importar lista/CSV, lista de leads com badge "já contatado",
agente prospecta (até 10), mensagem manual e follow-up de fechamento.

## Apagar leads (05/10)
- **Prospecção**: lixeira em cada lead (apaga 1) e botão "Apagar (N)" para os selecionados.
- **Contatos**: lixeira na coluna "Ações" de cada linha (`DeleteContactButton`).
- Actions: `deleteContacts(ids[])` (lote) e `deleteContact(id)` — exigem papel **admin/gerente**
  (atendente recebe "Sem permissão").
- A exclusão é no banco e **em cascata**: `contacts → conversations → messages`
  (também oportunidades, tags e agendamentos). Testado: contato + conversa + mensagem → 0/0/0.
- Sempre pede confirmação na tela avisando que a conversa e as mensagens vão junto.

## Limpeza em massa de leads (05/10)
Painel **"Limpeza de leads"** na tela `/prospeccao` (componente `BulkCleanupPanel`):
- **Sem telefone (N)**, **Nunca contatados (N)** e **Apagar todos (N)** — o último exige digitar
  `APAGAR` no prompt (evita acidente).
- Contagens vêm de `countContactsByFilter({kind})`; exclusão por `deleteContactsByFilter(filter)`.
- Filtros (`BulkDeleteFilter`): `noPhone` | `neverContacted` | `search` (lote de busca pelo
  `custom_fields->busca->>at`) | `all`.
- No histórico de buscas há um botão de lixeira que apaga **somente os leads daquela busca**.
- "Nunca contatados" = sem nenhuma mensagem nossa (`direction='out'` na conversa).
- Cascata do banco remove conversas, mensagens, oportunidades, tags e agendamentos.
- Permissão: admin/gerente.

## Etiquetas de temperatura e valor do serviço (05/10)
Os dados das colunas **Etiquetas** e **Oportunidade** vêm do banco:
`tags` + `contact_tags` (vínculo) e `opportunities` + `pipeline_stages`.
Antes nada preenchia — a prospecção criava só contato/conversa/mensagem.

Agora:
- Etiquetas de temperatura criadas sob demanda: **Lead frio / morno / quente**
  (`TEMPERATURE_TAGS` em `src/lib/data/lead-temperature.ts`). Constantes fora do
  arquivo de server actions — um arquivo `"use server"` só pode exportar funções async.
- Na lista da prospecção, cada lead tem ❄️ 🌤️ 🔥 (clica marca/troca; clicar de novo limpa)
  → `setLeadTemperature(contactId, temp)` grava em `contact_tags`.
- Cada lead tem o campo **R$ valor** (+ "ok") → `saveLeadOpportunity({contactId, value})`
  cria/atualiza a oportunidade na primeira etapa do funil ("Novo lead").
- Painel do agente: campo "Valor do serviço por lead" cria a oportunidade de cada lead abordado
  (usa `AgentProspectResult.contactIds`).
- Disparo manual: aceita valor + temperatura (`prospectManualLead`).
- A tela `/contatos` já exibe etiqueta e valor nas colunas existentes (via `getContacts`).

## Navegação de volta + dados do contato (05/10)
- `PageHeader` agora renderiza **breadcrumb**: sempre "🏠 Dashboard" e, quando passa
  `back={{href,label}}`, o nível pai (ex.: contato → "Dashboard › Contatos").
  `back={null}` esconde (usado no próprio dashboard).
  Componente reutilizável: `Breadcrumbs` (mesmo arquivo `components/ui/primitives.tsx`).
  Telas que não usam PageHeader (/prospeccao, /conexoes) recebem `<Breadcrumbs />` no topo.
- Tela do contato (`/contatos/[id]`), aba **Dados**: além do formulário, tem
  **Temperatura do lead** (❄️ frio / 🌤️ morno / 🔥 quente + badges das etiquetas atuais)
  e **Valor do serviço** (cria/atualiza a oportunidade). Usa `setLeadTemperature` e
  `saveLeadOpportunity`; a página carrega `contact_tags(tag:tags(name,color))` para
  exibir a temperatura atual via `temperatureFromTagNames`.

## Board do pipeline sem barra horizontal (05/10)
Antes: colunas fixas (`w-72 shrink-0`) dentro de `flex overflow-x-auto` → com 6 etapas dava
~1850px e a barra horizontal aparecia no desktop/tablet.
Agora: classes `.pipeline-board` / `.pipeline-column` em `src/app/globals.css`:
- **mobile (<768px)**: `flex` + `overflow-x: auto` (rola na horizontal, comportamento esperado).
- **≥768px**: `display: grid` + `grid-template-columns: repeat(auto-fit, minmax(190px, 1fr))`
  + `overflow-x: visible`, colunas `width: auto` → distribui na largura e quebra linha quando
  não couber (nada de barra horizontal).

## Tela de Templates removida (05/10)
- Apagados: rota `src/app/(dashboard)/templates/`, `components/templates/`,
  `lib/data/templates.ts`, link da sidebar e os tipos `TemplateCategory`/`TemplateStatus`.
  Backup dos arquivos em `.backups/removed-templates/`.
- `/templates` responde 404 e a sidebar não tem mais o item.
- Banco: `whatsapp_templates` está **vazia**; drop pendente de aplicação —
  `supabase/migrations/20261005_drop_whatsapp_templates.sql` (remove a coluna
  `appointment_reminders.template_id`, a tabela e os tipos `template_category`/`template_status`).
  `schema.sql` já foi atualizado para não criar nada disso em instalações novas.
- **`agent_templates` foi mantida** (2 registros) — é usada em `AgentWorkbench` e em `actions.ts`
  para montar o prompt inicial dos agentes.

## Central de prospecção v3 (05/10)
- **Mensagem manual removida** da tela (e a action `prospectContacts` saiu do painel; continua existindo
  no código para uso interno). Disparo avulso continua em "Disparar nova prospecção".
- **Layout**: linha 1 = `Buscar empresas` | `Disparar nova prospecção` alinhados com a mesma altura
  (`grid items-stretch` + `[&>div]:h-full`); linha 2 = `Importar leads` | `Limpeza de leads`;
  depois **`IA prospectando agora`** ocupando a largura toda; por fim a lista de leads + painel do agente.
- **Painel ao vivo** `LiveProspectingPanel` + rota `GET /api/prospecting/live` (polling 4s):
  últimas 20 abordagens do agente (`sender_type='agent_ai'`, 3 dias), com selo
  `na fila` (status pendente) / `enviada` / `respondeu` (inbound depois da mensagem) / `falhou`,
  contadores (na fila, hoje, responderam, aguardando) e preview do texto.

### Ajuste de layout (05/10 — v3.1)
`Importar leads` e `Limpeza de leads` saíram do topo e agora ficam **dentro do bloco de leads**,
logo abaixo do campo de busca — o `ProspectPanel` recebe a prop `tools?: React.ReactNode`
(server component passa os painéis) e renderiza numa faixa `bg-muted/20` sob o formulário de busca.
Ordem final da tela: Buscar empresas → Disparar nova prospecção → IA prospectando agora (largura total)
→ bloco de leads (busca · importar · limpeza · seleção · lista) + coluna com Agente/Follow-up.
Os dois painéis ganharam estilo mais leve (rounded-xl, bg-background) para não ficar borda dentro de borda.

### Seletor de leads no painel do agente (05/10)
O painel "Agente prospecta por mim" ganhou o bloco **"Escolher os leads"** (colapsável):
filtro por nome/telefone, lista com checkbox (badge "já contatado", "sem telefone" desabilitado),
atalhos de selecionar todos / limpar. Usa o MESMO estado `selected` da lista principal,
então marcar em um lugar reflete no outro; o botão mostra "N lead(s) selecionado(s)".
Mostra os leads da página atual (até 50).

## E-mail pela plataforma do Hermes (05/10)
Hermes tem plataforma **email** nativa (IMAP recebe / SMTP envia) — não precisa de OAuth nem de DDL.
- Config em `.hermes-home/.hermes/.env`: `EMAIL_ENABLED=true`, `EMAIL_ADDRESS`, `EMAIL_PASSWORD`
  (Gmail exige **senha de app** com 2FA), `EMAIL_SMTP_HOST=smtp.gmail.com`, `EMAIL_IMAP_HOST=imap.gmail.com`,
  `EMAIL_AUTHSERV_ID=mx.google.com` (exigido pela checagem de remetente) e `EMAIL_POLL_INTERVAL=15`.
  `config.yaml` → `platforms.email.enabled: true`.
- CRM: `src/services/email/hermes-email.ts` (`hermesEmailStatus`, `sendEmailViaHermes`) envia por
  `hermes send --to email:<destino> --subject "<assunto>" "<corpo>"`.
- `prospectWithAgent` usa **Hermes primeiro** quando o lead não tem telefone (fallback: Gmail API).
  `prospectManualLead` também manda e-mail por essa via.
- Sem o enum `email` no banco, o CRM não cria conversa de e-mail: o envio é registrado em
  `contacts.custom_fields.email_prospeccao` (histórico dos últimos 10) e isso já marca o lead como
  "já contatado" (`getContactedContactIds`).
- Respostas dos leads chegam na caixa do Hermes e o agente responde por lá; espelhar como conversa no CRM
  exige a migration `20261005_email_channel_gmail_tokens.sql` (enum `channel_type` += 'email').

## Migrations aplicadas (05/10) — banco em dia
Via `node scripts/apply-sql.mjs <arquivo>` lendo `DATABASE_URL` do `.env.local`
(a connection string nunca precisa ser colada no chat; o script tenta TLS e cai para conexão
direta avisando — nesta rede o handshake TLS do Postgres não completa).
- `20261005_email_channel_enum.sql` → enum `channel_type` ganhou `email` ✓
- `20261005_drop_whatsapp_templates.sql` → tabela `whatsapp_templates`, os tipos
  `template_category`/`template_status` e a coluna `appointment_reminders.template_id` removidos ✓
- `performance_indexes.sql` → 5 índices (conversations/contacts/messages/opportunities/appointments) ✓

## E-mail ponta a ponta (05/10) — funcionando
`email connected` no Hermes (IMAP + SMTP). Fluxo validado:
1. CRM/Hermes envia (`hermes send --to email:<destino> --subject ...`)
2. Lead responde → IMAP recebe → agente responde sozinho (SMTP)
3. Sync espelha tudo no CRM: canal `E-mail (Hermes)` (criado automaticamente pelo sync),
   conversa com `external_id = <e-mail do contato>` e `channel_type='email'`.
   Contato é casado pela coluna `email`, então e-mail e WhatsApp do mesmo cliente ficam no MESMO contato.
- `prospectWithAgent`/`prospectManualLead` usam Hermes primeiro para leads sem telefone;
  hoje ainda gravam o envio em `contacts.custom_fields.email_prospeccao` (dá para passar a criar
  a conversa de e-mail agora que o canal existe).

### Prospecção por e-mail espelhada no CRM (05/10)
- `ensureEmailConversation()` (em `src/lib/data/actions.ts`) cria/reaproveita a conversa de e-mail
  com `external_id = <e-mail do contato>` — o MESMO id que o sync usa, então a resposta do cliente
  cai na mesma thread. Canal `E-mail (Hermes)` é criado se faltar.
- `prospectWithAgent` (agente) e `prospectManualLead` agora abrem a conversa e inserem a mensagem
  `out/agent_ai` com `status='entregue'` e `external_id='hermes_email_<ts>'` → aparece no inbox
  e no painel "IA prospectando agora" (que lê `sender_type='agent_ai'`).
- **Valor do serviço** passou a ser aplicado dentro da action (`briefing.value`) — vale para a UI e
  para chamadas via API; antes só a UI criava a oportunidade.
- Rota nova `POST /api/prospecting/agent` `{contactIds, offer, goal, notes, value}` (sessão do CRM)
  para disparar a prospecção por API/cron — usada nos testes.
- Validado: lead só com e-mail → `emails: 1`, e-mail enviado pelo Hermes, conversa
  `email | <destino>` criada com 1 mensagem e listada no painel ao vivo.

### Popup de detalhes no painel ao vivo (05/10)
Cada card de "IA prospectando agora" agora é **clicável** e abre um popup com:
contato (telefone/e-mail), canal, status, temperatura, **valor da oportunidade**,
total de mensagens da thread, enviada em / respondida em, e o **texto completo** da abordagem.
Rodapé com "Ver contato" e "Abrir conversa" (deep-link `/conversas?c=<id>`).
- A rota `GET /api/prospecting/live` passou a devolver: `conversationId`, `contactId`,
  `contactPhone/Email`, `subject` (assunto do e-mail, extraído do conteúdo), `repliedAt`,
  `temperature` (via `temperatureFromTagNames`), `opportunityValue`, `threadMessages`, `threadLastAt`.
- O popup se atualiza junto com o polling (4s) enquanto aberto e fecha com ESC/clique fora.

### Card do painel ao vivo (05/10 — versão final)
Card **compacto**: avatar menor (h-8), padding `p-2.5`, nome + tempo, chips (status/canal/telefone)
e **uma linha** de prévia da mensagem. Sem chip de temperatura nem prefixo de assunto no card —
esses detalhes ficam no popup (que segue completo, com contato, temperatura, valor, thread e os
botões "Ver contato" / "Abrir conversa"). O card inteiro é um botão que abre o popup.

## Ciclo de disparo da prospecção — anti-ban (05/10)
Fila em `outreach_queue` (migration `20261005_outreach_queue.sql`, aplicada):
`status (pendente|enviado|falhou)`, `channel`, `scheduled_at`, `sent_at`, `briefing` (jsonb),
`message_id`, `conversation_id` — único por (organização, contato).

Regras (`src/services/prospecting/outreach-queue.ts`, testadas em `outreach-rules.test.ts`):
- **janela** 9h–18h (seg–sáb; domingo não dispara) — `OUTREACH_WINDOW_START/END`
- **teto diário 15–20** (`dailyTarget()` = 15 + diaDoAno % 6, estável no dia)
- **intervalos variados**: distribui o que falta até o fim da janela com jitter 0,6x–1,4x,
  mínimo `OUTREACH_MIN_GAP_MIN` (5 min); fora da janela o próximo slot é o próximo dia útil às 9h
- **canal**: telefone → WhatsApp (mensagem entra no outbox, que já tem anti-flood de 1,5s);
  só e-mail → e-mail pelo Hermes (conversa criada no CRM)
- texto gerado pelo agente citando explicitamente o **prompt mestre (SOUL)** e a skill
  `conecta-crm/vendedor` (atenção: não usar crases dentro das template strings dos prompts)

Operação:
- Rota `GET /api/cron/outreach` (`?force=1&limit=N` ignora janela/teto — teste) — no `vercel.json`
  a cada 5 min; localmente um loop roda a cada 2 min.
- UI: botão **"Ciclo de disparo (N)"** (enfileira os selecionados) ao lado de "Enviar agora (N)";
  painel `OutreachCyclePanel` mostra janela, teto, enviados hoje (barra), fila/agendados/falhas,
  próximo envio e o botão "rodar ciclo agora".
- Ações: `enqueueOutreachContacts`, `getOutreachStatus`, `runOutreachNow`.
- Validado: fora da janela → `ran:false, reason:"fora da janela (9h–18h)"` (nada enviado);
  `force=1&limit=1` → 1 e-mail enviado, fila marcada como `enviado`, conversa criada no CRM.

### Tic de "disparo manual fora do horário" (05/10)
Quando o envio é feito pelo botão **"Enviar agora"** (ação imediata, não o ciclo), a mensagem é gravada com
`media.outreach = { manual: true, outsideWindow: <true se fora de 9h–18h>, at }` — sem DDL.
- `prospectWithAgent` e `prospectManualLead` (WhatsApp e e-mail) usam o helper `outreachMarks()`.
- `GET /api/prospecting/live` devolve `manual` e `outsideWindow` por item.
- UI: card mostra o selo **"✓ fora do horário"** (âmbar) e o popup acrescenta
  "disparo manual fora do horário (9h–18h)".
- Validado: disparo manual às ~21h → API retornou `manual: true, outsideWindow: true`;
  mensagens antigas do ciclo/WhatsApp → `false`.

## Alertas em tempo real no Telegram (05/10)
Tabela `alerts` (migration `20261005_alerts.sql`, aplicada) + motor em `src/services/alerts/engine.ts`.
Bot: `@mlluiz_vendas_bot` (token/chat no `.env` do Hermes: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`).

Eventos detectados (`detectAlerts`, idempotente por `dedupe_key`, janela de 3 dias):
- `lead_contatado` — primeira mensagem nossa na conversa
- `lead_respondeu` — primeira mensagem do lead **depois** da abordagem (se o lead escreveu antes, não conta)
- `quer_fechar` — entrada com palavra-chave de fechamento (fechar, contrato, proposta, aprovado, pix, boleto, assinar…)
- `call_marcada` — agendamento criado

Regras importantes:
- Eventos com mais de **15 min** entram como histórico (`notified_at` já preenchido) → não dispara rajada
  na primeira execução nem ao aplicar a lógica nova.
- `notifyAlerts` envia os pendentes via Bot API (`sendMessage`, Markdown) e marca `notified_at`;
  falhas ficam em `notify_error`.
- Rota `GET /api/cron/alerts` — no `vercel.json` a cada minuto; localmente um loop roda a cada 60s.
- UI: `AlertsFeed` no dashboard (`/api/alerts/recent`) lista os últimos 12 alertas com link para a conversa.

Instagram: **não** há credencial no projeto e DM do Instagram exige conta profissional + app Meta
(Zernio é pago) — o caminho escolhido foi o Telegram.

## Palavras-chave do ciclo + temperatura automática (05/10)
`src/services/prospecting/keywords.ts` (testes em `keywords.test.ts`, 9 casos) define 4 grupos:
- **call**: call, reunião, agendar, marcar, horário, meet, zoom, videochamada, ligação, "podemos falar"
- **fechamento**: fechar, contratar, contrato, proposta, aprovado, assinar, pix, boleto, forma de pagamento, "quando começamos", "manda o link"
- **interesse**: quanto custa, valor, preço, orçamento, prazo, "como funciona", "tenho interesse", "faz sentido"
- **desinteresse**: "não tenho interesse", "não quero", "depois", "sem tempo", "está caro", "não é o momento", "para de mandar", descadastrar

`classifyTemperature(textos)` → **quente** (fechamento ou pediu call) > **frio** (desinteresse explícito) >
**morno** (interesse). Sem sinal → frio. A precedência evita que "não tenho interesse" vire morno.

Alertas (`src/services/alerts/engine.ts`) — tipos: `lead_contatado`, `lead_respondeu`, `em_prospeccao`
(abordagem + resposta em andamento), `quer_call` (📞), `quer_fechar` (🔥), `lead_quente`
(🔥 quente / 🌤️ morno / ❄️ frio, conforme transição) e `call_marcada`.

- `applyContactTemperature()` (`src/services/prospecting/temperature.ts`) grava a etiqueta
  (Lead frio/morno/quente) + `custom_fields.temperatura` e devolve `{changed, previous, current}`.
- **Antirruído**: alerta de temperatura só sai quando esquenta (quente/morno) ou quando **esfria vindo de**
  quente/morno — lead que nunca esquentou não gera "lead frio".
- Validado: 2 mensagens simuladas ("podemos marcar uma call?", "quanto custa e qual o prazo?") →
  `{"em_prospeccao":2,"lead_quente":2,"lead_respondeu":1,"quer_call":1}` e 5 avisos no Telegram;
  contato ficou com etiqueta "Lead quente".

### Alertas principais (05/10 — fechado com o dono)
Os 5 alertas que importam no dia a dia, todos no Telegram:
| tipo | ícone | gatilho |
|---|---|---|
| `lead_contatado` | ✉️ | primeira abordagem enviada ao lead |
| `lead_respondeu` | 💬 | lead respondeu depois da abordagem |
| `quer_orcamento` | 💰 | pediu orçamento/valor/preço ("me manda o orçamento", "quanto custa") |
| `quer_call` | 📞 | pediu call/reunião/horário |
| `quer_fechar` | 🔥 | sinal de fechamento (contrato, proposta, pix, "quando começamos") |
Complementares: `em_prospeccao` 🤝 (respondeu e está em andamento), `lead_quente` (mudança de temperatura) e
`call_marcada` 📅.

Taxonomia: `orcamento` e `interesse` deixam o lead **morno**; `call`/`fechamento` deixam **quente**;
`desinteresse` deixa **frio** (vence morno). Testes: `keywords.test.ts` (10 casos).
Validado ponta a ponta: uma única mensagem pedindo orçamento + call gerou 5 alertas
({"lead_respondeu","quer_orcamento","quer_call","em_prospeccao","lead_quente"}) e 5 avisos no Telegram.

### Correção de alertas duplicados (05/10)
Sintoma: o Telegram recebia vários avisos do mesmo lead ("três do mesmo").
Causas e correções:
1. Cada sinal virava um alerta (`quer_call` + `quer_orcamento` + `lead_respondeu` + `em_prospeccao` + `lead_quente`
   na MESMA mensagem) → agora é **um alerta por mensagem**, com prioridade
   `fechamento > call > orçamento > resposta` e os outros sinais no título entre parênteses
   (ex.: `📞 Quer uma call — Nome (pediu orçamento)`). O tipo `em_prospeccao` virou flag no payload.
2. Era gerado alerta para **todas** as mensagens do histórico (11 de uma vez) → agora só a **última**
   mensagem do lead gera alerta (`msg:<id>`), e eventos com mais de 15 min entram silenciosos.
3. A chave de dedupe mudava quando a temperatura mudava (`msg:<id>:<temp>`), recriando o mesmo alerta na
   rodada seguinte → chave agora é sempre `msg:<id>`.
Validado: rodada 1 → 5 detectados porém **1 aviso** (só o evento novo), rodada 2 → **0 novos / 0 avisos**.

### Alertas repetidos — causa raiz e correções (05/10, definitivo)
1. **Contatos duplicados**: o mesmo cliente existia duas vezes (`Marcelo Luiz` com telefone em formato JID e
   `Marcelo Luiz Pereira` só com e-mail). Cada contato/conversa gerava o próprio alerta → o Telegram recebia
   2–3 avisos do mesmo evento. Mesclados: agora 1 contato com telefone normalizado + e-mail, e as duas
   conversas (WhatsApp e e-mail) apontam para ele.
   ⚠️ Ao mesclar: mover `conversations/alerts/opportunities` do duplicado para o principal e apagar o duplicado.
2. **Envio concorrente**: o loop (60s) e o botão manual podiam ler os mesmos alertas pendentes.
   Agora `notifyAlerts` faz **claim atômico** (`update ... set notified_at where notified_at is null returning id`)
   antes de enviar — quem marcar primeiro envia; falha devolve para a fila.
3. **Vários alertas do mesmo lead**: agora são **agrupados em uma mensagem** por contato
   (`_N novidades_` + uma linha por evento).
Validado: rodada 1 → `sent: 1, grouped: 2`; rodada 2 → `0 novos / 0 avisos`.
⚠️ Cuidado com `delete().like(...)` em `messages`: `h_%` casa com `hermes_*` (o `_` é curinga). Prefira
`like("kw_%")` com prefixo específico do teste.

### Formato da mensagem de alerta (05/10)
Uma mensagem por lead, com os itens rotulados (antes iam só as frases soltas):
```
*Marcelo Luiz — 2 novidades*
• 💰 Quer orçamento
  _"Me manda o orçamento do site institucional"_
• 📞 Quer uma call
  _"Podemos marcar uma call quinta às 15h?"_
_05/10, 00:12_
```
O rótulo vem da parte do título antes do travessão; o texto é o trecho da mensagem do lead.
Se o dono preferir uma mensagem por evento, basta não agrupar em `notifyAlerts`.

## Trava comercial — o agente não vende sozinho (05/10)
**Camada 1 — regra no prompt mestre** (`SOUL.md` → seção "TRAVA COMERCIAL (PRIORIDADE MÁXIMA)"):
nunca informar preço/valor/estimativa (a casa não tem tabela fixa), nunca prometer desconto/promoção/prazo/data,
nunca declarar "fechado"/contrato/boleto/pix/nota, nunca enviar contrato/link de pagamento, nunca alterar dados
comerciais no CRM (etapa/valor) nem ler credenciais dele. Ao chegar em fechamento: "vou confirmar com o
responsável" + o alerta avisa o dono. Condições oficiais da base (30 dias de suporte, entrada 30–50%) podem ser citadas.

**Camada 2 — vigilância automática** (`commercialRiskHits` em `keywords.ts` + varredura no
`alerts/engine.ts`): toda mensagem **enviada pelo agente** é varrida; se aparecer valor em reais, número de
preço, desconto/promoção/parcelamento, prazo de entrega ("entrego em", "fica pronto em", "dias úteis"),
boleto/pix/nota fiscal/"fechado"/contrato → alerta **🚨 Possível promessa indevida** com os termos e o trecho,
no Telegram, na hora. Dedupe por mensagem; agrupado por contato.
Validado: mensagem simulada ("Fechado! Faço por R$ 2.500 com 10% de desconto e entrego em 7 dias…") →
`{"risco_comercial":1}`, 1 aviso enviado. Falsos positivos tratados (ex.: "30 dias de suporte" NÃO alerta).

**Limite honesto**: o CRM não intercepta o envio (o agente fala direto pelo WhatsApp/e-mail). As travas são
regra + detecção com aviso em ~60s — bloqueio duro exigiria intermediar o gateway do Hermes.

## Assumir conversa / reativar bot — agora funciona de verdade (05/10)
**Por que estava travado**: `takeoverConversation` só gravava `conversations.bot_active = false`, e o único
leitor desse flag é `src/services/agents/engine.ts` (motor de agentes DO CRM) — que não está no fluxo, porque
o inbound é do Hermes. Resultado: o botão mudava o banco e o Hermes continuava respondendo.

**Correção**: as ações agora acionam o **emergency stop do Hermes**:
- `takeoverConversation` → `hermes pause --reason "assumido no CRM: <contato>"` + `bot_active=false/assigned_to`
- `reactivateBot` → `hermes resume` + `bot_active=true`
- `hermes pause` para **trabalho novo** (novos turnos do gateway, cron, kanban) — **não** derruba o WhatsApp
  nem interrompe o que está em andamento. Estado no sentinel `<HERMES_HOME>/ESTOP`.
- Serviço: `src/services/messaging/hermes-control.ts` (`hermesBotState`, `pauseHermesBot`, `resumeHermesBot`)
- Rota: `GET/POST /api/hermes/bot-pause` (`{paused:boolean, reason?}`) — validada (pausar → ESTOP, retomar → some)
- UI: faixa âmbar no topo do Inbox quando o bot está pausado, com a dica dos comandos do celular.

**Pelo celular (sem o cliente perceber)**: mandar `/pause` na conversa com o bot e `/pause off` para retomar
(comando de sistema — o gateway não responde ao cliente e é uma conversa sua, não a do cliente).
⚠️ O pause é **global** (para todos os atendimentos), não por conversa.

## "A interface travou, só volta com refresh" — causa raiz encontrada (06/10)
**Sintoma**: clicar em "Assumir conversa"/"Reativar bot (IA)" não mudava nada na tela; a tela parecia morta
e só um refresh (F5) mostrava o estado novo. O usuário clicava de novo e parecia cada vez mais travado.

**Causa raiz (comprovada em browser real)**: `src/components/conversas/Inbox.tsx` guardava as props do
servidor em `useState` (`useState(initialConversations)`, `useState(initialMessages)`, `useState(initialNotes)`).
Depois de uma server action o servidor **mandava** o estado novo (response 200 + payload RSC de ~12 KB), mas o
componente continuava exibindo o snapshot inicial — estado inicializado de props **nunca** é reaplicado.

**Correção (padrão a repetir em qualquer tela)**:
1. Estado derivado das props + ajuste otimista com validade: `patches[cid] = {value, at}` aplicado só por 8 s
   (`PATCH_TTL_MS`) — resposta visual imediata e sem mascarar o estado real do servidor.
2. Mensagens/notas: merge das props com as adições locais e dedupe (`sameMessage`: mesmo texto/direção em até
   3 min; `sameNote`: mesmo texto) — evita item duplicado quando o real chega.
3. Após a action: `router.refresh()` (não confie só no stream da action em dev).
4. Botões com estado ocupado **explícito** (`botBusy: null | "assumir" | "reativar"`) — o rótulo não pode ser
   derivado do estado que o otimista acabou de inverter (`Assumir` virava "Reativando…").
5. Pollers: `src/lib/client/poll.ts` (`startPolling`) faz single-flight, timeout de 12 s e pausa com a aba
   oculta; intervalos: presence 6 s, prospecting/live 6 s, alerts 15 s, bot-pause 10 s.
6. `OutreachCyclePanel`: mesmo padrão (`rodada ?? initial`, limpa quando as props mudam).

**Como diagnosticar isso de novo (ferramentas no repo)**:
- `node scripts/ui-probe.mjs` → Chrome headless: faz login, abre todas as telas, coleta exceções/4xx e testa
  se a navegação client-side responde depois de cada tela e depois do clique no botão do bot.
- `node scripts/ui-action-test.mjs --secs=25 [--note="texto"]` → mede no nível de rede (CDP) o POST da server
  action (headers/corpo) e a sequência de rótulos do botão; `--note` testa o caminho de nota interna.
- Artefatos em `.probe/` (screenshots + `report.json`; pasta no `.gitignore`).
  ⚠️ `/tmp` **não** persiste entre processos aqui — sempre salvar dentro do repo.

**Evidência da correção (06/10, Chrome headless)**: "Reativar bot (IA)" → "Reativando…" → "Assumir conversa"
em 2,0 s; "Assumir conversa" → "Assumindo…" → "Reativar bot (IA)" em 2,0–7 s; ESTOP criado no assumir
(`{"reason":"assumido no CRM: Marcelo Luiz"}`) e removido no reativar; as 5 telas (dashboard, prospecção,
conversas, contatos, pipeline) HTTP 200 com navegação client-side respondendo em ~0,4 s; 49/49 testes e
`tsc --noEmit` limpos.

⚠️ `puppeteer-core` foi adicionado como devDependency e usa o `/usr/bin/google-chrome` local (sem baixar
Chromium). O probe **altera** o estado (assumir/reativar) e agora devolve o estado original ao final.

## Relógio, expediente e feriado no contexto do modelo (06/10)
**O contrato do SOUL sozinho NÃO se sustenta.** O SOUL diz "use a data e hora atuais informadas no
contexto", mas o que o Hermes injeta é só `Conversation started: <dia da semana, data>` (linha
byte-estável para cache de prompt em `agent/system_prompt.py::_timestamp_line`) — **hora nunca**, e o
prompt ainda orienta o modelo a pegar a hora no terminal (`prompt_builder.py:455`). Feriado o modelo não
sabe de jeito nenhum. Sem injeção, o modelo chuta horário — exatamente o que o SOUL proíbe.

**Solução — hook `pre_llm_call` (contexto dinâmico por turno, não system prompt):**
- `scripts/hermes-clock-context.py`: lê a hora em `America/Sao_Paulo` (independe do TZ do servidor),
  calcula o estado do expediente (seg-sex 9-12/13-18, sáb 9-12, dom/feriado fechado) e os feriados
  (fixos nacionais + Carnaval/Sexta Santa/Corpus Christi pela Páscoa; extras em `<HERMES_HOME>/holidays.json`),
  e devolve `{"context": "..."}` — o Hermes injeta na mensagem do turno.
- Registrado em `.hermes-home/.hermes/config.yaml` (`hooks.pre_llm_call[].command`) + allowlist em
  `.hermes-home/.hermes/shell-hooks-allowlist.json` (sem `hooks_auto_accept`, só este comando).
- Custo: ~60ms por turno e ~80 tokens. Loga cada disparo em `<HERMES_HOME>/hook-clock.log`.

**Verificação (06/10, tudo com evidência):**
- `hermes hooks test pre_llm_call` → exit=0, 0,059s, JSON no wire shape do Hermes.
- `hermes hooks list` → `✓ allowed`; `agent.log` → `shell hook registered: pre_llm_call -> ...` no
  gateway que está no ar.
- Turno real (`hermes -z "que horas são agora?"`) → o bloco está no **`api_content`** da mensagem do
  usuário em `state.db` (os bytes exatos enviados ao provedor) e o modelo respondeu "21h53 de
  segunda-feira, 05/10/2026, fora do expediente, retorna amanhã às 9h" **sem usar ferramenta**.
- Matriz de 13 datas: 08:30→fora (volta hoje 9h), 10:00→disponível, 12:30→almoço (volta 13h), 15:00→
  disponível, 18:30→fora (amanhã 9h), sáb 13:00→segunda..., domingo→próximo dia útil, 07/09
  (Independência), 17/02 (Carnaval), 03/04 (Sexta Santa), 04/06 (Corpus Christi) → feriado.
  Detalhe bacana: sábado 10/10/2026 13:00 pula o feriado de 12/10 e devolve terça 13/10 às 9h.

**Como recarregar o hook SEM reiniciar o gateway** (o gateway é um por host e `--replace`/`--force` não
ajudam): verbo `reload-plugins` no **socket de controle** → `discover_plugins(force=True)` →
`re_register_config_hooks()`. Exemplo:
`python3 -c` conectando em `<HERMES_HOME>/gateway.sock` e enviando
`{"verb":"reload-plugins","id":1,"protocol":1,"params":{"home":"<HERMES_HOME>"}}`.

## Gateway: falso negativo de status e vigia (06/10)
- ⚠️ `hermes gateway status` responde **"not running" mesmo com o gateway no ar** quando os processos
  rodam em namespaces de PID diferentes (aqui cada comando roda no seu): o `ps` não lista o gateway e o
  status não acha o PID. Prova de vida confiável = perguntar `identify` no `<HERMES_HOME>/gateway.sock`.
- `scripts/hermes-watchdog.mjs` agora checa, a cada 30s: (1) gateway pelo socket, (2) bridge 3005,
  (3) CRM 8081; se o gateway não responde, tenta subir (`hermes gateway run`, sem `--force`, e o
  host-lock do Hermes impede duplicar) e avisa no Telegram com cooldown de 10 min.
  Antes o vigia só olhava o bridge — bridge de pé + gateway morto = cliente escrevendo e ninguém
  respondendo, sem ninguém perceber.
- ⚠️ Cuidado ao testar o vigia com `WATCHDOG_HERMES_HOME` apontando para outra pasta: o `hermesEnv` do
  script usa `HERMES_HOME` real, então a "tentativa de subir" pode subir um gateway de verdade e
  balançar o bridge. Testar com a checagem isolada (`--once`) e sem token no HOME falso.

## Vazamento de monólogo interno na mensagem do cliente (06/10) — TRAVA OBRIGATÓRIA
**O que aconteceu**: o cliente mandou "Boa noite" e recebeu **1504 caracteres** com o monólogo interno do
modelo: marcador "(texto real enviado ao cliente)", auto-correção ("⚠️ Hmm, espere. Foi isso que
realmente aconteceu? Não."), raciocínio sobre o que responder e uma **assinatura de spam** ("Clique aqui
para ME AJUDAR e AUMENTAR minha produtividade! https://www.lluiz.top 😊👍🙏…"). O texto foi persistido em
`content` E entregue (o `gateway.log` registra "Sending response (1504 chars)").

**Causa raiz**: o modelo escreve o raciocínio dentro do `content` (o campo `reasoning` também veio
preenchido). O endpoint é o **tier anônimo** do Nous: `session_model_usage.model = nous/welcome` em TODO
turno — passar `-m Hermes-4-405B` é ignorado (o roteamento anônimo manda tudo para `nous/welcome`). Ou
seja: **não dá para "trocar de modelo" sem autenticar uma conta Nous real (`hermes model`) ou apontar
outro provider com chave própria.** Regra no SOUL não resolve: o modelo ignorou as "PROIBIÇÕES ABSOLUTAS
DE EXPOSIÇÃO".

**Solução — plugin `crm-output-guard`** (hook `transform_llm_output`, roda ANTES de persistir e entregar):
- Local: `<HERMES_HOME>/plugins/crm-output-guard/{plugin.yaml,__init__.py}`.
- Sem marca de vazamento → devolve `None` e a mensagem passa intacta (texto normal, link legítimo e o
  e-mail `ASSUNTO:/CORPO:` do CRM são preservados — coberto por teste).
- Com marca → corta tudo até o fim da última frase com marca (o modelo escreve a mensagem real por
  último), descarta linha de spam/CTA/separador `---`, tira sintaxe interna de tool-call
  (`</parameter>`, `<function=…>`, `antml:`), e se sobrar pouco usa a maior sequência limpa; se ainda
  ficar vazio, devolve uma linha neutra.
- Registra cada turno em `<HERMES_HOME>/output-guard.log` (inclusive `fired: false`, o que prova que o
  hook está vivo) e avisa no Telegram com cooldown de 10 min.
- Teste: `python3 scripts/test-output-guard.py` — roda contra o **texto real vazado** lido da `state.db`
  (1504 → 117 caracteres) mais 8 casos (texto limpo, e-mail de prospecção, spam sem monólogo, link
  legítimo, frase emendada sem espaço, tags internas, hook real devolvendo texto limpo).

**⚠️ Plugins são OPT-IN**: o plugin aparece como `not enabled` em `hermes plugins list` e **não carrega**
até rodar `hermes plugins enable crm-output-guard`. Depois disso, `reload-plugins` no socket de controle
já ativa no gateway que está no ar (a resposta traz `adapters_rewired: 3`).

## Modelo do atendimento: Google Gemini via API key (06/10)
**Configuração** (feita e verificada):
- Chave em `.hermes-home/.hermes/.env` → `GEMINI_API_KEY=...` (arquivo fora do git, `chmod 600`).
- `config.yaml`: `model: {provider: gemini, default: gemini-3.8-flash}` e
  `fallback_providers: [{provider: nous, model: stealth/space-bunny-alpha}]`.
- Backups para rollback: `config.yaml.bak-nous` e `.env.bak-pre-gemini`.
- ⚠️ **Armadilha**: `.env` tinha `HERMES_MODEL_PROVIDER=nous` e `HERMES_MODEL=stealth/space-bunny-alpha`
  sobrando do setup antigo. No caminho do **CLI/one-shot** (que o CRM usa para gerar e-mail de
  prospecção) essas variáveis **têm precedência sobre o config.yaml** — por isso o e-mail saía no modelo
  antigo mesmo com o config em Gemini. Agora estão comentadas. O gateway não sofria disso (lê o config).
- Detalhe de roteamento: sessões do gateway fixam o modelo no início da sessão; trocar o provider exige
  reiniciar o gateway (usei o verbo `pause-for-update` no socket de controle; o vigia sobe de novo em ~30s).

**Verificação real**: turnos do WhatsApp às 22:16 e 22:17 responderam com `gemini-3.8-flash` (provider
`gemini`, ~45k tokens de entrada, 88% de cache de prompt) — respostas limpas, sem monólogo, usando o
relógio injetado ("amanhã às 09h"). O teste da cadeia de fallback também passou: com o Pro (cota 0) o
turno foi servido pelo Nous e a resposta saiu.

**⚠️ LIMITE DO FREE TIER (medido, não suposto)**: a chave está no plano gratuito e o erro da API diz
`GenerateRequestsPerDayPerProjectPerModel-FreeTier` com **limite = 20 requisições/dia por modelo**.
Como o Hermes faz 3-10 chamadas por turno, isso dá **~2 a 6 turnos por dia** — não sustenta operação real
(a própria Hermes recusa chave free-tier do Gemini no wizard por esse motivo). Além disso o Pro aparece
com cota **zero** no free tier (`generate_content_free_tier_requests ... limit: 0`).
→ Para operar de verdade: ativar **billing** no projeto Google da chave (aí libera milhares/dia e o Pro).
Enquanto isso, o desenho atual é "tenta Gemini, cai para Nous": o atendimento não para, mas em boa parte
do dia roda no modelo antigo (com a trava de saída cobrindo).

**Vigia**: agora compara o provider do config com o modelo do **último turno de canal de cliente**
(join `session_model_usage` × `sessions` com source whatsapp/email/telegram) e avisa no Telegram
(cooldown 30 min) quando o atendimento está rodando no fallback — assim o usuário sabe na hora que a cota
acabou. Teste no CLI não dispara mais o aviso.

## Cadeia de fallback completa: Gemini → Nous → DeepSeek → OpenRouter (06/10)
Ordem pedida pelo usuário (economia primeiro). Config final em `config.yaml`:
```yaml
model:
  provider: gemini
  default: gemini-3.8-flash
fallback_providers:
  - provider: nous
    model: stealth/space-bunny-alpha
  - provider: deepseek
    model: deepseek-v4-pro
  - provider: openrouter
    model: qwen/qwen3.8-flash   # escolha do usuário (06/10): barato (~US$0,007/turno)
```
- Chaves em `.hermes-home/.hermes/.env` (fora do git, `chmod 600`): `GEMINI_API_KEY`,
  `DEEPSEEK_API_KEY`, `OPENROUTER_API_KEY`. Backup: `.env.bak-sem-deepseek-or`.
- Nomes de provider confirmados no código: `deepseek` (`env_vars=DEEPSEEK_API_KEY`,
  `base_url=https://api.deepseek.com/v1`) e `openrouter` (`OPENROUTER_API_KEY`,
  `https://openrouter.ai/api/v1`).
- **Diversidade de fornecedor garantida**: o último elo é Qwen (Alibaba), diferente do elo 2 (DeepSeek
  direto). Assim uma queda da DeepSeek não derruba os dois últimos elos ao mesmo tempo.
- Preços da família Qwen no OpenRouter (06/10): `qwen3.8-flash` US$0,15/1M entrada ·
  `qwen3.8-27b` US$0,42/1M · `qwen3.8-max-0902` e `qwen3.8-2.4t-a95b` US$2,00/1M · `qwen3.8-max-prime`
  US$4,00/1M. Com o nosso prompt (~45k tokens/turno): max ≈ US$0,09/turno, flash ≈ US$0,007/turno.
- **Teste comparativo feito (06/10)** com prompt real de atendimento: os três candidatos
  (`qwen3.8-flash`, `qwen3.8-27b`, `qwen3.8-max-0902`) respeitaram a trava comercial (não deram preço).
  No caso difícil ("me dá 20% e entrega em 5 dias que fecho hoje"), flash e max **ambos** recusaram
  prometer desconto/prazo; o max foi mais "vendedor" (registrou a urgência sem prometer). O usuário testou
  o max e **escolheu o flash** (13x mais barato, passou nos dois testes). Validado nos dois caminhos:
  elo isolado (`--provider openrouter -m qwen/qwen3.8-flash`) e pelo mecanismo de fallback com a cadeia
  reduzida a esse elo — na segunda prova ele respondeu à pergunta de preço sem citar valor, qualificando
  o lead, como manda a trava comercial.
- ⚠️ No free tier o DeepSeek devolve `deepseek-flash` e `deepseek-v4-pro` (1M ctx);
  `GET https://api.deepseek.com/v1/models` confirma. No OpenRouter os preços/ids saem de
  `GET https://openrouter.ai/api/v1/models`; saldo/uso em `GET /api/v1/key`.

**O gateway relê a cadeia a cada turno** (`gateway/run_config_loaders.py::_refresh_fallback_model`,
"Lets a chain edited after startup reach messaging sessions") — **não precisa reiniciar** para mudar
fallback. Já o **modelo principal** de uma sessão do gateway fica fixado no início da sessão: trocar
provider principal exige reiniciar o gateway (`pause-for-update` no socket de controle; o vigia sobe de novo).

**Verificação (tudo com evidência real):**
- Chaves validadas direto na API: DeepSeek `/v1/models` OK; OpenRouter `/api/v1/key` OK com créditos
  (`is_free_tier: false`).
- Cada elo testado isolado: `hermes --provider deepseek -m deepseek-v4-pro` → atendeu `deepseek-v4-pro`;
  `--provider openrouter -m anthropic/claude-sonnet-5.5` → atendeu `anthropic/claude-sonnet-5.5`.
- **Mecanismo de fallback testado de ponta a ponta**: com a cadeia reduzida a um elo só e o Gemini sem
  cota, o turno foi servido pelo DeepSeek; depois, com só o OpenRouter na cadeia, servido pelo Claude.
- O OpenRouter recebe o prompt mestre inteiro: pedi horários + frase de transferência e ele respondeu
  certo, citando inclusive o relógio injetado ("agora são 22h34 de segunda... retorna amanhã às 9h").
  (A contagem de tokens dele no `session_model_usage` é subestimada — `in=4` — mas o conteúdo chega.)

## Empacotado em Docker (06/10) — 4 serviços, um comando
`docker compose --env-file .env.local up -d --build` (com `CONECTA_ROOT="$PWD"` exportado) sobe:
`hermes` (gateway + bridge do WhatsApp + cron do Hermes), `crm` (Next em 8081), `cron` (agenda interna)
e `watchdog`. Detalhes completos em `DOCKER.md` na raiz do repo.

**Decisões estruturais (e por quê):**
- **O CRM é buildado `FROM nousresearch/hermes-agent:latest`**: ele chama o CLI do Hermes (`send`,
  `chat -q`, `pause/resume`) e os dois escrevem no **mesmo `state.db`**. Mesma imagem = mesma versão de
  CLI e gateway, sem risco de skew de schema. (A imagem de release espera schema 30 e o nosso banco
  estava em 31: testado — lê e escreve normal, `integrity_check` ok, schema preservado.)
- **`network_mode: host` nos quatro serviços**: o CLI fala com o bridge em `127.0.0.1:3005`, o CRM
  escuta 8081 e o Telegram faz polling — cada um com rede própria de container significaria um
  `127.0.0.1` diferente e nada se encontraria.
- **Um volume só** (`./.hermes-home/.hermes` → `/opt/data`) montado em `hermes`, `crm` e `watchdog`:
  config, SOUL, skills, plugins (trava de saída), sessão do WhatsApp e `state.db`.
- **A sessão do WhatsApp é portátil**: subiu no container sem QR novo.

**Armadilhas que custaram tempo (não repetir):**
1. `/usr/bin/tini` na imagem do Hermes é um **shim que sobe o s6-overlay** — e o s6 recusa `--user <uid>`
   ("This is not supported under the s6-overlay image"). No container do CRM usei
   `ENTRYPOINT ["/usr/local/bin/node"]` (sem s6) e deixei o Docker aplicar `user: <uid>:<gid>`.
2. Sem `chown -R ${APP_UID}:${APP_GID} /app` no Dockerfile, `scripts/*.mjs` morrem com `EACCES`
   (o Compose roda como uid do host, os arquivos ficam root).
3. **O hook `pre_llm_call` é registrado com caminho absoluto** (`<raiz>/scripts/hermes-clock-context.py`):
   então `$CONECTA_ROOT/scripts` precisa estar montado no MESMO caminho dentro de todo container que roda
   turnos do Hermes — `hermes` **e** `crm` (o CRM gera o texto da prospecção). Faltava no `crm` e o
   turno saía sem relógio/expediente (falha silenciosa, o turno respondia normal).
4. **`parse_mode: Markdown` no Telegram derruba alertas**: o texto do lead é truncado em 160 chars e o
   corte no meio de uma entidade devolve `400 can't parse entities ... byte offset`. Reproduzi a chamada
   e confirmei: sem parse_mode → 200, com Markdown → 400. Trocado para **HTML** com `&`, `<`, `>`
   escapados (`escaparHtml`). 3 alertas estavam sendo perdidos por isso; os pendentes foram entregues
   no primeiro ciclo depois da correção.
5. Em ambiente com `$HOME` somente-leitura, o buildx falha
   (`open ~/.docker/buildx/activity/...: read-only file system`): usar `DOCKER_CONFIG=<dir gravável>`.

**Verificação feita (tudo real):** 4 containers `healthy`; gateway com `whatsapp/email/telegram/api_server`
conectados; bridge em 3005 estável; CRM 200; agenda rodando (`outbox`, `hermes-sync`, `alerts` com
`sent/failed` corretos); vigia "tudo de pé"; CLI dentro do container do CRM criou e removeu o `ESTOP`
(pausa/retomada) no volume compartilhado; hook do relógio registrando turno feito de dentro do container.
