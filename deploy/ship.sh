#!/usr/bin/env bash
#
# deploy/ship.sh — leva o ConectaCRM + o essencial do Hermes para uma VPS e sobe a stack.
#
# Uso:
#   ./deploy/ship.sh usuario@ip-da-vps                 # primeira subida
#   REMOTE_DIR=/opt/conectacrm ./deploy/ship.sh ...    # outro diretório na VPS
#   ./deploy/ship.sh usuario@ip --no-home              # só o código (não mexe no home do Hermes)
#   ./deploy/ship.sh usuario@ip --build-only           # não copia, só reconstrói na VPS
#
# O que viaja:
#   * o repositório SEM node_modules/.next/.hermes-home/.probe/.git  (~4 MB)
#   * o .env.local (segredos do CRM) — vai com permissão 600 no destino
#   * o ESSENCIAL do home do Hermes (~12 MB): config.yaml, .env, SOUL.md, allowlist,
#     state.db, platforms (sessão do WhatsApp), sessions, skills, plugins.
#     Os 2,5 GB de runtime local (tools/, installs/, cache/) NÃO viajam: dentro do
#     container o Hermes usa o runtime da própria imagem.
#
# ⚠️ Só pode existir UM gateway usando a sessão do WhatsApp por vez. O script congela o
#    Hermes local durante a cópia e, no fim, pergunta se pode parar a stack local de vez.

set -euo pipefail

VPS="${1:-}"
shift || true
COPIAR_HOME=1
BUILD_ONLY=0
ASSETS_ONLY=0
for arg in "$@"; do
  case "$arg" in
    --no-home) COPIAR_HOME=0 ;;
    --build-only) BUILD_ONLY=1 ;;
    # fluxo por git: o código já foi clonado na VPS; enviamos só env + home do Hermes
    --assets-only) ASSETS_ONLY=1 ;;
    *) echo "argumento desconhecido: $arg" >&2; exit 2 ;;
  esac
done

if [[ -z "$VPS" ]]; then
  echo "uso: $0 usuario@ip-da-vps [--no-home] [--build-only]" >&2
  exit 2
fi

RAIZ_LOCAL="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# Env file que vai para a VPS. Use um separado (ex.: .env.vps) para o .env.local da sua
# máquina continuar apontando para localhost e a stack local não quebrar.
ENV_FILE="${ENV_FILE:-.env.local}"
REMOTE_DIR="${REMOTE_DIR:-/opt/conectacrm}"
HOME_LOCAL="$RAIZ_LOCAL/.hermes-home/.hermes"

log() { printf '\033[1;36m==>\033[0m %s\n' "$*"; }
erro() { printf '\033[1;31m!!\033[0m %s\n' "$*" >&2; }

# ---------------------------------------------------------------- checagens
[[ -f "$RAIZ_LOCAL/$ENV_FILE" ]] || { erro "não achei $ENV_FILE na raiz do projeto"; exit 1; }
command -v rsync >/dev/null || { erro "rsync não instalado no seu computador"; exit 1; }
ssh -o BatchMode=yes -o ConnectTimeout=10 "$VPS" true 2>/dev/null \
  || { erro "não consegui conectar em $VPS por SSH sem senha (configure a chave)"; exit 1; }

# preflight: evita descobrir problema só depois de transferir tudo
log "checando pré-requisitos na VPS"
ssh "$VPS" 'bash -s' <<'REMOTO' || { erro "preflight falhou — resolva o item acima e rode de novo"; exit 1; }
falhou=0
command -v docker >/dev/null || { echo "  ✗ docker não instalado (curl -fsSL https://get.docker.com | sh)"; falhou=1; }
docker compose version >/dev/null 2>&1 || { echo "  ✗ plugin docker compose ausente (apt-get install -y docker-compose-plugin)"; falhou=1; }
command -v rsync >/dev/null || { echo "  ✗ rsync não instalado (apt-get install -y rsync)"; falhou=1; }
livre=$(df -Pk / | awk 'NR==2 {print int($4/1024/1024)}')
echo "  espaço livre em /: ${livre} GB"
[ "$livre" -ge 15 ] || { echo "  ✗ pouco espaço: as imagens somam ~9 GB (recomendado 40 GB de disco)"; falhou=1; }
docker info >/dev/null 2>&1 || { echo "  ✗ o usuário não consegue falar com o docker (entre no grupo docker ou use root)"; falhou=1; }
exit $falhou
REMOTO
log "pré-requisitos ok"

if [[ "$BUILD_ONLY" == "0" ]]; then
  log "destino: $VPS:$REMOTE_DIR"
  ssh "$VPS" "mkdir -p '$REMOTE_DIR/deploy'"
