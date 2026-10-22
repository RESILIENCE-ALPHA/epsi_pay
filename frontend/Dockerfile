# Contexte de build : frontend/
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run typecheck && npm run build

FROM nginxinc/nginx-unprivileged:1.27-alpine
ENV AUTH_URL=http://auth:3000 PAYMENT_URL=http://payment:3000
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=3s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:8080/healthz" > /dev/null || exit 1
