#!/usr/bin/env bash
# install-hermes-assets.sh — instala os ativos do atendimento que NÃO podem viver só no git do CRM.
#
# São DOIS destinos diferentes, e isso importa:
#
#   1. PERSONAS (lidas pelo whatsapp_manager.py, que tem /opt/data CRAVADO no código):
#        deploy/personas/SOUL_WHATSAPP.md  ->  /opt/data/SOUL_WHATSAPP.md   (persona do atendimento)
#        deploy/personas/support_rules.md  ->  /opt/data/support_rules.md   (base de produtos, gerada)
#
#   2. PLUGIN (carregado pelo Hermes a partir do home dele, $HERMES_HOME):
#        deploy/hermes/plugins/<nome>/     ->  $HERMES_HOME/plugins/<nome>/
#        crm-output-guard = trava de saída (hook transform_llm_output)
#
# Por que as personas importam: sem `support_rules.md`, o whatsapp_manager usa um fallback
# HARDCODED de outro cliente — "Responda de forma profissional e ajude com Chatkanban,
# Chatcommerce e Api Connector." O boot tenta baixar os arquivos do GitHub, falha (404) e,
# como o bootstrap só baixa o que está AUSENTE, o fallback assume. Instalar aqui encerra isso.
#
# Por que o plugin importa: o log do boot do manager estava sendo colado NA FRENTE da resposta
# entregue ao lead (caminho interno, URL de repo, nome de skill). A trava corta antes de entregar.
#
# Uso:
#   ./scripts/install-hermes-assets.sh            # instala/atualiza
#   ./scripts/install-hermes-assets.sh --check    # só verifica (sai 1 se algo falta/difere)
#
# Rode de dentro do projeto: a raiz é descoberta sozinha (funciona em /root/projects, /opt, …).
#
# Destinos (nesta ordem):
#   PERSONAS: $WHATSAPP_DATA_DIR -> /opt/data (se parecer o data dir do WhatsApp) -> $HERMES_HOME
#   PLUGIN:   $HERMES_HOME/plugins  ($HERMES_HOME vem do ambiente ou do HERMES_HOME do .env.local)
#
# No fim ele confere o que foi instalado contra o que o CRM e o bridge realmente usam, e
# imprime o `pm2 restart` com os nomes reais dos processos desta máquina.

set -euo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PERSONAS="$RAIZ/deploy/personas"
PLUGINS="$RAIZ/deploy/hermes/plugins"
CHECK=0
[[ "${1:-}" == "--check" ]] && CHECK=1

log()  { printf '\033[1;36m==>\033[0m %s\n' "$*"; }
ok()   { printf '  \033[1;32m✓\033[0m %s\n' "$*"; }
aviso(){ printf '  \033[1;33m!\033[0m %s\n' "$*"; }
erro() { printf '  \033[1;31m!!\033[0m %s\n' "$*" >&2; }

[[ -d "$PERSONAS" ]] || { erro "não achei $PERSONAS"; exit 1; }

# ── Onde o Hermes mora (state.db, config.yaml, plugins/) ───────────────────────
ENV_CRM="$RAIZ/.env.local"
[[ -f "$ENV_CRM" ]] || ENV_CRM="$RAIZ/.env"
home_crm=""
if [[ -f "$ENV_CRM" ]]; then
  home_crm="$(grep -E '^[[:space:]]*HERMES_HOME=' "$ENV_CRM" | tail -1 | cut -d= -f2- \
    | sed 's/[[:space:]]*#.*$//' | tr -d '"' | tr -d "'" | xargs || true)"
fi

HERMES_DIR="${HERMES_HOME:-$home_crm}"
[[ -n "$HERMES_DIR" && -d "$HERMES_DIR" ]] || HERMES_DIR=""

# ── Onde o whatsapp_manager lê as personas (path cravado no script dele) ───────
parece_data_dir() {
  [[ -f "$1/SOUL_WHATSAPP.md" || -f "$1/SOUL.md" || -f "$1/SOUL_EMAIL.md" ||
     -f "$1/support_rules.md" || -f "$1/config.yaml" || -f "$1/state.db" ]]
}

