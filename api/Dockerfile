# ==========================================
# Stage 1: Install & Build
# ==========================================
FROM node:22-alpine AS builder

WORKDIR /app

# Copie des manifestes workspace
COPY package.json package-lock.json ./
COPY database/package.json database/
COPY api/package.json api/

# Installation des dépendances (workspaces)
RUN npm ci --workspace=api --workspace=database --include-workspace-root

# Copie des sources
COPY database/ database/
COPY api/ api/

# Génération du client Prisma
RUN npx prisma generate --schema=database/prisma/schema.prisma

# Compilation TypeScript du package database puis api
RUN npm run build --workspace=database
RUN npm run build --workspace=api

# ==========================================
# Stage 2: Runtime allégé
# ==========================================
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Copie des manifestes et installation production uniquement
COPY package.json package-lock.json ./
COPY database/package.json database/
COPY api/package.json api/
RUN npm ci --workspace=api --workspace=database --include-workspace-root --omit=dev && npm cache clean --force

# Copie des artefacts compilés et du client Prisma
COPY --from=builder /app/database/dist database/dist
COPY --from=builder /app/api/dist api/dist
COPY --from=builder /app/node_modules/.prisma node_modules/.prisma
COPY --from=builder /app/database/prisma/schema.prisma database/prisma/schema.prisma

USER node

EXPOSE 3000

CMD ["node", "api/dist/src/server.js"]
