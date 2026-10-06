# Ativos do Hermes (personas e trava de saída)

Estes arquivos não são documentação: são **prompt e código de produção** do atendimento.
Eles vivem fora do git do CRM, então precisam ser instalados — e vão para **dois lugares
diferentes**, porque quem lê cada um é um processo diferente:

| Origem no repo | Destino real | Quem lê | O que faz |
| --- | --- | --- | --- |
| `deploy/personas/SOUL_WHATSAPP.md` | **`/opt/data/SOUL_WHATSAPP.md`** | `whatsapp_manager` | persona do atendimento no WhatsApp |
| `deploy/personas/support_rules.md` | **`/opt/data/support_rules.md`** | `whatsapp_manager` | base de produtos/serviços (**gerada**) |
| `deploy/hermes/plugins/crm-output-guard/` | **`$HERMES_HOME/plugins/crm-output-guard/`** | Hermes (`$HERMES_HOME`, ex.: `/root/.hermes`) | trava de saída (hook `transform_llm_output`) |

O `whatsapp_manager.py` tem **`/opt/data` cravado** no código para as personas
(`soul_path = "/opt/data/SOUL_WHATSAPP.md"`), enquanto o Hermes carrega plugins do **home dele**
(e o CRM lê o `state.db` desse mesmo home, via `HERMES_HOME` do `.env.local`). Na VPS isso dá:

```
/opt/data/SOUL_WHATSAPP.md          <- persona lida pelo manager
/opt/data/support_rules.md          <- base lida pelo manager
/root/.hermes/plugins/crm-output-guard/   <- trava carregada pelo Hermes
/root/.hermes/state.db              <- histórico que o CRM espelha
```

```bash
./scripts/install-hermes-assets.sh          # instala/atualiza os dois destinos
./scripts/install-hermes-assets.sh --check  # só verifica (sai 1 se falta ou difere)
```

O script decide assim:

- **personas**: `$WHATSAPP_DATA_DIR` → `/opt/data` (se parecer o data dir do WhatsApp) → `$HERMES_HOME`.
  Se o seu `/opt/data` for outro caminho, force: `WHATSAPP_DATA_DIR=/caminho ./scripts/install-hermes-assets.sh`;
- **plugin**: `$HERMES_HOME/plugins`, com o `$HERMES_HOME` vindo do ambiente ou do `HERMES_HOME=`
  do seu `.env.local` (é o mesmo home que o CRM usa para o sync — o script avisa se divergirem);
- antes de sobrescrever qualquer arquivo existente, ele guarda uma cópia em
  `<destino>/.backups-install/<arquivo>.<data>`.

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

## Habilitar o plugin (uma vez)

O Hermes só carrega um plugin que esteja em `plugins.enabled` do `config.yaml`. O instalador
avisa quando falta; para habilitar sem editar YAML na mão (e sem risco de derrubar o agente):

```bash
python3 scripts/enable-hermes-plugin.py           # usa $HERMES_HOME/config.yaml
python3 scripts/enable-hermes-plugin.py --check   # só verifica (sai 1 se não estiver habilitado)
```

Ele faz backup do `config.yaml`, insere a linha na lista certa, é idempotente e não toca em
nada mais. Depois: `pm2 restart whatsapp-bridge --update-env` (plugin é registrado no boot —
as personas, não: o manager lê a cada mensagem).

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
# o build é `output: standalone` — o Next não copia public/ e .next/static (no Docker o
# Dockerfile faz isso). Sem estes dois cp o CRM sobe sem CSS/JS:
cp -r public .next/standalone/public 2>/dev/null || true
mkdir -p .next/standalone/.next && cp -r .next/static .next/standalone/.next/static

# 3. reinicie os processos (nomes deste deployment)
pm2 restart conecta-crm crm-cron --update-env    # CRM + agenda
pm2 restart whatsapp-bridge --update-env         # atendimento: relê persona + trava de saída
```

> O processo do atendimento é o que roda **dentro do home do Hermes** — na sua VPS,
> `whatsapp-bridge` (`/root/.hermes/plugins/whatsapp-manager/bridge.js`). O instalador acha
> esse nome sozinho pelo `pm2 jlist` e imprime o comando pronto. Reinicie por último e
> acompanhe `pm2 logs whatsapp-bridge --lines 30 --timestamp --nostream` — se pedir QR, escaneie.

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

> **Leia log com data, sempre.** `pm2 logs` mostra o **fim do arquivo**, não o que acabou de
> acontecer: um `Cannot find module` de horas atrás parece atual e assusta à toa. Use
> `--timestamp --nostream` e confira o `ls -l /root/.pm2/logs/whatsapp-bridge-error.log`
> (se o mtime é antigo, o erro é antigo).

```bash
# personas (lidas pelo whatsapp_manager)
ls -l /opt/data/SOUL_WHATSAPP.md /opt/data/support_rules.md 2>&1
grep -ril "chatkanban\|chatcommerce" /opt/data/*.md 2>/dev/null || echo "personas limpas"

# plugin (carregado pelo Hermes)
ls -l "${HERMES_HOME:-$HOME/.hermes}"/plugins/crm-output-guard/

# o instalador compara repo x instalado nos dois destinos
./scripts/install-hermes-assets.sh --check
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
python3 scripts/enable-hermes-plugin.py --check           # plugin habilitado no config.yaml
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