# Ordem, e o porquê:
#   1. $WHATSAPP_DATA_DIR                             (explícito ganha de tudo)
#   2. <repo>/.hermes-home/.hermes                    (Docker: dentro do container ISTO é /opt/data)
#   3. /opt/data                                      (instalação SEM Docker: o whatsappkit crava /opt/data)
#   4. $HERMES_DIR                                    (último recurso)
# O passo 2 vem antes do 3 porque no host pode existir um /opt/data antigo do setup sem
# Docker: escolher ele instalaría a persona fora do volume do container.
VOLUME_REPO="$RAIZ/.hermes-home/.hermes"
PERSONA_DIR=""
if [[ -n "${WHATSAPP_DATA_DIR:-}" ]]; then
  PERSONA_DIR="$WHATSAPP_DATA_DIR"
elif [[ -d "$VOLUME_REPO" ]]; then
  PERSONA_DIR="$VOLUME_REPO"
elif [[ -d /opt/data ]] && parece_data_dir /opt/data; then
  PERSONA_DIR="/opt/data"
elif [[ -n "$HERMES_DIR" ]]; then
  PERSONA_DIR="$HERMES_DIR"
else
  erro "não achei onde instalar as personas."
  erro "Numa VPS, o whatsapp_manager lê /opt/data (cravado):"
  erro "  mkdir -p /opt/data   # ou rode:  WHATSAPP_DATA_DIR=/caminho $0"
  exit 1
fi

PLUGIN_DIR="${HERMES_DIR:-$PERSONA_DIR}/plugins"
CFG_HERMES="$(dirname "$PLUGIN_DIR")/config.yaml"

log "origem      : $PERSONAS + $PLUGINS"
log "personas em : $PERSONA_DIR$([[ $CHECK == 1 ]] && echo '   (--check: nada será escrito)')"
log "plugin em   : $PLUGIN_DIR"

# ── Avisos de coerência (o que o bridge e o CRM realmente usam) ────────────────
if [[ "$PERSONA_DIR" == "$RAIZ/.hermes-home/.hermes" ]]; then
  ok "personas em .hermes-home/.hermes (no docker isso é montado como /opt/data)"
elif [[ "$PERSONA_DIR" != "/opt/data" ]]; then
  aviso "as personas vão para $PERSONA_DIR, mas o whatsapp_manager do template lê /opt/data."
  aviso "Se é essa a sua instalação, use:  WHATSAPP_DATA_DIR=/opt/data $0"
fi
if [[ -d /opt/data && "$PERSONA_DIR" != "/opt/data" ]]; then
  aviso "/opt/data existe nesta máquina mas as personas vão para $PERSONA_DIR."
  aviso "Se o Hermes roda em Docker, isso é o certo: dentro do container $PERSONA_DIR É /opt/data."
fi
if [[ -n "$home_crm" && -n "$HERMES_DIR" && "$home_crm" != "$HERMES_DIR" ]]; then
  aviso "o CRM aponta HERMES_HOME=$home_crm (em $(basename "$ENV_CRM")), mas o home em uso é $HERMES_DIR."
  aviso "O sync do CRM lê $home_crm/state.db — alinhe os dois ou o espelho fica vazio."
elif [[ -n "$home_crm" ]]; then
  ok "CRM e Hermes apontam para o mesmo home ($home_crm)"
fi

faltando=0
desatualizado=0

instalar_arquivo() { # $1=origem $2=destino $3=rótulo
  local src="$1" dst="$2" rotulo="$3"
  if [[ ! -e "$dst" ]]; then
    if [[ $CHECK == 1 ]]; then aviso "FALTA  $rotulo"; faltando=$((faltando + 1))
    else install -D -m 0644 "$src" "$dst"; ok "instalado  $rotulo"; fi
  elif ! cmp -s "$src" "$dst"; then
    if [[ $CHECK == 1 ]]; then
      aviso "DIFERE $rotulo"; desatualizado=$((desatualizado + 1))
    else
      # Nunca sobrescreve sem guardar o que estava lá (pode ser edição sua, feita direto no servidor).
      local bak_dir; bak_dir="$(dirname "$dst")/.backups-install"
      mkdir -p "$bak_dir"
      cp -p "$dst" "$bak_dir/$(basename "$dst").$(date +%Y%m%d-%H%M%S)"
      ok "backup     $rotulo -> .backups-install/"
      cp -p "$src" "$dst"; ok "atualizado $rotulo"
    fi
  else ok "ok         $rotulo"; fi
}

