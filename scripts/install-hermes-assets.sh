#!/usr/bin/env bash
# install-hermes-assets.sh — instala no home do Hermes (= /opt/data no container) os ativos
# que NÃO podem viver só no git do CRM:
#
#   deploy/personas/*.md                     -> $HERMES_HOME/
#       SOUL_WHATSAPP.md   persona do atendimento no WhatsApp
#       support_rules.md   base de produtos/serviços (gerada)
#       (o assistente de WhatsApp lê esses dois A CADA mensagem de cliente)
#
#   deploy/hermes/plugins/<nome>/            -> $HERMES_HOME/plugins/<nome>/
#       crm-output-guard   trava de saída (hook transform_llm_output)
#
# Por que as personas importam: se `support_rules.md` não existe, o `whatsapp_manager.py`
# (template whatsappkit / hermes-whatsapp-mixed) usa um fallback HARDCODED de outro cliente
# — "Responda de forma profissional e ajude com Chatkanban, Chatcommerce e Api Connector."
# O boot tenta baixar os arquivos do GitHub e falha (404), e o bootstrap só baixa o que
# está AUSENTE: instalar aqui encerra o problema de vez.
#
# Por que o plugin importa: o log do boot do `whatsapp_manager` estava sendo colado NA
# FRENTE da resposta entregue ao lead (caminho interno, URL de repo, nome de skill).
# A trava corta isso antes de persistir e de entregar.
#
# Uso:
#   ./scripts/install-hermes-assets.sh            # instala/atualiza
#   ./scripts/install-hermes-assets.sh --check    # só verifica (sai 1 se algo falta/difere)
#
# Rode de dentro do projeto — o script descobre a raiz sozinho (pode estar em /opt,
# /projects, /home/…; nada aqui depende do caminho do repositório).
#
# Destino (home do Hermes), em ordem de preferência:
#   1. $HERMES_HOME                  (defina explicitamente quando quiser)
#   2. /opt/data                     (home do Hermes em VPS/container — é o path que o
#                                     whatsapp_manager do template usa, cravado no script dele)
#   3. <repo>/.hermes-home/.hermes   (home do Hermes local, usado no docker compose)
#
# No fim ele confere se o HERMES_HOME do CRM (.env.local) aponta para o MESMO lugar —
# se divergir, a persona ficaria num home e o hermes-sync espelharia o state.db de outro.

set -euo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PERSONAS="$RAIZ/deploy/personas"
PLUGINS="$RAIZ/deploy/hermes/plugins"
CHECK=0
[[ "${1:-}" == "--check" ]] && CHECK=1

log()  { printf '\033[1;36m==>\033[0m %s\n' "$*"; }
ok()   { printf '  \033[1;32m✓\033[0m %s\n' "$*"; }
aviso(){ printf '  \033[1;33m!\033[0m %s\n' "$*"; }
erro() { printf '\033[1;31m!!\033[0m %s\n' "$*" >&2; }

[[ -d "$PERSONAS" ]] || { erro "não achei $PERSONAS"; exit 1; }

if [[ -n "${HERMES_HOME:-}" ]]; then
  DESTINO="$HERMES_HOME"
  if [[ ! -d "$DESTINO" ]]; then
    erro "HERMES_HOME aponta para '$DESTINO', que não existe."
    erro "Numa VPS sem Docker o home do Hermes costuma ser /opt/data (de onde o bridge lê o SOUL.md)."
    exit 1
  fi
elif [[ -d /opt/data ]]; then
  # Instalação sem Docker (Node + PM2): /opt/data é o home do Hermes, o mesmo path que o
  # whatsapp_manager usa para ler SOUL_WHATSAPP.md e support_rules.md.
  if [[ ! -w /opt/data ]]; then
    erro "/opt/data existe, mas o usuário $(id -un) não pode escrever nele."
    erro "Rode com permissão:  sudo -E $0 ${1:-}   (ou ajuste o dono do diretório)"
    exit 1
  fi
  DESTINO="/opt/data"
elif [[ -d "$RAIZ/.hermes-home/.hermes" ]]; then
  DESTINO="$RAIZ/.hermes-home/.hermes"
