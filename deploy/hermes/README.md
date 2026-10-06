# Ativos do Hermes (home `/opt/data`) — personas e trava de saída

Estes arquivos não são documentação: são **prompt e código de produção** do atendimento.
Eles vivem no home do Hermes, não no git do CRM, então precisam ser instalados.

```bash
./scripts/install-hermes-assets.sh          # instala/atualiza tudo
./scripts/install-hermes-assets.sh --check  # só verifica (sai 1 se falta ou difere)
```

| Origem no repo | Destino (`$HERMES_HOME` = `/opt/data`) | O que faz |
| --- | --- | --- |
| `deploy/personas/SOUL_WHATSAPP.md` | `SOUL_WHATSAPP.md` | persona do atendimento no WhatsApp |
| `deploy/personas/support_rules.md` | `support_rules.md` | base de produtos/serviços (**gerada**) |
| `deploy/hermes/plugins/crm-output-guard/` | `plugins/crm-output-guard/` | trava de saída (hook `transform_llm_output`) |

---

## Bug 1 — o bot oferecia produto de outro cliente

O assistente de WhatsApp roda em cima do `whatsapp_manager.py` do template
[`leoalvesia/whatsappkit`](https://github.com/leoalvesia/whatsappkit) (nome antigo do repo:
`hermes-whatsapp-mixed`). Essa função decide persona e base de conhecimento:

```python
# whatsapp_manager.py, _load_support_files()
whatsapp_soul  = ler("/opt/data/SOUL_WHATSAPP.md")   # ausente -> "chatbot de suporte, polido..."
rules_content  = ler("/opt/data/support_rules.md")   # ausente -> fallback HARDCODED abaixo
if not rules_content:
    rules_content = "Responda de forma profissional e ajude com Chatkanban, Chatcommerce e Api Connector."
```

E `support_rules.md` entra no prompt do cliente como *"### REFERÊNCIA DE PRODUTOS E NEGÓCIOS DO
&lt;DONO&gt; ###"*. Com o arquivo ausente, o modelo tratava **Chatkanban, Chatcommerce e Api
Connector** como produtos da MLLuiz DevTech — daí a resposta *"Olá, boa tarde! Como posso te
ajudar hoje com o Chatkanban, Chatcommerce ou Api Connector?"*.

Por que faltava: no boot o script tenta baixar `SOUL.md`, `SOUL_WHATSAPP.md`, `SOUL_EMAIL.md` e
`support_rules.md` de `https://raw.githubusercontent.com/<github_user>/whatsappkit/main/deploy/`.
O download falhava (404 — repositório de configuração inexistente) e o script seguia com o
fallback. O bootstrap só baixa arquivo **ausente**, então instalar aqui encerra o problema.

## Bug 2 — o log do bridge ia colado na resposta do lead

O mesmo script imprime o log do boot no stdout, e esse texto chegou **dentro da mensagem
entregue ao cliente**:

```
[whatsapp-manager] Inicializando /opt/data/SOUL.md a partir de https://raw.githubusercontent.com/... (11 linhas)
Olá, Clínica São Paulo Dental Studio! A MLLuiz DevTech cria sites, sistemas e automação sob medida...
```

Isso vazou caminho interno do container, URL de repositório, nome de skill e o nome de hooks para
o lead — e sujou a conversa no CRM.

Correção em duas camadas:

1. **Antes de entregar** — `plugins/crm-output-guard/` (hook `transform_llm_output`) descarta as
   linhas de log e, se sobrar pouco, entrega um aviso neutro em vez de vazar. Também é ele que
   corta monólogo interno, assinatura de spam e sintaxe de tool-call.
2. **Antes de espelhar** — `src/services/messaging/hermes-sync.ts` limpa a saída do agente e
   **não espelha** mensagem que era só log (contador `noiseSkipped` no retorno do sync).

As regras de "o que é log" existem nos dois lados e **têm que andar juntas**:

- TypeScript: `src/services/messaging/hermes-noise.ts` (usado também pelo `agent-outreach`)
- Python: `deploy/hermes/plugins/crm-output-guard/__init__.py`

---

## Como aplicar

### Local (docker compose)

```bash
node scripts/build-support-rules.mjs       # regenera support_rules.md (se a base mudou)
./scripts/install-hermes-assets.sh         # copia personas + plugin para .hermes-home/.hermes
docker compose --env-file .env.local restart hermes
```

### VPS com Node puro + PM2 (sem Docker)

O home do Hermes é **`/opt/data`** — o mesmo path que o `whatsapp_manager` usa para ler
`SOUL_WHATSAPP.md` e `support_rules.md`. O script detecta isso sozinho.

