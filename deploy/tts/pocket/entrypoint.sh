#!/bin/sh
# Sobe o Pocket TTS (servidor `serve`) + o adaptador MLVoice no mesmo container.
set -eu

LANG_TTS="${POCKET_LANGUAGE:-portuguese}"
VOZ="${POCKET_VOICE:-}"
PORTA_POCKET="${POCKET_PORT:-8000}"

set -- serve --host 127.0.0.1 --port "$PORTA_POCKET" --language "$LANG_TTS"
if [ -n "$VOZ" ]; then
  set -- "$@" --default-voice "$VOZ"
fi
if [ -n "${POCKET_QUANTIZE:-}" ]; then
  set -- "$@" --quantize
fi

echo "[pocket] pocket-tts $*" >&2
pocket-tts "$@" &

# O adaptador (foreground) é o processo do container: se ele sair, o Docker reinicia.
exec python3 /app/server.py
