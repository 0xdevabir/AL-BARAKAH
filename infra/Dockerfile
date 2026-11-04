# syntax=docker/dockerfile:1.7
# Build from the repo root:
#   docker build -f infra/Dockerfile --target app  -t albarakah-app  .
#   docker build -f infra/Dockerfile --target edge -t albarakah-edge .
# Every base image is multi-arch, so this builds natively on amd64 and arm64 (Apple Silicon,
# Graviton, Windows on ARM). To build for a server of the other arch, add --platform linux/amd64.
FROM node:22.21.1-alpine AS app
RUN apk add --no-cache openssl && corepack enable
WORKDIR /app
ENV CI=trueNEXT_TELEMETRY_DISABLED=1 TURBO_TELEMETRY_DISABLED=1
# Download dependencies from the lockfile alone, so this layer (the slow one) is reused until
# pnpm-lock.yaml changes. The cache mount keeps the store across builds even when it doesn't.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm fetch --frozen-lockfile --store-dir=/pnpm/store
COPY . .
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --offline --store-dir=/pnpm/store
# Baked into the browser bundles. Relative, so the store and staff sites each call /api on their own domain.
ARG NEXT_PUBLIC_API_URL=/api
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
# Turbo's cache survives between builds, so packages whose sources didn't change aren't rebuilt.
RUN --mount=type=cache,id=turbo-cache,target=/turbo-cache \
    pnpm turbo run build --cache-dir=/turbo-cache \
      --filter=@albarakah/gateway --filter=@albarakah/auth-service --filter=@albarakah/core-service \
      --filter=@albarakah/store --filter=@albarakah/staff
# Next's standalone server doesn't include the static assets; put them where server.js looks.
RUN for app in store staff; do \
      out=web/$app/.next/standalone/web/$app; \
      cp -r web/$app/.next/static $out/.next/static && cp -r web/$app/public $out/public; \
    done && rm -rf web/*/.next/cache
ENV NODE_ENV=production
# Each compose service picks its command: gateway, auth-service, core-service (SERVICE_ROLE api|worker), or a Next server.
CMD ["node", "apps/gateway/dist/main.js"]

# Stock nginx plus the shared config. compose.app.yml mounts the same files, so editing them needs only a restart.
FROM nginx:1.28.0-alpine AS edge
ARG EDGE_MODE=tls
RUN rm /etc/nginx/conf.d/default.conf
COPY infra/nginx/shared /etc/nginx/shared
COPY infra/nginx/${EDGE_MODE}/ /etc/nginx/templates/
