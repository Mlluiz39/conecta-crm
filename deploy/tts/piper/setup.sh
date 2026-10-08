#!/usr/bin/env bash
# Baixa as vozes pt-BR do Piper, constrói a imagem e sobe o serviço de voz do CRM.
#
#   ./deploy/tts/piper/setup.sh                 # vozes padrão (faber, jeff, cadu, edresson)
#   VOZES="faber jeff" ./deploy/tts/piper/setup.sh
#   ./deploy/tts/piper/setup.sh --logs
#
# Piper: MIT, roda em CPU perto do tempo real — cada voz é um .onnx de ~60 MB baixado do
# repositório oficial (rhasspy/piper-voices) para ./voices, que entra no container como /voices.
set -euo pipefail

AQUI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VOZES_DIR="$AQUI/voices"
VOZES="${VOZES:-faber jeff cadu edresson}"
BASE="https://huggingface.co/rhasspy/piper-voices/resolve/main"

if [ "${1:-}" = "--logs" ]; then
  cd "$AQUI" && docker compose logs -f --tail 50
  exit 0
fi

# Cada voz tem qualidade própria no repositório; o mapa abaixo evita adivinhar o caminho.
qualidade_de() {
  case "$1" in
    edresson) echo low ;;
    *) echo medium ;;
  esac
}

mkdir -p "$VOZES_DIR"

for voz in $VOZES; do
  qual="$(qualidade_de "$voz")"
  arquivo="pt_BR-${voz}-${qual}"
  destino="$VOZES_DIR/${voz}.onnx"
  if [ -f "$destino" ] && [ -f "${destino}.json" ]; then
    echo "==> voz $voz já baixada"
    continue
  fi
  echo "==> baixando voz $voz ($qual)"
  curl -fsSL --retry 3 -o "$destino" "$BASE/pt/pt_BR/${voz}/${qual}/${arquivo}.onnx"
  curl -fsSL --retry 3 -o "${destino}.json" "$BASE/pt/pt_BR/${voz}/${qual}/${arquivo}.onnx.json"
done

echo "==> vozes em $VOZES_DIR:"
ls -1sh "$VOZES_DIR"/*.onnx | sed 's/^/    /'

echo "==> construindo e subindo o serviço"
cd "$AQUI"
docker compose up -d --build

echo "==> aguardando a API responder..."
for _ in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:4124/health >/dev/null 2>&1; then
    curl -sS http://127.0.0.1:4124/health; echo
    echo
    echo "no ar: http://127.0.0.1:4124"
    echo "próximos passos:"
    echo "  1. ligue os agentes nas vozes:   node scripts/setup-voices.mjs"
    echo "  2. ligue o CRM no serviço local: echo 'TTS_PROVIDER=piper' >> .env.local"
    echo "  3. recrie os containers:         CONECTA_ROOT=\$PWD docker compose --env-file .env.local up -d"
    exit 0
  fi
  sleep 3
done

echo "a API não respondeu — veja os logs: $0 --logs" >&2
exit 1
