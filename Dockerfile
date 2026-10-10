# ConectaCRM em container.
#
# Base: imagem oficial do Node + ffmpeg. O CRM **não** depende de runtime de agente externo:
#   1. as mensagens saem pelo Evolution API (src/services/messaging/evolution.adapter.ts);
#   2. o texto é gerado pelos agentes nativos (src/services/agents).
# O ffmpeg é o único binário de sistema que o app chama, na conversão da nota de voz
# (src/services/audio/voice.ts) — sem ele o áudio sai no formato que veio.
#
# Estrutura: builder (build do Next) -> runtime (Node + app standalone).

# ---------- 1) build do Next ----------
FROM node:24-bookworm-slim AS builder

WORKDIR /app

# deps primeiro (cache de camada)
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . .

# NEXT_PUBLIC_* é embutido no bundle do cliente em tempo de BUILD.
ARG NEXT_PUBLIC_SUPABASE_URL=""
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY=""
ARG NEXT_PUBLIC_APP_URL="http://localhost:8081"
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL \
    NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY \
    NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL \
    NEXT_TELEMETRY_DISABLED=1 \
    NODE_ENV=production

RUN npm run build
# o standalone não copia public/ e .next/static — juntamos tudo num só diretório
RUN if [ -d public ]; then cp -r public .next/standalone/public; fi \
    && mkdir -p .next/standalone/.next \
    && cp -r .next/static .next/standalone/.next/static

# ---------- 2) runtime ----------
FROM node:24-bookworm-slim AS runtime

RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/scripts ./scripts

# O Compose roda estes containers com `user: <uid do host>`. Sem o chown, os scripts ficam
# root-only e o node morre com EACCES ao carregar `scripts/*.mjs`.
ARG APP_UID=1000
ARG APP_GID=1000
RUN chown -R ${APP_UID}:${APP_GID} /app

ENV NODE_ENV=production \
    PORT=8081 \
    HOSTNAME=0.0.0.0 \
    NEXT_TELEMETRY_DISABLED=1 \
    TZ=America/Sao_Paulo

# `init: true` no compose dá o processo init; aqui quem manda é o Next.
ENTRYPOINT ["node"]
CMD ["server.js"]

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8081)+'/login').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
