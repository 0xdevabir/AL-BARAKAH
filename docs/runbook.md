# Deploy runbook

The first production deploy has not happened yet. Every step below ran on one machine except TLS, certificates, cron and off-site copies, so check those closely the first time.

## 1. Prepare the server
You need an Ubuntu VPS (about 4 vCPU and 8 GB) with Docker, and DNS records pointing at it for three names: the store, staff and files domains. Open only ports 22, 80 and 443.

## 2. Configure
Clone the repo, `cp .env.example .env`, and change these:

| Setting | Production value |
|---|---|
| `POSTGRES_PASSWORD`, `S3_ACCESS_KEY`, `S3_SECRET_KEY` | New random values. Use letters and digits only in `POSTGRES_PASSWORD`, because it goes inside a URL. |
| `JWT_SECRET`, `OTP_PEPPER`, `TOTP_ENCRYPTION_KEY` | Each `openssl rand -hex 32`. Changing `TOTP_ENCRYPTION_KEY` later locks admins out of TOTP. |
| `STORE_DOMAIN`, `STAFF_DOMAIN`, `FILES_DOMAIN` | Your three names |
| `STORE_URL` | `https://<store domain>` |
| `PUBLIC_API_BASE` | `https://<store domain>/api` |
| `S3_PUBLIC_URL` | `https://<files domain>` |
| `CORS_ORIGINS` | `https://<store domain>,https://<staff domain>,capacitor://localhost,https://localhost` |
| `SMS_PROVIDER`, `SMS_API_KEY`, `SMS_SENDER_ID` | `bulksmsbd`, plus your API key and approved sender ID from bulksmsbd.net |
| `BKASH_MODE` and `BKASH_*` | `sandbox` while testing, `live` with your merchant account |
| `FIRST_ADMIN_PHONE` | Your phone, as `+8801XXXXXXXXX` |

The compose file sets `NODE_ENV`, `DATABASE_URL`, `REDIS_URL` and the `S3_ENDPOINT` settings itself. The API refuses to start in production with the fake bKash or console SMS provider, or with `DEMO_LOGIN=true`, so remove that line from your `.env`.

BulkSMSBD can refuse requests from an IP that isn't whitelisted (gateway error 1032). Add the server's IP under Phone Book > IP White List in its dashboard, or disable whitelisting there. Masked sender IDs must send Bengali text (error 1012), and sign-in codes are in English, so use a non-masking sender ID or translate them. Failed sends appear in the worker log with the gateway's reason. Admins can check credit at `GET /admin/sms/balance`.

To test bKash with `BKASH_MODE=sandbox`, pay on bKash's page with wallet `01770618575`, OTP `123456` and PIN `12121`. Wallet `01823074817` fails with insufficient balance and `01823074818` with a debit block. bKash sends the customer's browser back to `PUBLIC_API_BASE`, so testing from a phone needs an address the phone can reach, not `localhost`. Sandbox credentials are rejected by the live service.

## 3. Get a certificate
Get one certificate covering all three names, stored under the store domain's name, before starting nginx in TLS mode:

```sh
sudo certbot certonly --standalone -d <store> -d <staff> -d <files>
```

For renewals, switch certbot to webroot `/var/www/acme` and add a deploy hook: `docker exec albarakah-edge-1 nginx -s reload`.

### Sharing the server with a host nginx
If nginx on the host already owns ports 80/443 for other sites, don't let the edge container take them. Run it in proxied mode on loopback and skip the certificate step above. Add these to `.env`:

```sh
EDGE_MODE=proxied
EDGE_HTTP_PORT=127.0.0.1:8080
EDGE_HTTPS_PORT=127.0.0.1:8443   # unused in this mode, kept off the public interface
```

Then give the host nginx one server block for the three names. Certbot's nginx plugin can add TLS to it as it does for your other sites:

```nginx
server {
  listen 443 ssl;
  http2 on;
  server_name <store> <staff> <files>;
  # ssl_certificate lines from certbot

  client_max_body_size 11m;          # prescription uploads go to the files domain
  location / {
    proxy_pass http://127.0.0.1:8080;
    proxy_http_version 1.1;
    proxy_set_header Connection "";
    proxy_set_header Host $host;      # picks the site inside the edge, and signed file URLs depend on it
    proxy_set_header X-Forwarded-For $remote_addr;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_buffering off;              # live order updates
    proxy_read_timeout 1h;
  }
}
server {
  listen 80;
  server_name <store> <staff> <files>;
  return 301 https://$host$request_uri;
}
```

The edge trusts `X-Forwarded-For` only from loopback and private Docker addresses, so it sees the visitor's real IP for rate limits.

## 4. Deploy

```sh
export COMPOSE_PROJECT_NAME=albarakah COMPOSE_FILE=infra/compose.storage.yml:infra/compose.app.yml COMPOSE_ENV_FILES=.env
export APP_VERSION=$(git rev-parse --short HEAD)
docker build -f infra/Dockerfile --target app -t albarakah-app:$APP_VERSION .
docker build -f infra/Dockerfile --target edge -t albarakah-edge:$APP_VERSION .
docker compose up -d --wait
```

`migrate` runs first on every deploy and applies new migrations. It also creates the settings row and first admin if they don't exist. Then `auth` and `core` start, then `gateway`, then the `store` and `staff` Next servers, then `edge`. `worker` runs the background jobs alongside. All of them use the `albarakah-app` image with different commands. The browser bundles call the relative `/api`, so the image works on any domain without a rebuild.

Then sign in on the staff site with `FIRST_ADMIN_PHONE`, set up TOTP, and set the real fees, zones and catalog.

## 5. Check it
- The store home page loads over HTTPS, and `https://<store>/api/health` returns `{"ok":true}`.
- A real SMS code arrives on your phone.
- A prescription upload works from a phone.
- A small bKash payment and refund work end to end.

## Roll back
Set `APP_VERSION` to the previous tag and run `docker compose up -d --wait`. This doesn't undo migrations, so keep them backward compatible with the previous release. If one isn't, restore the backup taken before the deploy.

## Backups
Run daily from root's cron, then copy `BACKUP_DIR` to another provider. A backup on the same VPS doesn't survive losing that VPS.

```cron
0 21 * * * COMPOSE_PROJECT_NAME=albarakah BACKUP_DIR=/var/backups/albarakah /srv/albarakah/infra/backup/backup.sh
```

Test a restore monthly. It loads a backup into a temporary database and compares row counts:

```sh
COMPOSE_PROJECT_NAME=albarakah infra/backup/restore-test.sh /var/backups/albarakah/db-<stamp>.dump
```

To restore for real, stop `gateway`, `auth`, `core`, `worker`, `store` and `staff`, then run `pg_restore --clean --if-exists` into `albarakah`. For prescription files, stop `objectstore` and extract `files-<stamp>.tar.gz` into its volume.

## Scaling
Do these in order, and only when measurements call for them:
1. Move Postgres to its own VPS.
2. Run more `core` replicas behind the gateway.
3. Add a read replica.
