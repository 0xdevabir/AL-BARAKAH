# Load test

**Result:** 1,000 simulated customers ran with no failed requests and low latency. This shows the software has no obvious bottleneck at that level, but it is not yet a measure of real VPS capacity.

## Run of 2 November 2026
The full production-mode stack ran through nginx and PgBouncer, with a 1-minute ramp, 3 minutes at 1,000 users and a 20-second ramp down.

| Measure | Result | Limit |
|---|---|---|
| Requests | 143,459 (534 per second) | |
| Failed requests | 0 | under 1% |
| Orders placed | 2,684, none failed | under 1% failed |
| Server-rendered pages, p95 | 2.8 ms | 800 ms |
| API reads, p95 | 1.3 ms | 500 ms |
| Order placement, p95 | 7.5 ms | 1,000 ms |
| Slowest request | 221 ms | |

## Why the real numbers will be slower
- **Same machine:** k6 and the stack shared one 10-CPU Mac with no real network, so these times leave out the internet. A 4 vCPU VPS also has less capacity.
- **Tiny catalog:** the database had 14 medicines, so search and listing queries did very little work.
- **One customer:** all orders came from a single account and medicine, which doesn't reflect real contention.
- **Not included:** real SMS and bKash calls, live order updates (SSE), and staff portal traffic.
- **Run before a small change:** the run came before the store's inline CSS limit was raised. That only affects page size, not server work.

Repeat this on the real VPS, from another machine, with the real catalog before launch.

## How to run
Use a throwaway stack only. `prepare.sql` adds a test customer and overwrites all stock, so never run it against real data.

```sh
docker exec -i <project>-postgres-1 psql -U albarakah -d albarakah < infra/k6/prepare.sql
docker run --rm --network <project>_default -v "$PWD/infra/k6:/k6:ro" \
  -e PEAK=1000 -e HOLD=3m -e USER_ID=loadtest-customer -e ADDRESS_ID=loadtest-address \
  -e JWT_SECRET=<the stack's secret> grafana/k6:1.3.0 run --quiet /k6/load.js
```

Set `RATE_LIMIT_PER_MINUTE` very high on that stack, because all the traffic comes from one address.
