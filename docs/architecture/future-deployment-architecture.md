# Future Deployment Architecture

Status: Implemented

This document records the current Render deployment shape for PagePulse and the limits that would need new infrastructure in a future deployment.

Live URL: https://pagepulse-3gub.onrender.com

Back to the [architecture index](README.md). Diagram source: [deployment-flow.mmd](../diagrams/deployment-flow.mmd).

## Current Deployment Shape

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
- Render supplies `PORT` automatically; live service observed `PORT=10000`.
- Render-managed HTTPS.
- Same-origin UI/API from the existing Express app.
- Health check path: `GET /healthz`.
- Automatic deploys from `main`.
- No database, persistent disk, background worker, cron job, Redis, Cloudinary, or persistent storage.

## Production Concerns

The current cache, semaphore, queue, and rate limiter are process-local. A single-instance deployment can use them directly. Restart clears local state. A horizontally scaled deployment would need shared cache and distributed rate limiting if consistent cross-instance behaviour is required, so autoscaling remains out of scope for the training deployment.

Deployment should preserve outbound SSRF safety with platform-level network controls where available. Runtime variables are configured through Render rather than committed `.env` files.

Render Free services may spin down after inactivity. The first request after inactivity can be delayed by a cold start, the filesystem is ephemeral, free compute and memory are limited, and this project makes no uptime or SLA claim.

`TRUST_PROXY` status: left unset. There is insufficient evidence to configure a specific trusted proxy hop count safely. Current rate limiting uses the direct Render proxy-facing address behaviour. Proxy-aware per-end-user client identity requires separately verified deployment topology and spoofing checks.

`Strict-Transport-Security` status: enabled in production only with `max-age=2592000`, without `includeSubDomains` or `preload`.

## Documentation

- [Deployment guide](../deployment/README.md)
- [Render configuration](../deployment/render-configuration.md)
- [Production environment](../deployment/production-environment.md)
- [Production verification report](../deployment/production-verification-report.md)
- [Operations and rollback](../deployment/operations-and-rollback.md)
- [Post-deployment verification](../deployment/post-deployment-verification.md)
