# PagePulse Architecture

This directory explains the current PagePulse architecture for maintainers, reviewers, recruiters, and interview discussions. It records what is implemented today, why key choices were made, where local performance measurements live, and where deployment decisions remain open.

Back to the [root README](../../README.md).

## Current System Status

Backend phases 1 through 8 are implemented: Express application foundation, request validation, destination safety, safe HTTP transport, HTML analysis, deterministic scoring, in-memory caching and concurrency bounds, and per-client audit rate limiting. Phase 9 CI and repository quality gates are configured locally. Phase 9B adds this architecture documentation system. Phase 10 adds the public demo UI served by the existing Express application.

Deployment architecture is planned only. Local Lighthouse lab measurements are recorded separately and do not claim production field data.

## Navigation

| Document | Purpose | Status | Related diagram |
| --- | --- | --- | --- |
| [System overview](system-overview.md) | Current backend components and boundaries | Implemented | [system-context.mmd](../diagrams/system-context.mmd) |
| [Request lifecycle](request-lifecycle.md) | Exact `POST /api/v1/audits` path and short circuits | Implemented | [audit-request-lifecycle.mmd](../diagrams/audit-request-lifecycle.mmd) |
| [Security architecture](security-architecture.md) | Trust boundaries, SSRF controls, and residual limits | Implemented | [ssrf-protection-flow.mmd](../diagrams/ssrf-protection-flow.mmd) |
| [Transport architecture](transport-architecture.md) | Safe outbound HTTP, redirect, timeout, and body limits | Implemented | [transport-and-redirect-flow.mmd](../diagrams/transport-and-redirect-flow.mmd) |
| [Analysis and scoring](analysis-and-scoring.md) | HTML analysis and deterministic scoring policy | Implemented | [analysis-and-scoring-flow.mmd](../diagrams/analysis-and-scoring-flow.mmd) |
| [Caching and concurrency](caching-and-concurrency.md) | TTL cache and semaphore behaviour | Implemented | [cache-concurrency-flow.mmd](../diagrams/cache-concurrency-flow.mmd) |
| [Rate limiting](rate-limiting.md) | Audit rate-limit policy and headers | Implemented | [rate-limit-flow.mmd](../diagrams/rate-limit-flow.mmd) |
| [Observability and errors](observability-and-errors.md) | Request IDs, logs, error envelopes, and public codes | Implemented | [error-handling-flow.mmd](../diagrams/error-handling-flow.mmd) |
| [CI and quality gates](ci-and-quality-gates.md) | GitHub Actions, coverage, audit, hygiene, and templates | Implemented | [ci-quality-flow.mmd](../diagrams/ci-quality-flow.mmd) |
| [Architecture decisions](architecture-decisions.md) | ADR-style index of current design choices | Implemented | None |
| [Future frontend architecture](future-frontend-architecture.md) | Public UI architecture and remaining measurement limits | Implemented | [system-context.mmd](../diagrams/system-context.mmd) |
| [Future deployment architecture](future-deployment-architecture.md) | Planned deployment concerns and undecided hosting choices | Planned | None |

Performance documentation:

- [Lighthouse performance report](../performance/lighthouse-report.md)

## Diagram Catalogue

Reusable Mermaid source files live in [docs/diagrams](../diagrams/README.md). Keep those files as the canonical diagram source and update Markdown embeds or references when behaviour changes.

## Updating These Documents

- Update the relevant architecture page in the same phase as the code or workflow change.
- Keep implemented and planned behaviour separate.
- Use repository-relative links only.
- Do not add local filesystem paths, secrets, request IDs, or environment values from a developer machine.
- Do not generate PNG or SVG diagrams in this phase.
