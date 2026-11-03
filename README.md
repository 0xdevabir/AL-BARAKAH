# BarakaBari

Online medicine delivery and doctor consultations for Bangladesh, on the web and as an Android app. It has separate experiences for customers, admins, riders and doctors.

## Run locally
You need Node 22 or newer, pnpm 11 and Docker.

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
| Store | http://localhost:5173 |
| Staff portals | http://localhost:5174 |
| API | http://localhost:4000 |

The seed creates demo accounts: admin `+8801700000001`, rider `+8801700000002`, doctor `+8801700000003` and customer `+8801700000004`. With `DEMO_LOGIN=true`, the sign-in pages show one-tap buttons for them: Customer on the store, and Admin, Rider and Doctor on the staff site. The demo admin skips TOTP. The API refuses to start with this setting in production.

In development, sign-in codes are printed in the API's log instead of being sent by SMS.

## Layout
| Folder | Contents |
|---|---|
| `apps/api` | NestJS API and background worker |
| `apps/store` | Customer website and Capacitor app |
| `apps/staff` | Admin, rider and doctor portals |
| `apps/e2e` | Playwright browser tests |
| `packages/contracts` | Request schemas and permissions shared with the frontends |
| `packages/domain` | Delivery slots, fees and order rules |
| `packages/database` | Prisma schema, migrations and seeds |
| `packages/ui` | Design tokens and shared components |
| `infra` | Docker, nginx, backups and the load test |

## Test
```sh
pnpm typecheck
pnpm test
cd apps/e2e && pnpm exec playwright test
```

To check the bundle budget, run the built store on port 3000 with the API running, then `pnpm --filter @albarakah/store budget`.

## Android app
You need JDK 21 and Android Studio. `PUBLIC_API_URL` must be the address the phone can reach, which is `http://10.0.2.2:4000` on the emulator.

```sh
cd apps/store
PUBLIC_API_URL=https://<store domain>/api pnpm build:mobile
pnpm exec cap sync android
pnpm exec cap open android
```

## Docs
- [Deploy runbook](docs/runbook.md)
- [Load test results](docs/load-test.md)
- [Decision records](docs/adr)
