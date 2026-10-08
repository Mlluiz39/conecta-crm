# Serviço de voz (Piper) do ConectaCRM — imagem enxuta: Piper + o wrapper HTTP.
#
# Piper é MIT e roda em CPU perto do tempo real, então não precisa de GPU nem de 3 GB de RAM.
# As vozes (.onnx ~60 MB cada) ficam num volume, montado em /voices.
FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    VOICES_DIR=/voices \
    PORT=4124

# espeak-ng é a base fonética do Piper; ffmpeg/sox não são necessários (o WAV sai pronto e o
# CRM converte para ogg/opus na hora de enfileirar para a Evolution).
RUN apt-get update \
    && apt-get install -y --no-install-recommends espeak-ng curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir piper-tts==1.2.0

WORKDIR /app
COPY server.py /app/server.py
RUN mkdir -p /voices

EXPOSE 4124
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -fsS "http://127.0.0.1:${PORT}/health" >/dev/null || exit 1

CMD ["python3", "/app/server.py"]
