# Post-Deployment Verification

Status: Pending live deployment

Run this checklist only after Northflank has created the generated HTTPS URL. Do not invent a URL before the service exists.

## Functional Checks

- Generated HTTPS URL opens the root UI.
- `GET /` returns `200` and HTML.
- `GET /styles.css`, `GET /app.js`, `GET /ui-core.js`, and `GET /assets/pagepulse-mark.svg` return `200`.
- `GET /healthz` returns `200` JSON with `success: true`.
- Unknown `/api/...` route returns JSON `404`.
- Unknown non-API path preserves the intended JSON `404` behaviour.
- `POST /api/v1/audits` handles a safe public audit target.
- Blocked target returns the expected blocked-target error without transport.
- Validation error returns a sanitized JSON error envelope.
- `X-Request-ID` propagates when valid and is generated when absent.
- Rate-limit headers appear on audit attempts.
- Footer shows `Built for Digital Heroes Training Task`.

## Proxy And IP Verification

Status: Requires live verification

Compare temporary diagnostic evidence for:

- `req.socket.remoteAddress`
- `req.ip`
- `req.ips`
- Northflank-provided forwarding headers

Do not add a public debugging endpoint. Do not log raw forwarding headers permanently. Any temporary diagnostic logging must be separately authorised, safely redacted, and removed afterward.

## Security And Reliability Checks

- Confirm response headers include `Content-Security-Policy`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, and framing protection.
- Confirm no public response exposes secrets, stack traces, local paths, provider tokens, or card information.
- Confirm structured logs include request IDs and do not include request bodies or response bodies.
- Confirm restart clears only process-local state and the service becomes healthy again.

## Performance Checks

- Run production Lighthouse against the generated HTTPS URL.
- Record mobile run count, median results, Lighthouse version, Chrome version, and measurement conditions.
- Treat results as lab data unless field-data tooling is added later.

## Rollback Confirmation

After any rollback, repeat the root UI, static asset, health, audit, blocked target, request ID, log, and secret-leakage checks.