else
  erro "não achei o home do Hermes (nem \$HERMES_HOME, nem /opt/data, nem .hermes-home/.hermes)."
  erro "Numa VPS, o whatsapp_manager do template lê /opt/data (path cravado no script dele):"
  erro "  sudo mkdir -p /opt/data && sudo chown \"\$(id -un)\" /opt/data"
  erro "  HERMES_HOME=/opt/data $0"
  exit 1
fi

# ── O CRM e o bridge precisam apontar para o MESMO home do Hermes ─────────────
# O whatsapp_manager lê /opt/data/SOUL_WHATSAPP.md e /opt/data/support_rules.md (path
# cravado no script do template). O hermes-sync do CRM lê $HERMES_HOME/state.db. Se os dois
# divergirem, a persona é instalada num lugar e o CRM espelha de outro — este aviso pega isso.
ENV_CRM="$RAIZ/.env.local"
[[ -f "$ENV_CRM" ]] || ENV_CRM="$RAIZ/.env"
if [[ -f "$ENV_CRM" ]]; then
  home_crm="$(grep -E '^[[:space:]]*HERMES_HOME=' "$ENV_CRM" | tail -1 | cut -d= -f2- | tr -d '"' | tr -d "'" | xargs || true)"
  if [[ -n "$home_crm" && "$home_crm" != "$DESTINO" ]]; then
    aviso "o CRM aponta HERMES_HOME=$home_crm (em $(basename "$ENV_CRM")), mas instalei em $DESTINO."
    aviso "O whatsapp_manager lê /opt/data (cravado). Aponte o CRM para o mesmo home, senão"
    aviso "a persona fica num lugar e o sync espelha o state.db de outro."
  elif [[ -n "$home_crm" ]]; then
    ok "CRM e instalador apontam para o mesmo home ($home_crm)"
  fi
fi

log "origem : $PERSONAS + $PLUGINS"
log "destino: $DESTINO$([[ $CHECK == 1 ]] && echo '  (--check: nada será escrito)')"

faltando=0
desatualizado=0

# ── 1. Personas ───────────────────────────────────────────────────────────────
instalar_arquivo() { # $1=origem $2=destino $3=rótulo
  local src="$1" dst="$2" rotulo="$3"
  if [[ ! -e "$dst" ]]; then
    if [[ $CHECK == 1 ]]; then aviso "FALTA  $rotulo"; faltando=$((faltando + 1))
    else install -D -m 0644 "$src" "$dst"; ok "instalado  $rotulo"; fi
  elif ! cmp -s "$src" "$dst"; then
    if [[ $CHECK == 1 ]]; then aviso "DIFERE $rotulo"; desatualizado=$((desatualizado + 1))
    else cp -p "$src" "$dst"; ok "atualizado $rotulo"; fi
  else ok "ok         $rotulo"; fi
}

for src in "$PERSONAS"/*.md; do
  [[ -e "$src" ]] || continue
  nome="$(basename "$src")"
  [[ "$nome" == "README.md" ]] && continue
  instalar_arquivo "$src" "$DESTINO/$nome" "$nome"
done

# ── 2. Plugins do Hermes ──────────────────────────────────────────────────────
if [[ -d "$PLUGINS" ]]; then
  for dir in "$PLUGINS"/*/; do
    [[ -d "$dir" ]] || continue
    nome="$(basename "$dir")"
    for src in "$dir"*; do
      [[ -f "$src" ]] || continue
      instalar_arquivo "$src" "$DESTINO/plugins/$nome/$(basename "$src")" "plugins/$nome/$(basename "$src")"
    done
    # pycache velho faria o Python reler bytecode antigo
    if [[ $CHECK == 0 && -d "$DESTINO/plugins/$nome/__pycache__" ]]; then
      rm -rf "$DESTINO/plugins/$nome/__pycache__"
      ok "limpei   plugins/$nome/__pycache__"
    fi
  done
fi

