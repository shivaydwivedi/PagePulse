# Deployment Readiness

Status: Prepared, not live

Provider: Render

Live URL: pending

PagePulse is prepared for a single Render Free Web Service. No Render service has been created from this repository in this phase, no live URL exists yet, and no custom domain, database, Redis, Cloudinary, persistent disk, background worker, or billing information belongs in the repository.

## Service Model

- One Render Web Service built from the GitHub repository.
- Node runtime from repository root.
- Build command `npm ci`.
- Node.js application started with `npm start`.
- One instance serving the public UI and JSON API from the same Express process.
- Render supplies `PORT` automatically; no fixed port is hardcoded.
- Render-managed HTTPS.
- Health checks use `GET /healthz`.
- Cache, rate limiter, semaphore, and queue are process-local.

## Documents

| Document | Purpose |
| --- | --- |
| [render-configuration.md](render-configuration.md) | Dashboard settings for the intended Render Web Service |
| [production-environment.md](production-environment.md) | Exact supported environment variables and recommended Render values |
| [operations-and-rollback.md](operations-and-rollback.md) | Operations, restart, rollback, and incident notes |
| [post-deployment-verification.md](post-deployment-verification.md) | Checklist to run after Render creates a generated HTTPS URL |

Architecture context: [future-deployment-architecture.md](../architecture/future-deployment-architecture.md).
