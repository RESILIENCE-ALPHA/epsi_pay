# ==========================================
# Stage 1: Install & Build
# ==========================================
FROM node:22-alpine AS builder

WORKDIR /app

# Toolchain requis pour compiler les modules natifs (bcrypt)
RUN apk add --no-cache python3 make g++

# Copie des manifestes workspace (api dépend de auth + database)
COPY package.json package-lock.json ./
COPY database/package.json database/
COPY auth/package.json auth/
COPY api/package.json api/

# Installation des dépendances (workspaces)
RUN npm ci --workspace=api --workspace=auth --workspace=database --include-workspace-root

# Copie des sources
COPY database/ database/
COPY auth/ auth/
COPY api/ api/

# Génération du client Prisma
RUN npx prisma generate --schema=database/prisma/schema.prisma

# Compilation TypeScript dans l'ordre des dépendances : database -> auth -> api
RUN npm run build --workspace=database
RUN npm run build --workspace=auth
RUN npm run build --workspace=api

# ==========================================
# Stage 2: Runtime allégé
# ==========================================
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Copie des manifestes et installation production uniquement.
# Le toolchain (virtuel) est ajouté pour compiler bcrypt puis retiré pour garder l'image légère.
COPY package.json package-lock.json ./
COPY database/package.json database/
COPY auth/package.json auth/
COPY api/package.json api/
RUN apk add --no-cache --virtual .build-deps python3 make g++ \
    && npm ci --workspace=api --workspace=auth --workspace=database --include-workspace-root --omit=dev \
    && npm cache clean --force \
    && apk del .build-deps

# Copie des artefacts compilés et du client Prisma
COPY --from=builder /app/database/dist database/dist
COPY --from=builder /app/auth/dist auth/dist
COPY --from=builder /app/api/dist api/dist
COPY --from=builder /app/node_modules/.prisma node_modules/.prisma
COPY --from=builder /app/database/prisma/schema.prisma database/prisma/schema.prisma

USER node

EXPOSE 3000

CMD ["node", "api/dist/src/server.js"]
