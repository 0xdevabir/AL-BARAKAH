# Build from the repo root: docker build -f infra/Dockerfile --target app -t albarakah-app .
FROM node:22.21.1-alpine AS app
RUN apk add --no-cache openssl && corepack enable
WORKDIR /app
ENV CI=true
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm turbo run build --filter=@albarakah/gateway --filter=@albarakah/auth-service --filter=@albarakah/core-service --filter=@albarakah/store --filter=@albarakah/staff
ENV NODE_ENV=production
# Services pick a command: gateway, auth-service, core-service, or worker (SERVICE_ROLE=worker).
CMD ["node", "apps/gateway/dist/main.js"]

FROM nginx:1.28.0-alpine AS edge
COPY --from=app /app/web/staff/.next/standalone /srv/staff
COPY --from=app /app/web/store/.next/standalone /srv/store
COPY infra/nginx /etc/nginx/templates
