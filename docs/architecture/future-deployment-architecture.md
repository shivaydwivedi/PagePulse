# Future Deployment Architecture

Status: Prepared

This document records the prepared Render deployment shape for PagePulse. The service is not live, no generated HTTPS URL exists yet, and production verification is pending.

Back to the [architecture index](README.md). Diagram source: [deployment-flow.mmd](../diagrams/deployment-flow.mmd).

## Prepared Deployment Shape

- Provider: Render.
- Service type: Web Service.
- Repository: `shivaydwivedi/PagePulse`.
- Branch: `main`.
- Runtime: Node.
- Root directory: repository root.
- Build command: `npm ci`.
- Start command: `npm start`.
- Runtime: Node.js 22 application.
- Instances: one.
- Instance type: Free.
- Render supplies `PORT` automatically; no fixed port is hardcoded.
- Render-managed HTTPS.
- same-origin UI/API from the existing Express app.
- Health check path: `GET /healthz`.
- Automatic deploys from `main`.
- No database, persistent disk, background worker, cron job, Redis, Cloudinary, or persistent storage.

## Production Concerns

The current cache, semaphore, queue, and rate limiter are process-local. A single-instance deployment can use them directly. Restart clears local state. A horizontally scaled deployment would need shared cache and distributed rate limiting if consistent cross-instance behaviour is required, so autoscaling is intentionally out of scope for the training deployment.

Deployment must preserve outbound SSRF safety with platform-level network controls where available. It must configure environment variables directly through Render rather than committing `.env` files.

Render Free services may spin down after inactivity. The first request after inactivity can be delayed by a cold start, the filesystem is ephemeral, free compute and memory are limited, and this readiness work makes no uptime or SLA claim.

`TRUST_PROXY` status: Requires live verification. The final value depends on how Render forwards client IP data to Express. Setting it too broadly can let spoofed forwarding headers affect rate-limit identity; leaving it disabled behind a proxy can make rate limiting use the proxy address instead of the client address.

## Documentation

- [Deployment readiness](../deployment/README.md)
- [Render configuration](../deployment/render-configuration.md)
- [Production environment](../deployment/production-environment.md)
- [Operations and rollback](../deployment/operations-and-rollback.md)
- [Post-deployment verification](../deployment/post-deployment-verification.md)
