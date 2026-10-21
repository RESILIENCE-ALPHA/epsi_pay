# Contexte de build : racine du dépôt (le schéma Prisma est partagé dans database/prisma)
FROM node:22-alpine AS build
RUN apk add --no-cache openssl
WORKDIR /app/auth
COPY auth/package.json auth/package-lock.json ./
RUN npm ci
COPY database/prisma/schema.prisma /app/database/prisma/schema.prisma
COPY auth/ ./
RUN npm run prisma:generate && npm run build

FROM node:22-alpine
RUN apk add --no-cache openssl
ENV NODE_ENV=production PORT=3000
WORKDIR /app
COPY auth/package.json auth/package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts
COPY --from=build /app/auth/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/auth/dist ./dist
COPY auth/openapi.yaml ./openapi.yaml
USER node
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/health" > /dev/null || exit 1
CMD ["node", "dist/main.js"]
