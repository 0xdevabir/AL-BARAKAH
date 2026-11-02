# 1. Stack and shape of the system

**Status:** accepted, November 2026

## Decision
- **Frontend:** SvelteKit and Svelte 5, for very little JavaScript on low-end phones. The store is server-rendered on the web and static inside Capacitor. Staff portals are a separate app, so admin code never reaches customers.
- **Backend:** a single NestJS modular monolith on Fastify. One image runs as the API or the worker, so background jobs can't slow customer requests.
- **Data:** PostgreSQL through PgBouncer in transaction mode, with reviewed Prisma migrations. Migrations connect directly to Postgres. `pg_trgm` handles medicine search.
- **Jobs:** Redis and BullMQ.
- **Files:** SeaweedFS behind the S3 API, so any S3 service can replace it. The plan named MinIO, but its image couldn't be pulled during the build.
- **Calling later:** LiveKit can be added as a new consultation channel, without changing how booking works.

## Trade-offs
- Svelte has a smaller ecosystem than React. We accept that for bundle size: the store's first load is about 42 KB of JS, against about 846 KB measured on FalconAI's React shell.
- One service means one deploy can affect everything. Split a service out only when measurements justify it.
