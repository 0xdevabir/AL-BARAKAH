# 1. Stack and shape of the system

**Status:** accepted, November 2026 (revised)

## Decision
- **Frontend:** Next.js (App Router) for the customer store and the staff portals. Store and staff are separate apps under `web/`, so admin code never reaches customers. The store can still ship as a Capacitor Android app via a static export.
- **Backend:** Falcon-style NestJS services under `apps/`:
  - `gateway` — public API entry (local / edge), routes `/auth` → auth-service and everything else → core-service
  - `auth-service` — OTP, sessions, TOTP, SMS/email workers
  - `core-service` — catalog, orders, payments, consultations, settings, storage
  - `worker` — core background jobs (`SERVICE_ROLE=worker`) so queue work cannot slow customer requests
- **Shared libs:** `libs/contracts`, `libs/database`, `libs/domain`, `libs/ui`, `libs/nest-common`
- **Data:** PostgreSQL through PgBouncer in transaction mode, with reviewed Prisma migrations. Migrations connect directly to Postgres. `pg_trgm` handles medicine search.
- **Jobs:** Redis and BullMQ.
- **Files:** SeaweedFS behind the S3 API, so any S3 service can replace it.

## Trade-offs
- Next.js is heavier than the previous SvelteKit store. We accept that for one React ecosystem across store, staff, and shared UI, matching the FalconAI frontend/backend split.
- Multiple Nest processes add ops surface. A gateway keeps one public API URL for cookies and clients. Split further only when measurements justify it.
