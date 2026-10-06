#!/usr/bin/env bash
#
# deploy/make-vps-env.sh — gera o .env.vps a partir do seu .env.local, já com os valores
# de VPS certos (URL pública, domínio, bind do CRM e dono dos arquivos).
#
# Uso:
#   ./deploy/make-vps-env.sh crm.seudominio.com.br          # com domínio (HTTPS)
#   ./deploy/make-vps-env.sh 203.0.113.10 --http            # só IP, sem proxy (HTTP puro)
#   HERMES_UID=1000 HERMES_GID=1000 ./deploy/make-vps-env.sh crm.seudominio.com.br
#
# Não sobrescreve um .env.vps existente sem --force.

set -euo pipefail

ALVO="${1:-}"
MODO_HTTP=0
FORCE=0
for arg in "${@:2}"; do
  case "$arg" in
    --http) MODO_HTTP=1 ;;
    --force) FORCE=1 ;;
    *) echo "argumento desconhecido: $arg" >&2; exit 2 ;;
  esac
done

if [[ -z "$ALVO" ]]; then
  echo "uso: $0 <dominio-ou-ip> [--http] [--force]" >&2
  exit 2
fi

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ORIGEM="$RAIZ/.env.local"
DESTINO="$RAIZ/.env.vps"

[[ -f "$ORIGEM" ]] || { echo "!! não achei $ORIGEM" >&2; exit 1; }
if [[ -f "$DESTINO" && "$FORCE" != "1" ]]; then
  echo "!! $DESTINO já existe (use --force para regravar)" >&2
  exit 1
fi

if [[ "$MODO_HTTP" == "1" ]]; then
  URL="http://$ALVO"
  CRM_BIND="0.0.0.0"
  CRM_DOMAIN=":80"
  AVISO="sem HTTPS (só teste)"
else
  URL="https://$ALVO"
  CRM_BIND="127.0.0.1"
  CRM_DOMAIN="$ALVO"
  AVISO="HTTPS pelo Caddy (profile proxy)"
fi

PYTHON="$(command -v python3 || true)"
[[ -n "$PYTHON" ]] || { echo "!! preciso de python3 para editar o env com segurança" >&2; exit 1; }

"$PYTHON" - "$ORIGEM" "$DESTINO" "$URL" "$CRM_BIND" "$CRM_DOMAIN" <<'PY'
import re, sys
origem, destino, url, bind, dominio = sys.argv[1:6]
texto = open(origem, encoding="utf-8").read()

def definir(txt, chave, valor):
    linha = f'{chave}="{valor}"'
    if re.search(rf"^{chave}=", txt, flags=re.M):
        return re.sub(rf"^{chave}=.*$", linha, txt, flags=re.M)
    return txt.rstrip("\n") + f"\n{linha}\n"

for chave, valor in (
    ("NEXT_PUBLIC_APP_URL", url),
    ("GOOGLE_REDIRECT_URI", f"{url}/api/integrations/google/callback"),
    ("CRM_BIND", bind),
    ("CRM_DOMAIN", dominio),
    ("HERMES_UID", "1000"),
    ("HERMES_GID", "1000"),
):
    texto = definir(texto, chave, valor)

# token do túnel (opcional): fica vazio para você só colar
if "CF_TUNNEL_TOKEN" not in texto:
    texto = texto.rstrip("\n") + (
        '\n\n# Cloudflare Tunnel (opcional): cole o token do túnel criado no painel\n'
        '# e suba com: docker compose --env-file .env.local --profile tunnel up -d\n'
        'CF_TUNNEL_TOKEN=""\n'
    )

cabecalho = (
    "# Gerado por deploy/make-vps-env.sh — este arquivo vai para a VPS como .env.local.\n"
    "# Contém segredos: está no .gitignore, não versione.\n"
)
open(destino, "w", encoding="utf-8").write(cabecalho + texto)
PY

chmod 600 "$DESTINO"
echo "✔ $DESTINO criado"
echo "  NEXT_PUBLIC_APP_URL = $URL ($AVISO)"
echo "  CRM_BIND           = $CRM_BIND"
echo "  CRM_DOMAIN         = $CRM_DOMAIN"
echo
cat <<'FIM'

Acesso pelo domínio — escolha UM:
  • Cloudflare Tunnel (não abre portas): crie o túnel no painel, acrescente
      CF_TUNNEL_TOKEN="..."     no .env.vps
    e depois, na VPS:  docker compose --env-file .env.local --profile tunnel up -d
  • Caddy com HTTPS no servidor:  docker compose --env-file .env.local --profile proxy up -d

Em qualquer caso, adicione o domínio nas Redirect URLs do Supabase (Authentication → URL Configuration).

Próximo passo:  ENV_FILE=.env.vps ./deploy/ship.sh usuario@ip-da-vps
FIM
