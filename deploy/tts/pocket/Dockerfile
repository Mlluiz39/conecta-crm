# Serviço de voz local (Pocket TTS) do ConectaCRM — Kyutai, MIT, 100M parâmetros em CPU.
#
# O CRM fala com ele pelo dialeto MLVoice (POST /v1/tts + X-API-Key); quem traduz é o
# server.py (adaptador). O WAV sai daqui e o CRM converte para ogg/opus com o ffmpeg
# da própria imagem.
#
# Voz pt-BR: `rafael` (padrão). Outras vozes built-in do pocket-tts podem ser pedidas
# por agente via agents.voice = "mlvoice:<nome>".
FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    HF_HOME=/cache/huggingface \
    ADAPTER_HOST=127.0.0.1 \
    ADAPTER_PORT=8765 \
    POCKET_URL=http://127.0.0.1:8000

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl \
    && rm -rf /var/lib/apt/lists/*

# PyTorch CPU do PyPI já vem sem CUDA em arm64/x86 CPU-only — o pocket-tts traz a
# dependência. (~1 GB de imagem; o modelo vira cache em /cache na primeira geração.)
RUN pip install --no-cache-dir pocket-tts

WORKDIR /app
COPY server.py entrypoint.sh /app/
RUN chmod +x /app/entrypoint.sh

EXPOSE 8765

# O download/load do modelo pode levar minutos na primeira subida.
HEALTHCHECK --interval=30s --timeout=6s --start-period=240s --retries=3 \
  CMD python3 -c "import sys,urllib.request; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8765/health', timeout=4).status == 200 else 1)" || exit 1

CMD ["/app/entrypoint.sh"]
