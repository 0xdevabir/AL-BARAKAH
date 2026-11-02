# 2. Deployment and client addresses

**Status:** accepted, November 2026

## Decision
- **Compose on one VPS:** storage and app run as separate compose files. Kubernetes isn't needed at this scale.
- **Three domains:** store, staff and files. The files domain exists because signed upload URLs include the host, so it must reach storage unchanged. Using a path on the store domain would break the signature.
- **One app image:** the API, worker, store and migration job share one image. It keeps deploys simple but is large (1.43 GB), because it includes the full workspace and the Prisma CLI. Slim it if pull times or disk become a problem.

## Client addresses and rate limits
- nginx overwrites `X-Forwarded-For`, and the API trusts exactly one proxy, so clients can't fake an address.
- During server rendering, the store forwards the visitor's address to the API. Without this, all visitors would share the store's address and a single rate limit.
- The general limit defaults to 1,200 requests per minute per address, and the OTP limit is 60 per 10 minutes. They are high because many Bangladeshi mobile users share a carrier address. OTP abuse is also limited per phone number.
