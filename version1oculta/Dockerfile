# ── Stage 1: dependencias ─────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# ── Stage 2: runtime endurecido ──────────────────────────────
FROM node:20-alpine AS runtime

# dumb-init reenvía señales SIGTERM/SIGINT al proceso Node correctamente
RUN apk add --no-cache dumb-init

WORKDIR /app

# Copiar solo node_modules limpios del builder (sin cache de npm)
COPY --from=builder /app/node_modules ./node_modules

# Copiar únicamente el servidor (sin client/, scripts/, *.md, .env*)
COPY server/ ./server/
COPY package.json ./
# security.txt para la ruta /.well-known/security.txt (RFC 9116)
COPY .well-known/ ./.well-known/

ENV NODE_ENV=production

# Forzar usuario no-root (uid 1000 ya existe en node:alpine)
USER node

# Filesystem de solo lectura — la app no necesita escribir en disco
# Los tmp que necesite Express van en el tmpfs definido en docker-compose
EXPOSE 3000

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "server/server.js"]
