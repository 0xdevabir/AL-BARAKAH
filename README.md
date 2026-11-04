# BarakaBari

Online medicine delivery and doctor consultations for Bangladesh, on the web and as an Android app. Customers, admins, riders and doctors each get a separate experience.

## Architecture

Falcon-style monorepo: Next.js frontends under `web/`, NestJS services under `apps/`, shared code under `libs/`.

```
web/store          Next.js customer store (+ Capacitor)
web/staff          Next.js admin / rider / doctor portals
apps/gateway       Public API entry (proxies auth + core)
apps/auth-service  OTP, sessions, SMS/email
apps/core-service  Catalog, orders, payments, consultations
apps/worker        Background jobs (core SERVICE_ROLE=worker)
libs/*             contracts, database, domain, ui, nest-common
infra/             Docker, nginx, backups, load tests
```

## Run locally

You need Node 22+, pnpm 11 and Docker.

```sh
cp .env.example .env
pnpm install
pnpm infra:up
pnpm build
pnpm db:migrate
pnpm db:seed
pnpm dev
```

| App | Address |
|---|---|
| Store | http://localhost:3000 |
| Staff portals | http://localhost:3001 |
| API gateway | http://localhost:4000 |
| Auth service | http://localhost:4010 |
| Core service | http://localhost:4020 |

Set `NEXT_PUBLIC_API_URL=http://localhost:4000` (and `PUBLIC_API_BASE`) so browsers hit the gateway.

The seed creates demo accounts: admin `+8801700000001`, rider `+8801700000002`, doctor `+8801700000003` and customer `+8801700000004`. With `DEMO_LOGIN=true`, the sign-in pages show one-tap buttons. The demo admin skips TOTP. The API refuses to start with this setting in production.

In development, sign-in codes are printed in the auth-service log instead of being sent by SMS.

## Test

```sh
pnpm typecheck
pnpm test
cd apps/e2e && pnpm exec playwright test
```

## Android app

You need JDK 21 and Android Studio. Point Capacitor at a static store build (`BUILD_TARGET=mobile`).

```sh
cd web/store
PUBLIC_API_URL=https://<store domain>/api pnpm build:mobile
```

## Docs

- [Deploy runbook](docs/runbook.md)
- [Load test results](docs/load-test.md)
- [Decision records](docs/adr)
