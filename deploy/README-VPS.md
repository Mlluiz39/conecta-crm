# ConectaCRM + Hermes numa VPS

Guia para tirar a stack da sua máquina e deixar rodando 24/7 num servidor.

> **A VPS roda Node puro + PM2, sem Docker?** Vá direto para a [seção 10](#10-vps-com-node-puro--pm2-sem-docker).
> O passo que não pode faltar depois de cada `git pull` é `./scripts/install-hermes-assets.sh`
> (personas + trava de saída no home do Hermes) seguido de `npm run build` e `pm2 restart`.
> O projeto pode estar em qualquer pasta (ex.: `/root/projects/conecta-crm`) — o instalador acha a raiz
> sozinho; só entre na pasta do repo antes de rodar.

## 1. Que VPS contratar

| Item | Mínimo | Recomendado |
|---|---|---|
| CPU | 2 vCPU | 2–4 vCPU |
| RAM | **4 GB** | 8 GB (o gateway do Hermes pede 2–4 GB; navegador headless pede mais) |
| Disco | 40 GB | 60 GB (as duas imagens somam ~9 GB + logs/volume) |
| Sistema | Ubuntu 24.04 LTS (amd64 ou arm64 — as duas funcionam) | idem |
| Região | São Paulo / América do Sul | idem (menos latência no WhatsApp) |

Custo típico: US$ 5–12/mês. Provedores: Hetzner, DigitalOcean, Vultr, Contabo, Oracle Free (arm64),
Hostinger, ou qualquer um com Docker.

> ⚠️ **Evite consoles web de VPS** para colar comandos e chaves: alguns corrompem caracteres
> especiais (`:` `@` `=`). Use SSH.

## 2. Preparar a VPS (uma vez)

```bash
ssh root@IP_DA_VPS

# Docker + compose plugin
curl -fsSL https://get.docker.com | sh
apt-get install -y rsync ufw

# firewall: só SSH, HTTP e HTTPS
ufw allow 22/tcp && ufw allow 80/tcp && ufw allow 443/tcp && ufw --force enable

# usuário dono dos arquivos (para os volumes não ficarem do root)
# se você vai rodar como root mesmo, siga em frente; senão:
# adduser --disabled-password --gecos "" conecta && usermod -aG docker conecta
```

O app roda como o usuário dono dos arquivos (`HERMES_UID`/`HERMES_GID`); em VPS o normal é 1000.

## 3. Enviar e subir (da sua máquina)

Antes de enviar, crie um env file **só para a VPS** (assim o `.env.local` da sua máquina continua
apontando para `localhost` e a stack local não quebra):

```bash
# gera o .env.vps a partir do .env.local, já com URL/domínio/bind certos
./deploy/make-vps-env.sh crm.seudominio.com.br
# (só IP, sem HTTPS: ./deploy/make-vps-env.sh 203.0.113.10 --http)
```

```ini
NEXT_PUBLIC_APP_URL="https://crm.seudominio.com.br"     # ou http://IP_DA_VPS se ainda não tem domínio
GOOGLE_REDIRECT_URI="https://crm.seudominio.com.br/api/integrations/google/callback"
CRM_BIND="127.0.0.1"        # só o proxy alcança o CRM (recomendado com domínio)
CRM_DOMAIN="crm.seudominio.com.br"
HERMES_UID="1000"
HERMES_GID="1000"
```

> `NEXT_PUBLIC_*` é **embutido no bundle em tempo de build**. Trocar depois exige `--build`, não
> só `up -d`.

Depois:

```bash
cd /caminho/do/repo
ENV_FILE=.env.vps ./deploy/ship.sh usuario@IP_DA_VPS
```

O script conecta por SSH, envia o repositório (~4 MB), o env file indicado (`.env.vps`) e o **essencial** do home do
Hermes (~12 MB: config, chaves, SOUL, skills, plugins, `state.db`, sessão do WhatsApp), e sobe a stack
com `--build`. Os 2,5 GB de runtime local **não** viajam — dentro do container o Hermes usa o runtime da
própria imagem.

Flags úteis:

```bash
./deploy/ship.sh usuario@ip --no-home       # só o código (não toca no home do Hermes)
./deploy/ship.sh usuario@ip --build-only    # não copia nada, só reconstrói na VPS
./deploy/ship.sh usuario@ip --assets-only   # código já está na VPS (git clone); envia só env + home
REMOTE_DIR=/srv/conectacrm ./deploy/ship.sh usuario@ip
```

### Fluxo alternativo: código pelo GitHub

Mais confortável se você já versiona o projeto: o código vai por `git`, e só os **ativos com segredo**
(env + home do Hermes) vão por rsync — eles nunca devem entrar no git.

```bash
# 1) na VPS
sudo mkdir -p /opt/conectacrm && sudo chown "$USER" /opt/conectacrm
git clone -b SUA_BRANCH git@github.com:SEU_USUARIO/conecta-crm.git /opt/conectacrm

# 2) da sua máquina (envia .env.vps -> .env.local e o home essencial do Hermes, depois sobe)
cd /caminho/do/repo
./deploy/make-vps-env.sh crm.seudominio.com.br
ENV_FILE=.env.vps ./deploy/ship.sh usuario@IP_DA_VPS --assets-only

# 3) atualizar depois: git pull na VPS + personas + reconstruir
ssh usuario@IP_DA_VPS 'cd /opt/conectacrm && git pull && ./scripts/install-hermes-assets.sh && CONECTA_ROOT=$PWD docker compose --env-file .env.local up -d --build'
```

> **Personas do atendimento (obrigatório).** `deploy/personas/SOUL_WHATSAPP.md` e
> `support_rules.md` são o prompt do bot de WhatsApp e ficam no volume, não no git.
> Depois de cada `git pull`, rode `./scripts/install-hermes-assets.sh` (ou
> `./scripts/install-hermes-assets.sh --check` para só verificar). Sem esses arquivos o script de
> WhatsApp cai num fallback hardcoded que oferece produto de terceiro — detalhes em
> [`hermes/README.md`](hermes/README.md).

> Para o `git clone` funcionar, a chave SSH da VPS precisa estar cadastrada no GitHub
> (Settings → SSH keys) ou use HTTPS com um token.

## 4. Conferir

```bash
ssh usuario@IP_DA_VPS
cd /opt/conectacrm
docker compose --env-file .env.local ps                 # 4 serviços healthy
docker compose logs -f hermes                           # WhatsApp/e-mail/Telegram conectando
docker compose logs --tail 20 cron                      # agenda rodando
curl -s localhost:3005/health                           # bridge do WhatsApp
curl -s -o /dev/null -w '%{http_code}\n' localhost:8081/login
```

**WhatsApp**: a sessão veio no volume, então normalmente **não pede QR novo**. Se pedir, escaneie o QR
que aparece em `docker compose logs -f hermes` (WhatsApp → Aparelhos conectados → Conectar aparelho).
Como o container roda em segundo plano, o QR pode expirar rápido: rode
`docker compose restart hermes` e acompanhe o log.

## 5. Expor o CRM: Cloudflare Tunnel (recomendado) ou Caddy

### Opção A — Cloudflare Tunnel (não abre porta nenhuma, esconde o IP da VPS)

1. Painel Cloudflare → **Zero Trust → Networks → Tunnels → Create a tunnel** (tipo *Cloudflared*).
2. Copie o **token** e, no `.env.local` da VPS, coloque:
   ```ini
   CF_TUNNEL_TOKEN="eyJhIjoi..."
   CRM_BIND="127.0.0.1"          # o CRM deixa de ser acessível de fora, exceto pelo túnel
   NEXT_PUBLIC_APP_URL="https://crm.seudominio.com.br"
   CRM_DOMAIN="crm.seudominio.com.br"
   ```
3. No túnel, crie o **Public Hostname**: `crm.seudominio.com.br` → serviço `http://127.0.0.1:8081`.
4. Na VPS:
   ```bash
   cd /opt/conectacrm
   docker compose --env-file .env.local up -d --build      # aplica o CRM_BIND
   docker compose --env-file .env.local --profile tunnel up -d
   ```
5. Acesse `https://crm.seudominio.com.br` — o TLS é do Cloudflare e o firewall pode deixar **só a 22** aberta.

### Opção B — DNS direto + Caddy (HTTPS automático no servidor)

1. Registro **A** do domínio → IP da VPS (com o proxy do Cloudflare **desligado**, nuvem cinza, para o
   Let's Encrypt validar direto). Confira: `dig +short crm.seudominio.com.br`.
2. Na VPS:
   ```bash
   cd /opt/conectacrm
   docker compose --env-file .env.local up -d --build
   docker compose --env-file .env.local --profile proxy up -d
   ```
3. Acesse `https://crm.seudominio.com.br` — o Caddy emite o certificado sozinho.

> **Em qualquer das duas**: adicione o domínio nas **Redirect URLs** do Supabase
> (Authentication → URL Configuration → Site URL / Additional Redirect URLs). Sem isso o login
> redireciona para o endereço errado.

O `deploy/Caddyfile` já aplica HSTS, `X-Content-Type-Options`, `Referrer-Policy` e desligou o header
`Server`. Tem também um bloco comentado de **basic auth** caso queira uma senha extra antes da tela de
login (gere o hash com `docker run --rm caddy:2-alpine caddy hash-password --plaintext 'SENHA'`).

Sem domínio? Use `CRM_DOMAIN=":80"` e `CRM_BIND="0.0.0.0"` e acesse pelo IP (sem HTTPS — não use
assim com dados de cliente).

## 6. Só pode existir UM gateway por sessão do WhatsApp

Enquanto a VPS estiver rodando o Hermes, **pare a stack local**:

```bash
cd /caminho/do/repo && docker compose --env-file .env.local down
```

Dois gateways com a mesma sessão derrubam a conexão um do outro (e o lock de host do Hermes recusa o
segundo de qualquer forma). Para ter os dois, use sessões diferentes (outro número).

## 7. Atualizar depois

```bash
# da sua máquina
./deploy/ship.sh usuario@ip                 # envia o código e reconstrói
# ou, direto na VPS, se o código estiver num git:
cd /opt/conectacrm && git pull && ./scripts/install-hermes-assets.sh && CONECTA_ROOT=$PWD docker compose --env-file .env.local up -d --build
```

> `./scripts/install-hermes-assets.sh` recoloca `SOUL_WHATSAPP.md`, `support_rules.md` e o plugin
> `crm-output-guard` (trava de saída) no home do Hermes. Rode sempre depois de um `git pull` e
> reinicie o serviço do WhatsApp. Detalhes: [`hermes/README.md`](hermes/README.md).

Mudou só variável de runtime? `docker compose --env-file .env.local up -d` resolve. Mudou
`NEXT_PUBLIC_*`? Precisa de `--build`.

## 8. Backup

```bash
# na VPS: home do Hermes (config, sessão do WhatsApp, histórico) + dump do banco do CRM
docker compose --env-file .env.local stop hermes crm
tar czf ~/backup-hermes-$(date +%F).tgz -C /opt/conectacrm/.hermes-home .hermes
docker compose --env-file .env.local start hermes crm
pg_dump "$DATABASE_URL" | gzip > ~/backup-crm-$(date +%F).sql.gz   # Supabase: ou use o backup do painel
```

Traga os backups para a sua máquina com `scp`/`rsync`. O `state.db` guarda o histórico das conversas e
o diretório `platforms/whatsapp/session` guarda o vínculo do WhatsApp — sem ele, só com QR novo.

## 9. Problemas comuns

| Sintoma | Causa provável | O que fazer |
|---|---|---|
| Bot mudo, mas containers de pé | gateway não conectou o WhatsApp | `docker compose logs -f hermes`, procure `whatsapp`; se preciso, `restart hermes` e escaneie o QR |
| WhatsApp desconecta sozinho | dois gateways na mesma sessão | pare a stack local (`docker compose down`) |
| CRM não abre pelo domínio | DNS ainda propagando, porta 80/443 fechada ou proxy não subiu | `dig +short SEU_DOMINIO`; `ufw status`; `docker compose --profile proxy ps` |
| Alerta do Telegram não chega | cota do modelo primário estourou e o vigia avisou | normal: `docker compose logs conectacrm-watchdog` mostra o estado |
| Build falha por memória | VPS com 2 GB | adicione swap (`fallocate -l 2G /swapfile && mkswap /swapfile && swapon /swapfile`) ou faça o build na sua máquina e envie a imagem (`docker save` + `ssh docker load`) |
| `EACCES` nos scripts do cron/vigia | `/app` não pertence ao usuário que roda o container | já tratado no `Dockerfile` (chown); confirme `HERMES_UID`/`HERMES_GID` no env file |
| Bot oferece produto/marca que não é nosso | faltam `SOUL_WHATSAPP.md`/`support_rules.md` no `/opt/data` e o script de WhatsApp usou o fallback do template | `./scripts/install-hermes-assets.sh && docker compose restart hermes` — ver [`hermes/README.md`](hermes/README.md) |
| Logo após subir, o lead recebe `[whatsapp-manager] Inicializando /opt/data/...` na frente da resposta | log do boot do bridge colado na resposta do agente | `./scripts/install-hermes-assets.sh && docker compose restart hermes` (a trava de saída passa a cortar); limpe o histórico com `node scripts/clean-hermes-noise.mjs --apply` |

## 10. VPS com Node puro + PM2 (sem Docker)

Arranjo em que tudo roda com `node` + `pm2`, e o projeto fica em qualquer pasta (ex.:
`/root/projects/conecta-crm`). O `pm2 list` de referência:

| Processo | Script / cwd | O que é |
| --- | --- | --- |
| `conecta-crm` | `.next/standalone/server.js` (cwd = pasta do projeto) | CRM Next.js em produção |
| `crm-cron` | `scripts/container-cron.mjs` | agenda interna (outbox, **hermes-sync**, alertas, prospecção, lembretes) |
| `whatsapp-bridge` | `$HERMES_HOME/plugins/whatsapp-manager/bridge.js` | **atendimento**: bridge Baileys + persona + plugins do Hermes |
| (outros) | — | ex.: `vendedor-ia` roda `/root/projects/crm-client-backup` — **outro** projeto, não mexa |

Dois caminhos precisam estar alinhados:

```
/opt/data/SOUL_WHATSAPP.md + /opt/data/support_rules.md   <- personas que o whatsapp_manager lê
/root/.hermes/                                             <- home do Hermes: config.yaml, plugins/, state.db
```

Variáveis que o CRM precisa no ambiente do PM2 (`.env.local` ou `ecosystem.config.js`):

- `HERMES_HOME=/root/.hermes` — home do Hermes, de onde o **hermes-sync** lê o `state.db`
  (não é o `/opt/data` das personas: são coisas diferentes);
- `HERMES_BIN=$(which hermes)` — CLI usado para pausar/retomar e gerar texto de prospecção;
- `CRM_BASE_URL=http://127.0.0.1:8081` + `CRON_SECRET` no processo do cron;
- `NEXT_PUBLIC_*` entram no bundle em tempo de **build**, não de runtime.

### Atualizar (git pull)

```bash
pm2 list
pm2 describe conecta-crm | grep -iE "script path|exec cwd"   # confirma a pasta do projeto

PROJETO=/root/projects/conecta-crm      # ajuste se for outra
cd "$PROJETO"

git pull

./scripts/install-hermes-assets.sh      # personas -> /opt/data ; plugin -> $HERMES_HOME/plugins
#   ele imprime os destinos, guarda backup do que sobrescrever e sugere os pm2 restart da máquina
#   se faltar permissão:  sudo -E ./scripts/install-hermes-assets.sh

npm ci && npm run build                 # o sync que limpa log é código do app
# o build é `output: standalone`: o Next NÃO copia public/ e .next/static (no Docker isso é
# feito no Dockerfile; aqui é na mão). Sem estes dois cp o CRM sobe sem CSS/JS:
cp -r public .next/standalone/public 2>/dev/null || true
mkdir -p .next/standalone/.next && cp -r .next/static .next/standalone/.next/static

pm2 restart conecta-crm crm-cron --update-env     # CRM + agenda (pega o build novo)
pm2 restart whatsapp-bridge --update-env          # atendimento: relê persona + trava de saída
```

> O `whatsapp-bridge` é o mais sensível: reinicie por último e acompanhe
> `pm2 logs whatsapp-bridge --lines 30 --timestamp --nostream` — se pedir QR, escaneie (seção 4).

### Conferir

O **bridge** (é ele que fala com o WhatsApp): a porta depende de como o processo foi subido —
não presuma. Aqui ele roda com `--port 3000`, e o `3005` é de **outro** serviço (`vendedor-ia`,
"Proxy Vendas IA"). Descubra antes de testar:

```bash
pm2 describe whatsapp-bridge | grep -iE "script args|exec cwd"
ss -ltnp | grep -i node                                  # quem escuta o quê
curl -s -m 5 http://127.0.0.1:3000/health; echo          # status "open" = sessão conectada
```

Se o `status` não for `open`, o bridge está de pé mas sem sessão do WhatsApp: escaneie o QR
(`pm2 logs whatsapp-bridge --lines 40 --timestamp --nostream`).

```bash
ls -l /opt/data/SOUL_WHATSAPP.md /opt/data/support_rules.md     # personas do manager
ls -l /root/.hermes/SOUL.md /root/.hermes/plugins/crm-output-guard/   # home do Hermes
grep -i '^HERMES_HOME=' .env.local                              # precisa ser /root/.hermes

# o sync está com o código novo? (noiseSkipped só existe depois deste deploy)
curl -s "http://127.0.0.1:8081/api/cron/hermes-sync" -H "Authorization: Bearer $CRON_SECRET"
```

Detalhes dos dois problemas que esse passo resolve (produto de terceiro e log do bridge colado
na resposta): [`hermes/README.md`](hermes/README.md).

> **Só um gateway por sessão do WhatsApp.** Local e VPS não podem atender o mesmo número ao
> mesmo tempo — pare o gateway local antes de subir o da VPS (seção 6).

### Backup (PM2)

O home do Hermes guarda o que **não** se recupera por git: `config.yaml`, `state.db` (histórico)
e `platforms/whatsapp/session` (o vínculo do WhatsApp — sem ele, só com QR novo).

```bash
pm2 stop whatsapp-bridge
tar czf ~/backup-hermes-$(date +%F).tgz -C /root .hermes
pm2 start whatsapp-bridge
```

### Migrar de PM2 para Docker (feito nesta VPS em 06/10/2026)

Nesta VPS o domínio `crm.mlluizdevtech.qzz.io` é um túnel cloudflared apontando para
`http://localhost:3002`. Para o Docker assumir **sem mexer no túnel**:

```bash
# .env.local da VPS (ajusta porta e dono dos volumes)
CRM_PORT="3002"      # mesma porta que o túnel já aponta
CRM_BIND="0.0.0.0"
HERMES_UID="0"       # os arquivos de /root/.hermes são do root
HERMES_GID="0"
HERMES_MEM_LIMIT="3g"  # VPS com ~6 GB, dividida com outros serviços
```

Ordem que funcionou (sem downtime no CRM até a virada):

```bash
cd /root/projects/conecta-crm

# 1. backup: home do Hermes + estado do pm2
tar czf ~/backup-hermes-$(date +%F).tgz -C /root .hermes
cp /root/.pm2/dump.pm2 ~/dump.pm2.bak

# 2. home do Hermes -> volume do Docker, personas e trava de saída dentro dele
mkdir -p .hermes-home && rsync -a /root/.hermes/ .hermes-home/.hermes/
WHATSAPP_DATA_DIR=$PWD/.hermes-home/.hermes HERMES_HOME=$PWD/.hermes-home/.hermes ./scripts/install-hermes-assets.sh
python3 scripts/enable-hermes-plugin.py --config $PWD/.hermes-home/.hermes/config.yaml

# 3. build com o stack antigo ainda no ar
docker compose --env-file .env.local build

# 4. virada
pm2 delete conecta-crm crm-cron whatsapp-bridge && pm2 save
systemctl --user stop hermes-gateway && systemctl --user disable hermes-gateway
CONECTA_ROOT=$PWD docker compose --env-file .env.local up -d

# 5. parear o WhatsApp (QR aparece no terminal)
docker compose exec hermes hermes whatsapp
docker compose restart hermes
```

Duas armadilhas encontradas:

- **porta 3005 é de outro serviço nesta VPS** (`vendedor-ia`). O bridge do Hermes usa a porta
  de `platforms.whatsapp.extra.bridge_port` — deixamos **3000** no `config.yaml` do volume;
- o `bridge.js` do template não escrevia no log do PM2 (stdout num socket), então o QR nunca
  aparecia: em Docker o QR sai em `docker compose logs hermes`, que é o motivo prático de
  rodar tudo em container.

### Variante: CRM em Vercel, Hermes na VPS

Se preferir o CRM na Vercel (com os crons do `vercel.json`) e a VPS só para o Hermes, o CRM
precisa alcançar o Hermes por rede: exponha o API server (porta 8642, exige `API_SERVER_KEY`) e
aponte o CRM para ele. Nesse arranjo, `HERMES_HOME` do sync deixa de ser local — o espelho do
`state.db` precisa vir por HTTP ou de um compartilhamento de arquivos.
