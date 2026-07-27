# Architecture Decisions

Status: Implemented

This index records concise ADR-style decisions already reflected in the current codebase.

Back to the [architecture index](README.md).

## ADR-001 JavaScript ESM And Node 22

- Decision: Use JavaScript ES modules on Node.js 22.
- Context: The project needs a modern backend foundation without TypeScript build complexity.
- Choice: Native ESM with `type: module`.
- Reason: Keeps runtime and tests simple while using current Node platform features.
- Consequences: Runtime requires Node `>=22 <25`.
- Future reconsideration trigger: A larger codebase needs stronger static typing.

## ADR-002 Express REST API

- Decision: Use Express for the REST API.
- Context: The qualification task needs clear HTTP endpoints and middleware.
- Choice: Express app, routers, and central error middleware.
- Reason: Mature ecosystem and straightforward request lifecycle.
- Consequences: API behaviour is middleware-order sensitive.
- Future reconsideration trigger: Requirements need a different protocol or framework.

## ADR-003 No Database

- Decision: Do not use a database in the current backend.
- Context: Current audit results are computed on demand and cached in memory.
- Choice: In-memory state only.
- Reason: Keeps the implementation focused and deterministic.
- Consequences: No persisted audit history.
- Future reconsideration trigger: User accounts, saved reports, or distributed state are required.

## ADR-004 Custom Email-Free Public Audit Endpoint

- Decision: Expose a public audit endpoint without accounts or email collection.
- Context: Current API only audits submitted URLs.
- Choice: `POST /api/v1/audits`.
- Reason: Minimises data collection and authentication scope.
- Consequences: Abuse protection relies on IP-based controls and concurrency bounds.
- Future reconsideration trigger: Authenticated quotas or saved reports are required.

## ADR-005 Custom SSRF Controls

- Decision: Implement explicit URL, DNS, and IP safety checks.
- Context: The API fetches user-supplied URLs.
- Choice: Reject unsafe schemes, credentials, and private or special destinations.
- Reason: SSRF safety is core to the product.
- Consequences: Some legitimate private targets are intentionally blocked.
- Future reconsideration trigger: Deployment adds network egress controls or private-audit modes.

## ADR-006 Undici Approved-Address Transport

- Decision: Use Undici with approved-address dispatch.
- Context: DNS validation must remain connected to the actual outbound request.
- Choice: Dispatcher pins connections to approved addresses.
- Reason: Reduces time-of-check to time-of-use drift.
- Consequences: Transport code is more explicit than default fetch.
- Future reconsideration trigger: A maintained library offers equivalent SSRF-aware transport.

## ADR-007 Cheerio Instead Of Headless Browser

- Decision: Parse HTML with Cheerio.
- Context: Current scoring needs static markup signals, not rendered browser metrics.
- Choice: No browser automation in backend audit execution.
- Reason: Lower resource use, deterministic output, no script execution.
- Consequences: LCP, INP, CLS, and rendered layout are not measured.
- Future reconsideration trigger: Product requires browser-rendered performance data.

## ADR-008 Deterministic Project-Specific Scoring

- Decision: Use scoring policy version `1.0`.
- Context: Results should be explainable and stable.
- Choice: Ten weighted checks with pass, warning, fail, and not-applicable handling.
- Reason: Makes audit output transparent and testable.
- Consequences: Score is not Lighthouse or a universal SEO score.
- Future reconsideration trigger: New scoring model or external benchmark is required.

## ADR-009 In-Memory TTL Cache

- Decision: Cache completed public-safe audit payloads in memory.
- Context: Repeat audits can reuse deterministic output for a short period.
- Choice: Bounded TTL cache with LRU eviction.
- Reason: Avoids repeated transport work without persistence.
- Consequences: Cache resets on restart and is per-process.
- Future reconsideration trigger: Multi-instance deployment requires shared cache.

## ADR-010 Custom Semaphore

- Decision: Use a custom bounded semaphore for cache-miss audits.
- Context: Outbound audits are the expensive path.
- Choice: Limit active audits and bound the waiting queue.
- Reason: Protects local resources and provides predictable capacity errors.
- Consequences: Capacity is per-process.
- Future reconsideration trigger: Distributed queueing or worker architecture is introduced.

## ADR-011 Fixed-Window IP Rate Limiting

