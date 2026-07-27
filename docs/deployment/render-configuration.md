# Render Configuration

Status: Implemented

Provider: Render

Live URL: https://pagepulse-3gub.onrender.com

PagePulse uses one Render Free Web Service. Do not commit provider secrets, dashboard identifiers, billing information, private logs, or `.env` files.

## Service Settings

| Setting | Value |
| --- | --- |
| Service type | `Web Service` |
| Repository | `shivaydwivedi/PagePulse` |
| Branch | `main` |
| Runtime | `Node` |
| Root directory | Repository root |
| Build command | `npm ci` |
| Start command | `npm start` |
| Instance type | `Free` |
| Health check path | `/healthz` |
| Auto-deploy | Enabled from `main` |
| Public HTTPS | Render-managed |
| Application port | Render-managed `PORT`, observed as `10000` |

## Runtime Variables

Only set variables supported by [production-environment.md](production-environment.md).

| Name | Recommended value | Reason |
| --- | --- | --- |
| `NODE_ENV` | `production` | Enables production runtime behaviour, including HSTS |
| `LOG_LEVEL` | `info` | Keeps structured logs useful without debug noise |
| `AUDIT_CACHE_MAX_ENTRIES` | `100` | Lower cache memory footprint for free compute |
| `AUDIT_MAX_QUEUE_SIZE` | `10` | Bounds queued request memory and waiters |
| `AUDIT_RATE_LIMIT_MAX_CLIENTS` | `1000` | Bounds process-local client buckets |

Leave `PORT` unset so Render can inject it. Leave `TRUST_PROXY` unset because a specific safe proxy hop count has not been proven.

Keep these schema defaults unless future evidence shows a need to change them:

- `AUDIT_MAX_CONCURRENT=5`
- `AUDIT_TIMEOUT_MS=8000`
- `AUDIT_QUEUE_TIMEOUT_MS=2000`
- `AUDIT_RATE_LIMIT_MAX_REQUESTS=30`
- `AUDIT_RATE_LIMIT_WINDOW_MS=60000`
- `AUDIT_MAX_RESPONSE_BYTES=1048576`

## Health Check

Render health checks call `/healthz`. The endpoint returns `200` JSON, is lightweight, does not consume audit quota, and does not perform DNS, outbound fetches, cache access, or semaphore acquisition.

## Explicit Non-Requirements

- No database.
- No persistent disk.
- No Redis.
- No Cloudinary.
- No background worker.
- No cron job.
- No Dockerfile.
- No secret files.
- No custom domain.
