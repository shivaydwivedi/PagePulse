# Post-Deployment Verification

Status: Implemented

Live URL: https://pagepulse-3gub.onrender.com

This checklist records evidence-backed checks for the current Render deployment and should be repeated after deploys, rollbacks, or environment changes.

## Functional Checks

- PASS: Generated Render HTTPS URL opens the root UI.
- PASS: `GET /` returns `200` and HTML.
- PASS: Static CSS and JavaScript assets return `200`.
- PASS: `GET /healthz` returns `200` JSON with `success: true`.
- PASS: `POST /api/v1/audits` audits `https://example.com`.
- PASS: `POST /api/v1/audits` audits `https://www.wikipedia.org`.
- PASS: `POST /api/v1/audits` audits `https://www.youtube.com`.
- PASS: Repeated safe audit can return a cache hit.
- PASS: Structured request IDs are returned.
- PASS: Rate-limit headers appear on audit attempts.
- PASS: Nested audit detail rendering works after the production UI validator hotfix.
- PASS: Nullable page metadata rendering works after the production UI validator hotfix.
- PASS: Private target `http://127.0.0.1` returns HTTP `400` with `BLOCKED_TARGET`.
- PASS: Structured error rendering works.
- PASS: Render-managed `PORT` observed as `10000`.
- PASS: Render-managed HTTPS verified.
- PASS: Footer shows `Built for Digital Heroes Training Task`.
- PASS: `/favicon.ico` 404 is fixed in Phase 12 by serving the local SVG favicon.

## Security And Reliability Checks

- PASS: First-party responses include CSP, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, and frame protection.
- PASS: HSTS is enabled only in production as `Strict-Transport-Security: max-age=2592000`.
- PASS: No public response is expected to expose secrets, stack traces, local paths, provider tokens, or card information.
- PASS: Structured logs include request IDs and do not log request bodies or response bodies.
- PASS: Restart clears only process-local cache, limiter, semaphore, and queue state.

## TRUST_PROXY

Status: unresolved by design.

`TRUST_PROXY` remains unset. Current rate limiting uses the direct Render proxy-facing address behaviour. Proxy-aware per-end-user client identity requires separately verified deployment topology and spoofing checks. No public diagnostics endpoint or permanent forwarding-header logging has been added.

## Performance Checks

- Local Lighthouse lab measurements are documented in [../performance/lighthouse-report.md](../performance/lighthouse-report.md).
- Production field performance is not measured.
- Render Free cold-start delay remains a known limitation.

## Deployment History

- Phase 11B: Render deployment readiness migration completed.
- Production hotfix: frontend success-response validator updated to accept nested security-header details and nullable page metadata.
- Phase 12: final documentation polish, production-only HSTS, and favicon support.

## Rollback Confirmation

After any rollback, repeat root UI, static asset, favicon, health, audit, blocked target, request ID, rate-limit, log, HSTS, and secret-leakage checks.
