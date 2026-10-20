# ==========================================
# Image d'initialisation BDD pour Kubernetes (Job / Migration)
# ==========================================
FROM node:22-alpine

WORKDIR /app

ENV NODE_ENV=production

# Copie des configurations et manifestes
COPY package*.json tsconfig.json ./
COPY database ./database
COPY dist ./dist
COPY node_modules ./node_modules

# Support double : build local/hors-ligne ou build CI/CD standard
RUN if [ ! -d "node_modules/@prisma/client" ]; then \
      npm ci && npx prisma generate --schema=database/prisma/schema.prisma; \
    fi

# Droits d'exécution sur le script d'entrée
RUN chmod +x database/entrypoint-init.sh

ENTRYPOINT ["database/entrypoint-init.sh"]
