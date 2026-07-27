import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  requiredArchitectureFiles,
  requiredDiagramFiles,
  validateDocumentationStructure
} from '../../scripts/check-documentation-links.js'

function readText(path) {
  return readFileSync(path, 'utf8')
}

describe('architecture documentation structure', () => {
  it('contains the required architecture and diagram directories and files', () => {
    expect(existsSync('docs/architecture')).toBe(true)
    expect(existsSync('docs/diagrams')).toBe(true)

    for (const file of [...requiredArchitectureFiles, ...requiredDiagramFiles]) {
      expect(existsSync(file), file).toBe(true)
      expect(readText(file).trim().length, file).toBeGreaterThan(0)
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
  })

  it('keeps local filesystem paths out of required documentation', () => {
    for (const file of [...requiredArchitectureFiles, ...requiredDiagramFiles, 'README.md']) {
      const text = readText(file)

      expect(text, file).not.toMatch(/[A-Za-z]:\\Users\\/)
      expect(text, file).not.toContain(`](/${'C'}:/`)
    }
  })

  it('labels future documents as planned without claiming completed frontend or deployment work', () => {
    const frontend = readText('docs/architecture/future-frontend-architecture.md')
    const deployment = readText('docs/architecture/future-deployment-architecture.md')

    expect(frontend).toContain('Status: Planned')
    expect(frontend).toContain('Frontend framework decision pending')
    expect(frontend).toContain('has not been measured')
    expect(frontend).not.toContain('LCP has been measured')
    expect(deployment).toContain('Status: Planned')
    expect(deployment).toContain('PagePulse is not deployed')
    expect(deployment).not.toContain('deployment exists')
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
})
