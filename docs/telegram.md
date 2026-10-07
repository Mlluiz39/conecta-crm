# Telegram no ConectaCRM

O CRM usa **um bot do Telegram** com dois papéis:

| Papel | O que faz | Como funciona |
|---|---|---|
| **Alertas** | avisa lead contatado/respondeu/quer fechar/call marcada | `src/services/alerts/engine.ts` → `sendMessage` |
| **Atendimento** | quem escreve no bot vira contato + conversa e o agente responde | `src/services/messaging/telegram.adapter.ts` (canal `telegram`) |

É o mesmo token (`TELEGRAM_BOT_TOKEN`), mas o canal de atendimento tem variáveis próprias.

## Variáveis

| Variável | Para que serve |
|---|---|
| `TELEGRAM_BOT_TOKEN` | token do bot (só do CRM — **não** reuse o bot do Hermes) |
| `ALERTS_TELEGRAM_CHAT_ID` | chat que recebe os alertas (fale `/start` com o bot antes) |
| `TELEGRAM_WEBHOOK_SECRET` | `secret_token` do `setWebhook`; sem ele o webhook recusa tudo (`openssl rand -hex 24`) |
| `TELEGRAM_ALLOWED_CHAT_IDS` | chat ids que podem conversar com o bot; **vazio = qualquer pessoa** que achar o @ do bot |
| `TELEGRAM_OWNER_CHAT_IDS` | chat do dono (CEO) — cai para `ALERTS_TELEGRAM_CHAT_ID` se vazio. Ver "modo dono" abaixo |

O alerta passou a ler **só** essas variáveis do CRM: antes havia um fallback para o `.env` do
Hermes (`$HERMES_HOME/.env`), o que fazia o alerta sair do bot errado sem ninguém perceber.

## Modo dono (CEO falando com o Gerente)

O chat do dono **não é um lead**: nada de funil, alerta de "lead respondeu", regra de
transbordo ou discurso de vendas. O que muda:

| | Lead (cliente) | Dono (CEO) |
|---|---|---|
| Conversa | inbox de Conversas | `conversations.is_internal = true` — fora do inbox e dos alertas |
| Prompt | prompt publicado do agente | instrução de modo interno (`src/services/agents/internal.ts`) |
| Agente | o do canal (gerente → especialistas) | sempre o **gerente** |
| Ferramentas | agendar, mover funil, transbordar… | **só leitura**: `buscar_informacoes` (base de conhecimento), `panorama_crm`, `situacao_lead`, `agenda` |
| Transbordo | regra pode desligar a IA | nunca |

É assim que ele responde "quais serviços vocês oferecem?" (base de conhecimento) e "como está
o lead da Odonto X?" / "como foi o dia?" (dados reais do CRM, calculados na hora).

Quem entra nesse modo: os chats de `TELEGRAM_OWNER_CHAT_IDS` (ou `ALERTS_TELEGRAM_CHAT_ID`).
A migration `20261010_conversa_interna.sql` é que cria o `is_internal` — sem ela o upsert da
conversa falha.

## Ligar o atendimento (uma vez)

```bash
# 1. migration (enum channel_type + contacts.telegram_chat_id)
node scripts/apply-sql.mjs supabase/migrations/20261009_telegram_channel.sql

# 2. canal + agente do canal + webhook na Bot API (idempotente)
node scripts/setup-telegram-channel.mjs                  # usa NEXT_PUBLIC_APP_URL
AGENTE="Ana Silva" node scripts/setup-telegram-channel.mjs https://crm.exemplo.com
```

O script grava em `channels` (`type='telegram'`, `cernio_channel_id=<id do bot>`,
`config={"provider":"telegram"}`, sem segredo no banco) e em `agent_channels` — **um agente
ativo por canal**, então ele desativa os outros do canal `telegram` antes de ativar o escolhido.

Confira depois:

```bash
curl -s https://SEU-DOMINIO/api/cron/alerts          # {"telegram":true,"bot":"bot 123456789",...}
curl -s "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/getWebhookInfo"
```

## Como uma mensagem flui

```
Telegram ──POST──► /api/webhooks/telegram        (valida x-telegram-bot-api-secret-token)
                        │
                        ├─ contato por contacts.telegram_chat_id  (Telegram não tem telefone)
                        ├─ conversa (channel_type='telegram', external_id='tg_<chat>')
                        ├─ messages (direction='in')
                        └─ agente (agent_channels.channel='telegram') ──► messages out 'pendente'
                                                                              │
                                          flushOutbox ──► providerFromConfig({provider:'telegram'})
                                                              └─ sendMessage/sendAudio
```

Detalhes que valem saber:

* **Sem telefone.** O identificador é o `chat.id`, guardado em `contacts.telegram_chat_id`.
  Se fosse para `contacts.phone`, o match por sufixo de 9 dígitos do CRM poderia casar um chat
  id com um número de WhatsApp e fundir dois leads.
* **Destino do envio** é resolvido no `flushOutbox`: `phone` nos canais de WhatsApp,
  `telegram_chat_id` no Telegram.
* **Texto puro** (sem `parse_mode`): resposta de modelo com markdown quebrado faz a Bot API
  devolver 400 e a mensagem se perder — mesma lição dos alertas.
* **Áudio** sai como `sendAudio` (a API só aceita OGG/OPUS no `sendVoice` e o TTS devolve mp3).
  Voz do lead é baixada por `getFile` e transcrita como no WhatsApp.
* **Sem recibo de leitura**: a Bot API não expõe isso, então `markRead` não existe no adapter.

## Problemas comuns

| Sintoma | Causa provável | O que fazer |
|---|---|---|
| Webhook devolve `401` | `TELEGRAM_WEBHOOK_SECRET` diferente do registrado | rode de novo `node scripts/setup-telegram-channel.mjs` |
| Bot não responde nada | chat fora de `TELEGRAM_ALLOWED_CHAT_IDS` | veja `[telegram] chat ... fora da allowlist` em `docker logs conectacrm-web` |
| Resposta sai no CRM mas não no Telegram | canal sem `config.provider='telegram'` (foi criado pelo fallback do webhook) | `node scripts/setup-telegram-channel.mjs` |
| Alerta e atendimento saindo de bots diferentes | `TELEGRAM_BOT_TOKEN` trocado no meio do caminho | `curl -s .../api/cron/alerts` mostra o id do bot em uso |
| Nada chega depois de trocar de domínio | webhook aponta para o domínio antigo | rode o script com a URL nova |
