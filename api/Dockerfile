# ==========================================
# Stage 1: Build & compilation TypeScript
# ==========================================
FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json tsconfig.json ./
COPY database ./database
COPY api ./api
COPY dist ./dist
COPY node_modules ./node_modules

# Si dist/ n'est pas déjà présent (ex: build CI/CD sans artefacts pré-compilés),
# installation et compilation
RUN if [ ! -f "dist/api/src/server.js" ]; then \
      npm ci && npx prisma generate --schema=database/prisma/schema.prisma && npm run build; \
    fi

# ==========================================
# Stage 2: Runtime de production allégé
# ==========================================
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

COPY package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist

# Sécurité K8s / CIS Docker : exécution sous utilisateur non-privilégié node
USER node

EXPOSE 3000

CMD ["node", "dist/api/src/server.js"]