fi

# ---------------------------------------------------------------- código
if [[ "$ASSETS_ONLY" == "1" ]]; then
  log "modo --assets-only: o código já está na VPS (git clone); enviando só env + home do Hermes"
fi

if [[ "$BUILD_ONLY" == "0" && "$ASSETS_ONLY" == "0" ]]; then
  log "enviando o repositório (sem node_modules/.next/.hermes-home)"
  rsync -az --delete \
    --exclude 'node_modules/' --exclude '.next/' --exclude '.hermes-home/' \
    --exclude '.probe/' --exclude '.git/' --exclude '.env' \
    --exclude '*.log' --exclude 'tmp/' \
    "$RAIZ_LOCAL/" "$VPS:$REMOTE_DIR/"

  log "enviando $ENV_FILE -> .env.local na VPS"
  rsync -az "$RAIZ_LOCAL/$ENV_FILE" "$VPS:$REMOTE_DIR/.env.local"
  ssh "$VPS" "chmod 600 '$REMOTE_DIR/.env.local'"

  # NEXT_PUBLIC_* entra no bundle em tempo de BUILD: precisa estar certo antes de construir
  if grep -q 'NEXT_PUBLIC_APP_URL="http://localhost' "$RAIZ_LOCAL/$ENV_FILE"; then
    erro "NEXT_PUBLIC_APP_URL ainda aponta para localhost em $ENV_FILE."
    erro "Troque para o domínio/IP da VPS ANTES do build (ex.: https://crm.seudominio.com.br) e rode de novo."
    exit 1
  fi
fi

# ---------------------------------------------------------------- home do Hermes
if [[ "$COPIAR_HOME" == "1" && "$BUILD_ONLY" == "0" ]]; then
  [[ -d "$HOME_LOCAL" ]] || { erro "não achei $HOME_LOCAL"; exit 1; }

  log "congelando o Hermes local (para o state.db sair consistente)"
  (cd "$RAIZ_LOCAL" && docker compose --env-file .env.local stop hermes >/dev/null 2>&1 || true)

  log "enviando o essencial do home do Hermes (~12 MB)"
  ssh "$VPS" "mkdir -p '$REMOTE_DIR/.hermes-home/.hermes'"
  rsync -az --delete \
    --exclude 'tools/' --exclude 'installs/' --exclude 'cache/' --exclude 'bin/' \
    --exclude 'scripts/' --exclude 'home/' --exclude 'logs/' --exclude 'lazy-packages/' \
    --exclude 'models_dev_cache.json' --exclude '*.log' --exclude '*.pyc' \
    --exclude '__pycache__/' --exclude 'ESTOP' \
    "$HOME_LOCAL/" "$VPS:$REMOTE_DIR/.hermes-home/.hermes/"

  log "religando o Hermes local"
  (cd "$RAIZ_LOCAL" && docker compose --env-file .env.local start hermes >/dev/null 2>&1 || true)
fi

# ---------------------------------------------------------------- subir na VPS
log "subindo a stack na VPS (build das imagens; leva alguns minutos)"
ssh "$VPS" "cd '$REMOTE_DIR' && CONECTA_ROOT='$REMOTE_DIR' docker compose --env-file .env.local up -d --build"

log "estado depois da subida"
ssh "$VPS" "cd '$REMOTE_DIR' && docker compose --env-file .env.local ps"

cat <<FIM

$(printf '\033[1;32m✔\033[0m') Stack no ar em $VPS:$REMOTE_DIR

Próximos passos:
  1) Confira o gateway:   ssh $VPS "cd $REMOTE_DIR && docker compose logs -f hermes"
     (WhatsApp deve reconectar sozinho pela sessão que veio no volume. Se pedir QR, escaneie no log.)
  2) HTTPS: aponte o DNS do domínio para a VPS, ajuste no .env.local da VPS
       NEXT_PUBLIC_APP_URL=https://SEU_DOMINIO
       GOOGLE_REDIRECT_URI=https://SEU_DOMINIO/api/integrations/google/callback
       CRM_BIND=127.0.0.1
       CRM_DOMAIN=SEU_DOMINIO
     e rode:  ssh $VPS "cd $REMOTE_DIR && docker compose --env-file .env.local up -d --build && docker compose --env-file .env.local --profile proxy up -d"
     (o NEXT_PUBLIC_* só muda com --build)
  3) Firewall: libere só 22, 80 e 443. NÃO exponha 8081, 3005 nem 8642.
  4) Pare a stack LOCAL para não haver dois gateways na mesma sessão do WhatsApp:
       cd $RAIZ_LOCAL && docker compose --env-file .env.local down
FIM
