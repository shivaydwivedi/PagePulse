import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  requiredArchitectureFiles,
  requiredDeploymentFiles,
  requiredDiagramFiles,
  requiredPerformanceFiles,
  requiredScreenshotFiles,
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

  it('labels frontend as implemented and deployment as prepared without claiming live deployment', () => {
    const frontend = readText('docs/architecture/future-frontend-architecture.md')
    const deployment = readText('docs/architecture/future-deployment-architecture.md')
    const rootReadme = readText('README.md')

    expect(frontend).toContain('Status: Implemented')
    expect(frontend).toContain('No frontend framework')
    expect(frontend).toContain('Phase 10B measured')
    expect(frontend).toContain('not production field data')
    expect(deployment).toContain('Status: Prepared')
    expect(deployment).toContain('not live')
    expect(deployment).toContain('Northflank')
    expect(rootReadme).toContain('Status: Prepared, not live')
    expect(rootReadme).toContain('Live URL: pending')
    expect(rootReadme).not.toMatch(/https:\/\/[^ \n)]+northflank/i)
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

  it('documents Northflank Buildpack readiness without adding live infrastructure claims', () => {
    const config = readText('docs/deployment/northflank-configuration.md')
    const deployment = readText('docs/architecture/future-deployment-architecture.md')
    const diagram = readText('docs/diagrams/deployment-flow.mmd')

    expect(config).toContain('Repository | `shivaydwivedi/PagePulse`')
    expect(config).toContain('Branch | `main`')
    expect(config).toContain('Build type | `Buildpack`')
    expect(config).toContain('Build context | `/`')
    expect(config).toContain('Compute | `nf-compute-10`')
    expect(config).toContain('Instances | `1`')
    expect(config).toContain('Port | `8080`')
    expect(config).toContain('No database')
    expect(config).toContain('No volume')
    expect(config).not.toMatch(/card (number|data)/i)
    expect(deployment).toContain('Northflank-managed HTTPS')
    expect(deployment).toContain('same-origin UI/API')
    expect(diagram).toContain('Northflank Buildpack build')
    expect(diagram).toContain('Public HTTPS endpoint')
    expect(diagram).not.toContain('Database')
  })

  it('documents production runtime policy, health checks, TRUST_PROXY verification, and rollback', () => {
    const env = readText('docs/deployment/production-environment.md')
    const config = readText('docs/deployment/northflank-configuration.md')
    const rollback = readText('docs/deployment/operations-and-rollback.md')
    const verification = readText('docs/deployment/post-deployment-verification.md')
    const packageJson = JSON.parse(readText('package.json'))

    expect(packageJson.engines.node).toBe('>=22 <25')
    expect(env).toContain('| `PORT` |')
    expect(env).toContain('`8080`')
    expect(env).toContain('| `NODE_ENV` |')
    expect(env).toContain('`production`')
    expect(env).toContain('| `LOG_LEVEL` |')
    expect(env).toContain('Requires live verification')
    expect(env).toContain('No database')
    expect(config).toContain('Readiness:')
    expect(config).toContain('Liveness:')
    expect(config).toContain('Initial delay | `10s`')
    expect(config).toContain('Initial delay | `20s`')
    expect(rollback).toContain('Northflank rollback')
    expect(rollback).toContain('Git revert rollback')
    expect(verification).toContain('generated HTTPS URL')
    expect(verification).toContain('Rate-limit headers')
    expect(verification).toContain('Digital Heroes Training Task')
  })

  it('keeps deployment docs free of fake URLs, provider secrets, and card data', () => {
    for (const file of requiredDeploymentFiles) {
      const text = readText(file)

      expect(text, file).not.toMatch(/https:\/\/[^ \n)]+northflank/i)
      expect(text, file).not.toMatch(/card (number|data)/i)
      expect(text, file).not.toMatch(/(secret|token|password)\s*[:=]\s*\S+/i)
    }
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
