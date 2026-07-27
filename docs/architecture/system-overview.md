# System Overview

Status: Implemented

PagePulse is a Node.js 22 Express application that serves a lightweight public demo UI and a JSON audit API. The UI submits same-origin audit requests from the browser. The API safely fetches one HTML page, analyses bounded page signals, scores the result, and returns a sanitized JSON envelope. The current system has no database and keeps cache, concurrency, queue, and rate-limit state in process memory.

Back to the [architecture index](README.md). Diagram source: [system-context.mmd](../diagrams/system-context.mmd).

```mermaid
flowchart TD
  Browser[Browser UI] --> ExpressAPI[PagePulse Express App]
  APIClient[API Client] --> ExpressAPI
  ExpressAPI --> StaticUI[Static public files]
  ExpressAPI --> RequestID[Request ID]
  ExpressAPI --> RateLimiter[Rate Limiter]
  RateLimiter --> Cache[Cache]
  Cache --> Semaphore[Semaphore]
  Semaphore --> DestinationSafety[Destination Safety]
  DestinationSafety --> SafeTransport[Safe HTTP Transport]
  SafeTransport --> TargetWebsite[Target Website]
  SafeTransport --> HTMLAnalysis[HTML Analysis]
  HTMLAnalysis --> Scoring[Scoring]
  Scoring --> ExpressAPI
  ExpressAPI --> APIClient
```

## Components

| Component | Source | Responsibility |
| --- | --- | --- |
| Public UI | [public/index.html](../../public/index.html), [public/styles.css](../../public/styles.css), [public/app.js](../../public/app.js) | Provides the recruiter-facing audit form, theme controls, result rendering, and error states |
| Express app | [src/app.js](../../src/app.js) | Composes middleware, routers, and injectable services |
| Server entrypoint | [src/server.js](../../src/server.js) | Starts HTTP server and handles graceful shutdown |
| Request ID middleware | [src/middleware/request-id.middleware.js](../../src/middleware/request-id.middleware.js) | Accepts safe request IDs or generates new IDs |
| Structured logging | [src/infrastructure/logging/logger.js](../../src/infrastructure/logging/logger.js) | Creates Pino logger and request logging integration |
| Audit route | [src/routes/audit.routes.js](../../src/routes/audit.routes.js) | Applies audit-only rate limit, JSON parser, and content policy |
| Audit controller | [src/controllers/audit.controller.js](../../src/controllers/audit.controller.js) | Builds the success response and `X-Cache` header |
| Audit service | [src/services/audit.service.js](../../src/services/audit.service.js) | Coordinates validation, cache, semaphore, transport, analysis, scoring, and storage |
| Destination safety | [src/services/destination-safety.service.js](../../src/services/destination-safety.service.js) | Resolves and classifies destination addresses |
| Safe HTTP client | [src/infrastructure/http/audit-http-client.js](../../src/infrastructure/http/audit-http-client.js) | Uses Undici with approved-address dispatch and redirect revalidation |
| HTML analysis | [src/services/html-analysis.service.js](../../src/services/html-analysis.service.js) | Parses bounded HTML with Cheerio and produces checks/issues |
| Scoring | [src/scoring/audit-scorer.js](../../src/scoring/audit-scorer.js) | Applies scoring policy version 1.0 |

## Responsibility Boundaries

The public UI owns browser-side presentation, same-origin API calls, theme preference, and safe DOM rendering. The API layer owns HTTP routing, headers, request IDs, parsing, and public envelopes. The service layer owns audit orchestration and cache/semaphore coordination. Destination safety and transport are separate so URL approval is performed before each outbound connection. Analysis and scoring do not fetch linked resources.

## Process-Local State

The TTL cache, semaphore, queue, and fixed-window rate limiter are process-local. They reset on process restart and are not shared across horizontally scaled instances. Phase 11B prepares a one-instance Render deployment, so distributed state is intentionally not introduced.

## Current Limitations

PagePulse is prepared for Render but is not live, does not use a database, and does not provide distributed cache or distributed rate limiting. CI is configured locally but remote GitHub execution must be proven after the first push or pull request.
