# Render Configuration

Status: Prepared, not live

Provider: Render

Use these settings for the intended single-instance Render Free Web Service. Do not enter provider secrets, secret files, billing information, or live URLs in repository files.

## Service Settings

| Setting | Recommended value |
| --- | --- |
| Service type | `Web Service` |
| Repository | `shivaydwivedi/PagePulse` |
| Branch | `main` |
| Region | Choose during dashboard setup |
| Runtime | `Node` |
| Root directory | Blank, repository root |
| Build command | `npm ci` |
| Start command | `npm start` |
| Instance type | `Free` |
| Health check path | `/healthz` |
| Auto-deploy | Enabled from `main` |
| Public HTTPS | Provided by Render |

## Port Behaviour

Render supplies `PORT` automatically. Do not manually set `PORT` in the Render dashboard unless live evidence shows a need. PagePulse already reads `process.env.PORT` through the environment schema, and `server.listen(env.PORT)` binds correctly for Render without hardcoding a fixed port.

A local Windows reservation for port `8080` is irrelevant to Render because Render injects its own port into the service environment.

## Runtime Variables

Only set variables supported by [production-environment.md](production-environment.md).

| Name | Recommended value | Reason |
| --- | --- | --- |
| `NODE_ENV` | `production` | Runs production mode without watch features |
| `LOG_LEVEL` | `info` | Keeps structured logs useful without debug noise |
| `AUDIT_CACHE_MAX_ENTRIES` | `100` | Lower cache memory footprint for free compute |
| `AUDIT_MAX_QUEUE_SIZE` | `10` | Bounds queued request memory and waiters |
| `AUDIT_RATE_LIMIT_MAX_CLIENTS` | `1000` | Bounds process-local client buckets |

Leave `TRUST_PROXY` unset until live verification. Status: Requires live verification.

Keep these at schema defaults unless live Render evidence shows a need to change them:

- `AUDIT_MAX_CONCURRENT=5`
- `AUDIT_TIMEOUT_MS=8000`
- `AUDIT_QUEUE_TIMEOUT_MS=2000`
- `AUDIT_RATE_LIMIT_MAX_REQUESTS=30`
- `AUDIT_RATE_LIMIT_WINDOW_MS=60000`
- `AUDIT_MAX_RESPONSE_BYTES=1048576`

## Health Check

Set the Render health check path to `/healthz`. No port field is needed in the Render health-check configuration; Render routes the check to the service.

The endpoint returns `200` JSON, is lightweight, does not consume audit quota, and does not perform DNS, outbound fetches, cache access, or semaphore acquisition.

## Explicit Non-Requirements

- No database.
- No persistent disk.
- No Redis.
- No Cloudinary.
- No background worker.
- No cron job.
- No Dockerfile.
- No secret files.
- No custom domain in this phase.
