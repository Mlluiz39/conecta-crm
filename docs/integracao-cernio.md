# Guia de integração — Cernio

A mensageria é isolada atrás da interface `MessageProvider`
(`src/services/messaging/types.ts`). Trocar de provedor (Cernio → Meta Cloud
API direto) significa escrever um novo adapter e registrá-lo — nada no webhook
handler, no motor de agentes ou na UI muda.

## Arquivos

| Arquivo | Papel |
|---|---|
| `src/services/messaging/types.ts` | Contrato `MessageProvider` + `InboundMessage` |
| `src/services/messaging/cernio.adapter.ts` | Adapter Cernio (stub até haver contrato) |
| `src/services/messaging/index.ts` | Registry de providers |
| `src/services/messaging/inbound.service.ts` | Fluxo do webhook + outbox |
| `src/app/api/webhooks/[provider]/route.ts` | Endpoint de entrada |
| `src/app/api/cron/outbox/route.ts` | Envio assíncrono/retry |

## Configurar credenciais

`.env.local`:

```env
CERNIO_API_URL="https://api.cernio.com"
CERNIO_API_KEY="..."
CERNIO_WEBHOOK_SECRET="..."   # vazio em dev = aceita qualquer assinatura
```

Registrar o webhook no painel da Cernio apontando para
`https://<seu-dominio>/api/webhooks/cernio`.

## Contrato esperado do webhook

O adapter aceita `{ "messages": [...] }`, `{ "message": {...} }` ou um objeto
único. Campos esperados por mensagem:

```json
{
  "id": "msg_123",              // id da mensagem (dedup de 2º nível)
  "event_id": "evt_123",        // id do evento (idempotência de 1º nível; default = id)
  "channel": "whatsapp",        // whatsapp | instagram | messenger
  "account_id": "num_55...",    // telefone/página que resolve a organização
  "from": "5511999998888",
  "from_name": "Ana",
  "type": "text",              // text | image | audio | video | document | interactive
  "text": "Olá, quero agendar",
  "media_url": null,
  "timestamp": "2026-10-04T14:00:00Z"
}
```

- **`account_id`** precisa bater com `agent_channels.external_account_id`
  (cadastrado ao vincular um agente a um canal). Sem isso o evento é ignorado.
- **Assinatura**: HMAC-SHA256 do corpo cru com `CERNIO_WEBHOOK_SECRET`, no
  header `x-cernio-signature` (aceita prefixo `sha256=`). Ajuste em
  `verifySignature` se o formato real for diferente.

## Fluxo

```
POST /api/webhooks/cernio
  → verifySignature
  → insert webhook_events (unique provider+event_id)  → duplicata = 200, sem reprocesso
  → resolve organização por account_id
  → upsert contato (por telefone) + conversa
  → insert mensagem (unique external_message_id)
  → runAgentForConversation  (handoff? → não chama IA, notifica atendente)
  → insert message_outbox (resposta do agente)
  → 200 imediato

GET /api/cron/outbox  (a cada 5 min, vercel.json)
  → envia pendentes pelo provider, marca sent, retry com backoff (5 tentativas)
```

A IA **nunca** roda dentro do request do webhook de forma bloqueante para o
provider: a resposta é enfileirada e enviada pelo cron.

## Testar localmente

```bash
# 1. subir o app
npm run dev

# 2. simular uma mensagem (sem segredo configurado, assinatura é aceita)
curl -X POST http://localhost:3000/api/webhooks/cernio \
  -H 'content-type: application/json' \
  -d '{
    "messages": [{
      "id": "test_1", "event_id": "test_1", "channel": "whatsapp",
      "account_id": "SEU_ACCOUNT_ID", "from": "5511999998888",
      "from_name": "Ana", "type": "text",
      "text": "Oi, queria saber o preço", "timestamp": "2026-10-04T14:00:00Z"
    }]
  }'

# 3. reenviar o MESMO payload → deve responder sem duplicar (idempotência)

# 4. disparar a fila de saída
curl http://localhost:3000/api/cron/outbox -H "authorization: Bearer $CRON_SECRET"
```

Verifique em `Contatos` / `Conversas` que o contato e a conversa apareceram, e
em `ai_runs` (Supabase) o registro da execução da IA com as ferramentas chamadas.

## Com assinatura ativa

```bash
BODY='{"messages":[...]}'
SIG=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$CERNIO_WEBHOOK_SECRET" | awk '{print $2}')
curl -X POST http://localhost:3000/api/webhooks/cernio \
  -H 'content-type: application/json' -H "x-cernio-signature: sha256=$SIG" -d "$BODY"
```

## Trocar de provedor

1. Criar `src/services/messaging/<novo>.adapter.ts` implementando `MessageProvider`.
2. Registrar em `registry` (`src/services/messaging/index.ts`).
3. Apontar o webhook para `/api/webhooks/<nome>`.

Para a **Meta Cloud API** direto: `sendText`/`sendTemplate` chamam
`https://graph.facebook.com/v19.0/{phone-number-id}/messages`; `verifySignature`
valida o header `x-hub-signature-256`.

## Pendências a validar quando houver credenciais

- Formato exato da assinatura e nomes dos campos do payload.
- Tipo de evento para mensagens vs. status de entrega (status pode chegar antes
  da mensagem — hoje o dedup os separa por `external_message_id`).
- Janela de 24h do WhatsApp: outbound proativo fora da janela exige template
  aprovado — a `message_outbox` já suporta `sendTemplate`.
