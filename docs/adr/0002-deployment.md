# 2. Deployment and client addresses

**Status:** accepted, November 2026 (revised)

## Decision
- **Compose on one VPS:** storage and app run as separate compose files. Kubernetes isn't needed at this scale.
- **Lite by default:** 8 long-running containers (postgres, redis, auth, core-with-jobs, gateway, store, staff, edge). No SeaweedFS, no PgBouncer, no dedicated worker. Heavy split is `compose.full.yml`.
- **Two domains + R2:** store and staff. Prescription/images live on Cloudflare R2; there is no files domain on the VPS. Local SeaweedFS still uses `pnpm infra:up` (`local-s3` profile).
- **One app image:** the API, optional worker, store and migration job share one image. It keeps deploys simple but is large (1.43 GB), because it includes the full workspace and the Prisma CLI. Slim it if pull times or disk become a problem.
- **Memory caps:** Node services set `NODE_OPTIONS=--max-old-space-size=…` and Compose `mem_limit` so a small VPS does not OOM under idle churn.

## Client addresses and rate limits
- nginx overwrites `X-Forwarded-For`, and the API trusts exactly one proxy, so clients can't fake an address.
- During server rendering, the store forwards the visitor's address to the API. Without this, all visitors would share the store's address and a single rate limit.
- The general limit defaults to 1,200 requests per minute per address, and the OTP limit is 60 per 10 minutes. They are high because many Bangladeshi mobile users share a carrier address. OTP abuse is also limited per phone number.
