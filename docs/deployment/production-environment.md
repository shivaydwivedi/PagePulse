# Production Environment

Status: Prepared, not live

PagePulse reads environment variables through [src/config/env.js](../../src/config/env.js). `npm start` does not automatically load `.env`; Render should provide runtime variables through its dashboard.

| Name | Purpose | Type | Default | Min | Max | Production recommendation | Required | Secret | Set on Render |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `NODE_ENV` | Runtime mode | enum: `development`, `test`, `production` | `development` | n/a | n/a | `production` | No | No | Yes |
| `PORT` | HTTP server port | integer | `3000` | `1` | `65535` | Render-managed; do not set manually unless proven necessary | No | No | No |
| `LOG_LEVEL` | Structured logger level | enum: `trace`, `debug`, `info`, `warn`, `error`, `fatal` | `info` | n/a | n/a | `info` | No | No | Optional |
| `REQUEST_BODY_LIMIT` | JSON request body limit | size string matching positive `b`, `kb`, or `mb` | `16kb` | positive bytes | positive MB value accepted by parser | keep `16kb` | No | No | No |
| `AUDIT_TIMEOUT_MS` | Total outbound audit timeout across safety validation, DNS wait, redirects, request, and body streaming | integer milliseconds | `8000` | `500` | `30000` | keep `8000` until live platform timeout is verified | No | No | No |
| `AUDIT_MAX_REDIRECTS` | Manual redirect limit | integer | `5` | `0` | `10` | keep `5` | No | No | No |
| `AUDIT_MAX_RESPONSE_BYTES` | Maximum retained upstream HTML bytes | integer bytes | `1048576` | `1024` | `5242880` | keep `1048576` | No | No | No |
| `AUDIT_USER_AGENT` | Outbound audit User-Agent | string without CR/LF, at least one non-whitespace char | `PagePulseBot/1.0` | 1 char | 120 chars | keep default unless a contact URL is added later | No | No | No |
| `AUDIT_CACHE_ENABLED` | Enable process-local audit cache | boolean: `true`, `false`, `1`, `0` | `true` | n/a | n/a | keep `true` | No | No | No |
| `AUDIT_CACHE_TTL_MS` | Cache entry lifetime | integer milliseconds | `300000` | `1000` | `3600000` | keep `300000` | No | No | No |
| `AUDIT_CACHE_MAX_ENTRIES` | Maximum cached audit payloads | integer | `500` | `1` | `5000` | `100` for 256 MB free compute | No | No | Yes |
| `AUDIT_MAX_CONCURRENT` | Active cache-miss audit permits | integer | `5` | `1` | `50` | keep `5` | No | No | No |
| `AUDIT_MAX_QUEUE_SIZE` | Waiting audit queue depth | integer | `50` | `0` | `500` | `10` for 256 MB free compute | No | No | Yes |
| `AUDIT_QUEUE_TIMEOUT_MS` | Maximum queue wait | integer milliseconds | `2000` | `100` | `30000` | keep `2000` | No | No | No |
| `AUDIT_RATE_LIMIT_ENABLED` | Enable audit endpoint rate limiting | boolean: `true`, `false`, `1`, `0` | `true` | n/a | n/a | keep `true` | No | No | No |
| `AUDIT_RATE_LIMIT_WINDOW_MS` | Fixed rate-limit window | integer milliseconds | `60000` | `1000` | `3600000` | keep `60000` | No | No | No |
| `AUDIT_RATE_LIMIT_MAX_REQUESTS` | Audit attempts per client per window | integer | `30` | `1` | `10000` | keep `30` | No | No | No |
| `AUDIT_RATE_LIMIT_MAX_CLIENTS` | Maximum process-local client buckets | integer | `10000` | `1` | `100000` | `1000` for 256 MB free compute | No | No | Yes |
| `TRUST_PROXY` | Express proxy trust for `req.ip` and `req.ips` | boolean or integer hop count | `false` | `0` when numeric | `10` when numeric | Requires live verification | No | No | Pending |

All variables are non-secret in the current schema. No database, object storage, Redis, Cloudinary, payment, or provider credential variables are supported.

## Validation Notes

Invalid values are rejected at process startup because `src/server.js` calls `parseEnv()` before listening. Whitespace-only values are rejected when the schema has explicit non-empty validation, such as `AUDIT_USER_AGENT` and `TRUST_PROXY`; enum and numeric fields also reject whitespace-only strings through Zod parsing.

`REQUEST_BODY_LIMIT` is constrained to positive `b`, `kb`, or `mb` strings and is used by Express JSON parsing for the audit route only.

## TRUST_PROXY

Status: Requires live verification

Accepted values are `false`, `true`, or integer hop counts from `0` through `10`. The default `false` makes Express use the socket address for `req.ip`, ignoring spoofable forwarding headers. Setting it too broadly can let a client influence rate-limit identity through forwarded headers. Leaving it disabled behind a proxy can collapse many users into the proxy address and make rate limiting less fair.

After Render deployment, compare `req.socket.remoteAddress`, `req.ip`, `req.ips`, `X-Forwarded-For` handling, whether distinct clients receive distinct rate-limit buckets, and whether spoofed forwarding input can influence identity. Do not add a public diagnostics endpoint and do not permanently log full forwarding headers.
