# Future Deployment Architecture

Status: Prepared

This document records the prepared Northflank deployment shape for PagePulse. The service is not live, no generated HTTPS URL exists yet, and production verification is pending.

Back to the [architecture index](README.md). Diagram source: [deployment-flow.mmd](../diagrams/deployment-flow.mmd).

## Prepared Deployment Shape

- Provider: Northflank.
- Repository: `shivaydwivedi/PagePulse`.
- Branch: `main`.
- Build type: Buildpack.
- Build context: `/`.
- Runtime: Node.js 22 application.
- Start command: Buildpack default or `npm start`.
- Instances: one.
- Public port: HTTP `8080` behind Northflank-managed HTTPS.
- same-origin UI/API from the existing Express app.
- Readiness and liveness: `GET /healthz`.
- No database, volume, background worker, Redis, Cloudinary, or persistent storage.

## Production Concerns

The current cache, semaphore, queue, and rate limiter are process-local. A single-instance deployment can use them directly. Restart clears local state. A horizontally scaled deployment would need shared cache and distributed rate limiting if consistent cross-instance behaviour is required, so autoscaling is intentionally out of scope for the training deployment.

Deployment must preserve outbound SSRF safety with platform-level network controls where available. It must configure environment variables directly through Northflank rather than committing `.env` files.

`TRUST_PROXY` status: Requires live verification. The final value depends on how Northflank forwards client IP data to Express. Setting it too broadly can let spoofed forwarding headers affect rate-limit identity; leaving it disabled behind a proxy can make rate limiting use the proxy address instead of the client address.

## Documentation

- [Deployment readiness](../deployment/README.md)
- [Northflank configuration](../deployment/northflank-configuration.md)
- [Production environment](../deployment/production-environment.md)
- [Operations and rollback](../deployment/operations-and-rollback.md)
- [Post-deployment verification](../deployment/post-deployment-verification.md)
