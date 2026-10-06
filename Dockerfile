# ConectaCRM em container.
#
# Por que derivar da imagem oficial do Hermes (`nousresearch/hermes-agent`):
#   o CRM chama o CLI do Hermes para (1) enviar WhatsApp/e-mail, (2) pausar/retomar o bot
#   e (3) gerar o texto da prospecção. Se o CRM usasse outra imagem, o CLI ficaria em
#   versão diferente do gateway — e os dois escrevem no mesmo `state.db`. Derivando da
#   mesma imagem, CLI e gateway são sempre a MESMA versão.
#
# Estrutura: builder (Node + build do Next) -> runtime (imagem do Hermes + app standalone).
# O app roda como usuário comum (não root) e o home do Hermes fica em /opt/data (volume).

# ---------- 1) build do Next ----------
FROM nousresearch/hermes-agent:latest AS builder

USER root
RUN apt-get update \
    && apt-get install -y --no-install-recommends nodejs npm ca-certificates \
    && rm -rf /var/lib/apt/lists/*
RUN node --version && npm --version

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
FROM nousresearch/hermes-agent:latest AS runtime

USER root
RUN apt-get update \
    && apt-get install -y --no-install-recommends nodejs ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/scripts ./scripts

# O Compose roda estes containers com `user: <uid do host>` (para os arquivos do volume
# do Hermes ficarem com o dono certo). Sem isso, os scripts ficam root-only e o node
# morre com EACCES ao carregar `scripts/*.mjs`.
ARG APP_UID=1000
ARG APP_GID=1000
RUN chown -R ${APP_UID}:${APP_GID} /app

ENV NODE_ENV=production \
    PORT=8081 \
    HOSTNAME=0.0.0.0 \
    NEXT_TELEMETRY_DISABLED=1 \
    TZ=America/Sao_Paulo \
    HERMES_HOME=/opt/data

# O CLI do Hermes já existe nesta imagem (mesma versão do gateway).
# Pode ser sobrescrito por env (HERMES_BIN) se o layout da imagem mudar.
ENV HERMES_BIN=/opt/hermes/bin/hermes

# ATENÇÃO: nesta imagem `/usr/bin/tini` é um shim que sobe o s6-overlay do Hermes — e o s6
# recusa iniciar com `--user <uid>` (exige root + HERMES_UID/GID). Como aqui quem manda é o Next,
# usamos o node direto como entrypoint: sem s6, e o Compose aplica `user: 1000:1000` normalmente.
# (O gateway do Hermes roda no serviço `hermes`, que usa o s6 como manda a doc.)
ENTRYPOINT ["/usr/local/bin/node"]
CMD ["server.js"]

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8081)+'/login').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