# ── 1. Personas → PERSONA_DIR ─────────────────────────────────────────────────
echo
log "personas"
for src in "$PERSONAS"/*.md; do
  [[ -e "$src" ]] || continue
  nome="$(basename "$src")"
  [[ "$nome" == "README.md" ]] && continue
  instalar_arquivo "$src" "$PERSONA_DIR/$nome" "$nome"
done

# ── 2. Plugins → HERMES/plugins ───────────────────────────────────────────────
if [[ -d "$PLUGINS" ]]; then
  echo
  log "plugins do Hermes"
  for dir in "$PLUGINS"/*/; do
    [[ -d "$dir" ]] || continue
    nome="$(basename "$dir")"
    for src in "$dir"*; do
      [[ -f "$src" ]] || continue
      instalar_arquivo "$src" "$PLUGIN_DIR/$nome/$(basename "$src")" "$nome/$(basename "$src")"
    done
    # pycache velho faria o Python reler bytecode antigo
    if [[ $CHECK == 0 && -d "$PLUGIN_DIR/$nome/__pycache__" ]]; then
      rm -rf "$PLUGIN_DIR/$nome/__pycache__"
      ok "limpei   $nome/__pycache__"
    fi
  done
fi

# ── 3. Skills do ConectaCRM -> HERMES/skills ─────────────────────────────────
SKILLS_SRC="$RAIZ/deploy/hermes/skills"
if [[ -d "$SKILLS_SRC" ]]; then
  echo
  log "skills"
  if [[ -z "$HERMES_DIR" ]]; then
    aviso "não achei o home do Hermes — skills não instaladas"
  else
    while IFS= read -r src; do
      rel="${src#"$SKILLS_SRC"/}"
      instalar_arquivo "$src" "$HERMES_DIR/skills/$rel" "skills/$rel"
    done < <(find "$SKILLS_SRC" -type f | sort)
  fi
fi

# ── 4. Guarda-corpos ──────────────────────────────────────────────────────────
echo
if [[ $CHECK == 0 ]]; then
  for nome in support_rules.md SOUL_WHATSAPP.md; do
    dst="$PERSONA_DIR/$nome"
    if [[ -f "$dst" ]] && grep -qi -e "Chatkanban" -e "Chatcommerce" -e "Api Connector" "$dst"; then
      erro "$nome contém o fallback do template (Chatkanban/Chatcommerce/Api Connector)."
      erro "Reescreva o arquivo antes de subir — o bot vai oferecer produto de terceiro."
      exit 1
    fi
  done
  ok "nenhum fallback de terceiro nas personas"

  guard="$PLUGIN_DIR/crm-output-guard/__init__.py"
  if [[ -f "$guard" ]]; then
    if ! command -v python3 >/dev/null 2>&1; then
      aviso "python3 não está no PATH — não validei a trava de saída"
    elif python3 -m py_compile "$guard" 2>/dev/null; then
      ok "trava de saída compila"
      rm -rf "$(dirname "$guard")/__pycache__"
    else
      erro "a trava de saída ($guard) não compila em Python — corrija antes de reiniciar"
      exit 1
    fi
    if [[ ! -f "$CFG_HERMES" ]]; then
      aviso "não achei $CFG_HERMES — confira se o Hermes carrega plugins desse home."
    elif ! grep -q "crm-output-guard" "$CFG_HERMES"; then
      aviso "$CFG_HERMES não habilita crm-output-guard em plugins.enabled — a trava não roda."
    else
      ok "trava de saída habilitada em $(basename "$(dirname "$CFG_HERMES")")/config.yaml"
    fi
  fi
fi

# ── 4. Chaves críticas do config.yaml (o que o cliente vê) ────────────────────
# O config.yaml vive no volume (não na imagem), então não é reproduzível pelo git: já
# nasceram três bugs ali. `apply-hermes-config.py` garante o essencial a cada deploy.
config_ok=1
if [[ -f "$CFG_HERMES" ]]; then
  if [[ $CHECK == 1 ]]; then
    python3 "$RAIZ/scripts/apply-hermes-config.py" --config "$CFG_HERMES" --check >/dev/null 2>&1 \
      && ok "config.yaml com as chaves críticas em ordem" \
      || { aviso "config.yaml divergente — rode sem --check para corrigir"; config_ok=0; }
  else
    python3 "$RAIZ/scripts/apply-hermes-config.py" --config "$CFG_HERMES" 2>&1 | sed 's/^/  /' | tail -6
  fi
else
  aviso "não achei $CFG_HERMES — não conferi as chaves de display/plugins"
fi

