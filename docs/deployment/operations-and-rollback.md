# Operations And Rollback

Status: Prepared, not live

## Deployment Lifecycle

The intended Northflank service builds from `shivaydwivedi/PagePulse` on branch `main` using Buildpack from `/`. Automatic deployment may run after pushes if enabled in the Northflank dashboard. This repository does not contain deployment credentials and does not define a Northflank deployment workflow.

## Logs

PagePulse writes structured JSON logs through Pino. Request logs include method, URL, status code, and request ID. Request bodies, response bodies, and full headers are not logged by the application logger.

Use Northflank logs to inspect startup, request completion, shutdown, and unexpected application errors. Do not add permanent raw forwarding-header logging for proxy checks.

## Restart Behaviour

Northflank restarts or deploys may send `SIGTERM`. The server logs shutdown, closes the HTTP server, allows active requests to finish while the server is closing, and has a 10-second forced-exit timeout. `SIGINT` follows the same path. Repeated shutdown signals are ignored after shutdown begins.

Restart clears process-local cache, rate-limit buckets, active semaphore state, and queued requests. This is expected for the single-instance training deployment.

## Rollback Options

Northflank rollback:

1. Open the service deployments in Northflank.
2. Select the last known good deployment.
3. Use Northflank rollback or redeploy controls.
4. Re-run [post-deployment-verification.md](post-deployment-verification.md).

Git revert rollback:

1. Revert the faulty commit on `main`.
2. Push the revert through the normal review process.
3. Let Northflank rebuild from `main` if automatic deployments are enabled.
4. Re-run [post-deployment-verification.md](post-deployment-verification.md).

## Incident Checklist

- Confirm `/healthz` response and status code.
- Check startup and error logs for request IDs and stack traces.
- Confirm no secrets or local paths appear in public responses.
- Check whether failures started after a deployment, restart, or environment change.
- If audit requests fail, compare validation failures, destination safety failures, timeouts, and capacity/rate-limit errors.
- Roll back if the deployed version cannot safely serve the UI and API.
