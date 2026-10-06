# ConectaCRM + Hermes numa VPS

Guia para tirar a stack da sua máquina e deixar rodando 24/7 num servidor.

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

# 3) atualizar depois: git pull na VPS + reconstruir
ssh usuario@IP_DA_VPS 'cd /opt/conectacrm && git pull && CONECTA_ROOT=$PWD docker compose --env-file .env.local up -d --build'
```

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
cd /opt/conectacrm && git pull && CONECTA_ROOT=$PWD docker compose --env-file .env.local up -d --build
```

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

## 10. Alternativa: sem Docker na VPS

Se preferir Vercel para o CRM (com os crons do `vercel.json`) e a VPS só para o Hermes, use só o serviço
`hermes` deste compose — mas atenção: o CRM chamava o **CLI do Hermes** localmente. Nesse arranjo, ou a
VPS expõe o API server do Hermes (porta 8642, exige `API_SERVER_KEY`) e o CRM passa a usar HTTP, ou os
recursos de pausar/retomar e gerar texto de prospecção ficam limitados. O caminho suportado hoje é o
pacote completo em Docker, como descrito acima.
