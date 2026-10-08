#!/usr/bin/env bash
# Sobe o serviço local de TTS (Chatterbox) na VPS, em CPU.
#
# O CRM fala com ele por HTTP, no formato OpenAI-compatible (`/v1/audio/speech`), e usa as
# vozes clonadas cadastradas por `scripts/setup-voices.mjs`.
#
# Por que o projeto de terceiro e não um serviço nosso: ele já traz o *fork* do chatterbox
# com o ajuste que faz o modelo multilíngue funcionar sem CUDA (`chatterbox-multilingual@exp`)
# e a biblioteca de vozes. O que fazemos aqui é fixar a versão, prender a porta no localhost
# e limitar a memória — a Evolution/Postgres do CRM rodam na mesma máquina.
#
# Uso (na VPS, como root):
#   ./deploy/tts/setup.sh              # clona/atualiza e sobe
#   ./deploy/tts/setup.sh --logs       # acompanha os logs
#   LIMITE_MEM=5g ./deploy/tts/setup.sh
set -euo pipefail

DESTINO="${CHATTERBOX_DIR:-/root/chatterbox-tts-api}"
REPO="${CHATTERBOX_REPO:-https://github.com/travisvn/chatterbox-tts-api}"
PORTA="${CHATTERBOX_PORT:-4123}"
LIMITE_MEM="${LIMITE_MEM:-4g}"
LIMITE_MEM_SWAP="${LIMITE_MEM_SWAP:-6g}"
COMPOSE="docker/docker-compose.cpu.yml"

if [ "${1:-}" = "--logs" ]; then
  cd "$DESTINO" && docker compose -f "$COMPOSE" logs -f --tail 50
  exit 0
fi

echo "==> serviço de TTS em $DESTINO (porta $PORTA, memória $LIMITE_MEM / swap $LIMITE_MEM_SWAP)"
if [ -d "$DESTINO/.git" ]; then
  git -C "$DESTINO" pull --ff-only || echo "aviso: não deu para atualizar (seguindo com o que está lá)"
else
  rm -rf "$DESTINO"
  git clone --depth 1 "$REPO" "$DESTINO"
fi

cd "$DESTINO"
[ -f .env ] || cp .env.example.docker .env

# Ajustes idempotentes: porta só no localhost (o CRM alcança, a internet não) e teto de memória
# para o container nunca derrubar o Postgres/Evolution que dividem a máquina.
python3 - "$COMPOSE" "$PORTA" "$LIMITE_MEM" "$LIMITE_MEM_SWAP" <<'PY'
import re, sys
from pathlib import Path
arquivo, porta, mem, memswap = sys.argv[1:5]
p = Path(arquivo)
t = p.read_text()
t = re.sub(r"-\s*'[^']*:\$\{PORT:-4123\}:\$\{PORT:-4123\}'", f"- '127.0.0.1:{porta}:{porta}'", t)
t = re.sub(r"-\s*\d+:4123:4123", f"- '127.0.0.1:{porta}:{porta}'", t)
if "mem_limit:" not in t:
    t = t.replace("    volumes:", f"    mem_limit: {mem}\n    memswap_limit: {memswap}\n    volumes:", 1)
else:
    t = re.sub(r"mem_limit: \S+", f"mem_limit: {mem}", t)
    t = re.sub(r"memswap_limit: \S+", f"memswap_limit: {memswap}", t)
p.write_text(t)

e = Path(".env")
s = e.read_text()
s = s.replace("DEVICE=auto", "DEVICE=cpu")
e.write_text(s)
print("compose/.env ajustados")
PY

echo "==> build + up (o primeiro build instala o PyTorch CPU e demora alguns minutos)"
docker compose -f "$COMPOSE" up -d --build

echo "==> aguardando a API responder..."
for i in $(seq 1 60); do
  if curl -fsS "http://127.0.0.1:$PORTA/health" >/dev/null 2>&1; then
    echo "no ar: http://127.0.0.1:$PORTA"
    echo
    echo "próximos passos:"
    echo "  1. coloque as amostras de voz (~10s cada) em deploy/tts/voices/ e rode:"
    echo "       node scripts/setup-voices.mjs"
    echo "  2. ligue o CRM nesse serviço no .env.local:  TTS_PROVIDER=chatterbox"
    echo "  3. recrie os containers:  CONECTA_ROOT=\$PWD docker compose --env-file .env.local up -d"
    exit 0
  fi
  sleep 5
done

echo "a API não respondeu em 5 minutos — veja os logs: $0 --logs" >&2
exit 1
