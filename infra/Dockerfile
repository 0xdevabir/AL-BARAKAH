# Build from the repo root:
#   docker build -f infra/Dockerfile --target app  -t albarakah-app  .
#   docker build -f infra/Dockerfile --target edge -t albarakah-edge .
FROM node:22.21.1-alpine AS app
RUN apk add --no-cache openssl && corepack enable
WORKDIR /app
ENV CI=true
COPY . .
RUN pnpm install --frozen-lockfile
# Baked into the browser bundles. Relative, so the store and staff sites each call /api on their own domain.
ARG NEXT_PUBLIC_API_URL=/api
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL} NEXT_TELEMETRY_DISABLED=1
RUN pnpm turbo run build --filter=@albarakah/gateway --filter=@albarakah/auth-service --filter=@albarakah/core-service --filter=@albarakah/store --filter=@albarakah/staff
# Next's standalone server doesn't include the static assets; put them where server.js looks.
RUN for app in store staff; do \
      out=web/$app/.next/standalone/web/$app; \
      cp -r web/$app/.next/static $out/.next/static && cp -r web/$app/public $out/public; \
    done
ENV NODE_ENV=production
# Each compose service picks its command: gateway, auth-service, core-service (SERVICE_ROLE api|worker), or a Next server.
CMD ["node", "apps/gateway/dist/main.js"]

# Stock nginx plus the shared config. compose.app.yml mounts the same files, so editing them needs only a restart.
FROM nginx:1.28.0-alpine AS edge
ARG EDGE_MODE=tls
RUN rm /etc/nginx/conf.d/default.conf
COPY infra/nginx/shared /etc/nginx/shared
COPY infra/nginx/${EDGE_MODE}/ /etc/nginx/templates/