# Perfis (ex.: profiles/whatsapp) têm config PRÓPRIA e é ela que define o modelo do
# atendimento no WhatsApp. Ali só o modelo/cadeia é enforçado — nada de display/plugins,
# para não sobrescrever os toolsets restritos do perfil.
for perfil_cfg in "$HERMES_DIR"/profiles/*/config.yaml; do
  [[ -f "$perfil_cfg" ]] || continue
  if [[ $CHECK == 1 ]]; then
    python3 "$RAIZ/scripts/apply-hermes-config.py" --config "$perfil_cfg" --somente-modelo --check >/dev/null 2>&1 \
      && ok "modelo em ordem: ${perfil_cfg#"$HERMES_DIR"/}" \
      || { aviso "modelo divergente em ${perfil_cfg#"$HERMES_DIR"/} — rode sem --check"; config_ok=0; }
  else
    python3 "$RAIZ/scripts/apply-hermes-config.py" --config "$perfil_cfg" --somente-modelo 2>&1 | sed 's/^/  /' | tail -4
  fi
done

[[ -f "$PERSONA_DIR/SOUL_EMAIL.md" ]] || aviso "SOUL_EMAIL.md ausente (canal de e-mail fica sem persona própria)"

# Prompt mestre: vive no home do Hermes (é o agente que lê) e NÃO é versionado.
if [[ -n "$HERMES_DIR" && ! -f "$HERMES_DIR/SOUL.md" ]]; then
  aviso "SOUL.md ausente em $HERMES_DIR — prompt mestre do Hermes, sem fallback bom no boot."
  aviso "Copie o seu (local: .hermes-home/.hermes/SOUL.md) ou rode ./deploy/ship.sh."
fi

echo
if [[ $CHECK == 1 ]]; then
  if (( faltando + desatualizado > 0 )); then
    erro "$faltando ausente(s), $desatualizado desatualizado(s) — rode sem --check para instalar"
    exit 1
  fi
  if (( config_ok == 0 )); then
    erro "config.yaml divergente das chaves críticas — rode sem --check para corrigir"
    exit 1
  fi
  ok "tudo instalado e em dia"
  exit 0
fi

# ── Próximos passos: nomes reais dos processos (PM2) ─────────────────────────
echo "Próximos passos:"
TEM_PM2=0
if command -v pm2 >/dev/null 2>&1; then
  TEM_PM2=1
  todos=""
  atendimento=""
  if command -v node >/dev/null 2>&1; then
    info="$(pm2 jlist 2>/dev/null | HERMES_DIR="$HERMES_DIR" node --input-type=module -e '
      import { readFileSync } from "node:fs";
      let raw = "";
      try { raw = readFileSync(0, "utf8"); } catch { process.exit(0); }
      let procs = [];
      try { procs = JSON.parse(raw); } catch { process.exit(0); }
      const home = (process.env.HERMES_DIR || "").replace(/\/+$/, "");
      const nomes = procs.map((p) => p.name).filter(Boolean);
      const dentro = procs.filter((p) => {
        const e = p.pm2_env || {};
        const caminhos = [e.pm_cwd, e.cwd, e.pm_exec_path].filter(Boolean).map(String);
        return home && caminhos.some((c) => c === home || c.startsWith(home + "/"));
      }).map((p) => p.name);
      console.log("TODOS=" + nomes.join(" "));
      console.log("ATENDIMENTO=" + dentro.join(" "));
    ' 2>/dev/null || true)"
    todos="$(printf '%s\n' "$info" | sed -n 's/^TODOS=//p')"
    atendimento="$(printf '%s\n' "$info" | sed -n 's/^ATENDIMENTO=//p')"
  fi

  if [[ -n "${todos// /}" ]]; then
    echo "  • PM2 nesta máquina: $todos"
    if [[ -n "${atendimento// /}" ]]; then
      echo "        pm2 restart ${atendimento% } --update-env     # roda dentro de ${HERMES_DIR:-o home do Hermes}: relê persona + trava"
    else
      echo "        pm2 restart <processo do WhatsApp> --update-env   # quem roda dentro de ${HERMES_DIR:-$PLUGIN_DIR}"
    fi
    # CRM/cron por nome (heurística): exclui quem já é do atendimento
    crms=""
    for n in $todos; do
      case " $atendimento " in *" $n "*) continue ;; esac
      case "${n,,}" in
        *cron*|*agenda*|*scheduler*|*crm*|*conecta*|*web*|*site*) crms+="$n " ;;
      esac
    done
    [[ -n "${crms// /}" ]] && echo "        pm2 restart ${crms% } --update-env$(printf '%*s' 3 '')# CRM/cron: pega o build novo"
  else
    echo "  • PM2: reinicie o processo que roda dentro de ${HERMES_DIR:-$PLUGIN_DIR} (atendimento) e o do CRM/cron"
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