- Decision: Use per-client fixed-window rate limiting for audit attempts.
- Context: The public audit endpoint needs basic abuse resistance.
- Choice: IP bucket from Express `req.ip`.
- Reason: Simple, deterministic, and dependency-free.
- Consequences: Proxy trust must be configured correctly and limits are per-process.
- Future reconsideration trigger: Authenticated users or distributed quotas are introduced.

## ADR-012 Per-Process State

- Decision: Keep cache, semaphore, and limiter state in process memory.
- Context: Current phase has no deployment topology or shared infrastructure.
- Choice: No Redis, database, or queue service.
- Reason: Avoids premature infrastructure decisions.
- Consequences: Horizontal scaling requires future architecture work.
- Future reconsideration trigger: Production deployment scales beyond one process.

## ADR-013 Request IDs And Structured Logging

- Decision: Propagate request IDs and use structured Pino logs.
- Context: Errors and audit attempts need traceability.
- Choice: Request-scoped logger and response envelopes include request IDs.
- Reason: Useful for debugging without exposing internal details publicly.
- Consequences: Log consumers need structured-log support.
- Future reconsideration trigger: Hosted logging provider imposes a different format.

## ADR-014 No External CI Or Coverage Service

- Decision: Use GitHub Actions only for CI in Phase 9.
- Context: No external tokens should be required.
- Choice: Local coverage output and repository checks.
- Reason: Reduces setup risk and keeps permissions read-only.
- Consequences: No hosted coverage badge or trend history yet.
- Future reconsideration trigger: Maintainers choose a coverage reporting service.

## ADR-015 Documentation Diagrams Stored As Mermaid Source

- Decision: Store diagrams as Mermaid source files.
- Context: Architecture diagrams should be reviewable and reusable.
- Choice: `.mmd` files under `docs/diagrams`.
- Reason: Text diffs are simple and no binary assets are needed.
- Consequences: Rendered images are not committed.
- Future reconsideration trigger: A publishing pipeline needs generated artifacts.

## ADR-016 Plain HTML CSS And JavaScript For Public UI

- Decision: Build the Phase 10 public demo UI with plain HTML, CSS, and browser JavaScript.
- Context: The project needs a lightweight recruiter-facing interface without changing backend behaviour or adding frontend tooling.
- Choice: Serve static files from the existing Express app and call the audit API through same-origin `fetch`.
- Reason: Keeps the page small, LCP-conscious, easy to review, and free of framework or build dependencies.
- Consequences: UI state and rendering helpers are maintained manually.
- Future reconsideration trigger: The frontend grows into a multi-page application or needs a build pipeline.

## ADR-017 Performance-First Static UI And Lab Measurement Policy

- Decision: Keep the public UI dependency-free and document repeated Lighthouse lab measurements.
- Context: The public interface needs to be fast, reviewable, and honest about what has been measured.
- Choice: Use system fonts, local static assets, initial-content HTML, no external runtime assets, and median results from repeated local Lighthouse runs.
- Reason: Median lab results are more useful than a single best run, while avoiding field-data or production claims before deployment exists.
- Consequences: Local results must be remeasured after hosting, TLS, CDN, and production caching decisions exist.
- Future reconsideration trigger: Deployment or product requirements introduce a build pipeline, CDN policy, or real-user monitoring.

## ADR-018 Northflank Single-Service Deployment

- Decision: Prepare PagePulse for one Northflank Developer Sandbox service.
- Context: The qualification project needs a simple production-like deployment path without adding infrastructure that the current product does not use.
- Choice: Buildpack from repository root, `npm start`, one Node.js instance, public HTTP port `8080`, Northflank-managed HTTPS, and same-origin UI/API.
- Reason: The existing Express app already serves both UI and API, has `GET /healthz`, uses process-local state intentionally, and does not need a database, volume, worker, or external runtime assets.
- Consequences: Cache, queue, semaphore, and rate-limit buckets reset on restart and are not shared across instances. Autoscaling is intentionally disabled for this training deployment.
- Live verification requirement: `TRUST_PROXY` must remain pending until Northflank forwarding behaviour is observed in the deployed service.
- Rollback policy: Prefer Northflank rollback to a known good deployment or a reviewed Git revert on `main`, followed by the post-deployment verification checklist.
- Future reconsideration trigger: Requirements need multiple instances, persisted reports, authenticated quotas, shared rate limiting, or managed deployment automation.
