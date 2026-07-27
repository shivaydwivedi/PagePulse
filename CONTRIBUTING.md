# Contributing To PagePulse

Thanks for helping improve PagePulse. This repository is a Node.js 22, npm-based ESM API project with linting, Vitest tests, coverage gates, dependency audit checks, and repository hygiene checks.

## Prerequisites

- Node.js 22
- npm
- Git

Install dependencies from the lockfile:

```powershell
npm ci
```

## Environment Setup

Copy `.env.example` to `.env` for local development, then adjust values as needed. Do not commit `.env` or other secret-bearing files.

```powershell
Copy-Item .env.example .env
```

## Local Development

```powershell
npm run dev
```

The production-equivalent entrypoint is:

```powershell
npm start
```

## Verification

Run focused checks while developing:

```powershell
npm run lint
npm test
npm run coverage
npm run check:hygiene
```

Run the local CI-equivalent quality command:

```powershell
npm run ci
```

Before opening a pull request, also review dependencies:

```powershell
npm audit --audit-level=high
npm ls --depth=0
git diff --check
```

Do not run `npm audit fix --force` as part of normal contribution work because it can introduce major dependency changes.

## Branches And Commits

- Use focused branches such as `phase/09-ci-quality` or `fix/request-validation`.
- Keep commits scoped to one coherent change.
- Use concise imperative commit messages, for example `add ci quality gates`.

## Pull Requests

Pull requests should include:

- A clear summary of the change.
- Tests or verification output.
- Documentation updates when behaviour, setup, or commands change.
- Notes about API compatibility, security, caching, concurrency, and rate-limit impact when relevant.

Avoid unrelated dependency updates, generated files, coverage output, logs, and secrets.

## Security Reports

Do not open public issues for sensitive vulnerabilities. Use GitHub's private vulnerability reporting feature when available. See `SECURITY.md` for details.