```bash
pm2 list                                                     # nomes dos processos
pm2 describe conecta-crm | grep -iE "script path|exec cwd"   # acha a pasta do projeto
PROJETO=/root/projects/conecta-crm                           # ajuste para a sua
cd "$PROJETO"
git pull

# 1. personas + trava de saída no home do Hermes (precisa poder escrever em /opt/data)
./scripts/install-hermes-assets.sh
#    se der erro de permissão:  sudo -E ./scripts/install-hermes-assets.sh

# 2. build novo do CRM (a limpeza do log no sync é código do app)
npm ci && npm run build

# 3. reinicie os processos (nomes deste deployment)
pm2 restart conecta-crm crm-cron --update-env    # CRM + agenda
pm2 restart vendedor-ia --update-env             # atendimento: relê persona + trava
pm2 restart whatsapp-bridge --update-env         # bridge do WhatsApp (por último)
```

> O `whatsapp-bridge` é o mais sensível: reinicie por último e acompanhe
> `pm2 logs whatsapp-bridge --lines 30` — se pedir QR, escaneie.
> O instalador imprime essa mesma lista já com os nomes que ele encontrou no `pm2 jlist`.

Confirme que o sync está com o código novo (deve aparecer `noiseSkipped`):

```bash
curl -s "http://127.0.0.1:8081/api/cron/hermes-sync" -H "Authorization: Bearer $CRON_SECRET"
# {"ok":true,"sessions":..,"contacts":..,"conversations":..,"messages":0,"noiseSkipped":0}
```

> O CRM lê o `state.db` pelo `HERMES_HOME` do processo. Numa VPS sem Docker, confira no
> `.env.local` do CRM (ou no `ecosystem.config.js` do PM2): `HERMES_HOME=/opt/data` e
> `HERMES_BIN` apontando para o CLI do Hermes (`which hermes`).

### Docker / VPS com compose

```bash
cd "$PROJETO"
git pull
./scripts/install-hermes-assets.sh
docker compose --env-file .env.local restart hermes
docker compose --env-file .env.local up -d --build   # para valer o build do CRM
```

### Conferir que instalou

```bash
HOME_HERMES="${HERMES_HOME:-/opt/data}"      # local: .hermes-home/.hermes
ls -l "$HOME_HERMES"/{SOUL_WHATSAPP.md,support_rules.md}
grep -ril "chatkanban\|chatcommerce" "$HOME_HERMES"/*.md "$HOME_HERMES"/plugins || echo limpo
./scripts/install-hermes-assets.sh --check   # compara repo x instalado
```

Depois mande um "oi" para o número: a resposta não pode citar produto de terceiro nem trazer
linha `[whatsapp-manager] ...` na frente.

### Limpar o histórico que já está no CRM

```bash
node scripts/clean-hermes-noise.mjs           # dry-run: mostra o antes/depois
node scripts/clean-hermes-noise.mjs --apply   # grava
```

Reescreve as mensagens espelhadas do Hermes tirando o log (mantendo a conversa) e apaga as que
eram só log.

---

## Regenerar a base de conhecimento

`support_rules.md` é **gerado** de `scripts/knowledge.json` (os mesmos itens cadastrados no CRM
em `knowledge_base_items`):

```bash
node scripts/build-support-rules.mjs
```

O gerador preserva o conteúdo dos itens literalmente e acrescenta as regras de tom, trava
comercial e escalonamento escritas no próprio script. Ajuste essas partes em
`scripts/build-support-rules.mjs` — não no arquivo gerado, que é sobrescrito.

## Testes

```bash
node --test src/services/messaging/hermes-noise.test.ts   # regras de ruído (TS)
node --test "src/**/*.test.ts"                            # toda a suíte TS (Node 24; no 22 use --experimental-strip-types)
python3 scripts/test-output-guard.py                      # trava de saída (inclui o caso real do vazamento)
./scripts/install-hermes-assets.sh --check                # personas + plugin em dia
```

O teste da trava roda contra a **fonte versionada** e ainda confere que a cópia instalada está
idêntica (sem drift).

## Pendências conhecidas

**`SOUL_EMAIL.md`** não existe: o canal de e-mail fica sem persona própria (não há fallback de
produto nesse caminho, então não há risco de vazar oferta de terceiro). Para cobrir, crie
`deploy/personas/SOUL_EMAIL.md` — o instalador copia qualquer `.md` daquela pasta.

**`SOUL.md` (prompt mestre) não é versionado.** Ele vive só no home do Hermes e viaja pelo rsync
do `deploy/ship.sh` — numa VPS atualizada por `git pull` ele **não** chega. O instalador avisa
quando ele falta. Se o boot não encontrá-lo, o `whatsapp_manager` tenta baixar do GitHub
(`raw.githubusercontent.com/<github_user>/whatsappkit/main/deploy/SOUL.md`) e, se esse repo não
existe, o Hermes fica sem persona mestre. Para versionar de vez:

```bash
cp .hermes-home/.hermes/SOUL.md deploy/personas/SOUL.md   # a partir daí vale o --check também
./scripts/install-hermes-assets.sh
```

Confira na VPS: `ls -l "${HERMES_HOME:-/opt/data}"/SOUL.md` — se não existir, copie o seu.