# ── 3. Guarda-corpos ──────────────────────────────────────────────────────────
if [[ $CHECK == 0 ]]; then
  for nome in support_rules.md SOUL_WHATSAPP.md; do
    dst="$DESTINO/$nome"
    if [[ -f "$dst" ]] && grep -qi -e "Chatkanban" -e "Chatcommerce" -e "Api Connector" "$dst"; then
      erro "$nome contém o fallback do template (Chatkanban/Chatcommerce/Api Connector)."
      erro "Reescreva o arquivo antes de subir — o bot vai oferecer produto de terceiro."
      exit 1
    fi
  done
  log "nenhum fallback de terceiro nas personas"

  guard="$DESTINO/plugins/crm-output-guard/__init__.py"
  if [[ -f "$guard" ]]; then
    if python3 -m py_compile "$guard" 2>/dev/null; then
      ok "trava de saída compila"
      rm -rf "$(dirname "$guard")/__pycache__"
    else
      erro "a trava de saída ($guard) não compila em Python — corrija antes de reiniciar"
      exit 1
    fi
    if ! grep -q "crm-output-guard" "$DESTINO/config.yaml" 2>/dev/null; then
      aviso "config.yaml não habilita crm-output-guard em plugins.enabled — a trava não roda"
    else
      ok "trava de saída habilitada no config.yaml"
    fi
  fi
fi

[[ -f "$DESTINO/SOUL_EMAIL.md" ]] || aviso "SOUL_EMAIL.md ausente (canal de e-mail fica sem persona própria)"

# O prompt mestre (SOUL.md) NÃO é versionado: viaja pelo rsync do ship.sh. Se ele faltar, o
# Hermes roda sem a persona mestre e o boot tenta baixar do GitHub (e falha se o repo não existe).
if [[ ! -f "$DESTINO/SOUL.md" ]]; then
  aviso "SOUL.md ausente em $DESTINO — prompt mestre do Hermes, sem fallback bom no boot."
  aviso "Copie o seu (máquina local: .hermes-home/.hermes/SOUL.md) ou rode ./deploy/ship.sh."
fi

echo
if [[ $CHECK == 1 ]]; then
  if (( faltando + desatualizado > 0 )); then
    erro "$faltando ausente(s), $desatualizado desatualizado(s) — rode sem --check para instalar"
    exit 1
  fi
  ok "tudo instalado e em dia"
  exit 0
fi

echo "Próximos passos:"

# Ambiente detectado: PM2 (VPS com Node puro) e/ou Docker (stack local/compose).
TEM_PM2=0
if command -v pm2 >/dev/null 2>&1; then
  TEM_PM2=1
  # Nomes reais dos processos desta máquina (não adivinhe: o PM2 responde).
  nomes="$(pm2 jlist 2>/dev/null | grep -o '"name":"[^"]*"' | cut -d'"' -f4 | sort -u | tr '\n' ' ' || true)"
  if [[ -n "${nomes// /}" ]]; then
    atendimento=""; crms=""; crons=""
    for n in $nomes; do
      case "${n,,}" in
        *whats*|*bridge*|*hermes*|*manager*|*vendedor*|*agente*|*atendimento*|*bot*) atendimento+="$n " ;;
        *cron*|*agenda*|*scheduler*) crons+="$n " ;;
        *crm*|*conecta*|*web*|*site*) crms+="$n " ;;
      esac
    done
    echo "  • PM2 nesta máquina: $nomes"
    if [[ -n "$atendimento" ]]; then
      echo "        pm2 restart ${atendimento% } --update-env     # relê persona + trava de saída"
    fi
    if [[ -n "${crms}${crons}" ]]; then
      echo "        pm2 restart ${crms}${crons% } --update-env$(printf '%*s' 3 '')# pega o build novo do CRM/cron"
    fi
    echo "    (confirme os nomes com 'pm2 list' — a divisão acima é heurística)"
  else
    echo "  • PM2: reinicie o processo do atendimento e o do CRM/cron (veja 'pm2 list')"
  fi
fi
if command -v docker >/dev/null 2>&1 && [[ -f "$RAIZ/docker-compose.yml" ]]; then
  echo "  • Docker: docker compose --env-file .env.local restart hermes"
fi
echo "  • o CRM precisa de build novo para o sync filtrar o log:  npm ci && npm run build"
if [[ $TEM_PM2 == 1 ]]; then
  echo "    depois reinicie o processo do CRM"
elif command -v docker >/dev/null 2>&1 && [[ -f "$RAIZ/docker-compose.yml" ]]; then
  echo "    depois: docker compose --env-file .env.local up -d --build"
fi
cat <<'FIM'
  • confirme com um "oi" para o número: a resposta não pode citar produto de terceiro
    nem trazer linha de log ([whatsapp-manager] ...) na frente
FIM
