# Deployment Readiness

Status: Prepared, not live

Provider: Northflank

PagePulse is prepared for a single Northflank Developer Sandbox service. No Northflank service has been created from this repository in this phase, no live URL exists yet, and no custom domain, database, volume, persistent storage, addon, or payment-card configuration belongs in the repository.

## Service Model

- One Northflank service built from the GitHub repository.
- Buildpack build from repository root.
- Node.js application started with `npm start`.
- One instance serving the public UI and JSON API from the same Express process.
- Public HTTP port `8080` behind Northflank-managed HTTPS.
- Readiness and liveness probes use `GET /healthz`.
- Cache, rate limiter, semaphore, and queue are process-local.

## Documents

| Document | Purpose |
| --- | --- |
| [northflank-configuration.md](northflank-configuration.md) | Dashboard settings for the intended Developer Sandbox service |
| [production-environment.md](production-environment.md) | Exact supported environment variables and recommended Northflank values |
| [operations-and-rollback.md](operations-and-rollback.md) | Operations, restart, rollback, and incident notes |
| [post-deployment-verification.md](post-deployment-verification.md) | Checklist to run after Northflank creates a generated HTTPS URL |

Architecture context: [future-deployment-architecture.md](../architecture/future-deployment-architecture.md).
