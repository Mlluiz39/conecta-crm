#!/usr/bin/env bash
# Baixa o modelo, constrói e sobe o Pocket TTS + adaptador MLVoice.
#
#   ./deploy/tts/pocket/setup.sh              # constrói e sobe
#   ./deploy/tts/pocket/setup.sh --logs       # acompanha os logs
#
# A chave (MLVOICE_API_KEY) vem do ambiente, do .env.local do projeto ou é gerada
# na hora (e impressa para você colocar no .env.local). O modelo fica em ./cache.
set -euo pipefail

AQUI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$AQUI"
mkdir -p cache

if [ "${1:-}" = "--logs" ]; then
  docker compose logs -f --tail 60
  exit 0
fi

RAIZ="$(cd "$AQUI/../../.." && pwd)"
if [ -z "${MLVOICE_API_KEY:-}" ] && [ -f "$RAIZ/.env.local" ]; then
  MLVOICE_API_KEY="$(grep -E '^MLVOICE_API_KEY=' "$RAIZ/.env.local" 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"' || true)"
fi
if [ -z "${MLVOICE_API_KEY:-}" ]; then
  MLVOICE_API_KEY="$(openssl rand -hex 24)"
  echo "==> chave gerada; adicione ao .env.local do CRM:"
  echo "    MLVOICE_API_KEY=\"$MLVOICE_API_KEY\""
fi
export MLVOICE_API_KEY

echo "==> construindo e subindo o pocket-tts (primeira subida baixa o modelo)"
docker compose up -d --build

echo "==> aguardando o serviço responder (pode levar alguns minutos na 1ª vez)..."
for _ in $(seq 1 120); do
  if curl -fsS http://127.0.0.1:8765/health >/dev/null 2>&1; then
    echo "no ar: http://127.0.0.1:8765 (v1/tts)"
    echo
    echo "próximos passos no CRM (.env.local):"
    echo "  MLVOICE_URL=\"http://127.0.0.1:8765/v1/tts\""
    echo "  MLVOICE_API_KEY=\"<a mesma chave de cima>\""
    echo "  MLVOICE_VOICE=\"rafael\""
    echo "  TTS_PROVIDER=\"mlvoice\""
    exit 0
  fi
  sleep 5
done

echo "o serviço não respondeu — veja os logs: $0 --logs" >&2
exit 1
