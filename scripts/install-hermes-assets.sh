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
# Destino, em ordem de preferência:
#   1. $HERMES_HOME                  (defina explicitamente quando quiser)
#   2. /opt/data                     (home do Hermes dentro do container/VPS)
#   3. <repo>/.hermes-home/.hermes   (home do Hermes local, usado no docker compose)

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
elif [[ -d /opt/data && -w /opt/data ]]; then
  DESTINO="/opt/data"
elif [[ -d "$RAIZ/.hermes-home/.hermes" ]]; then
  DESTINO="$RAIZ/.hermes-home/.hermes"
else
  erro "não achei o home do Hermes. Defina HERMES_HOME=/caminho/do/home e rode de novo."
  exit 1
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

echo
if [[ $CHECK == 1 ]]; then
  if (( faltando + desatualizado > 0 )); then
    erro "$faltando ausente(s), $desatualizado desatualizado(s) — rode sem --check para instalar"
    exit 1
  fi
  ok "tudo instalado e em dia"
  exit 0
fi

cat <<'FIM'
Próximos passos:
  1. reinicie o serviço que atende o WhatsApp para ele reler personas e plugin
       docker compose --env-file .env.local restart hermes
     (na VPS, se o WhatsApp roda em outro container/serviço, reinicie esse)
  2. mande "oi" para o número e confirme que a resposta não cita produto de terceiro
     nem traz linha de log ([whatsapp-manager] ...) na frente
FIM
