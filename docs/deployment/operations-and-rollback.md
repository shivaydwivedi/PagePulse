# Operations And Rollback

Status: Implemented

Live URL: https://pagepulse-3gub.onrender.com

## Deployment Lifecycle

The Render Web Service builds from `shivaydwivedi/PagePulse` on branch `main`, using repository root, `npm ci`, and `npm start`. Automatic deployment from `main` is enabled. The repository does not contain deployment credentials and does not define a deployment workflow.

## Logs

PagePulse writes structured JSON logs through Pino. Request logs include method, URL, status code, and request ID. Request bodies, response bodies, and full headers are not logged by the application logger.

Use Render runtime logs to inspect startup, request completion, shutdown, and unexpected application errors. Do not add permanent raw forwarding-header logging for proxy checks.

## Restart Behaviour

Render restarts, manual redeploys, and automatic deploys may stop the running process. The server logs shutdown, closes the HTTP server, allows active requests to finish while the server is closing, and has a 10-second forced-exit timeout. `SIGINT` follows the same path. Repeated shutdown signals are ignored after shutdown begins.

Restart clears process-local cache, rate-limit buckets, active semaphore state, and queued requests. This is expected for the single-instance training deployment. Render Free services may spin down after inactivity, so recruiter or demo users may see a delayed first response after a cold start.

## Rollback Options

Render rollback:

1. Open the service deploys in Render.
2. Select the last known good deploy if Render offers rollback for the service state.
3. Use Render rollback, manual deploy, or redeploy controls.
4. Re-run [post-deployment-verification.md](post-deployment-verification.md).

Git revert rollback:

1. Revert the faulty commit on `main`.
2. Push the revert through the normal review process.
3. Let Render rebuild from `main` through auto-deploy.
4. Re-run [post-deployment-verification.md](post-deployment-verification.md).

Environment-variable rollback:

1. Revert the changed variable in the Render dashboard.
2. Redeploy or restart the service if Render does not apply the value immediately.
3. Re-run [post-deployment-verification.md](post-deployment-verification.md).

During an incident, temporarily disable automatic deploys if new pushes could make diagnosis or rollback harder.

## Incident Checklist

- Confirm `/healthz` response and status code.
- Check startup and error logs for request IDs and stack traces.
- Confirm no secrets or local paths appear in public responses.
- Check whether failures started after a deployment, restart, or environment change.
- If audit requests fail, compare validation failures, destination safety failures, timeouts, capacity/rate-limit errors, and frontend response validation.
- Account for free-tier cold starts before treating a delayed first response as an application regression.
- No database restore is needed because PagePulse has no database, persistent disk, Redis, or Cloudinary integration.
- Roll back if the deployed version cannot safely serve the UI and API.
