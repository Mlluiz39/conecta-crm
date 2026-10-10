# ConectaCRM em Docker

Dois serviços fixos e dois opcionais (por perfil):

| Serviço | Container | O que faz |
|---|---|---|
| `crm` | `conectacrm-web` | ConectaCRM (Next.js) em http://localhost:8081 (`CRM_PORT` muda a porta) |
| `cron` | `conectacrm-cron` | Agenda interna: outbox, alertas, prospecção, lembretes, follow-up |
| `proxy` | `conectacrm-proxy` | Caddy com HTTPS automático (perfil `proxy`) |
| `tunnel` | `conectacrm-tunnel` | Cloudflare Tunnel, sem abrir porta (perfil `tunnel`) |

O WhatsApp **não é um container desta stack**: quem fala com o WhatsApp é o **Evolution API**, que roda
separado (na VPS, em `127.0.0.1:8082`). O CRM recebe os eventos por webhook (`/api/webhooks/evolution`)
e responde pelos agentes nativos, com o texto saindo pela outbox.

```
WhatsApp ──► Evolution API (127.0.0.1:8082) ──► webhook ──► crm (Next.js)
                  ▲                                            │
                  └──────── outbox (agentes nativos) ◄──────────┘
```

## Subir

```bash
cd /caminho/do/repo
docker compose --env-file .env.local up -d --build
docker compose --env-file .env.local ps
```

Depois: http://localhost:8081 (CRM). Para HTTPS sem abrir porta, suba com o túnel:

```bash
docker compose --env-file .env.local --profile tunnel up -d
```

Comandos do dia a dia:

```bash
docker compose logs -f crm                 # CRM
docker compose logs --tail 20 cron         # rodadas da agenda
docker compose restart crm                 # reinicia só o CRM
docker compose down                        # para tudo (dados ficam nos volumes)
docker compose --env-file .env.local up -d --build   # atualizar depois de mexer no código
```

## Por que `network_mode: host`

O CRM precisa alcançar a Evolution API e o Postgres/Redis dela em `127.0.0.1`. Sem `host`, cada
container veria um `127.0.0.1` diferente e o webhook/outbox não sairia. A consequência é que a porta
do CRM (`CRM_PORT`, padrão 8081) fica exposta no host — com domínio, use `CRM_BIND=127.0.0.1` para que
só o proxy alcance.

## Build args (`NEXT_PUBLIC_*`)

`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` e `NEXT_PUBLIC_APP_URL` entram **no bundle
em tempo de build**, por isso o compose os passa como build args lidos do `.env.local`. Trocar qualquer
um deles exige `--build`, não só `up -d`.

## Onde ficam os dados

| O quê | Onde |
|---|---|
| Banco do CRM (contatos, conversas, mensagens) | **Supabase** (nuvem) |
| Certificados do Caddy | volumes `caddy-data` / `caddy-config` |
| Segredos | `.env.local` (fora do git), via `env_file` |

O container do CRM não guarda estado: recriar a imagem não perde nada. Backup é o dump do Supabase
(`deploy/README-VPS.md`, seção 8).

## Armadilhas já resolvidas (não repita)

1. **`/app` precisa ser do uid que roda o container.** O Dockerfile faz
   `chown -R ${APP_UID}:${APP_GID} /app`; sem isso o Next não escreve o cache em `/app/.next` e loga
   `EACCES` a cada request.
2. **`NEXT_PUBLIC_*` é de build, não de runtime** (ver acima).
3. **Um número, uma sessão.** Duas instâncias da Evolution no mesmo número derrubam a conexão.
4. **`docker compose` e o buildx precisam de `$HOME` gravável.** Em ambiente com `$HOME` read-only,
   use `DOCKER_CONFIG=/caminho/gravavel docker compose ...`.
5. **O `cron` não tem healthcheck** (`healthcheck: disable` no compose): ele não é servidor web e
   herdaria o teste de porta da imagem, ficando eternamente `unhealthy`.

## Diagnóstico

```bash
docker compose ps                                    # crm healthy, cron Up
docker compose logs --tail 30 cron                   # rodadas da agenda
curl -s -o /dev/null -w '%{http_code}\n' localhost:8081/login     # CRM
curl -s -H "apikey: $EVOLUTION_API_KEY" http://127.0.0.1:8082/instance/connectionState/SEU_INSTANCE
node scripts/diag-telegram-alert.mjs                 # reproduz o envio de alerta e mostra o erro cru
```
