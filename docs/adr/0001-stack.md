# 1. Stack and shape of the system

**Status:** accepted, November 2026 (revised)

## Decision
- **Frontend:** Next.js (App Router) for the customer store and the staff portals. Store and staff are separate apps under `web/`, so admin code never reaches customers. The store can still ship as a Capacitor Android app via a static export.
- **Backend:** Falcon-style NestJS services under `apps/`:
  - `gateway` — public API entry (local / edge), routes `/auth` → auth-service and everything else → core-service
  - `auth-service` — OTP, sessions, TOTP, SMS/email workers
  - `core-service` — catalog, orders, payments, consultations, settings, storage; production lite runs with `SERVICE_ROLE=all` so BullMQ jobs share the process
  - dedicated `worker` (`SERVICE_ROLE=worker`) is optional via `compose.full.yml` when queue load must not share the API process
- **Shared libs:** `libs/contracts`, `libs/database`, `libs/domain`, `libs/ui`, `libs/nest-common`
- **Data:** PostgreSQL (direct in lite; PgBouncer via `compose.full.yml`). Migrations connect directly to Postgres. `pg_trgm` handles medicine search.
- **Jobs:** Redis and BullMQ.
- **Files:** Cloudflare R2 in production (S3 API). Local SeaweedFS behind compose profile `local-s3`.

## Trade-offs
- Next.js is heavier than the previous SvelteKit store. We accept that for one React ecosystem across store, staff, and shared UI, matching the FalconAI frontend/backend split.
- Multiple Nest processes add ops surface. Lite keeps auth/gateway/core separate but folds jobs into core; split further only when measurements justify it.
