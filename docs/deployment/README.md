# Deployment

Status: Implemented

Provider: Render

Live URL: https://pagepulse-3gub.onrender.com

PagePulse is deployed as a single Render Free Web Service. The service serves the static public UI and JSON API from the same Express process.

## Service Model

- One Render Web Service built from `shivaydwivedi/PagePulse`.
- Branch: `main`.
- Runtime: Node.
- Root directory: repository root.
- Build command: `npm ci`.
- Start command: `npm start`.
- Instance type: Free.
- Auto-deploy: enabled from `main`.
- Render supplies `PORT`; the live service observed `PORT=10000`.
- Render-managed HTTPS.
- Health check path: `GET /healthz`.
- No database.
- No persistent disk.
- No Redis.
- No Cloudinary.
- No background worker.
- No cron job.
- Same-origin UI and API.

Render Free services may spin down after inactivity, so the first request after a cold start can be delayed. No uptime or SLA claim is made.

## Documents

| Document | Purpose |
| --- | --- |
| [render-configuration.md](render-configuration.md) | Final Render Web Service configuration |
| [production-environment.md](production-environment.md) | Supported environment variables and Render recommendations |
| [production-verification-report.md](production-verification-report.md) | Evidence-backed live production verification |
| [post-deployment-verification.md](post-deployment-verification.md) | Repeatable checklist for future deploys and rollbacks |
| [operations-and-rollback.md](operations-and-rollback.md) | Operations, restart, rollback, and incident notes |

Architecture context: [future-deployment-architecture.md](../architecture/future-deployment-architecture.md).
