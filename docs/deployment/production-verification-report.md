# Production Verification Report

Status: Implemented

Provider: Render

Live URL: https://pagepulse-3gub.onrender.com

## Deployment

| Item | Result |
| --- | --- |
| Deployment provider | Render |
| Service type | Web Service |
| Repository | `shivaydwivedi/PagePulse` |
| Branch | `main` |
| Runtime | Node |
| Build command | `npm ci` |
| Start command | `npm start` |
| Root directory | Repository root |
| Instance type | Free |
| Auto-deploy | Enabled |
| HTTPS | Render-managed |
| `PORT` | Render-managed; observed as `10000` |
| Database | None |
| Persistent disk | None |
| Worker or cron | None |

## Verification Results

| Check | Result | Notes |
| --- | --- | --- |
| Homepage load | PASS | Root UI loaded over Render HTTPS |
| Static CSS and JavaScript assets | PASS | Local UI assets loaded from same origin |
| `GET /healthz` | PASS | Returned JSON health envelope |
| `POST /api/v1/audits` for `https://example.com` | PASS | Successful audit response |
| `POST /api/v1/audits` for `https://www.wikipedia.org` | PASS | Successful audit response |
| `POST /api/v1/audits` for `https://www.youtube.com` | PASS | Successful audit response |
| Repeated cached audit | PASS | `X-Cache: HIT` observed |
| Request ID | PASS | Structured request ID observed |
| Rate-limit headers | PASS | Rate-limit response headers observed |
| Nested audit detail rendering | PASS | Production UI validator hotfix completed |
| Nullable metadata rendering | PASS | `metaDescription: null` and `canonicalUrl: null` render safely |
| Structured error rendering | PASS | Error envelope displayed by UI |
| Private target rejection | PASS | `http://127.0.0.1` returned HTTP `400` and `BLOCKED_TARGET` |
| Favicon | PASS | `/favicon.ico` 404 fixed in Phase 12 |

## Final Security Decisions

### TRUST_PROXY

Final status: left unset.

There is insufficient evidence to configure a specific trusted proxy hop count safely. Current rate limiting uses the direct Render proxy-facing address behaviour. Proxy-aware per-end-user client identity requires separately verified deployment topology and spoofing checks.

### HSTS

Final status: enabled in production only.

Production responses set:

```text
Strict-Transport-Security: max-age=2592000
```

The policy does not include `includeSubDomains` or `preload`.

## Limitations

- Render Free cold starts remain possible after inactivity.
- Production field performance is not measured.
- Cache, rate limiting, semaphore, and queue state are process-local.
- This report does not include private dashboard identifiers, service IDs, billing data, provider credentials, or sensitive logs.
