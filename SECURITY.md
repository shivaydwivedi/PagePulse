# Security Policy

## Supported Versions

PagePulse is currently pre-1.0. Security review applies to the active `main` branch and the current development phases.

## Reporting A Vulnerability

Please do not open public GitHub issues for sensitive security reports. Use GitHub's private vulnerability reporting feature when available.

When reporting, include only the information needed to understand and reproduce the issue. Do not include credentials, private tokens, production secrets, or unnecessary exploit data.

Useful details include:

- Affected endpoint or component.
- Expected and actual behaviour.
- Minimal reproduction steps.
- Relevant logs with secrets removed.
- Impact assessment if known.

## Scope

Security-sensitive areas include the API request lifecycle, SSRF protections, URL validation, outbound transport, rate limiting, cache behaviour, concurrency controls, request handling, and response safety.

## Response Expectations

This portfolio project is maintained on a best-effort basis. Reports will be reviewed as availability allows, with priority given to issues that can expose sensitive data, bypass SSRF protections, disrupt service availability, or compromise consumers of the API.
