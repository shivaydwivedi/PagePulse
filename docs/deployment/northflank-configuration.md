# Northflank Configuration

Status: Prepared, not live

Use these settings for the intended single-instance Developer Sandbox deployment. Do not enter card details, provider secrets, or live URLs in repository files.

## Service Settings

| Setting | Recommended value |
| --- | --- |
| Repository | `shivaydwivedi/PagePulse` |
| Branch | `main` |
| Build type | `Buildpack` |
| Build context | `/` |
| CI | Enabled |
| Compute | `nf-compute-10` |
| Instances | `1` |
| Port | `8080` |
| Protocol | `HTTP` |
| Public exposure | Enabled |
| Port name | `site` |
| Start command | Buildpack default or `npm start` |
| Readiness path | `/healthz` |
| Liveness path | `/healthz` |

## Runtime Variables

Only set variables supported by [production-environment.md](production-environment.md).

| Name | Recommended value | Reason |
| --- | --- | --- |
| `PORT` | `8080` | Matches the public service port |
| `NODE_ENV` | `production` | Runs production mode without watch features |
| `LOG_LEVEL` | `info` | Keeps structured logs useful without debug noise |
| `AUDIT_CACHE_MAX_ENTRIES` | `100` | Lower cache memory footprint for free compute |
| `AUDIT_MAX_QUEUE_SIZE` | `10` | Bounds queued request memory and waiters |
| `AUDIT_RATE_LIMIT_MAX_CLIENTS` | `1000` | Bounds process-local client buckets |

`TRUST_PROXY` status: Requires live verification. Do not finalise this value until the deployed service proves how Northflank forwards client identity to Express.

## Health Checks

Readiness:

| Setting | Value |
| --- | --- |
| Type | `HTTP` |
| Path | `/healthz` |
| Port | `8080` |
| Initial delay | `10s` |
| Interval | `60s` |
| Timeout | `3s` |
| Max failures | `3` |
| Success threshold | `1` |

Liveness:

| Setting | Value |
| --- | --- |
| Type | `HTTP` |
| Path | `/healthz` |
| Port | `8080` |
| Initial delay | `20s` |
| Interval | `60s` |
| Timeout | `3s` |
| Max failures | `3` |

The endpoint is in-process, JSON-only, and does not perform DNS, outbound fetches, cache access, semaphore acquisition, or audit rate-limit work. The short timeout is appropriate because a healthy local Express route should respond quickly; the 60-second interval avoids noisy probes for a training service.

## Explicit Non-Requirements

- No database.
- No volume.
- No Redis.
- No Cloudinary.
- No background worker.
- No Dockerfile.
- No custom domain.
- No repository-stored payment or card information.

Payment method requirements, if any, are account-level Northflank verification and are not repository configuration.
