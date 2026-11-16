# Deux usages, même image :
#  - migrations : `npm run migrate` (hook Argo CD PreSync avant chaque déploiement), jamais de perte de données ;
#  - seeder (CMD par défaut) : migrations puis données de démonstration, et s'arrête.
# Contexte de build : ./database
FROM node:22-alpine AS build
RUN apk add --no-cache openssl
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run prisma:generate && npm run build

FROM node:22-alpine
RUN apk add --no-cache openssl
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts
COPY prisma/schema.prisma ./prisma/schema.prisma
COPY prisma/migrations ./prisma/migrations
RUN npm run prisma:generate
COPY --from=build /app/dist ./dist
USER node
# SEED_SCRIPT : seed-10k (défaut, ignoré si la base est déjà peuplée) ou seed (jeu minimal, réinitialise les tables)
ENV SEED_SCRIPT=seed-10k
CMD ["npm", "start"]
