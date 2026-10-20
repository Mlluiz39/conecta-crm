# Captação de leads e opt-out

Três peças novas fecham o buraco entre "ter um CRM" e "receber lead":

1. **Fonte pública de captação** (`/api/captacao/<token>`) para formulário, landing page,
   anúncio ou automação (Zapier/n8n/Make).
2. **Card automático no funil** para toda conversa inbound — a conversa deixa de ficar só na
   caixa de entrada e passa a aparecer no Pipeline.
3. **Supressão (opt-out)** para quem pediu para não receber mais: bloqueia prospecção,
   follow-up e disparo em massa, sem apagar o histórico.

## 1. Fonte de captação

### Criar pela tela

`Configurações → Captação de leads → Nova fonte de captação`.

- **Nome**: serve para você saber de onde veio (Site, Landing Black Friday, Anúncio Meta).
- **Entrar no funil em**: opcional; vazio = primeira etapa do funil.
- A tela gera uma URL `https://seu-dominio/api/captacao/<token>`.
- **Desativar** corta a entrada na hora, sem apagar a fonte.
- **Apagar** invalida a URL; os leads já captados continuam no CRM.

> O token é a credencial. Quem tiver a URL consegue criar lead naquela organização.
> Use uma fonte por campanha e apague/desative se a URL vazar.

### Enviar um lead

Aceita `application/json` e `application/x-www-form-urlencoded` (formulário HTML).
Telefone **ou** e-mail é obrigatório. Nome é opcional.

```bash
curl -X POST "https://seu-dominio/api/captacao/SEU_TOKEN" \
  -H "content-type: application/json" \
  -d '{
    "nome": "Ana Souza",
    "telefone": "(11) 98888-7777",
    "email": "ana@exemplo.com",
    "empresa": "Clínica Sorriso",
    "cidade": "São Paulo",
    "mensagem": "Quero um orçamento",
    "utm_source": "google",
    "utm_campaign": "black-friday",
    "gclid": "abc123"
  }'
```

Resposta:

```json
{
  "ok": true,
  "contact_id": "…",
  "lead_id": "…",
  "card_created": true
}
```

Erros de formulário voltam como `422` com `{ "ok": false, "error": "…" }`.

### Campos aceitos

| Campo | Apelidos |
|---|---|
| Nome | `nome`, `name`, `nome_completo`, `full_name`, `contato` |
| Telefone | `telefone`, `phone`, `whatsapp`, `celular`, `fone` |
| E-mail | `email`, `e-mail`, `mail` |
| Empresa | `empresa`, `company`, `organizacao`, `negocio` |
| Cidade | `cidade`, `city`, `municipio` |
| Mensagem | `mensagem`, `message`, `observacao`, `comentario`, `duvida` |
| ID externo | `external_id`, `id_externo`, `event_id` |
| Rastreio | `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `utm_term`, `utm_id`, `utm_adset`, `utm_ad`, `utm_placement`, `utm_matchtype`, `utm_network`, `utm_device`, `utm_creative`, `gclid`, `gbraid`, `wbraid`, `fbclid`, `ctwa_clid`, `ttclid`, `msclkid` |

Chaves desconhecidas **não** são gravadas (evita PII sem controle). O rastreio fica em
`contacts.custom_fields.utm`, a origem em `custom_fields.origem = "captacao"` e o nome da
fonte em `custom_fields.formulario`.

### O que a rota garante

- **Sem duplicar contato**: procura por telefone exato, sufixo com DDD e e-mail. O sufixo
  preserva o DDD (`11 97777-6666` não casa com `21 97777-6666`); `src/lib/data/phone-match.ts`
  concentra a regra.
- **Sem duplicar card**: se o contato já tem oportunidade aberta, devolve a existente
  (`card_created: false`).
- **Primeiro toque vence**: uma segunda captura não sobrescreve `origem`/`utm`.
- **Limite de abuso**: body de 64 KB e 30 requisições por minuto por token/IP
  (best-effort em memória; não substitui WAF).

## 2. Card automático para conversa inbound

Toda mensagem recebida de contato externo (`is_internal = false`) garante uma oportunidade
aberta no funil, na primeira etapa (ou na etapa configurada na fonte, no caso de captação).
A criação é determinística — não depende de o modelo lembrar de chamar ferramenta — e
idempotente: se já existe card aberto, nada é criado.

- Card ganho/perdido não é reaberto automaticamente; lead que volta depois de perdido ganha
  card novo.
- Organização sem etapa de funil cadastrada não recebe card (o contato e a conversa continuam
  salvos).
- O card nasce antes do turno do agente, então a ferramenta `mover_etapa_funil` já enxerga a
  oportunidade na mesma conversa.

## 3. Opt-out / supressão

### Automático

Quando o lead escreve algo como "pare de me mandar", "não quero mais receber",
"me descadastrar" ou "sair da lista", o webhook:

1. grava a supressão em `contact_suppressions` (telefone e e-mail do contato);
2. cancela o que estava pendente em `outreach_queue`.

A IA ainda responde a mensagem normalmente; o bloqueio vale para os próximos disparos.

### Manual

Na tela do contato, cartão **"Não contatar (opt-out)"**:

- **Bloquear contato** grava a supressão por contato + telefone + e-mail.
- **Remover bloqueio** libera o contato de novo (ato explícito de quem atende).

### Onde o bloqueio vale

- enfileirar prospecção (`enqueueOutreach`);
- ciclo de disparo (`runOutreachCycle`) — cancela item pendente e não envia;
- follow-up automático (`findFollowupCandidates`);
- prospecção manual (`prospectManualLead`) — recusa com mensagem clara.

A supressão é por organização e sobrevive à exclusão do contato (a linha fica pelo menos com
telefone/e-mail), então uma reimportação do mesmo número continua bloqueada.

## Banco de dados

Migration: `supabase/migrations/20261020_captacao_e_optout.sql`.

- `lead_capture_sources`: fonte + token + etapa opcional + ativo/inativo.
- `contact_suppressions`: contato/telefone/e-mail + motivo + origem + autor.
- RLS: fonte é configuração (membro lê; admin/gerente administra); supressão é operação
  (qualquer membro lê e gerencia).

Aplique com `supabase db push` (ou pelo SQL Editor do Supabase) antes de usar a tela.

## Limites conhecidos

- A rota **não** cria anúncio, não gerencia campanha e não puxa Meta Lead Ads nativo.
- Não há entrada de e-mail (o Gmail é somente envio).
- O limite de requisições é em memória por instância; em várias réplicas o teto efetivo é
  maior.
- A detecção automática cobre pedido explícito em português; casos ambíguos continuam
  dependendo do botão manual no contato.
