# Build from the repo root: docker build -f infra/Dockerfile --target app -t albarakah-app .
FROM node:22.21.1-alpine AS app
RUN apk add --no-cache openssl && corepack enable
WORKDIR /app
ENV CI=true
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm turbo run build --filter=@albarakah/api --filter=@albarakah/store --filter=@albarakah/staff
ENV NODE_ENV=production
# The API, worker, store and migration job all use this image with a different command.
CMD ["node", "apps/api/dist/main.js"]

FROM nginx:1.28.0-alpine AS edge
COPY --from=app /app/apps/staff/build /srv/staff
