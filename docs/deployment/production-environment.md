# Production Environment

Status: Implemented

Provider: Render

Live URL: https://pagepulse-3gub.onrender.com

PagePulse reads environment variables through [src/config/env.js](../../src/config/env.js). `npm start` does not automatically load `.env`; Render provides runtime variables through its dashboard.

| Name | Purpose | Type | Default | Production recommendation | Required | Secret | Set on Render |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `NODE_ENV` | Runtime mode | enum: `development`, `test`, `production` | `development` | `production` | No | No | Yes |
| `PORT` | HTTP server port | integer `1` to `65535` | `3000` | Render-managed; observed as `10000`; do not set manually | No | No | No |
| `LOG_LEVEL` | Structured logger level | enum: `trace`, `debug`, `info`, `warn`, `error`, `fatal` | `info` | `info` | No | No | Optional |
| `REQUEST_BODY_LIMIT` | JSON request body limit | positive `b`, `kb`, or `mb` string | `16kb` | keep default | No | No | No |
| `AUDIT_TIMEOUT_MS` | Total outbound audit timeout | integer `500` to `30000` | `8000` | keep default | No | No | No |
| `AUDIT_MAX_REDIRECTS` | Manual redirect limit | integer `0` to `10` | `5` | keep default | No | No | No |
| `AUDIT_MAX_RESPONSE_BYTES` | Maximum retained upstream HTML bytes | integer `1024` to `5242880` | `1048576` | keep default | No | No | No |
| `AUDIT_USER_AGENT` | Outbound audit User-Agent | no CR/LF, non-whitespace, max 120 chars | `PagePulseBot/1.0` | keep default unless contact info is added | No | No | No |
| `AUDIT_CACHE_ENABLED` | Enable process-local audit cache | boolean: `true`, `false`, `1`, `0` | `true` | keep default | No | No | No |
| `AUDIT_CACHE_TTL_MS` | Cache entry lifetime | integer `1000` to `3600000` | `300000` | keep default | No | No | No |
| `AUDIT_CACHE_MAX_ENTRIES` | Maximum cached audit payloads | integer `1` to `5000` | `500` | `100` for free compute | No | No | Yes |
| `AUDIT_MAX_CONCURRENT` | Active cache-miss audit permits | integer `1` to `50` | `5` | keep default | No | No | No |
| `AUDIT_MAX_QUEUE_SIZE` | Waiting audit queue depth | integer `0` to `500` | `50` | `10` for free compute | No | No | Yes |
| `AUDIT_QUEUE_TIMEOUT_MS` | Maximum queue wait | integer `100` to `30000` | `2000` | keep default | No | No | No |
| `AUDIT_RATE_LIMIT_ENABLED` | Enable audit endpoint rate limiting | boolean: `true`, `false`, `1`, `0` | `true` | keep default | No | No | No |
| `AUDIT_RATE_LIMIT_WINDOW_MS` | Fixed rate-limit window | integer `1000` to `3600000` | `60000` | keep default | No | No | No |
| `AUDIT_RATE_LIMIT_MAX_REQUESTS` | Audit attempts per client per window | integer `1` to `10000` | `30` | keep default | No | No | No |
| `AUDIT_RATE_LIMIT_MAX_CLIENTS` | Maximum process-local client buckets | integer `1` to `100000` | `10000` | `1000` for free compute | No | No | Yes |
| `TRUST_PROXY` | Express proxy trust for `req.ip` and `req.ips` | `false`, `true`, or integer `0` to `10` | `false` | leave unset until topology is separately verified | No | No | No |

All variables are non-secret in the current schema. No database, object storage, Redis, Cloudinary, payment, or provider credential variables are supported.

## Validation Notes

Invalid values are rejected at process startup because [src/server.js](../../src/server.js) calls `parseEnv()` before listening. `REQUEST_BODY_LIMIT` is constrained to positive size strings. `AUDIT_USER_AGENT` rejects CR/LF and whitespace-only values. `TRUST_PROXY` rejects empty, whitespace-only, decimal, comma-separated, and arbitrary string values.

## TRUST_PROXY

Final status: left unset on Render.

There is insufficient evidence to configure a specific trusted proxy hop count safely. Current rate limiting uses the direct Render proxy-facing address behaviour. Proxy-aware per-end-user client identity requires separately verified topology evidence for `req.socket.remoteAddress`, `req.ip`, `req.ips`, forwarded headers, distinct client buckets, and spoofed forwarding input.

Do not add a public diagnostics endpoint and do not permanently log raw forwarding headers.

## HSTS

Final status: enabled only when `NODE_ENV=production`.

Production responses set:

```text
Strict-Transport-Security: max-age=2592000
```

The policy uses a conservative 30-day max age. It does not include `preload` or `includeSubDomains`. Local development and tests using non-production config do not receive the HSTS header.
