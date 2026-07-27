import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  requiredArchitectureFiles,
  requiredDeploymentFiles,
  requiredDiagramFiles,
  requiredPerformanceFiles,
  requiredScreenshotFiles,
  liveRenderUrl,
  validateDocumentationStructure
} from '../../scripts/check-documentation-links.js'

function readText(path) {
  return readFileSync(path, 'utf8')
}

describe('architecture documentation structure', () => {
  it('contains the required architecture and diagram directories and files', () => {
    expect(existsSync('docs/architecture')).toBe(true)
    expect(existsSync('docs/diagrams')).toBe(true)

    expect(existsSync('docs/performance')).toBe(true)
    expect(existsSync('docs/screenshots')).toBe(true)

    expect(existsSync('docs/deployment')).toBe(true)

    for (const file of [
      ...requiredArchitectureFiles,
      ...requiredDiagramFiles,
      ...requiredPerformanceFiles,
      ...requiredDeploymentFiles,
      ...requiredScreenshotFiles
    ]) {
      expect(existsSync(file), file).toBe(true)
      if (file.endsWith('.png')) {
        expect(readFileSync(file).length, file).toBeGreaterThan(0)
      } else {
        expect(readText(file).trim().length, file).toBeGreaterThan(0)
      }
    }
  })

  it('links indexes, README, and required architecture documents', () => {
    const architectureIndex = readText('docs/architecture/README.md')
    const diagramIndex = readText('docs/diagrams/README.md')
    const rootReadme = readText('README.md')

    for (const file of requiredArchitectureFiles.filter((file) => file !== 'docs/architecture/README.md')) {
      expect(architectureIndex).toContain(file.replace('docs/architecture/', ''))
    }

    for (const file of requiredDiagramFiles.filter((file) => file.endsWith('.mmd'))) {
      expect(diagramIndex).toContain(file.replace('docs/diagrams/', ''))
    }

    expect(rootReadme).toContain('docs/architecture/README.md')
    expect(rootReadme).toContain('docs/performance/lighthouse-report.md')
    expect(rootReadme).toContain('docs/deployment/README.md')
    for (const file of requiredScreenshotFiles) {
      expect(rootReadme).toContain(file)
    }
  })

  it('keeps local filesystem paths out of required documentation', () => {
    for (const file of [
      ...requiredArchitectureFiles,
      ...requiredDiagramFiles,
      ...requiredPerformanceFiles,
      ...requiredDeploymentFiles,
      'README.md'
    ]) {
      const text = readText(file)

      expect(text, file).not.toMatch(/[A-Za-z]:\\Users\\/)
      expect(text, file).not.toContain(`](/${'C'}:/`)
    }
  })

  it('labels frontend and deployment as implemented with the live Render URL', () => {
    const frontend = readText('docs/architecture/future-frontend-architecture.md')
    const deployment = readText('docs/architecture/future-deployment-architecture.md')
    const rootReadme = readText('README.md')

    expect(frontend).toContain('Status: Implemented')
    expect(frontend).toContain('No frontend framework')
    expect(frontend).toContain('Phase 10B measured')
    expect(frontend).toContain('not production field data')
    expect(deployment).toContain('Status: Implemented')
    expect(deployment).toContain(liveRenderUrl)
    expect(deployment).toContain('Render')
    expect(rootReadme).toContain('Status: Implemented')
    expect(rootReadme).toContain(liveRenderUrl)
    expect(rootReadme).toContain('Provider: Render')
  })

  it('documents critical implemented architecture facts', () => {
    expect(readText('docs/architecture/analysis-and-scoring.md')).toContain('does not run Lighthouse')
    expect(readText('docs/architecture/security-architecture.md')).toContain('SSRF')
    expect(readText('docs/architecture/security-architecture.md')).toContain('Residual limitation')
    expect(readText('docs/architecture/request-lifecycle.md')).toContain('Rate-limit decision')
    expect(readText('docs/architecture/request-lifecycle.md')).toContain('Route-specific JSON parsing')
    expect(readText('docs/architecture/caching-and-concurrency.md')).toContain('Request IDs are not cached')
    expect(readText('docs/architecture/rate-limiting.md')).toContain('bypass JSON parsing')
    expect(readText('docs/architecture/rate-limiting.md')).toContain('cache lookup')
    expect(readText('docs/architecture/rate-limiting.md')).toContain('semaphore acquisition')
    expect(readText('docs/architecture/ci-and-quality-gates.md')).toContain('first GitHub run')
  })

  it('keeps Mermaid sources plain and parseable at a structural level', () => {
    const validStarts = /^(flowchart|sequenceDiagram|classDiagram|stateDiagram|erDiagram|journey|gantt|pie|mindmap|timeline)/

    for (const file of requiredDiagramFiles.filter((file) => file.endsWith('.mmd'))) {
      const text = readText(file).trim()

      expect(text, file).toMatch(validStarts)
      expect(text, file).not.toContain('```')
      expect(text, file).not.toMatch(/[A-Za-z]:\\/)
      expect(text, file).not.toContain('/C:/')
    }
  })

  it('exposes and wires the documentation check', () => {
    const packageJson = JSON.parse(readText('package.json'))
    const workflow = readText('.github/workflows/ci.yml')

    expect(packageJson.scripts['check:docs']).toBe('node scripts/check-documentation-links.js')
    expect(packageJson.scripts.ci).toContain('npm run check:docs')
    expect(workflow).toContain('npm run check:docs')
    expect(validateDocumentationStructure()).toEqual([])
  })

  it('documents the implemented Render Web Service model without private provider data', () => {
    const config = readText('docs/deployment/render-configuration.md')
    const deployment = readText('docs/architecture/future-deployment-architecture.md')
    const diagram = readText('docs/diagrams/deployment-flow.mmd')

    expect(existsSync('docs/deployment/northflank-configuration.md')).toBe(false)
    expect(config).toContain('Provider: Render')
    expect(config).toContain('Service type | `Web Service`')
    expect(config).toContain('Repository | `shivaydwivedi/PagePulse`')
    expect(config).toContain('Branch | `main`')
    expect(config).toContain('Runtime | `Node`')
    expect(config).toContain('Build command | `npm ci`')
    expect(config).toContain('Start command | `npm start`')
    expect(config).toContain('Health check path | `/healthz`')
    expect(config).toContain('Instance type | `Free`')
    expect(config).toContain('observed as `10000`')
    expect(config).toContain('Auto-deploy')
    expect(config).toContain('No database')
    expect(config).toContain('No persistent disk')
    expect(config).not.toMatch(/card (number|data)/i)
    expect(deployment).toContain('Render-managed HTTPS')
    expect(deployment).toContain('Same-origin UI/API')
    expect(deployment).toContain('cold start')
    expect(deployment).toContain('Strict-Transport-Security')
    expect(diagram).toContain('Render build: npm ci')
    expect(diagram).toContain(liveRenderUrl)
    expect(diagram).toContain('Render-managed HTTPS')
    expect(diagram).not.toContain('Northflank')
    expect(diagram).not.toContain('Database')
  })

  it('documents production runtime policy, Render health checks, TRUST_PROXY, HSTS, and rollback', () => {
    const env = readText('docs/deployment/production-environment.md')
    const config = readText('docs/deployment/render-configuration.md')
    const rollback = readText('docs/deployment/operations-and-rollback.md')
    const verification = readText('docs/deployment/post-deployment-verification.md')
    const report = readText('docs/deployment/production-verification-report.md')
    const packageJson = JSON.parse(readText('package.json'))

    expect(packageJson.engines.node).toBe('>=22 <25')
    expect(env).toContain('| `PORT` |')
    expect(env).toContain('observed as `10000`')
    expect(env).toContain('| `NODE_ENV` |')
    expect(env).toContain('`production`')
    expect(env).toContain('| `LOG_LEVEL` |')
    expect(env).toContain('Final status: left unset')
    expect(env).toContain('max-age=2592000')
    expect(env).toContain('No database')
    expect(config).toContain('Health check path | `/healthz`')
    expect(config).toContain('Leave `PORT` unset')
    expect(rollback).toContain('Render rollback')
    expect(rollback).toContain('Git revert rollback')
    expect(rollback).toContain('disable automatic deploys')
    expect(verification).toContain(liveRenderUrl)
    expect(verification).toContain('Rate-limit headers')
    expect(verification).toContain('cache hit')
    expect(verification).toContain('HSTS')
    expect(verification).toContain('Digital Heroes Training Task')
    expect(report).toContain('Production Verification Report')
    expect(report).toContain('https://www.wikipedia.org')
    expect(report).toContain('https://www.youtube.com')
    expect(report).toContain('http://127.0.0.1')
    expect(report).toContain('BLOCKED_TARGET')
  })

  it('keeps deployment docs free of stale provider wording, fake URLs, provider secrets, and card data', () => {
    for (const file of requiredDeploymentFiles) {
      const text = readText(file)

      expect(text, file).not.toMatch(/https:\/\/(?!pagepulse-3gub\.onrender\.com)[^ \n)]+onrender\.com/i)
      expect(text, file).not.toMatch(/Northflank|northflank/i)
      expect(text, file).not.toMatch(/Live URL:\s*pending/i)
      expect(text, file).not.toMatch(/Status:\s*Prepared,\s*not live/i)
      expect(text, file).not.toMatch(/Requires live verification/i)
      expect(text, file).not.toMatch(/card (number|data)/i)
      expect(text, file).not.toMatch(/(secret|token|password)\s*[:=]\s*\S+/i)
      expect(text, file).not.toMatch(/srv-[a-z0-9]{8,}/i)
    }
  })

  it('documents final README positioning, architecture flow, attribution, and unsupported claims', () => {
    const rootReadme = readText('README.md')

    expect(rootReadme).toContain('security-focused server-side web-page audit service')
    expect(rootReadme).toContain('public HTTP and HTTPS pages')
    expect(rootReadme).toContain('SSRF-aware')
    expect(rootReadme).toContain('not Lighthouse')
    expect(rootReadme).toContain('not a browser-rendering engine')
    expect(rootReadme).toContain('not a Core Web Vitals measurement service')
    expect(rootReadme).toContain('bounded semaphore and queue')
    expect(rootReadme).toContain('DNS resolution and approved-address transport')
    expect(rootReadme).toContain('redirect revalidation')
    expect(rootReadme).toContain('Provider: Render')
    expect(rootReadme).toContain('HSTS')
    expect(rootReadme).toContain('Digital Heroes Training Task')
    expect(rootReadme).not.toMatch(/enterprise-grade|bulletproof|fully secure|infinitely scalable|production-proven|industry-leading/i)
  })

  it('links production documentation and favicon assets', () => {
    const rootReadme = readText('README.md')
    const index = readText('public/index.html')

    expect(rootReadme).toContain('docs/deployment/production-verification-report.md')
    expect(rootReadme).toContain('docs/deployment/render-configuration.md')
    expect(rootReadme).toContain('docs/deployment/operations-and-rollback.md')
    expect(existsSync('public/favicon.svg')).toBe(true)
    expect(index).toContain('<link rel="icon" href="/favicon.svg" type="image/svg+xml">')
  })

  it('documents Lighthouse lab conditions and median results without production claims', () => {
    const report = readText('docs/performance/lighthouse-report.md')

    expect(report).toContain('Lighthouse `13.4.1`')
    expect(report).toContain('Chrome `150.0.7871.182`')
    expect(report).toContain('mobile navigation')
    expect(report).toContain('Median')
    expect(report).toContain('1.160 s')
    expect(report).toContain('CLS')
    expect(report).toContain('not field data')
    expect(report).not.toContain('production measurement')
  })

  it('keeps screenshot artifacts stable, relative, and reasonably sized', () => {
    const rootReadme = readText('README.md')
    const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47])

    for (const file of requiredScreenshotFiles) {
      const bytes = readFileSync(file)

      expect(bytes.subarray(0, 4), file).toEqual(pngSignature)
      expect(bytes.length, file).toBeGreaterThan(1024)
      expect(bytes.length, file).toBeLessThan(1_500_000)
      expect(rootReadme).toContain(`](${file})`)
    }
  })
})
