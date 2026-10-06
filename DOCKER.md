# ConectaCRM + Hermes em Docker

Uma stack, quatro serviços, tudo o que hoje roda "na unha" num host:

| Serviço | Container | O que faz |
|---|---|---|
| `hermes` | `conectacrm-hermes` | Gateway do Hermes (WhatsApp, e-mail, Telegram) + bridge do WhatsApp (127.0.0.1:3005) + agendador de cron do Hermes |
| `crm` | `conectacrm-web` | ConectaCRM (Next.js) em http://localhost:8081 |
| `cron` | `conectacrm-cron` | Agenda interna: outbox, hermes-sync, alertas, prospecção, lembretes, follow-up |
| `watchdog` | `conectacrm-watchdog` | Vigia: gateway (socket), bridge 3005, CRM e aviso de fallback no Telegram |

```
WhatsApp/e-mail ──► hermes (gateway + bridge) ──► state.db ──► cron (hermes-sync) ──► Supabase
                          ▲                                                     ▲
                          │ CLI (send/pause/chat)                               │
                     crm (Next.js 8081) ◄────── navegador/celular ────────────►│
                          ▲
                    watchdog (observa e avisa)
```

## Subir

```bash
cd /caminho/do/repo
export CONECTA_ROOT="$PWD"                       # caminho ABSOLUTO — obrigatório (ver abaixo)
docker compose --env-file .env.local up -d --build
docker compose --env-file .env.local ps
```

Depois: http://localhost:8081 (CRM). O WhatsApp **não pede QR novo** — a sessão vive no volume
`.hermes-home/.hermes/platforms/whatsapp/session`.

Comandos do dia a dia:

```bash
docker compose logs -f hermes              # logs do gateway (WhatsApp/e-mail/Telegram)
docker compose logs -f crm cron watchdog
docker compose restart crm                 # reinicia só o CRM
docker compose down                        # para tudo (os dados ficam nos volumes)
docker compose --env-file .env.local up -d --build   # atualizar depois de mexer no código
```

## Por que `CONECTA_ROOT` é obrigatório

O hook `pre_llm_call` (relógio/expediente/feriado) é registrado no `config.yaml` do Hermes com o
**caminho absoluto** do script:

```yaml
hooks:
  pre_llm_call:
    - command: "/caminho/do/repo/scripts/hermes-clock-context.py"
```

Para o mesmo `config.yaml` funcionar no host **e** dentro do container, o Compose monta
`$CONECTA_ROOT/scripts` no mesmo caminho dentro do container. Se `CONECTA_ROOT` não for absoluto, o
hook é registrado mas falha ao executar (o arquivo não existe lá dentro).

## Onde ficam os dados

| Caminho no host | Dentro do container | Conteúdo |
|---|---|---|
| `./.hermes-home/.hermes` | `/opt/data` | config.yaml, `SOUL.md`, skills, plugins, `state.db`, sessão do WhatsApp, `.env` do Hermes (chaves de modelo) |
| `./scripts` | mesmo caminho | hook do relógio (montado read-only no `hermes`) |
| `.env.local` | — | segredos do CRM (Supabase, `CRON_SECRET`, …) via `env_file` |
| Supabase (nuvem) | — | banco do CRM (fora do Docker) |

Backup = copiar `.hermes-home/.hermes` (contém a sessão do WhatsApp e o histórico) + o dump do Supabase.

## Segredos e variáveis

- **Runtime**: vêm do `.env.local` (`env_file`), o mesmo arquivo que o `next dev` usava. As chaves de
  modelo (Gemini/DeepSeek/OpenRouter) ficam no `.env` **do Hermes**, dentro do volume — não duplicar.
- **Build**: `NEXT_PUBLIC_*` é embutido no bundle em tempo de build, então passam como build args do
  `.env.local` (o Compose já faz isso). Trocar o Supabase exige `--build`, não só restart.
- O container do CRM roda com `user: <seu uid>:<seu gid>` para que os arquivos que ele escreve no
  volume do Hermes fiquem com o dono certo (`HERMES_UID`/`HERMES_GID`, padrão 1000).

## Recursos

- `hermes`: 4 GB e 2 CPUs (limites no `docker-compose.yml`; a doc do Hermes recomenda 2–4 GB).
- `crm`, `cron`, `watchdog`: leves (o CRM usa ~300 MB em produção).
- Imagens: `nousresearch/hermes-agent:latest` (~4 GB) e `conectacrm-app` (~4,2 GB, derivada dela).

O CRM é derivado da imagem do Hermes de propósito: ele chama o **CLI do Hermes** (`hermes send`,
`hermes chat -q`, `hermes pause/resume`) e os dois escrevem no mesmo `state.db`. Usando a mesma
imagem, CLI e gateway são sempre a mesma versão.

## Rollback (voltar a rodar no host)

```bash
docker compose down
# no host, como antes:
npm run dev                       # CRM em 8081
hermes gateway run                # gateway (kill do container libera 3005/8642)
```
O home do Hermes é o mesmo diretório nos dois modos — não há migração de dados para desfazer.

## Armadilhas já resolvidas (não repita os erros)

1. **`--user` com a imagem do Hermes quebra o boot.** `/usr/bin/tini` nessa imagem é um shim que sobe
   o s6-overlay, e o s6 recusa iniciar com UID arbitrário. Por isso o container do CRM usa
   `/usr/local/bin/node` como entrypoint (sem s6) e deixa o Docker aplicar `user:`.
2. **Arquivos root-only na imagem.** Se `/app` não for `chown` para o uid do host, `scripts/*.mjs`
   morrem com `EACCES`. O Dockerfile já faz `chown -R ${APP_UID}:${APP_GID} /app`.
3. **`parse_mode: Markdown` no Telegram derruba alertas.** O texto do lead é dinâmico e truncado; quando
   o corte caía no meio de uma entidade, a API devolvia `400 can't parse entities` e o alerta se perdia.
   Os alertas agora usam `parse_mode: HTML` (com `&`, `<`, `>` escapados).
4. **Um gateway por host.** Não suba o gateway do host e o do container ao mesmo tempo: eles disputam a
   sessão do WhatsApp, a porta 3005 e o lock do host. Pare o do host antes (`docker compose up` já cuidou
   disso nesta migração).
5. **`docker compose` e o buildx precisam de `$HOME` gravável.** Em ambientes com `$HOME` read-only, use
   `DOCKER_CONFIG=/caminho/gravável docker compose ...`.

## Diagnóstico

```bash
docker compose ps                                   # saúde dos 4 serviços
docker logs conectacrm-cron --tail 20               # rodadas da agenda
curl -s localhost:3005/health                       # bridge do WhatsApp
curl -s -o /dev/null -w '%{http_code}\n' localhost:8081/login   # CRM
docker exec conectacrm-web /opt/hermes/bin/hermes --version      # CLI que o CRM usa
node scripts/diag-telegram-alert.mjs                # reproduz o envio de alerta e mostra o erro cru
```
