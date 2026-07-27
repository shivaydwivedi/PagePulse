# Diagram Catalogue

These Mermaid files are the canonical diagram sources for PagePulse architecture documentation.

| Diagram | Purpose | Related document | Status | Maintenance note |
| --- | --- | --- | --- | --- |
| [system-context.mmd](system-context.mmd) | Shows the current backend system boundaries | [System overview](../architecture/system-overview.md) | Implemented | Update when a new runtime component is added |
| [audit-request-lifecycle.mmd](audit-request-lifecycle.mmd) | Shows the audit request path and short circuits | [Request lifecycle](../architecture/request-lifecycle.md) | Implemented | Keep middleware order aligned with `src/app.js` and `src/routes/audit.routes.js` |
| [ssrf-protection-flow.mmd](ssrf-protection-flow.mmd) | Shows destination validation and revalidation | [Security architecture](../architecture/security-architecture.md) | Implemented | Update when URL or DNS safety policy changes |
| [transport-and-redirect-flow.mmd](transport-and-redirect-flow.mmd) | Shows outbound transport and redirect handling | [Transport architecture](../architecture/transport-architecture.md) | Implemented | Keep error branches aligned with `src/infrastructure/http/audit-http-client.js` |
| [analysis-and-scoring-flow.mmd](analysis-and-scoring-flow.mmd) | Shows HTML analysis and scoring | [Analysis and scoring](../architecture/analysis-and-scoring.md) | Implemented | Update when analyzers, weights, or grades change |
| [cache-concurrency-flow.mmd](cache-concurrency-flow.mmd) | Shows cache and semaphore interaction | [Caching and concurrency](../architecture/caching-and-concurrency.md) | Implemented | Update when cache or queue policy changes |
| [rate-limit-flow.mmd](rate-limit-flow.mmd) | Shows audit rate-limit decisions | [Rate limiting](../architecture/rate-limiting.md) | Implemented | Update when quota accounting or client identity changes |
| [error-handling-flow.mmd](error-handling-flow.mmd) | Shows error mapping and response safety | [Observability and errors](../architecture/observability-and-errors.md) | Implemented | Update when public error contracts change |
| [ci-quality-flow.mmd](ci-quality-flow.mmd) | Shows CI quality gates | [CI and quality gates](../architecture/ci-and-quality-gates.md) | Implemented | Update when workflow steps change |
| [deployment-flow.mmd](deployment-flow.mmd) | Shows the prepared Render single-service deployment path | [Future deployment architecture](../architecture/future-deployment-architecture.md) | Prepared | Update after live deployment verification |

Back to the [architecture index](../architecture/README.md).
